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
import { decodeHtmlEntities } from "@/lib/utils/htmlEntities";
import { isPromotion } from "@/lib/utils/statusRank";
import { logError } from "@/lib/errors/log";
import { analyzeEmail } from "@/lib/email/analyze";
import { getNextStepsColumnIndex } from "@/lib/sheets/schema";
import {
  buildIndexes,
  getContactAddr,
  isNewsletter,
  isOwnerEmail,
  isSent,
  parseAddr,
  scoreMessage,
  scoreCandidates,
  emailDomain,
  MatchIndexes,
} from "@/lib/email/matcher";
import { disambiguate } from "@/lib/email/disambiguator";
import { inferAndCreateAccount } from "@/lib/email/inferAccount";
import { extractSignatureFields } from "@/lib/email/signature";
import { getPhoneColumnIndex } from "@/lib/sheets/schema";
import { getAccountContacts, updateAccountContact } from "@/lib/contacts/store";

export const dynamic = "force-dynamic";

const EARLY_STAGE_STATUSES = new Set(["", "Identified"]);

/** Strip "Re:", "Fwd:" prefixes, lowercase, collapse whitespace. */
function normalizeSubject(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .replace(/^(?:re|fwd|fw|aw)[:\s]+/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function extractSubjectFromNote(note: string | null | undefined): string {
  if (!note) return "";
  const match = note.match(/\[(?:Sent|Received)\]\s*(.+?)$/m);
  return match ? match[1].trim() : "";
}

/**
 * Resolve the message → account match, using:
 *   1. Confidence-scored matcher
 *   2. AI tiebreaker for ambiguous results (when 2+ candidates score >= 50)
 * Returns null when the matcher cannot confidently attribute.
 */
async function resolveMatch(
  message: GmailSentMessage,
  indexes: MatchIndexes,
  threadAccountId: string | null
): Promise<{ account: AnyAccount; via: "score" | "ai" } | null> {
  const outcome = scoreMessage(message, indexes, threadAccountId);
  if (outcome.kind === "match") {
    return { account: outcome.result.account, via: "score" };
  }

  // Only ambiguous / below-threshold cases with multiple candidates are
  // worth asking the AI about. "no_candidates" means there's nothing to
  // disambiguate.
  if (outcome.skip.reason === "no_candidates") return null;

  const candidates = scoreCandidates(message, indexes, threadAccountId)
    .filter((c) => c.score >= 50)
    .slice(0, 3);

  if (candidates.length < 2) return null;

  const decision = await disambiguate({ message, candidates });
  if (!decision.accountId) return null;

  const winner = candidates.find((c) => c.account.id === decision.accountId);
  return winner ? { account: winner.account, via: "ai" } : null;
}

async function logMessage(account: AnyAccount, message: GmailSentMessage) {
  const accountId = getAccountStableId(account);
  const logDate = message.internalDate
    ? new Date(Number(message.internalDate)).toISOString()
    : message.date
      ? new Date(message.date).toISOString()
      : new Date().toISOString();

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

  try {
    const analysis = await analyzeEmail({
      direction: "outbound",
      subject: message.subject,
      snippet: message.snippet,
      body: message.body,
      currentStatus: account.status,
    });

    if (analysis.followUpDate) {
      await updateActivityLog(insertedLog.id, { follow_up_date: analysis.followUpDate });
    }

    const desiredStatus =
      analysis.suggestedStatus ??
      (EARLY_STAGE_STATUSES.has(account.status ?? "") ? "Reached Out" : null);
    const allowChange =
      desiredStatus === "Not a Fit" || isPromotion(account.status, desiredStatus);
    if (desiredStatus && desiredStatus !== account.status && allowChange) {
      await updateAccountSnapshot(account.id, { status: desiredStatus }).catch(() => {});
      // Skip the sheet sync for auto-created accounts — they don't have a row
      // yet. The sheet sync layer can pick them up on next reconciliation.
      if (account._rowIndex > 0) {
        await updateCell(
          account._tab,
          account._rowIndex,
          getStatusColumnIndex(account._tab),
          desiredStatus
        ).catch(() => {});
      }
    }
  } catch (error) {
    await logError("gmail-poll/analyze-outbound", error, { messageId: message.id });
  }

  const contact = getContactAddr(message);
  if (!contact) return insertedLog;

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
  if (account._rowIndex > 0) {
    if (needsName) {
      await updateCell(
        account._tab,
        account._rowIndex,
        getContactNameColumnIndex(account._tab),
        contact.name
      ).catch(() => {});
    }
    if (needsEmail) {
      await updateCell(
        account._tab,
        account._rowIndex,
        getEmailColumnIndex(account._tab),
        contact.email
      ).catch(() => {});
    }
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

    // Mutable account universe — auto-inferred accounts get appended here so
    // subsequent messages in the same poll batch can match them too.
    const liveAccounts: AnyAccount[] = [...accounts];
    let indexes = buildIndexes(liveAccounts);

    const allIds = await listRecentSentMessageIds(`in:sent after:${sinceStr}`, 75);
    const newIds = allIds.filter((id) => !seenMessageIds.has(id));

    if (!newIds.length) {
      return NextResponse.json({
        imported: 0,
        checked: allIds.length,
        accounts: accounts.length,
        breakdown: { score: 0, ai: 0, inferred: 0, skipped: 0 },
        lastPolledAt: new Date().toISOString(),
      });
    }

    const messages = await getSentMessagesById(newIds.slice(0, 25));

    let imported = 0;
    const breakdown = { score: 0, ai: 0, inferred: 0, pendingReview: 0, skipped: 0 };
    const importedAccounts: string[] = [];
    const importedAccountPaths: string[] = [];
    const importedLogIds: string[] = [];
    const inferredAccounts: Array<{ name: string; tab: string; reason: string }> = [];
    const pendingReview: Array<{ name: string; tab: string; reason: string }> = [];

    for (const message of messages) {
      if (!isSent(message)) continue;
      if (isNewsletter(message)) continue;
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

      // Legacy-format dedup (pre-message-id markers): match by thread + subject.
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
          if (note.match(/\[gmail-message:[^\]]+\]/)) return false;
          const subjKey = normalizeSubject(extractSubjectFromNote(note));
          return subjKey && subjKey === messageSubjectKey;
        });
        if (legacyMatch) {
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

      // Thread bias: if there's an existing log on this thread, find its account.
      let threadAccountId: string | null = null;
      if (message.threadId) {
        const { data: threadLogs } = await supabase
          .from("activity_logs")
          .select("account_id")
          .eq("source", "gmail")
          .ilike("note", `%gmail-thread:${message.threadId}%`)
          .not("is_deleted", "eq", true)
          .limit(1);
        if (threadLogs && threadLogs.length > 0 && threadLogs[0].account_id) {
          threadAccountId = threadLogs[0].account_id as string;
        }
      }

      const resolved = await resolveMatch(message, indexes, threadAccountId);

      // No match → try to auto-infer a new account from the email content.
      if (!resolved) {
        const created = await inferAndCreateAccount({ message, existingAccounts: liveAccounts });
        if (created) {
          seenMessageIds.add(message.id);
          // Log the triggering email against the new account either way so the
          // first-touch is preserved once it's live.
          const insertedLog = await logMessage(created.account, message);
          importedLogIds.push(insertedLog.id);

          if (created.pending) {
            // Parked for manual review — keep it out of the live match index
            // and the imported tally until Jake approves it.
            pendingReview.push({
              name: created.account.account,
              tab: created.account._tab,
              reason: created.inference.reason,
            });
            breakdown.pendingReview++;
            continue;
          }

          liveAccounts.push(created.account);
          indexes = buildIndexes(liveAccounts);
          importedAccounts.push(created.account.account);
          importedAccountPaths.push(
            `/accounts/${created.account._tabSlug}/${created.account._rowIndex}`
          );
          inferredAccounts.push({
            name: created.account.account,
            tab: created.account._tab,
            reason: created.inference.reason,
          });
          breakdown.inferred++;
          imported++;
          continue;
        }

        // Couldn't match and couldn't confidently infer. Log to error_logs
        // as a low-severity audit trail so Jake can see what's being missed.
        breakdown.skipped++;
        await logError(
          "gmail-poll/skipped-no-match",
          "Email matcher could not attribute message",
          {
            messageId: message.id,
            subject: message.subject,
            from: message.from,
            to: message.to,
          },
          "warn"
        );
        continue;
      }

      seenMessageIds.add(message.id);
      const insertedLog = await logMessage(resolved.account, message);
      importedAccounts.push(resolved.account.account ?? "");
      importedAccountPaths.push(`/accounts/${resolved.account._tabSlug}/${resolved.account._rowIndex}`);
      importedLogIds.push(insertedLog.id);
      breakdown[resolved.via]++;
      imported++;
    }

    // Dedup pass: collapse duplicate logs per thread (same as before).
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
    // Inbound contact auto-capture (same indexes, same scorer)
    // -------------------------------------------------------------------------
    const inboundCapture = { created: 0, updated: 0, skipped: 0, errors: 0 };
    const inboundAnalysis = { actionItemsAdded: 0, statusChanges: 0, errors: 0 };
    try {
      const inboundIds = await listRecentSentMessageIds(`in:inbox after:${sinceStr}`, 50);
      if (inboundIds.length) {
        const inboundMessages = await getSentMessagesById(inboundIds.slice(0, 25));
        for (const message of inboundMessages) {
          if (isSent(message)) continue;
          if (isNewsletter(message)) continue;
          const sender = parseAddr(message.from);
          if (!sender.email || isOwnerEmail(sender.email)) continue;

          // Thread bias for inbound mail
          let threadAccountId: string | null = null;
          if (message.threadId) {
            const { data: threadLogs } = await supabase
              .from("activity_logs")
              .select("account_id")
              .eq("source", "gmail")
              .ilike("note", `%gmail-thread:${message.threadId}%`)
              .not("is_deleted", "eq", true)
              .limit(1);
            if (threadLogs && threadLogs.length > 0 && threadLogs[0].account_id) {
              threadAccountId = threadLogs[0].account_id as string;
            }
          }

          const resolved = await resolveMatch(message, indexes, threadAccountId);
          if (!resolved) {
            inboundCapture.skipped++;
            continue;
          }

          const matchedAccount = resolved.account;
          const accountId = getAccountStableId(matchedAccount);

          const result = await captureInboundContact(accountId, sender.name, sender.email);
          if (result.action === "created") inboundCapture.created++;
          else if (result.action === "updated") inboundCapture.updated++;
          else if (result.action === "error") inboundCapture.errors++;
          else inboundCapture.skipped++;

          // Signature enrichment: pull phone/title/website from the sig block
          // and fill blanks on the contact + account (never overwrite).
          try {
            const senderDomain = emailDomain(sender.email);
            const sig = extractSignatureFields(
              message.body,
              senderDomain ? [senderDomain] : []
            );
            if (result.contactId && (sig.phone || sig.title)) {
              const contacts = await getAccountContacts(accountId);
              const contact = contacts.find((c) => c.id === result.contactId);
              if (contact) {
                const updates: { phone?: string; role?: string } = {};
                if (sig.phone && !contact.phone?.trim()) updates.phone = sig.phone;
                if (sig.title && !contact.role?.trim()) updates.role = sig.title;
                if (Object.keys(updates).length) {
                  await updateAccountContact(accountId, contact.id, updates).catch(() => {});
                }
              }
            }
            // Account-level phone: fill only if the account has none.
            if (sig.phone && !matchedAccount.phone?.trim()) {
              await updateAccountSnapshot(accountId, { phone: sig.phone }).catch(() => {});
              if (matchedAccount._rowIndex > 0) {
                await updateCell(
                  matchedAccount._tab,
                  matchedAccount._rowIndex,
                  getPhoneColumnIndex(matchedAccount._tab),
                  sig.phone
                ).catch(() => {});
              }
            }
          } catch (error) {
            await logError("gmail-poll/signature-enrich", error, { messageId: message.id }, "warn");
          }

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

            if (analysis.actionItems.length) {
              const dateLabel = new Date().toISOString().slice(0, 10);
              const newLines = analysis.actionItems.map((item) => `- ${item}`).join("\n");
              const existingNextSteps = (matchedAccount.nextSteps ?? "").trim();
              const stamped = `(${dateLabel} from email reply)\n${newLines}`;
              const merged = existingNextSteps ? `${existingNextSteps}\n\n${stamped}` : stamped;
              await updateAccountSnapshot(accountId, { next_steps: merged }).catch(() => {});
              if (matchedAccount._rowIndex > 0) {
                await updateCell(
                  matchedAccount._tab,
                  matchedAccount._rowIndex,
                  getNextStepsColumnIndex(matchedAccount._tab),
                  merged
                ).catch(() => {});
              }
              inboundAnalysis.actionItemsAdded += analysis.actionItems.length;
            }

            if (
              analysis.suggestedStatus &&
              analysis.suggestedStatus !== matchedAccount.status &&
              (analysis.suggestedStatus === "Not a Fit" ||
                isPromotion(matchedAccount.status, analysis.suggestedStatus))
            ) {
              await updateAccountSnapshot(accountId, { status: analysis.suggestedStatus }).catch(
                () => {}
              );
              if (matchedAccount._rowIndex > 0) {
                await updateCell(
                  matchedAccount._tab,
                  matchedAccount._rowIndex,
                  getStatusColumnIndex(matchedAccount._tab),
                  analysis.suggestedStatus
                ).catch(() => {});
              }
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
      inferredAccounts,
      pendingReview,
      checked: allIds.length,
      accounts: liveAccounts.length,
      breakdown,
      inboundCapture,
      inboundAnalysis,
      lastPolledAt: new Date().toISOString(),
    });
  } catch (error) {
    await logError("gmail-poll", error);
    return NextResponse.json({ error: "Poll failed" }, { status: 500 });
  }
}
