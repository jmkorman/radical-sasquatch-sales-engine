import { NextResponse } from "next/server";
import { getAccountsData } from "@/lib/accounts/source";
import { getAllAccounts } from "@/lib/accounts/snapshot";
import { searchThreadsByEmail, searchThreadsByQuery, GmailThread } from "@/lib/gmail/threads";
import { getActivityLogs, insertActivityLog, updateAccountSnapshot } from "@/lib/supabase/queries";
import { getAccountStableId } from "@/lib/accounts/identity";
import { updateCell } from "@/lib/sheets/write";
import { getContactNameColumnIndex, getEmailColumnIndex } from "@/lib/sheets/schema";
import { AnyAccount } from "@/types/accounts";

export const dynamic = "force-dynamic";

// The authenticated Gmail account — used to detect direction and the contact side
const OWNER_EMAIL = (process.env.GMAIL_OWNER_EMAIL ?? "jake@radicalsasquatch.com").toLowerCase();

function extractThreadId(note: string | null): string | null {
  if (!note) return null;
  const match = note.match(/\[gmail-thread:([^\]]+)\]/);
  return match ? match[1] : null;
}

function parseFrom(raw: string): { name: string; email: string } {
  const match = raw.match(/^(.*?)\s*<([^>]+)>/);
  if (match) {
    return {
      name: match[1].trim().replace(/^["']|["']$/g, ""),
      email: match[2].trim().toLowerCase(),
    };
  }
  return { name: "", email: raw.trim().toLowerCase() };
}

function extractDomainFromUrl(url: string | undefined | null): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  const normalized = trimmed
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .split(/[\/\s?#]/)[0]
    .split(":")[0]
    .toLowerCase();
  // Reject obvious non-domains
  if (!normalized.includes(".")) return null;
  // Skip generic domains that would match way too many emails
  const generic = ["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "icloud.com", "aol.com"];
  if (generic.includes(normalized)) return null;
  return normalized;
}

function detectDirection(thread: GmailThread): "sent" | "received" {
  const fromEmail = parseFrom(thread.from).email;
  return fromEmail.includes(OWNER_EMAIL) ? "sent" : "received";
}

function extractContact(thread: GmailThread): { name: string; email: string } | null {
  const from = parseFrom(thread.from);
  const to = parseFrom(thread.to);
  if (from.email && !from.email.includes(OWNER_EMAIL)) return from;
  if (to.email && !to.email.includes(OWNER_EMAIL)) return to;
  return null;
}

async function logThread(account: AnyAccount, thread: GmailThread) {
  const accountId = getAccountStableId(account);
  const threadDate = thread.latestMessageDate || thread.date;
  const logDate = threadDate ? new Date(threadDate).toISOString() : new Date().toISOString();
  const direction = detectDirection(thread);
  const tag = direction === "sent" ? "[Sent]" : "[Received]";

  await insertActivityLog({
    account_id: accountId,
    tab: account._tab,
    row_index: account._rowIndex,
    account_name: account.account,
    action_type: "email",
    note: `${tag} ${thread.subject}\n\n${thread.snippet.trim()}\n\n[gmail-thread:${thread.id}]`,
    source: "gmail",
    activity_kind: "outreach",
    counts_as_contact: true,
    created_at: logDate,
  });

  // Auto-populate contact fields when empty
  const contact = extractContact(thread);
  if (!contact) return;

  const needsName = !account.contactName?.trim() && contact.name;
  const needsEmail = !account.email?.trim() && contact.email;
  if (!needsName && !needsEmail) return;

  const snapshotUpdates: Record<string, string> = {};
  if (needsName) snapshotUpdates.contact_name = contact.name;
  if (needsEmail) snapshotUpdates.email = contact.email;

  await updateAccountSnapshot(account.id, snapshotUpdates).catch(() => {});

  if (needsName) {
    await updateCell(
      account._tab, account._rowIndex,
      getContactNameColumnIndex(account._tab), contact.name
    ).catch(() => {});
  }
  if (needsEmail) {
    await updateCell(
      account._tab, account._rowIndex,
      getEmailColumnIndex(account._tab), contact.email
    ).catch(() => {});
  }
}

export async function GET() {
  if (!process.env.GMAIL_CLIENT_ID || !process.env.GMAIL_REFRESH_TOKEN) {
    return NextResponse.json({ skipped: true, reason: "Gmail not configured" });
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return NextResponse.json({ skipped: true, reason: "Supabase not configured" });
  }

  try {
    const { data } = await getAccountsData();
    const accounts = getAllAccounts(data);

    if (!accounts.length) {
      return NextResponse.json({ imported: 0, checked: 0, accounts: 0 });
    }

    // Build set of already-seen thread IDs across all Gmail-sourced logs
    const allLogs = await getActivityLogs();
    const seenThreadIds = new Set(
      allLogs
        .filter((l) => l.source === "gmail")
        .map((l) => extractThreadId(l.note))
        .filter(Boolean) as string[]
    );

    const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const sinceStr = `${since.getFullYear()}/${String(since.getMonth() + 1).padStart(2, "0")}/${String(since.getDate()).padStart(2, "0")}`;

    let imported = 0;
    let checked = 0;
    const breakdown = { email: 0, domain: 0, name: 0 };

    // Pass 1: Match by email address (highest confidence)
    const emailToAccount = new Map<string, AnyAccount>();
    for (const account of accounts) {
      if (account.email?.trim()) {
        emailToAccount.set(account.email.trim().toLowerCase(), account);
      }
    }
    for (const [email, account] of emailToAccount) {
      try {
        const threads = await searchThreadsByEmail(email, { since: sinceStr });
        checked += threads.length;
        for (const thread of threads) {
          if (seenThreadIds.has(thread.id)) continue;
          seenThreadIds.add(thread.id);
          await logThread(account, thread);
          imported++;
          breakdown.email++;
        }
      } catch (err) {
        console.error(`Gmail poll error for email ${email}:`, err);
      }
    }

    // Pass 2: Match by website domain (catches new contacts at known accounts)
    const domainToAccount = new Map<string, AnyAccount>();
    for (const account of accounts) {
      const website = "website" in account ? (account as { website?: string }).website : "";
      const domain = extractDomainFromUrl(website);
      if (domain && !domainToAccount.has(domain)) {
        domainToAccount.set(domain, account);
      }
    }
    for (const [domain, account] of domainToAccount) {
      try {
        const threads = await searchThreadsByQuery(
          `(from:${domain} OR to:${domain}) after:${sinceStr}`
        );
        checked += threads.length;
        for (const thread of threads) {
          if (seenThreadIds.has(thread.id)) continue;
          seenThreadIds.add(thread.id);
          await logThread(account, thread);
          imported++;
          breakdown.domain++;
        }
      } catch (err) {
        console.error(`Gmail poll error for domain ${domain}:`, err);
      }
    }

    // Pass 3: Match by account name in subject (catches forwards/renamed threads)
    for (const account of accounts) {
      const name = account.account?.trim();
      if (!name || name.length < 5) continue;
      try {
        const threads = await searchThreadsByQuery(`subject:"${name}" after:${sinceStr}`);
        checked += threads.length;
        for (const thread of threads) {
          if (seenThreadIds.has(thread.id)) continue;
          seenThreadIds.add(thread.id);
          await logThread(account, thread);
          imported++;
          breakdown.name++;
        }
      } catch (err) {
        console.error(`Gmail poll error for account name "${name}":`, err);
      }
    }

    return NextResponse.json({
      imported,
      checked,
      accounts: accounts.length,
      breakdown,
      lastPolledAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Gmail poll error:", error);
    return NextResponse.json({ error: "Poll failed" }, { status: 500 });
  }
}
