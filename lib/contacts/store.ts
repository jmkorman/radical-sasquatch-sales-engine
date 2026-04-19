import { getAppSetting, upsertAppSetting } from "@/lib/supabase/queries";
import { AccountContact, AccountContactInput } from "@/types/contacts";

const CONTACTS_PREFIX = "account_contacts:";

function getContactsKey(accountId: string) {
  return `${CONTACTS_PREFIX}${accountId}`;
}

function asText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function normalizeContact(
  accountId: string,
  value: Partial<AccountContact>,
  timestamps?: { createdAt: string; updatedAt: string }
): AccountContact {
  const now = new Date().toISOString();
  return {
    id: asText(value.id) || crypto.randomUUID(),
    accountId,
    name: asText(value.name),
    role: asText(value.role),
    email: asText(value.email),
    phone: asText(value.phone),
    preferredChannel: asText(value.preferredChannel),
    notes: asText(value.notes),
    createdAt: asText(value.createdAt) || timestamps?.createdAt || now,
    updatedAt: asText(value.updatedAt) || timestamps?.updatedAt || now,
  };
}

function sortContacts(contacts: AccountContact[]) {
  return [...contacts].sort(
    (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
  );
}

export async function getAccountContacts(accountId: string): Promise<AccountContact[]> {
  const stored = await getAppSetting(getContactsKey(accountId));
  if (!stored) return [];

  try {
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    return sortContacts(parsed.map((value) => normalizeContact(accountId, value)));
  } catch {
    return [];
  }
}

export async function createAccountContact(
  accountId: string,
  input: Omit<AccountContactInput, "accountId">
): Promise<AccountContact> {
  const existing = await getAccountContacts(accountId);
  const now = new Date().toISOString();
  const contact = normalizeContact(
    accountId,
    { accountId, ...input },
    { createdAt: now, updatedAt: now }
  );

  await upsertAppSetting(getContactsKey(accountId), JSON.stringify([contact, ...existing]));
  return contact;
}

export async function updateAccountContact(
  accountId: string,
  contactId: string,
  updates: Partial<Omit<AccountContactInput, "accountId">>
): Promise<AccountContact | null> {
  const existing = await getAccountContacts(accountId);
  const definedUpdates = Object.fromEntries(
    Object.entries(updates).filter(([, value]) => value !== undefined)
  ) as Partial<Omit<AccountContactInput, "accountId">>;
  let updatedContact: AccountContact | null = null;
  const updatedAt = new Date().toISOString();
  const nextContacts = existing.map((contact) => {
    if (contact.id !== contactId) return contact;

    updatedContact = normalizeContact(
      accountId,
      {
        ...contact,
        ...definedUpdates,
        id: contact.id,
        createdAt: contact.createdAt,
        updatedAt,
      },
      { createdAt: contact.createdAt, updatedAt }
    );

    return updatedContact;
  });

  if (!updatedContact) return null;

  await upsertAppSetting(getContactsKey(accountId), JSON.stringify(sortContacts(nextContacts)));
  return updatedContact;
}

export async function deleteAccountContact(accountId: string, contactId: string): Promise<boolean> {
  const existing = await getAccountContacts(accountId);
  const nextContacts = existing.filter((contact) => contact.id !== contactId);

  if (nextContacts.length === existing.length) {
    return false;
  }

  await upsertAppSetting(getContactsKey(accountId), JSON.stringify(nextContacts));
  return true;
}
