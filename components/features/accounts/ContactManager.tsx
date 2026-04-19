"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { AccountContact } from "@/types/contacts";
import { useUIStore } from "@/stores/useUIStore";

type EditableContactField = keyof Omit<AccountContact, "id" | "accountId" | "createdAt" | "updatedAt">;

function ContactRow({
  contact,
  saving,
  onUpdate,
  onFlush,
  onRemove,
}: {
  contact: AccountContact;
  saving: boolean;
  onUpdate: (field: EditableContactField, value: string) => void;
  onFlush: () => void;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-xl border border-rs-border/60 bg-black/10">
      {/* Collapsed summary row */}
      <div className="flex items-center justify-between gap-3 px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-sm font-medium text-rs-cream truncate">
              {contact.name || <span className="italic text-[#9d8dd5]">Unnamed</span>}
            </span>
            {contact.role && (
              <span className="text-xs text-[#9d8dd5]">{contact.role}</span>
            )}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
            {contact.email && (
              <span className="text-xs text-[#af9fe6]">{contact.email}</span>
            )}
            {contact.phone && (
              <span className="text-xs text-[#af9fe6]">{contact.phone}</span>
            )}
            {!contact.email && !contact.phone && (
              <span className="text-xs text-[#6b5fa0] italic">No email or phone</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="rounded px-2 py-1 text-xs text-[#9d8dd5] hover:text-rs-gold transition-colors"
          >
            {expanded ? "Done" : "Edit"}
          </button>
          <button
            onClick={onRemove}
            className="rounded px-2 py-1 text-xs text-[#9d8dd5] hover:text-rs-punch transition-colors"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Expanded edit form */}
      {expanded && (
        <div className="border-t border-rs-border/40 px-3 pb-3 pt-2.5 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Name" value={contact.name} onChange={(e) => onUpdate("name", e.target.value)} onBlur={onFlush} />
            <Input label="Role" value={contact.role} onChange={(e) => onUpdate("role", e.target.value)} onBlur={onFlush} />
            <Input label="Email" value={contact.email} onChange={(e) => onUpdate("email", e.target.value)} onBlur={onFlush} />
            <Input label="Phone" value={contact.phone} onChange={(e) => onUpdate("phone", e.target.value)} onBlur={onFlush} />
            <Input label="Preferred Channel" value={contact.preferredChannel} onChange={(e) => onUpdate("preferredChannel", e.target.value)} onBlur={onFlush} />
          </div>
          <Textarea
            label="Relationship Notes"
            value={contact.notes}
            onChange={(e) => onUpdate("notes", e.target.value)}
            onBlur={onFlush}
            rows={2}
          />
          {saving && <div className="text-[11px] text-[#9d8dd5]">Saving…</div>}
        </div>
      )}
    </div>
  );
}

export function ContactManager({
  accountId,
  defaultContact,
}: {
  accountId: string;
  defaultContact: { name: string; email: string; phone: string };
}) {
  const showActionFeedback = useUIStore((state) => state.showActionFeedback);
  const [contacts, setContacts] = useState<AccountContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [savingContactIds, setSavingContactIds] = useState<string[]>([]);
  const contactsRef = useRef<AccountContact[]>([]);
  const saveTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const [draft, setDraft] = useState({ name: "", role: "", email: "", phone: "", preferredChannel: "", notes: "" });
  const canSave = Boolean(draft.name.trim() || draft.email.trim() || draft.phone.trim());

  useEffect(() => { contactsRef.current = contacts; }, [contacts]);

  useEffect(() => {
    let active = true;
    Object.values(saveTimersRef.current).forEach((t) => clearTimeout(t));
    saveTimersRef.current = {};
    setSavingContactIds([]);
    setContacts([]);
    setLoading(true);

    void (async () => {
      try {
        const res = await fetch(`/api/contacts?accountId=${encodeURIComponent(accountId)}`, { cache: "no-store" });
        if (!res.ok) throw new Error();
        const data: AccountContact[] = await res.json();
        if (active) setContacts(data);
      } catch {
        if (active) showActionFeedback("Couldn't load contacts.", "error");
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
      Object.values(saveTimersRef.current).forEach((t) => clearTimeout(t));
      saveTimersRef.current = {};
    };
  }, [accountId, showActionFeedback]);

  const persistContact = async (contactId: string) => {
    const contact = contactsRef.current.find((c) => c.id === contactId);
    if (!contact) return;
    setSavingContactIds((s) => (s.includes(contactId) ? s : [...s, contactId]));
    try {
      const res = await fetch("/api/contacts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, id: contact.id, name: contact.name, role: contact.role, email: contact.email, phone: contact.phone, preferredChannel: contact.preferredChannel, notes: contact.notes }),
      });
      if (!res.ok) throw new Error();
      const saved: AccountContact = await res.json();
      setContacts((s) => s.map((c) => (c.id === saved.id ? saved : c)));
    } catch {
      showActionFeedback("Couldn't save contact change.", "error");
    } finally {
      setSavingContactIds((s) => s.filter((id) => id !== contactId));
    }
  };

  const scheduleSave = (contactId: string) => {
    if (saveTimersRef.current[contactId]) clearTimeout(saveTimersRef.current[contactId]);
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
    setContacts((s) => s.map((c) => (c.id === contactId ? { ...c, [field]: value } : c)));
    scheduleSave(contactId);
  };

  const addContact = async () => {
    if (!canSave) return;
    setCreating(true);
    try {
      const res = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, ...draft }),
      });
      if (!res.ok) throw new Error();
      const created: AccountContact = await res.json();
      setContacts((s) => [created, ...s]);
      setDraft({ name: "", role: "", email: "", phone: "", preferredChannel: "", notes: "" });
      setShowAddForm(false);
      showActionFeedback("Contact saved.", "success");
    } catch {
      showActionFeedback("Couldn't create that contact.", "error");
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
    setContacts((s) => s.filter((c) => c.id !== contactId));
    try {
      const res = await fetch(`/api/contacts?accountId=${encodeURIComponent(accountId)}&id=${encodeURIComponent(contactId)}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      showActionFeedback("Contact removed.", "success");
    } catch {
      setContacts(previous);
      showActionFeedback("Couldn't remove that contact.", "error");
    }
  };

  return (
    <Card>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-[11px] uppercase tracking-[0.3em] text-[#af9fe6]">Contacts</div>
          {!loading && (
            <button
              onClick={() => setShowAddForm((v) => !v)}
              className="text-xs text-rs-gold hover:text-rs-cream transition-colors"
            >
              {showAddForm ? "Cancel" : "+ Add Contact"}
            </button>
          )}
        </div>

        {/* Sheet contact (read-only) */}
        {(defaultContact.name || defaultContact.email || defaultContact.phone) && (
          <div className="rounded-xl border border-rs-border/40 bg-white/5 px-3 py-2">
            <div className="text-[10px] uppercase tracking-[0.2em] text-rs-gold mb-1">Sheet Contact</div>
            <div className="text-sm text-[#ece5ff]">{defaultContact.name}</div>
            <div className="text-xs text-[#af9fe6]">{[defaultContact.email, defaultContact.phone].filter(Boolean).join(" · ")}</div>
          </div>
        )}

        {loading ? (
          <div className="text-xs text-[#9d8dd5]">Loading contacts…</div>
        ) : (
          <div className="space-y-2">
            {contacts.map((contact) => (
              <ContactRow
                key={contact.id}
                contact={contact}
                saving={savingContactIds.includes(contact.id)}
                onUpdate={(field, value) => updateContact(contact.id, field, value)}
                onFlush={() => flushSave(contact.id)}
                onRemove={() => void removeContact(contact.id)}
              />
            ))}
            {contacts.length === 0 && !showAddForm && (
              <div className="text-xs text-[#6b5fa0] italic">No contacts saved yet.</div>
            )}
          </div>
        )}

        {/* Inline add form */}
        {showAddForm && (
          <div className="rounded-xl border border-rs-border/60 bg-black/10 px-3 pb-3 pt-2.5 space-y-3">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-rs-gold">New Contact</div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="Name" value={draft.name} onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))} />
              <Input label="Role" value={draft.role} onChange={(e) => setDraft((p) => ({ ...p, role: e.target.value }))} />
              <Input label="Email" value={draft.email} onChange={(e) => setDraft((p) => ({ ...p, email: e.target.value }))} />
              <Input label="Phone" value={draft.phone} onChange={(e) => setDraft((p) => ({ ...p, phone: e.target.value }))} />
              <Input label="Preferred Channel" value={draft.preferredChannel} onChange={(e) => setDraft((p) => ({ ...p, preferredChannel: e.target.value }))} />
            </div>
            <Textarea label="Relationship Notes" value={draft.notes} onChange={(e) => setDraft((p) => ({ ...p, notes: e.target.value }))} rows={2} />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setShowAddForm(false)}>Cancel</Button>
              <Button size="sm" onClick={() => void addContact()} disabled={!canSave || creating}>
                {creating ? "Saving…" : "Add Contact"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
