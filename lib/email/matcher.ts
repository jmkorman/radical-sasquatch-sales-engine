/**
 * Confidence-scored Gmail → account matcher.
 *
 * Replaces the prior first-match-wins logic with a weighted score per
 * candidate, so we only attribute an email to an account when one
 * candidate clearly beats every other candidate.
 *
 * Signals (cumulative; multiple can apply):
 *   - Exact email match (account.email == sender/recipient)              100
 *   - Domain match + account name token in subject                       +85
 *   - Domain match + contact-name token in From display name             +75
 *   - Domain match alone, domain owned by exactly 1 account              +55
 *   - Domain match alone, domain owned by >1 account                     0  (ambiguous)
 *   - Account name appears in subject only                               +50
 *   - Thread-attribution boost (prior log on this thread for this acct)  +30
 *
 * A winner is returned only when:
 *   - top score   >= MIN_SCORE (default 70)
 *   - margin (top - runner-up) >= MIN_MARGIN (default 20)
 *
 * Anything else returns null with a reason — the caller logs it as
 * "skipped_ambiguous" so the user can audit the matcher's behavior.
 */

import { AnyAccount } from "@/types/accounts";
import { GmailSentMessage } from "@/lib/gmail/sent";

const MIN_SCORE = 70;
const MIN_MARGIN = 20;
const MIN_TOKEN_CHARS = 7;

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

// Tokens too generic to be a name-match signal on their own.
const NOISE_TOKENS = new Set([
  "restaurant", "restaurants", "pizza", "pizzeria", "bakery", "cafe", "coffee",
  "kitchen", "grill", "bar", "bistro", "deli", "market", "shop", "store",
  "company", "group", "and", "the", "llc", "inc", "corp", "co", "ltd",
  "house", "food", "foods", "catering", "truck", "trucks", "eatery",
  "diner", "tavern", "pub",
]);

export interface MatchIndexes {
  /** account.email (lowercased) → account */
  emailIdx: Map<string, AnyAccount>;
  /** domain → accounts that own this domain (via email or website) */
  domainIdx: Map<string, AnyAccount[]>;
}

export interface MatchResult {
  account: AnyAccount;
  score: number;
  runnerUpScore: number;
  reasons: string[];
}

export interface MatchSkip {
  reason: "no_candidates" | "below_threshold" | "ambiguous";
  topCandidates: Array<{ accountId: string; accountName: string; score: number }>;
}

