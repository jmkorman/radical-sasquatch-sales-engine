"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { AccountContact } from "@/types/contacts";
import { useUIStore } from "@/stores/useUIStore";

type EditableContactField = keyof Omit<AccountContact, "id" | "accountId" | "createdAt" | "updatedAt">;

export function ContactManager({
  accountId,
  defaultContact,
}: {
  accountId: string;
  defaultContact: {
    name: string;
    email: string;
    phone: string;
  };
}) {
  const showActionFeedback = useUIStore((state) => state.showActionFeedback);
  const [contacts, setContacts] = useState<AccountContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [savingContactIds, setSavingContactIds] = useState<string[]>([]);
  const contactsRef = useRef<AccountContact[]>([]);
  const saveTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const [draft, setDraft] = useState({
    name: "",
    role: "",
    email: "",
    phone: "",
    preferredChannel: "",
    notes: "",
  });

  const canSave = Boolean(draft.name.trim() || draft.email.trim() || draft.phone.trim());

  useEffect(() => {
    contactsRef.current = contacts;
  }, [contacts]);

  useEffect(() => {
    let active = true;

    Object.values(saveTimersRef.current).forEach((timer) => clearTimeout(timer));
    saveTimersRef.current = {};
    setSavingContactIds([]);
    setContacts([]);
    setLoading(true);

    void (async () => {
      try {
        const response = await fetch(`/api/contacts?accountId=${encodeURIComponent(accountId)}`, {
          cache: "no-store",
        });
        if (!response.ok) throw new Error("Failed to load contacts");
        const data: AccountContact[] = await response.json();
        if (!active) return;
        setContacts(data);
      } catch {
        if (!active) return;
        setContacts([]);
        showActionFeedback("Couldn’t load saved contacts for this account.", "error");
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    })();

    return () => {
      active = false;
      Object.values(saveTimersRef.current).forEach((timer) => clearTimeout(timer));
      saveTimersRef.current = {};
    };
  }, [accountId, showActionFeedback]);

  const markSaving = (contactId: string) => {
    setSavingContactIds((existing) => (existing.includes(contactId) ? existing : [...existing, contactId]));
  };

  const clearSaving = (contactId: string) => {
    setSavingContactIds((existing) => existing.filter((id) => id !== contactId));
  };

  const persistContact = async (contactId: string) => {
    const contact = contactsRef.current.find((item) => item.id === contactId);
    if (!contact) return;

    markSaving(contactId);

    try {
      const response = await fetch("/api/contacts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId,
          id: contact.id,
          name: contact.name,
          role: contact.role,
          email: contact.email,
          phone: contact.phone,
          preferredChannel: contact.preferredChannel,
          notes: contact.notes,
        }),
      });

      if (!response.ok) throw new Error("Failed to save contact");
      const saved: AccountContact = await response.json();
      setContacts((existing) => existing.map((item) => (item.id === saved.id ? saved : item)));
    } catch {
      showActionFeedback("Couldn’t save that contact change.", "error");
    } finally {
      clearSaving(contactId);
    }
  };

  const scheduleSave = (contactId: string) => {
    if (saveTimersRef.current[contactId]) {
      clearTimeout(saveTimersRef.current[contactId]);
    }

    saveTimersRef.current[contactId] = setTimeout(() => {
      delete saveTimersRef.current[contactId];
      void persistContact(contactId);
    }, 700);
  };

  const flushSave = (contactId: string) => {
    if (saveTimersRef.current[contactId]) {
      clearTimeout(saveTimersRef.current[contactId]);
      delete saveTimersRef.current[contactId];
    }

    void persistContact(contactId);
  };

  const updateContact = (contactId: string, field: EditableContactField, value: string) => {
    setContacts((existing) =>
      existing.map((contact) =>
        contact.id === contactId
          ? {
              ...contact,
              [field]: value,
            }
          : contact
      )
    );
    scheduleSave(contactId);
  };

  const addContact = async () => {
    if (!canSave) return;

    setCreating(true);
    try {
      const response = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId,
          name: draft.name,
          role: draft.role,
          email: draft.email,
          phone: draft.phone,
          preferredChannel: draft.preferredChannel,
          notes: draft.notes,
        }),
      });

      if (!response.ok) throw new Error("Failed to add contact");
      const created: AccountContact = await response.json();
      setContacts((existing) => [created, ...existing]);
      setDraft({
        name: "",
        role: "",
        email: "",
        phone: "",
        preferredChannel: "",
        notes: "",
      });
      showActionFeedback("Contact saved to the cloud.", "success");
    } catch {
      showActionFeedback("Couldn’t create that contact.", "error");
    } finally {
      setCreating(false);
    }
  };

  const removeContact = async (contactId: string) => {
    if (saveTimersRef.current[contactId]) {
      clearTimeout(saveTimersRef.current[contactId]);
      delete saveTimersRef.current[contactId];
    }

    const previous = contactsRef.current;
    setContacts((existing) => existing.filter((contact) => contact.id !== contactId));

    try {
      const response = await fetch(
        `/api/contacts?accountId=${encodeURIComponent(accountId)}&id=${encodeURIComponent(contactId)}`,
        {
          method: "DELETE",
        }
      );

      if (!response.ok) throw new Error("Failed to remove contact");
      showActionFeedback("Contact removed.", "success");
    } catch {
      setContacts(previous);
      showActionFeedback("Couldn’t remove that contact.", "error");
    }
  };

  return (
    <Card>
      <div className="space-y-4">
        <div>
          <div className="text-[11px] uppercase tracking-[0.3em] text-[#af9fe6]">Contacts</div>
          <div className="mt-1 text-sm text-[#d8ccfb]">
            Keep multiple stakeholders for each deal, not just the single contact from the sheet.
          </div>
        </div>

        {(defaultContact.name || defaultContact.email || defaultContact.phone) && (
          <div className="rounded-2xl border border-rs-border/60 bg-white/5 p-3">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-rs-gold">Sheet Contact</div>
            <div className="mt-2 space-y-1 text-sm text-[#ece5ff]">
              {defaultContact.name && <div>{defaultContact.name}</div>}
              {defaultContact.email && <div>{defaultContact.email}</div>}
              {defaultContact.phone && <div>{defaultContact.phone}</div>}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between text-xs text-[#cdbdff]">
          <span>
            {loading
              ? "Loading saved contacts..."
              : savingContactIds.length > 0 || creating
                ? "Saving contact changes..."
                : "Contacts are saved to your cloud data store."}
          </span>
          {!loading && <span>{contacts.length} saved</span>}
        </div>

        <div className="space-y-3">
          {contacts.map((contact) => (
            <div key={contact.id} className="rounded-2xl border border-rs-border/60 bg-black/10 p-3">
              <div className="grid gap-3 md:grid-cols-2">
                <Input
                  label="Name"
                  value={contact.name}
                  onChange={(e) => updateContact(contact.id, "name", e.target.value)}
                  onBlur={() => flushSave(contact.id)}
                />
                <Input
                  label="Role"
                  value={contact.role}
                  onChange={(e) => updateContact(contact.id, "role", e.target.value)}
                  onBlur={() => flushSave(contact.id)}
                />
                <Input
                  label="Email"
                  value={contact.email}
                  onChange={(e) => updateContact(contact.id, "email", e.target.value)}
                  onBlur={() => flushSave(contact.id)}
                />
                <Input
                  label="Phone"
                  value={contact.phone}
                  onChange={(e) => updateContact(contact.id, "phone", e.target.value)}
                  onBlur={() => flushSave(contact.id)}
                />
                <Input
                  label="Preferred Channel"
                  value={contact.preferredChannel}
                  onChange={(e) => updateContact(contact.id, "preferredChannel", e.target.value)}
                  onBlur={() => flushSave(contact.id)}
                />
              </div>
              <div className="mt-3">
                <Textarea
                  label="Relationship Notes"
                  value={contact.notes}
                  onChange={(e) => updateContact(contact.id, "notes", e.target.value)}
                  onBlur={() => flushSave(contact.id)}
                  rows={3}
                />
              </div>
              <div className="mt-3 flex items-center justify-between">
                <div className="text-[11px] uppercase tracking-[0.24em] text-[#9f90d8]">
                  {savingContactIds.includes(contact.id) ? "Saving..." : "Saved"}
                </div>
                <Button variant="ghost" size="sm" onClick={() => void removeContact(contact.id)}>
                  Remove Contact
                </Button>
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-2xl border border-rs-border/60 bg-black/10 p-3">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-rs-gold">Add Contact</div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <Input label="Name" value={draft.name} onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))} />
            <Input label="Role" value={draft.role} onChange={(e) => setDraft((prev) => ({ ...prev, role: e.target.value }))} />
            <Input label="Email" value={draft.email} onChange={(e) => setDraft((prev) => ({ ...prev, email: e.target.value }))} />
            <Input label="Phone" value={draft.phone} onChange={(e) => setDraft((prev) => ({ ...prev, phone: e.target.value }))} />
            <Input
              label="Preferred Channel"
              value={draft.preferredChannel}
              onChange={(e) => setDraft((prev) => ({ ...prev, preferredChannel: e.target.value }))}
            />
          </div>
          <div className="mt-3">
            <Textarea
              label="Relationship Notes"
              value={draft.notes}
              onChange={(e) => setDraft((prev) => ({ ...prev, notes: e.target.value }))}
              rows={3}
            />
          </div>
          <div className="mt-3 flex justify-end">
            <Button size="sm" onClick={() => void addContact()} disabled={!canSave || creating}>
              {creating ? "Saving..." : "Add Contact"}
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
