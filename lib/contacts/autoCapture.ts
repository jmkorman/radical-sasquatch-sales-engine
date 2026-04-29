import {
  createAccountContact,
  getAccountContacts,
  updateAccountContact,
} from "@/lib/contacts/store";

/**
 * Heuristic to reject obviously bad names pulled from email headers.
 * Gmail sometimes gives you "info" or the full email address as the name.
 */
function cleanName(raw: string, email: string): string {
  const name = raw.trim().replace(/^["']|["']$/g, "");
  if (!name) return "";
  // If the "name" is just the email address, drop it
  if (name.toLowerCase() === email.toLowerCase()) return "";
  // Very short or single-word names that are just the email's local part
  const localPart = email.split("@")[0]?.toLowerCase() ?? "";
  if (name.toLowerCase() === localPart) return "";
  return name;
}

function betterName(existing: string, incoming: string): string {
  const e = existing.trim();
  const i = incoming.trim();
  if (!i) return e;
  if (!e) return i;
  // Prefer multi-word names over single-word
  const eWords = e.split(/\s+/).length;
  const iWords = i.split(/\s+/).length;
  if (iWords > eWords) return i;
  return e;
}

export interface CaptureResult {
  action: "created" | "updated" | "skipped" | "error";
  reason?: string;
  contactId?: string;
}

/**
 * Idempotently add or enrich a contact for the given account based on an
 * email sender. Dedupes case-insensitively on email. Only upgrades name
 * (never downgrades). Never overwrites role/phone/notes set by the user.
 */
export async function captureInboundContact(
  accountId: string,
  rawName: string,
  rawEmail: string
): Promise<CaptureResult> {
  const email = rawEmail.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return { action: "skipped", reason: "invalid email" };
  }

  const name = cleanName(rawName, email);

  try {
    const contacts = await getAccountContacts(accountId);
    const existing = contacts.find(
      (c) => c.email.trim().toLowerCase() === email
    );

    if (existing) {
      const improvedName = betterName(existing.name, name);
      if (improvedName !== existing.name) {
        await updateAccountContact(accountId, existing.id, { name: improvedName });
        return { action: "updated", contactId: existing.id };
      }
      return { action: "skipped", reason: "already exists", contactId: existing.id };
    }

    const created = await createAccountContact(accountId, {
      name,
      role: "",
      email,
      phone: "",
      preferredChannel: "email",
      notes: "Auto-captured from inbound email",
    });
    return { action: "created", contactId: created.id };
  } catch (error) {
    return {
      action: "error",
      reason: error instanceof Error ? error.message : "unknown error",
    };
  }
}
