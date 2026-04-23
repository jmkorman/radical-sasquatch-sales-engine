import { NextResponse } from "next/server";
import { getAccountsData } from "@/lib/accounts/source";
import { getAllAccounts } from "@/lib/accounts/snapshot";
import { listRecentThreadIds, getThreadDetailsById, GmailThread } from "@/lib/gmail/threads";
import { insertActivityLog, updateAccountSnapshot } from "@/lib/supabase/queries";
import { createServerClient } from "@/lib/supabase/server";
import { getAccountStableId } from "@/lib/accounts/identity";
import { updateCell } from "@/lib/sheets/write";
import { getContactNameColumnIndex, getEmailColumnIndex } from "@/lib/sheets/schema";
import { AnyAccount } from "@/types/accounts";

export const dynamic = "force-dynamic";

const OWNER_EMAIL = (process.env.GMAIL_OWNER_EMAIL ?? "jake@radicalsasquatch.com").toLowerCase();
const GENERIC_DOMAINS = new Set([
  "gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "icloud.com",
  "aol.com", "protonmail.com", "me.com", "live.com", "msn.com",
]);

function extractThreadId(note: string | null): string | null {
  if (!note) return null;
  const match = note.match(/\[gmail-thread:([^\]]+)\]/);
  return match ? match[1] : null;
}