export type MatchOutcome =
  | { kind: "match"; result: MatchResult }
  | { kind: "skip"; skip: MatchSkip };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function parseAddr(raw: string): { name: string; email: string } {
  const match = raw.match(/^(.*?)\s*<([^>]+)>/);
  if (match) {
    return {
      name: match[1].trim().replace(/^["']|["']$/g, ""),
      email: match[2].trim().toLowerCase(),
    };
  }
  return { name: "", email: raw.trim().toLowerCase() };
}

export function isOwnerEmail(email: string): boolean {
  return email.toLowerCase() === OWNER_EMAIL;
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

export function getDomainVariants(domain: string | null): string[] {
  if (!domain) return [];
  const normalized = domain.toLowerCase();
  const variants = new Set([normalized]);
  const parts = normalized.split(".");
  if (parts.length > 2) variants.add(parts.slice(-2).join("."));
  return Array.from(variants);
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function nameTokens(name: string): string[] {
  return normalize(name)
    .split(" ")
    .filter((part) => part.length >= MIN_TOKEN_CHARS && !NOISE_TOKENS.has(part));
}

function fullNamePhrase(name: string): string {
  return normalize(name);
}

// ---------------------------------------------------------------------------
// Index builder
// ---------------------------------------------------------------------------

export function buildIndexes(accounts: AnyAccount[]): MatchIndexes {
  const emailIdx = new Map<string, AnyAccount>();
  const domainIdx = new Map<string, AnyAccount[]>();

  function addDomain(domain: string | null, account: AnyAccount) {
    if (!domain) return;
    for (const variant of getDomainVariants(domain)) {
      const existing = domainIdx.get(variant) ?? [];
      if (!existing.some((a) => a.id === account.id)) {
        existing.push(account);
        domainIdx.set(variant, existing);
      }
    }
  }

  for (const account of accounts) {
    if (account.email?.trim()) {
      const email = account.email.trim().toLowerCase();
      emailIdx.set(email, account);
      addDomain(emailDomain(email), account);
    }
    const website = (account as unknown as { website?: string }).website;
    addDomain(extractUrlDomain(website), account);
  }

  return { emailIdx, domainIdx };
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

interface CandidateScore {
  account: AnyAccount;
  score: number;
  reasons: string[];
}

function getNonOwnerAddrs(message: GmailSentMessage): Array<{ name: string; email: string }> {
  return [parseAddr(message.from), parseAddr(message.to)].filter(
    (entry) => entry.email && !isOwnerEmail(entry.email)
  );
}

function bumpCandidate(
  map: Map<string, CandidateScore>,
  account: AnyAccount,
  amount: number,
  reason: string
) {
  const existing = map.get(account.id);
  if (existing) {
    existing.score += amount;
    existing.reasons.push(reason);
  } else {
    map.set(account.id, { account, score: amount, reasons: [reason] });
  }
}

function nameInSubject(account: AnyAccount, subject: string): boolean {
  const normSubject = normalize(subject);
  if (!normSubject) return false;
  const full = fullNamePhrase(account.account ?? "");
  if (full && normSubject.includes(full)) return true;
  const tokens = nameTokens(account.account ?? "");
  return tokens.some((token) => normSubject.includes(token));
}

function nameInDisplayName(account: AnyAccount, displayName: string): boolean {
  const norm = normalize(displayName);
  if (!norm) return false;
  const full = fullNamePhrase(account.account ?? "");
  if (full && norm.includes(full)) return true;
  const tokens = nameTokens(account.account ?? "");
  return tokens.some((token) => norm.includes(token));
}

function contactNameInDisplayName(account: AnyAccount, displayName: string): boolean {
  const stored = normalize(account.contactName ?? "");
  if (stored.length < 4) return false;
  const norm = normalize(displayName);
  return norm.includes(stored);
}

/**
 * Score every candidate account against an inbound/outbound message.
 *
 * threadAccountId — when the matcher knows a prior log on this thread already
 * attributes to a particular account, we boost that account by +30. This
 * makes thread inheritance a *bias* rather than a *bypass*, so a strong
 * new signal on a different account can still override a bad earlier guess.
 */
export function scoreMessage(
  message: GmailSentMessage,
  indexes: MatchIndexes,
  threadAccountId: string | null = null
): MatchOutcome {
  const candidates = new Map<string, CandidateScore>();
  const contactAddrs = getNonOwnerAddrs(message);
  const subject = message.subject ?? "";

  // 1) Exact email match — strongest signal
  for (const addr of contactAddrs) {
    const acct = indexes.emailIdx.get(addr.email);
    if (acct) bumpCandidate(candidates, acct, 100, `exact email ${addr.email}`);
  }

  // 2) Domain candidates
  const domainCandidates = new Map<string, AnyAccount>();
  for (const addr of contactAddrs) {
    const domain = emailDomain(addr.email);
    for (const variant of getDomainVariants(domain)) {
      const accounts = indexes.domainIdx.get(variant) ?? [];
      for (const acct of accounts) domainCandidates.set(acct.id, acct);
    }
  }
  const domainOwnerCount = domainCandidates.size;

  for (const acct of Array.from(domainCandidates.values())) {
    if (nameInSubject(acct, subject)) {
      bumpCandidate(candidates, acct, 85, "domain + name in subject");
    } else {
      // Display-name corroboration: From "Jane Smith" matching contactName
      const fromAddr = parseAddr(message.from);
      const toAddr = parseAddr(message.to);
      const displays = [fromAddr.name, toAddr.name].filter(Boolean);
      const nameMatches = displays.some((d) => nameInDisplayName(acct, d));
      const contactMatches = displays.some((d) => contactNameInDisplayName(acct, d));
      if (nameMatches) {
        bumpCandidate(candidates, acct, 80, "domain + account name in display");
      } else if (contactMatches) {
        bumpCandidate(candidates, acct, 75, "domain + contact name in display");
      } else if (domainOwnerCount === 1) {
        // Sole owner of a non-generic domain — moderate confidence.
        bumpCandidate(candidates, acct, 55, "domain match (sole owner)");
      }
      // If domain is shared by >1 account with no name corroboration, we add
      // nothing — the candidate stays at 0 and the ambiguity check below
      // forces us to skip rather than guess.
    }
  }

  // 3) Subject-only name match against ALL accounts. Only added for accounts
  // whose name *uniquely* identifies them (still gated by margin check below).
  // Pulled from indexes' domainIdx values isn't enough — many accounts have
  // no website/email. We iterate every distinct account already in the
  // domainIdx + emailIdx maps as our universe, plus we accept name-only.
  const universe = new Set<AnyAccount>();
  for (const acct of Array.from(indexes.emailIdx.values())) universe.add(acct);
  for (const list of Array.from(indexes.domainIdx.values())) for (const acct of list) universe.add(acct);

  for (const acct of Array.from(universe)) {
    if (candidates.has(acct.id)) continue;
    if (nameInSubject(acct, subject)) {
      bumpCandidate(candidates, acct, 50, "name in subject only");
    }
  }

  // 4) Thread-attribution boost
  if (threadAccountId) {
    const existing = candidates.get(threadAccountId);
    if (existing) {
      existing.score += 30;
      existing.reasons.push("prior thread attribution");
    }
    // If thread account isn't otherwise scoring, do NOT silently include it —
    // we want a fresh signal to override a stale/wrong thread assignment.
  }

  // 5) Pick a winner
  const sorted = Array.from(candidates.values()).sort((a, b) => b.score - a.score);
  const topCandidates = sorted.slice(0, 3).map((c) => ({
    accountId: c.account.id,
    accountName: c.account.account,
    score: c.score,
  }));

  if (sorted.length === 0) {
    return { kind: "skip", skip: { reason: "no_candidates", topCandidates } };
  }

  const top = sorted[0];
  const runnerUp = sorted[1]?.score ?? 0;

  if (top.score < MIN_SCORE) {
    return { kind: "skip", skip: { reason: "below_threshold", topCandidates } };
  }
  if (top.score - runnerUp < MIN_MARGIN) {
    return { kind: "skip", skip: { reason: "ambiguous", topCandidates } };
  }

  return {
    kind: "match",
    result: {
      account: top.account,
      score: top.score,
      runnerUpScore: runnerUp,
      reasons: top.reasons,
    },
  };
}

/**
 * Re-exported so the route can fetch the top candidates for an AI
 * disambiguator call when scoreMessage returns "ambiguous".
 */
export function scoreCandidates(
  message: GmailSentMessage,
  indexes: MatchIndexes,
  threadAccountId: string | null = null
): CandidateScore[] {
  const outcome = scoreMessage(message, indexes, threadAccountId);
  if (outcome.kind === "match") {
    return [
      {
        account: outcome.result.account,
        score: outcome.result.score,
        reasons: outcome.result.reasons,
      },
    ];
  }
  // For "skip" we still need the underlying ranked list — rerun scoring to
  // grab full Candidate objects (top 3) for downstream disambiguation.
  const all = scoreAllCandidates(message, indexes, threadAccountId);
  return all.slice(0, 3);
}

function scoreAllCandidates(
  message: GmailSentMessage,
  indexes: MatchIndexes,
  threadAccountId: string | null
): CandidateScore[] {
  // Mirror of scoreMessage's accumulation phase, returned without the
  // winner selection. Duplicated rather than refactored to keep
  // scoreMessage's hot path allocation-free.
  const candidates = new Map<string, CandidateScore>();
  const contactAddrs = getNonOwnerAddrs(message);
  const subject = message.subject ?? "";

  for (const addr of contactAddrs) {
    const acct = indexes.emailIdx.get(addr.email);
    if (acct) bumpCandidate(candidates, acct, 100, `exact email ${addr.email}`);
  }

  const domainCandidates = new Map<string, AnyAccount>();
  for (const addr of contactAddrs) {
    const domain = emailDomain(addr.email);
    for (const variant of getDomainVariants(domain)) {
      const accounts = indexes.domainIdx.get(variant) ?? [];
      for (const acct of accounts) domainCandidates.set(acct.id, acct);
    }
  }
  const domainOwnerCount = domainCandidates.size;

  for (const acct of Array.from(domainCandidates.values())) {
    if (nameInSubject(acct, subject)) {
      bumpCandidate(candidates, acct, 85, "domain + name in subject");
    } else {
      const fromAddr = parseAddr(message.from);
      const toAddr = parseAddr(message.to);
      const displays = [fromAddr.name, toAddr.name].filter(Boolean);
      const nameMatches = displays.some((d) => nameInDisplayName(acct, d));
      const contactMatches = displays.some((d) => contactNameInDisplayName(acct, d));
      if (nameMatches) bumpCandidate(candidates, acct, 80, "domain + name display");
      else if (contactMatches) bumpCandidate(candidates, acct, 75, "domain + contact display");
      else if (domainOwnerCount === 1) bumpCandidate(candidates, acct, 55, "domain sole owner");
    }
  }

  const universe = new Set<AnyAccount>();
  for (const acct of Array.from(indexes.emailIdx.values())) universe.add(acct);
  for (const list of Array.from(indexes.domainIdx.values())) for (const acct of list) universe.add(acct);
  for (const acct of Array.from(universe)) {
    if (candidates.has(acct.id)) continue;
    if (nameInSubject(acct, subject)) bumpCandidate(candidates, acct, 50, "name in subject");
  }

  if (threadAccountId) {
    const existing = candidates.get(threadAccountId);
    if (existing) {
      existing.score += 30;
      existing.reasons.push("thread bias");
    }
  }

  return Array.from(candidates.values()).sort((a, b) => b.score - a.score);
}

/**
 * Newsletter / bulk-mail header detection. Returning true means the message
 * should never be logged or attributed.
 */
export function isNewsletter(message: GmailSentMessage): boolean {
  if (message.listUnsubscribe?.trim()) return true;
  if (message.listId?.trim()) return true;
  if (message.autoSubmitted && message.autoSubmitted.toLowerCase() !== "no") return true;
  const precedence = message.precedence?.toLowerCase().trim();
  if (precedence === "bulk" || precedence === "list" || precedence === "junk") return true;
  return false;
}

export function isSent(message: GmailSentMessage): boolean {
  return isOwnerEmail(parseAddr(message.from).email);
}

export function getContactAddr(message: GmailSentMessage): { name: string; email: string } | null {
  const from = parseAddr(message.from);
  const to = parseAddr(message.to);
  if (from.email && !isOwnerEmail(from.email)) return from;
  if (to.email && !isOwnerEmail(to.email)) return to;
  return null;
}

export { extractUrlDomain, emailDomain };
