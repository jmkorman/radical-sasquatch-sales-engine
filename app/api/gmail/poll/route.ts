import { NextResponse } from "next/server";
import { getAccountsData } from "@/lib/accounts/source";
import { getAllAccounts } from "@/lib/accounts/snapshot";
import { getAccountStableId } from "@/lib/accounts/identity";
import { extractGmailMessageId } from "@/lib/activity/gmailMarkers";
import { buildGmailActivityLogId } from "@/lib/gmail/logId";
import { GmailSentMessage, getSentMessagesById, listRecentSentMessageIds } from "@/lib/gmail/sent";
import { updateCell } from "@/lib/sheets/write";
import { getContactNameColumnIndex, getEmailColumnIndex, getStatusColumnIndex } from "@/lib/sheets/schema";
import { createServerClient } from "@/lib/supabase/server";
import { insertActivityLog, updateAccountSnapshot, updateActivityLog } from "@/lib/supabase/queries";
import { AnyAccount } from "@/types/accounts";
import { captureInboundContact } from "@/lib/contacts/autoCapture";
import { captureUnmatchedDomain } from "@/lib/contacts/captureUnmatchedDomain";
import { decodeHtmlEntities } from "@/lib/utils/htmlEntities";
import { isPromotion } from "@/lib/utils/statusRank";
import { logError } from "@/lib/errors/log";
import { analyzeEmail } from "@/lib/email/analyze";
import { getNextStepsColumnIndex } from "@/lib/sheets/schema";

export const dynamic = "force-dynamic";

const EARLY_STAGE_STATUSES = new Set(["", "Identified"]);
const OWNER_EMAIL = (process.env.GMAIL_OWNER_EMAIL ?? "jake@radicalsasquatch.com").toLowerCase();
const GENERIC_DOMAINS = new Set([
  "gmail.com",
  "yahoo.com",
  "hotmail.com",
  "outlook.com",
  "icloud.com",
  "aol.com",
  "protonmail.com",
  "me.com",
  "live.com",
  "msn.com",
]);

