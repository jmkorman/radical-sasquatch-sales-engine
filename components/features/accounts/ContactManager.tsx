"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { useContactStore } from "@/stores/useContactStore";

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
  const { contacts, addContact, updateContact, removeContact } = useContactStore();
  const accountContacts = useMemo(
    () => contacts.filter((contact) => contact.accountId === accountId),
    [accountId, contacts]
  );

  const [draft, setDraft] = useState({
    name: "",
    role: "",
    email: "",
    phone: "",
    preferredChannel: "",
    notes: "",
  });

  const canSave = Boolean(draft.name.trim() || draft.email.trim() || draft.phone.trim());

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

        <div className="space-y-3">
          {accountContacts.map((contact) => (
            <div key={contact.id} className="rounded-2xl border border-rs-border/60 bg-black/10 p-3">
              <div className="grid gap-3 md:grid-cols-2">
                <Input
                  label="Name"
                  value={contact.name}
                  onChange={(e) => updateContact(contact.id, { name: e.target.value })}
                />
                <Input
                  label="Role"
                  value={contact.role}
                  onChange={(e) => updateContact(contact.id, { role: e.target.value })}
                />
                <Input
                  label="Email"
                  value={contact.email}
                  onChange={(e) => updateContact(contact.id, { email: e.target.value })}
                />
                <Input
                  label="Phone"
                  value={contact.phone}
                  onChange={(e) => updateContact(contact.id, { phone: e.target.value })}
                />
                <Input
                  label="Preferred Channel"
                  value={contact.preferredChannel}
                  onChange={(e) => updateContact(contact.id, { preferredChannel: e.target.value })}
                />
              </div>
              <div className="mt-3">
                <Textarea
                  label="Relationship Notes"
                  value={contact.notes}
                  onChange={(e) => updateContact(contact.id, { notes: e.target.value })}
                  rows={3}
                />
              </div>
              <div className="mt-3 flex justify-end">
                <Button variant="ghost" size="sm" onClick={() => removeContact(contact.id)}>
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
            <Button
              size="sm"
              onClick={() => {
                if (!canSave) return;
                addContact({
                  accountId,
                  name: draft.name,
                  role: draft.role,
                  email: draft.email,
                  phone: draft.phone,
                  preferredChannel: draft.preferredChannel,
                  notes: draft.notes,
                });
                setDraft({
                  name: "",
                  role: "",
                  email: "",
                  phone: "",
                  preferredChannel: "",
                  notes: "",
                });
              }}
              disabled={!canSave}
            >
              Add Contact
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
