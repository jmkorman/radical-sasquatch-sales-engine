"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface AccountContact {
  id: string;
  accountId: string;
  name: string;
  role: string;
  email: string;
  phone: string;
  preferredChannel: string;
  notes: string;
}

interface ContactStore {
  contacts: AccountContact[];
  addContact: (contact: Omit<AccountContact, "id">) => void;
  updateContact: (id: string, updates: Partial<Omit<AccountContact, "id" | "accountId">>) => void;
  removeContact: (id: string) => void;
  getContactsForAccount: (accountId: string) => AccountContact[];
}

export const useContactStore = create<ContactStore>()(
  persist(
    (set, get) => ({
      contacts: [],

      addContact: (contact) =>
        set((state) => ({
          contacts: [
            {
              ...contact,
              id: crypto.randomUUID(),
            },
            ...state.contacts,
          ],
        })),

      updateContact: (id, updates) =>
        set((state) => ({
          contacts: state.contacts.map((contact) =>
            contact.id === id ? { ...contact, ...updates } : contact
          ),
        })),

      removeContact: (id) =>
        set((state) => ({
          contacts: state.contacts.filter((contact) => contact.id !== id),
        })),

      getContactsForAccount: (accountId) =>
        get().contacts.filter((contact) => contact.accountId === accountId),
    }),
    {
      name: "rs-contacts",
    }
  )
);