/** Strip "Re:", "Fwd:" prefixes, lowercase, collapse whitespace. */
function normalizeSubject(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .replace(/^(?:re|fwd|fw|aw)[:\s]+/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Pull the subject out of a stored Gmail-source note (the `[Sent] X` line). */
function extractSubjectFromNote(note: string | null | undefined): string {
  if (!note) return "";
  const match = note.match(/\[(?:Sent|Received)\]\s*(.+?)$/m);
  return match ? match[1].trim() : "";
}

function parseAddr(raw: string): { name: string; email: string } {
  const match = raw.match(/^(.*?)\s*<([^>]+)>/);
  if (match) {
    return {
      name: match[1].trim().replace(/^["']|["']$/g, ""),
      email: match[2].trim().toLowerCase(),
    };
  }
  return { name: "", email: raw.trim().toLowerCase() };
}

function getDomainVariants(domain: string | null): string[] {
  if (!domain) return [];
  const normalized = domain.toLowerCase();
  const variants = new Set([normalized]);
  const parts = normalized.split(".");
  if (parts.length > 2) {
    variants.add(parts.slice(-2).join("."));
  }
  return Array.from(variants);
}

function emailDomain(email: string): string | null {
  const at = email.indexOf("@");
  if (at < 0) return null;
  const domain = email.slice(at + 1).toLowerCase();
  return GENERIC_DOMAINS.has(domain) ? null : domain;
}

function extractUrlDomain(url: string | undefined | null): string | null {
  if (!url) return null;
  const normalized = url
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .split(/[\/\s?#]/)[0]
    .split(":")[0]
    .toLowerCase();
  if (!normalized.includes(".")) return null;
  if (GENERIC_DOMAINS.has(normalized)) return null;
  return normalized;
}

function normalizeForMatch(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getSignificantAccountPhrases(accountName: string): string[] {
  const normalized = normalizeForMatch(accountName);
  if (!normalized) return [];
  const parts = normalized.split(" ").filter((part) => part.length >= 4);
  return Array.from(new Set([normalized, ...parts]));
}

function isSent(message: GmailSentMessage): boolean {
  return parseAddr(message.from).email.includes(OWNER_EMAIL);
}

function getContactAddr(message: GmailSentMessage): { name: string; email: string } | null {
  const from = parseAddr(message.from);
  const to = parseAddr(message.to);
  if (from.email && !from.email.includes(OWNER_EMAIL)) return from;
  if (to.email && !to.email.includes(OWNER_EMAIL)) return to;
  return null;
}

function getNonOwnerAddrs(message: GmailSentMessage): Array<{ name: string; email: string }> {
  return [parseAddr(message.from), parseAddr(message.to)].filter(
    (entry) => entry.email && !entry.email.includes(OWNER_EMAIL)
  );
}

function addAccountCandidate(map: Map<string, AnyAccount[]>, key: string | null, account: AnyAccount) {
  if (!key) return;
  const existing = map.get(key) ?? [];
  if (!existing.some((candidate) => candidate.id === account.id)) {
    existing.push(account);
    map.set(key, existing);
  }
}

function accountMatchesMessage(account: AnyAccount, message: GmailSentMessage, contactNames: string[]): boolean {
  const searchableText = normalizeForMatch([message.subject, message.to, message.from].join(" "));

  if (
    getSignificantAccountPhrases(account.account ?? "").some(
      (phrase) => phrase && searchableText.includes(phrase)
    )
  ) {
    return true;
  }

  const storedContactName = normalizeForMatch(account.contactName ?? "");
  if (
    storedContactName.length >= 4 &&
    contactNames.some((name) => normalizeForMatch(name).includes(storedContactName))
  ) {
    return true;
  }

  return false;
}

function matchMessage(
  message: GmailSentMessage,
  emailIdx: Map<string, AnyAccount>,
  domainIdx: Map<string, AnyAccount[]>,
  accounts: AnyAccount[]
): { account: AnyAccount; pass: "email" | "domain" | "name" } | null {
  const contactAddrs = getNonOwnerAddrs(message);
  const contactEmails = contactAddrs.map((entry) => entry.email);
  const contactNames = contactAddrs.map((entry) => entry.name).filter(Boolean);

  for (const email of contactEmails) {
    const account = emailIdx.get(email);
    if (account) return { account, pass: "email" };
  }

  const domainCandidates = new Map<string, AnyAccount>();
  for (const email of contactEmails) {
    const domain = emailDomain(email);
    for (const domainKey of getDomainVariants(domain)) {
      for (const candidate of domainIdx.get(domainKey) ?? []) {
        domainCandidates.set(candidate.id, candidate);
      }
    }
  }

  const uniqueDomainCandidates = Array.from(domainCandidates.values());
  if (uniqueDomainCandidates.length === 1) {
    return { account: uniqueDomainCandidates[0], pass: "domain" };
  }
  if (uniqueDomainCandidates.length > 1) {
    const narrowedByName = uniqueDomainCandidates.filter((account) =>
      accountMatchesMessage(account, message, contactNames)
    );
    if (narrowedByName.length === 1) {
      return { account: narrowedByName[0], pass: "domain" };
    }
  }

  const nameMatches = accounts.filter((account) => accountMatchesMessage(account, message, contactNames));
  if (nameMatches.length === 1) {
    return { account: nameMatches[0], pass: "name" };
  }

  return null;
}

async function logMessage(account: AnyAccount, message: GmailSentMessage) {
  const accountId = getAccountStableId(account);
  const logDate = message.internalDate
    ? new Date(Number(message.internalDate)).toISOString()
    : message.date
      ? new Date(message.date).toISOString()
      : new Date().toISOString();

  // Brief summary only — Gmail's snippet is already a 140-char preview.
  // Falls back to first 250 chars of the body if snippet is empty.
  // Full thread is always available in Gmail; the log just needs context.
  // Snippets arrive HTML-encoded (e.g. `you&#39;re`) — decode entities first.
  const rawSummary = decodeHtmlEntities(
    message.snippet?.trim() || message.body?.trim() || ""
  );
  const summary =
    rawSummary.length > 250 ? `${rawSummary.slice(0, 247).trimEnd()}...` : rawSummary;
  const note = [
    `[gmail-message:${message.id}]`,
    message.threadId ? `[gmail-thread:${message.threadId}]` : null,
    `[Sent] ${message.subject}`,
    "",
    summary,
  ]
    .filter((line) => line !== null)
    .join("\n");

  const insertedLog = await insertActivityLog({
    id: buildGmailActivityLogId(message.id),
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

  // Run AI analysis: suggest follow-up date + smart status transition.
  // Falls back to heuristics if Anthropic isn't configured.
  try {
    const analysis = await analyzeEmail({
      direction: "outbound",
      subject: message.subject,
      snippet: message.snippet,
      body: message.body,
      currentStatus: account.status,
    });

    // Apply follow-up date to the just-inserted log. updateActivityLog also
    // calls clearOtherFollowUpDates, which auto-clears any prior open follow-up
    // on this account — exactly what Jake wants when he sends a new email.
    if (analysis.followUpDate) {
      await updateActivityLog(insertedLog.id, { follow_up_date: analysis.followUpDate });
    }

    // Apply status transition if analyzer flagged one — but ONLY if it's a
    // promotion. An outbound email to an account already at Sample Sent or
    // Tasting Complete should never demote it back to Reached Out.
    const desiredStatus =
      analysis.suggestedStatus ??
      (EARLY_STAGE_STATUSES.has(account.status ?? "") ? "Reached Out" : null);
    if (desiredStatus && desiredStatus !== account.status && isPromotion(account.status, desiredStatus)) {
      await updateAccountSnapshot(account.id, { status: desiredStatus }).catch(() => {});
      await updateCell(
        account._tab,
        account._rowIndex,
        getStatusColumnIndex(account._tab),
        desiredStatus
      ).catch(() => {});
    }
  } catch (error) {
    await logError("gmail-poll/analyze-outbound", error, { messageId: message.id });
  }

  const contact = getContactAddr(message);
  if (!contact) return insertedLog;

  // Always add the recipient to the account's multi-contact list (deduped by email).
  // Ensures every person you email at an existing account gets captured —
  // not just the first one who happens to land on the legacy primary contact cell.
  if (contact.email) {
    await captureInboundContact(accountId, contact.name, contact.email).catch(() => {});
  }

  const needsName = !account.contactName?.trim() && contact.name;
  const needsEmail = !account.email?.trim() && contact.email;
  if (!needsName && !needsEmail) return insertedLog;

  const snapshotUpdates: Record<string, string> = {};
  if (needsName) snapshotUpdates.contact_name = contact.name;
  if (needsEmail) snapshotUpdates.email = contact.email;

  await updateAccountSnapshot(account.id, snapshotUpdates).catch(() => {});
  if (needsName) {
    await updateCell(account._tab, account._rowIndex, getContactNameColumnIndex(account._tab), contact.name).catch(
      () => {}
    );
  }
  if (needsEmail) {
    await updateCell(account._tab, account._rowIndex, getEmailColumnIndex(account._tab), contact.email).catch(
      () => {}
    );
  }

  return insertedLog;
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

    const supabase = createServerClient();
    const { data: gmailNotes } = await supabase
      .from("activity_logs")
      .select("note")
      .eq("source", "gmail")
      .limit(5000);

    const seenMessageIds = new Set<string>(
      (gmailNotes ?? [])
        .map((row) => extractGmailMessageId(row.note as string | null))
        .filter((id): id is string => id !== null)
    );
    const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const sinceStr = `${since.getFullYear()}/${String(since.getMonth() + 1).padStart(2, "0")}/${String(
      since.getDate()
    ).padStart(2, "0")}`;

    const emailIdx = new Map<string, AnyAccount>();
    const domainIdx = new Map<string, AnyAccount[]>();
    for (const account of accounts) {
      if (account.email?.trim()) {
        const email = account.email.trim().toLowerCase();
        emailIdx.set(email, account);
        for (const domainKey of getDomainVariants(emailDomain(email))) {
          addAccountCandidate(domainIdx, domainKey, account);
        }
      }

      const website = (account as unknown as { website?: string }).website;
      for (const domainKey of getDomainVariants(extractUrlDomain(website))) {
        addAccountCandidate(domainIdx, domainKey, account);
      }
    }

    const allIds = await listRecentSentMessageIds(`in:sent after:${sinceStr}`, 75);
    const newIds = allIds.filter((id) => !seenMessageIds.has(id));

    if (!newIds.length) {
      return NextResponse.json({
        imported: 0,
        checked: allIds.length,
        accounts: accounts.length,
        breakdown: { email: 0, domain: 0, name: 0 },
        lastPolledAt: new Date().toISOString(),
      });
    }

    const messages = await getSentMessagesById(newIds.slice(0, 25));

    let imported = 0;
    const breakdown = { email: 0, domain: 0, name: 0 };
    const importedAccounts: string[] = [];
    const importedAccountPaths: string[] = [];
    const importedLogIds: string[] = [];
    const unmatchedCaptured: string[] = [];

    for (const message of messages) {
      if (!isSent(message)) continue;
      if (seenMessageIds.has(message.id)) continue;

      const { count } = await supabase
        .from("activity_logs")
        .select("id", { count: "exact", head: true })
        .eq("source", "gmail")
        .ilike("note", `%gmail-message:${message.id}%`);
      if (count && count > 0) {
        seenMessageIds.add(message.id);
        continue;
      }

      // Legacy-format dedup: pre-refactor logs only have [gmail-thread:T]
      // (no gmail-message marker), so the message-ID search above misses
      // them. Match by thread ID + normalized subject — if any legacy log
      // on this thread has the same subject (after stripping Re:/Fwd:),
      // it represents the same email. Backfill the legacy log with the
      // gmail-message marker so future polls dedupe on the primary key.
      if (message.threadId) {
        const { data: threadLogs } = await supabase
          .from("activity_logs")
          .select("id, note")
          .eq("source", "gmail")
          .ilike("note", `%gmail-thread:${message.threadId}%`)
          .not("is_deleted", "eq", true);
        const messageSubjectKey = normalizeSubject(message.subject);
        const legacyMatch = (threadLogs ?? []).find((log) => {
          const note = (log.note as string | null) ?? "";
          if (note.match(/\[gmail-message:[^\]]+\]/)) return false; // already migrated
          const subjKey = normalizeSubject(extractSubjectFromNote(note));
          return subjKey && subjKey === messageSubjectKey;
        });
        if (legacyMatch) {
          // Backfill: prepend the gmail-message marker so the next poll's
          // primary-key dedup works without subject matching.
          const oldNote = (legacyMatch.note as string | null) ?? "";
          const newNote = `[gmail-message:${message.id}]\n${oldNote}`;
          await supabase
            .from("activity_logs")
            .update({ note: newNote })
            .eq("id", legacyMatch.id)
            .then(() => undefined, (err) => logError("gmail-poll/legacy-backfill", err, { logId: legacyMatch.id }));
          seenMessageIds.add(message.id);
          continue;
        }
      }

      const match = matchMessage(message, emailIdx, domainIdx, accounts);
      if (!match) {
        // Email went to / came from someone NOT in any existing account.
        // Capture as a prospect so leads aren't lost — e.g. you email
        // mark@luckys.com and Lucky's gets auto-created as a prospect.
        const recipient = getContactAddr(message);
        if (recipient?.email) {
          unmatchedCaptured.push(recipient.email);
          await captureUnmatchedDomain({
            email: recipient.email,
            name: recipient.name,
            subject: message.subject,
            direction: "outbound",
          }).catch((err) => logError("gmail-poll/unmatched-outbound", err, { messageId: message.id }));
        }
        continue;
      }

      seenMessageIds.add(message.id);
      const insertedLog = await logMessage(match.account, message);
      importedAccounts.push(match.account.account ?? "");
      importedAccountPaths.push(`/accounts/${match.account._tabSlug}/${match.account._rowIndex}`);
      importedLogIds.push(insertedLog.id);
      breakdown[match.pass]++;
      imported++;
    }

    // Dedup pass: for each fetched message, find all logs on its thread.
    // Match by (a) explicit gmail-message:ID OR (b) legacy log with the same
    // normalized subject. Keep the oldest, soft-delete the rest. Subject
    // matching is more reliable than a time window since legacy logs have
    // created_at = poll time, not email send time.
    for (const message of messages) {
      if (!message.threadId) continue;
      const messageSubjectKey = normalizeSubject(message.subject);

      const { data: threadLogs } = await supabase
        .from("activity_logs")
        .select("id, created_at, note")
        .eq("source", "gmail")
        .ilike("note", `%gmail-thread:${message.threadId}%`)
        .not("is_deleted", "eq", true)
        .order("created_at", { ascending: true });

      if (!threadLogs || threadLogs.length <= 1) continue;

      const matchingThis = threadLogs.filter((log) => {
        const note = (log.note as string | null) ?? "";
        if (note.includes(`gmail-message:${message.id}`)) return true;
        if (!note.match(/\[gmail-message:[^\]]+\]/)) {
          const subjKey = normalizeSubject(extractSubjectFromNote(note));
          return Boolean(subjKey) && subjKey === messageSubjectKey;
        }
        return false;
      });

      if (matchingThis.length > 1) {
        const toDelete = matchingThis.slice(1).map((log) => log.id as string);
        await supabase.from("activity_logs").update({ is_deleted: true }).in("id", toDelete);
      }
    }

    // -------------------------------------------------------------------------
    // Inbound contact auto-capture
    // When someone emails Jake, try to match the sender to an account and
    // add/enrich their contact entry. Uses layered fallbacks for accuracy:
    //   1. Thread match — look up existing gmail log with the same threadId
    //      to find the exact account we've already associated with this thread
    //   2. Email domain match — sender's domain matches account email/website
    //   3. Name match — account name appears in subject/body
    // -------------------------------------------------------------------------
    const inboundCapture = { created: 0, updated: 0, skipped: 0, errors: 0 };
    const inboundAnalysis = { actionItemsAdded: 0, statusChanges: 0, errors: 0 };
    try {
      const inboundIds = await listRecentSentMessageIds(`in:inbox after:${sinceStr}`, 50);
      if (inboundIds.length) {
        const inboundMessages = await getSentMessagesById(inboundIds.slice(0, 25));
        for (const message of inboundMessages) {
          // Skip our own sent messages that may show in inbox
          if (isSent(message)) continue;
          const sender = parseAddr(message.from);
          if (!sender.email || sender.email.includes(OWNER_EMAIL)) continue;

          // Fallback 1: thread match — most reliable
          let accountId: string | null = null;
          let matchedAccount: AnyAccount | null = null;
          if (message.threadId) {
            const { data: threadLogs } = await supabase
              .from("activity_logs")
              .select("account_id")
              .eq("source", "gmail")
              .ilike("note", `%gmail-thread:${message.threadId}%`)
              .not("is_deleted", "eq", true)
              .limit(1);
            if (threadLogs && threadLogs.length > 0 && threadLogs[0].account_id) {
              accountId = threadLogs[0].account_id as string;
              matchedAccount = accounts.find((a) => getAccountStableId(a) === accountId) ?? null;
            }
          }

          // Fallback 2 + 3: domain / name match
          if (!accountId) {
            const match = matchMessage(message, emailIdx, domainIdx, accounts);
            if (match) {
              matchedAccount = match.account;
              accountId = getAccountStableId(match.account);
            }
          }

          if (!accountId) {
            inboundCapture.skipped++;
            // Reply from a domain not in the pipeline — auto-create a prospect
            // so it shows up in /prospecting for review.
            unmatchedCaptured.push(sender.email);
            await captureUnmatchedDomain({
              email: sender.email,
              name: sender.name,
              subject: message.subject,
              direction: "inbound",
            }).catch((err) =>
              logError("gmail-poll/unmatched-inbound", err, { messageId: message.id })
            );
            continue;
          }

          const result = await captureInboundContact(accountId, sender.name, sender.email);
          if (result.action === "created") inboundCapture.created++;
          else if (result.action === "updated") inboundCapture.updated++;
          else if (result.action === "error") inboundCapture.errors++;
          else inboundCapture.skipped++;

          // ---- Inbound analysis: action items + status transitions ----
          // Dedup: if we've already processed this message (logged it as a
          // [Received] activity), skip the analysis to avoid double-appending
          // action items.
          if (!matchedAccount) continue;
          if (seenMessageIds.has(message.id)) continue;

          const { count: alreadyLogged } = await supabase
            .from("activity_logs")
            .select("id", { count: "exact", head: true })
            .eq("source", "gmail")
            .ilike("note", `%gmail-message:${message.id}%`);
          if (alreadyLogged && alreadyLogged > 0) {
            seenMessageIds.add(message.id);
            continue;
          }

          try {
            const analysis = await analyzeEmail({
              direction: "inbound",
              subject: message.subject,
              snippet: message.snippet,
              body: message.body,
              currentStatus: matchedAccount.status,
            });

            // Build the [Received] log so future polls dedupe via gmail-message marker
            const briefBody = decodeHtmlEntities(
              message.snippet?.trim() || message.body?.trim() || ""
            ).slice(0, 250);
            const actionItemsBlock = analysis.actionItems.length
              ? `\n\nAction items:\n${analysis.actionItems.map((item) => `- ${item}`).join("\n")}`
              : "";
            const inboundNote = [
              `[gmail-message:${message.id}]`,
              message.threadId ? `[gmail-thread:${message.threadId}]` : null,
              `[Received] ${message.subject}`,
              `From: ${sender.name || sender.email} <${sender.email}>`,
              "",
              briefBody,
              actionItemsBlock,
            ]
              .filter((line) => line !== null)
              .join("\n")
              .trim();

            const inboundLogDate = message.internalDate
              ? new Date(Number(message.internalDate)).toISOString()
              : new Date().toISOString();

            await insertActivityLog({
              id: buildGmailActivityLogId(message.id),
              account_id: accountId,
              tab: matchedAccount._tab,
              row_index: matchedAccount._rowIndex,
              account_name: matchedAccount.account,
              action_type: "email",
              note: inboundNote,
              source: "gmail",
              activity_kind: "note",
              counts_as_contact: false,
              created_at: inboundLogDate,
            });
            seenMessageIds.add(message.id);

            // Append action items to the account's Next Steps so they show up in the pipeline view
            if (analysis.actionItems.length) {
              const dateLabel = new Date().toISOString().slice(0, 10);
              const newLines = analysis.actionItems.map((item) => `- ${item}`).join("\n");
              const existingNextSteps = (matchedAccount.nextSteps ?? "").trim();
              const stamped = `(${dateLabel} from email reply)\n${newLines}`;
              const merged = existingNextSteps ? `${existingNextSteps}\n\n${stamped}` : stamped;
              await updateAccountSnapshot(accountId, { next_steps: merged }).catch(() => {});
              await updateCell(
                matchedAccount._tab,
                matchedAccount._rowIndex,
                getNextStepsColumnIndex(matchedAccount._tab),
                merged
              ).catch(() => {});
              inboundAnalysis.actionItemsAdded += analysis.actionItems.length;
            }

            // Apply suggested status transition
            if (
              analysis.suggestedStatus &&
              analysis.suggestedStatus !== matchedAccount.status &&
              isPromotion(matchedAccount.status, analysis.suggestedStatus)
            ) {
              await updateAccountSnapshot(accountId, { status: analysis.suggestedStatus }).catch(
                () => {}
              );
              await updateCell(
                matchedAccount._tab,
                matchedAccount._rowIndex,
                getStatusColumnIndex(matchedAccount._tab),
                analysis.suggestedStatus
              ).catch(() => {});
              inboundAnalysis.statusChanges++;
            }
          } catch (error) {
            inboundAnalysis.errors++;
            await logError("gmail-poll/analyze-inbound", error, { messageId: message.id });
          }
        }
      }
    } catch (error) {
      await logError("gmail-poll/inbound", error);
    }

    return NextResponse.json({
      imported,
      importedAccounts,
      importedAccountPaths,
      importedLogIds,
      checked: allIds.length,
      accounts: accounts.length,
      breakdown,
      inboundCapture,
      inboundAnalysis,
      unmatchedCaptured: Array.from(new Set(unmatchedCaptured)),
      lastPolledAt: new Date().toISOString(),
    });
  } catch (error) {
    await logError("gmail-poll", error);
    return NextResponse.json({ error: "Poll failed" }, { status: 500 });
  }
}