function parseAddr(raw: string): { name: string; email: string } {
  const match = raw.match(/^(.*?)\s*<([^>]+)>/);
  if (match) return { name: match[1].trim().replace(/^["']|["']$/g, ""), email: match[2].trim().toLowerCase() };
  return { name: "", email: raw.trim().toLowerCase() };
}

function emailDomain(email: string): string | null {
  const at = email.indexOf("@");
  if (at < 0) return null;
  const domain = email.slice(at + 1).toLowerCase();
  return GENERIC_DOMAINS.has(domain) ? null : domain;
}

function extractUrlDomain(url: string | undefined | null): string | null {
  if (!url) return null;
  const normalized = url.trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .split(/[\/\s?#]/)[0]
    .split(":")[0]
    .toLowerCase();
  if (!normalized.includes(".")) return null;
  if (GENERIC_DOMAINS.has(normalized)) return null;
  return normalized;
}

function isSent(thread: GmailThread): boolean {
  return parseAddr(thread.from).email.includes(OWNER_EMAIL);
}

function getContactAddr(thread: GmailThread): { name: string; email: string } | null {
  const from = parseAddr(thread.from);
  const to = parseAddr(thread.to);
  if (from.email && !from.email.includes(OWNER_EMAIL)) return from;
  if (to.email && !to.email.includes(OWNER_EMAIL)) return to;
  return null;
}

function getNonOwnerEmails(thread: GmailThread): string[] {
  return [parseAddr(thread.from).email, parseAddr(thread.to).email]
    .filter((e) => e && !e.includes(OWNER_EMAIL));
}

function matchThread(
  thread: GmailThread,
  emailIdx: Map<string, AnyAccount>,
  domainIdx: Map<string, AnyAccount>,
  accounts: AnyAccount[],
): { account: AnyAccount; pass: "email" | "domain" | "name" } | null {
  const contactEmails = getNonOwnerEmails(thread);

  // Pass 1: exact email match
  for (const email of contactEmails) {
    const acc = emailIdx.get(email);
    if (acc) return { account: acc, pass: "email" };
  }

  // Pass 2: email domain → account website or stored-email domain
  for (const email of contactEmails) {
    const domain = emailDomain(email);
    if (domain) {
      const acc = domainIdx.get(domain);
      if (acc) return { account: acc, pass: "domain" };
    }
  }

  // Pass 3: account name appears in subject
  const subjectLower = thread.subject.toLowerCase();
  for (const account of accounts) {
    const name = account.account?.trim();
    if (!name || name.length < 5) continue;
    if (subjectLower.includes(name.toLowerCase())) return { account, pass: "name" };
  }

  return null;
}

async function logThread(account: AnyAccount, thread: GmailThread) {
  const accountId = getAccountStableId(account);
  const threadDate = thread.latestMessageDate || thread.date;
  const logDate = threadDate ? new Date(threadDate).toISOString() : new Date().toISOString();

  // Thread ID marker goes first so it's never truncated by DB field limits
  // Body capped at 3000 chars; fall back to snippet if body is empty
  const emailBody = (thread.body?.trim() || thread.snippet.trim()).slice(0, 3000);
  const note = `[gmail-thread:${thread.id}]\n[Sent] ${thread.subject}\n\n${emailBody}`;

  await insertActivityLog({
    account_id: accountId,
    tab: account._tab,
    row_index: account._rowIndex,
    account_name: account.account,
    action_type: "email",
    note,
    source: "gmail",
    activity_kind: "outreach",
    counts_as_contact: true,
    created_at: logDate,
  });

  // Auto-populate contact name + email when account fields are empty
  const contact = getContactAddr(thread);
  if (!contact) return;
  const needsName = !account.contactName?.trim() && contact.name;
  const needsEmail = !account.email?.trim() && contact.email;
  if (!needsName && !needsEmail) return;

  const snapshotUpdates: Record<string, string> = {};
  if (needsName) snapshotUpdates.contact_name = contact.name;
  if (needsEmail) snapshotUpdates.email = contact.email;
  await updateAccountSnapshot(account.id, snapshotUpdates).catch(() => {});
  if (needsName) await updateCell(account._tab, account._rowIndex, getContactNameColumnIndex(account._tab), contact.name).catch(() => {});
  if (needsEmail) await updateCell(account._tab, account._rowIndex, getEmailColumnIndex(account._tab), contact.email).catch(() => {});
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
    if (!accounts.length) return NextResponse.json({ imported: 0, checked: 0, accounts: 0 });

    // Build set of already-logged Gmail thread IDs.
    // Direct query without is_deleted filter — gmail entries are inserted without
    // is_deleted set, so null != false would exclude them from getActivityLogs().
    const supabase = createServerClient();
    const { data: gmailNotes } = await supabase
      .from("activity_logs")
      .select("note")
      .eq("source", "gmail");
    const seenThreadIds = new Set<string>(
      (gmailNotes ?? [])
        .map((r) => extractThreadId(r.note as string | null))
        .filter((id): id is string => id !== null)
    );

    // 14-day lookback
    const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const sinceStr = `${since.getFullYear()}/${String(since.getMonth() + 1).padStart(2, "0")}/${String(since.getDate()).padStart(2, "0")}`;

    // Build local match indexes — no per-account API calls
    const emailIdx = new Map<string, AnyAccount>();
    const domainIdx = new Map<string, AnyAccount>();
    for (const account of accounts) {
      if (account.email?.trim()) {
        const email = account.email.trim().toLowerCase();
        emailIdx.set(email, account);
        const domain = emailDomain(email);
        if (domain && !domainIdx.has(domain)) domainIdx.set(domain, account);
      }
      const website = (account as unknown as { website?: string }).website;
      const urlDomain = extractUrlDomain(website);
      if (urlDomain && !domainIdx.has(urlDomain)) domainIdx.set(urlDomain, account);
    }

    // Only log sent emails
    const allIds = await listRecentThreadIds(`in:sent after:${sinceStr}`, 50);
    const newIds = allIds.filter((id) => !seenThreadIds.has(id));

    if (!newIds.length) {
      return NextResponse.json({
        imported: 0,
        checked: allIds.length,
        accounts: accounts.length,
        breakdown: { email: 0, domain: 0, name: 0 },
        lastPolledAt: new Date().toISOString(),
      });
    }

    // Fetch details only for unseen threads (max 20 per poll cycle)
    const threads = await getThreadDetailsById(newIds.slice(0, 20));

    let imported = 0;
    const breakdown = { email: 0, domain: 0, name: 0 };

    for (const thread of threads) {
      // Only process threads where we are the sender
      if (!isSent(thread)) continue;
      if (seenThreadIds.has(thread.id)) continue;

      // Per-thread DB check — handles concurrent polls and pagination limits
      const { count } = await supabase
        .from("activity_logs")
        .select("id", { count: "exact", head: true })
        .eq("source", "gmail")
        .like("note", `%[gmail-thread:${thread.id}]%`);
      if (count && count > 0) {
        seenThreadIds.add(thread.id);
        continue;
      }

      const match = matchThread(thread, emailIdx, domainIdx, accounts);
      if (!match) continue;
      seenThreadIds.add(thread.id);
      await logThread(match.account, thread);
      breakdown[match.pass]++;
      imported++;
    }

    return NextResponse.json({
      imported,
      checked: allIds.length,
      accounts: accounts.length,
      breakdown,
      lastPolledAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Gmail poll error:", error);
    return NextResponse.json({ error: "Poll failed" }, { status: 500 });
  }
}
