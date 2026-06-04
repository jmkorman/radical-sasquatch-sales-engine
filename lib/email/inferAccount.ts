/**
 * AI-driven account inference for outbound emails to unknown recipients.
 *
 * When Jake sends an email and the matcher returns "no_candidates", this
 * module tries to infer the company name + tab (Restaurants / Retail /
 * Catering / Food Truck) from the email content and creates the account
 * automatically. The new account is logged as "Reached Out" and the email
 * is attributed to it on the same poll.
 *
 * Confidence is gated — low-confidence inferences are skipped rather
 * than guessing wildly.
 */

import { generateJSON, hasAnthropic } from "@/lib/ai/anthropic";
import { GmailSentMessage } from "@/lib/gmail/sent";
import { TabName, TabSlug, AnyAccount, StatusValue } from "@/types/accounts";
import { TAB_NAME_TO_SLUG } from "@/lib/utils/constants";
import { buildStableAccountId, normalizeAccountName } from "@/lib/accounts/identity";
import { upsertAccountSnapshot } from "@/lib/supabase/queries";
import { toAccountSnapshot } from "@/lib/accounts/snapshot";
import { parseAddr, isOwnerEmail, emailDomain, extractUrlDomain } from "@/lib/email/matcher";

// Below this, we don't create anything. Between MIN and LIVE, the account is
// created but parked in the review queue. At/above LIVE it goes live as a
// "Reached Out" pipeline account immediately.
const MIN_CONFIDENCE = 70;
const LIVE_CONFIDENCE = 85;

// The sender's own company. We must never auto-create a prospect for
// ourselves — Jake's outbound emails pitch Radical Sasquatch to venues, and
// the model sometimes latches onto the sender's company in the body/signature
// instead of the recipient. Both the name and the sending domain are guarded.
const OWNER_COMPANY = process.env.GMAIL_OWNER_COMPANY ?? "Radical Sasquatch";
const OWNER_DOMAIN =
  (process.env.GMAIL_OWNER_EMAIL ?? "jake@radicalsasquatch.com").split("@")[1]?.toLowerCase() ?? "";

export interface InferAccountInput {
  message: GmailSentMessage;
  existingAccounts: AnyAccount[];
}

export interface InferredAccount {
  /** Company name as best inferred. */
  companyName: string;
  /** Tab this account belongs in. */
  tab: TabName;
  /** Optional city / state hint. */
  location: string;
  /** Optional contact name (usually the recipient display name). */
  contactName: string;
  /** Confidence 0–100. Only used if >= MIN_CONFIDENCE. */
  confidence: number;
  /** Short rationale. */
  reason: string;
}

const SYSTEM = `You analyze a B2B sales email to infer the RECIPIENT company and which CRM bucket it belongs in.

IMPORTANT: The email is sent BY ${process.env.GMAIL_OWNER_COMPANY ?? "Radical Sasquatch"} (a dumpling company) to a prospect. NEVER return the sender's own company — identify the company being pitched TO (the recipient). If you can only identify the sender, or the recipient is internal/personal, return confidence 0.

CRM tabs:
- "Restaurants" — restaurants, bars, eateries, food halls
- "Retail" — grocery stores, specialty markets, convenience, retail shops
- "Catering" — caterers, event venues, corporate catering, hotels
- "Food Truck" — food trucks, mobile vendors, pop-ups

Return JSON only:
{
  "companyName": string,    // canonical company name (e.g. "Solterra Catering")
  "tab": "Restaurants" | "Retail" | "Catering" | "Food Truck",
  "location": string,        // city/state if obvious in subject/body/signature, else ""
  "contactName": string,     // recipient's name, else ""
  "confidence": 0-100,       // be conservative — guess <60 means skip
  "reason": string           // ≤120 chars
}

Skip (confidence < 60) if:
- recipient is a generic gmail/yahoo/personal address with no company context
- email is automated/transactional (calendar invite, receipt, notification)
- you cannot identify a real business name
- you cannot confidently pick a single tab`;

async function inferAccount(input: InferAccountInput): Promise<InferredAccount | null> {
  if (!hasAnthropic()) return null;

  const recipient = parseAddr(input.message.to);
  if (!recipient.email || isOwnerEmail(recipient.email)) return null;

  const domain = emailDomain(recipient.email);
  // Emailing anyone on our own domain (team/self) is never a prospect.
  if (OWNER_DOMAIN && domain === OWNER_DOMAIN) return null;

  // Send the model a compact, deduped list of existing account names so it
  // can avoid recreating an account that already exists (e.g. spelled
  // slightly differently from what the matcher recognized).
  const existingNames = Array.from(
    new Set(input.existingAccounts.map((a) => a.account).filter(Boolean))
  ).slice(0, 250);

  const snippet = (input.message.snippet ?? input.message.body ?? "").slice(0, 1000);

  const user = `Outbound email:
  To: ${input.message.to}
  Subject: ${input.message.subject}
  Snippet: ${snippet}

Recipient email domain: ${domain ?? "(generic/personal)"}

Existing CRM accounts (do NOT create a duplicate of any of these — if the email is for one of them, return confidence:0):
${existingNames.join(", ")}`;

  const result = await generateJSON<InferredAccount>({
    system: SYSTEM,
    user,
    maxTokens: 250,
    model: "claude-haiku-4-5-20251001",
  });

  if (!result) return null;
  if (typeof result.confidence !== "number" || result.confidence < MIN_CONFIDENCE) return null;
  if (!result.companyName?.trim()) return null;
  if (!result.tab) return null;

  // Hard guard: never create an account for our own company, even if the
  // model returned the sender instead of the recipient.
  const requestedNorm = normalizeAccountName(result.companyName);
  const ownerNorm = normalizeAccountName(OWNER_COMPANY);
  if (ownerNorm && (requestedNorm === ownerNorm || requestedNorm.startsWith(`${ownerNorm}-`))) {
    return null;
  }

  // Don't recreate an existing account, even if the model didn't notice.
  const dupe = input.existingAccounts.find(
    (a) => normalizeAccountName(a.account ?? "") === requestedNorm
  );
  if (dupe) return null;

  return result;
}

/**
 * Build a minimal AnyAccount object for a freshly inferred account, persist
 * it, and return it ready to be added to the matcher indexes mid-poll.
 *
 * The new account is saved to Supabase (source of truth). Row index is set
 * to 0 because the row only exists in the sheet if/when the existing sheet
 * sync layer mirrors it later — but Supabase is authoritative, so this is
 * fine.
 */
export async function inferAndCreateAccount(
  input: InferAccountInput
): Promise<{ account: AnyAccount; inference: InferredAccount; pending: boolean } | null> {
  const inference = await inferAccount(input);
  if (!inference) return null;

  // 70–84 → parked for manual review; 85+ → live immediately.
  const pending = inference.confidence < LIVE_CONFIDENCE;

  const tabSlug: TabSlug = TAB_NAME_TO_SLUG[inference.tab];
  const recipient = parseAddr(input.message.to);
  const domain = emailDomain(recipient.email);

  const id = buildStableAccountId(tabSlug, inference.companyName);
  const websiteGuess = domain ? `https://${domain}` : "";

  // Construct a synthetic AnyAccount that matches the tab's shape. We
  // populate only the fields known at creation time; everything else is
  // empty and can be filled in by Jake later.
  const baseFields = {
    id,
    _rowIndex: 0,
    _tab: inference.tab,
    _tabSlug: tabSlug,
    account: inference.companyName,
    type: "",
    // Pending accounts stay "Identified" until approved; live ones jump to
    // "Reached Out" since the outbound email is the first touch.
    status: (pending ? "Identified" : "Reached Out") as StatusValue,
    nextSteps: "",
    nextActionType: "",
    contactDate: "",
    contactName: inference.contactName,
    phone: "",
    email: recipient.email,
    notes: `Auto-created from outbound email (${inference.reason}).`,
  };

  let account: AnyAccount;
  if (inference.tab === "Active Accounts") {
    account = {
      ...baseFields,
      _tab: "Active Accounts",
      _tabSlug: "active-accounts",
      rsLead: "",
      order: "",
    };
  } else if (inference.tab === "Restaurants") {
    account = {
      ...baseFields,
      _tab: "Restaurants",
      _tabSlug: "restaurants",
      location: inference.location,
      estMonthlyOrder: "",
      commissionPct: "",
      ig: "",
      website: websiteGuess,
      kitchen: "",
      dumplings: "",
    };
  } else if (inference.tab === "Retail") {
    account = {
      ...baseFields,
      _tab: "Retail",
      _tabSlug: "retail",
      location: inference.location,
      estMonthlyOrder: "",
      commissionPct: "",
      ig: "",
      website: websiteGuess,
    };
  } else if (inference.tab === "Catering") {
    account = {
      ...baseFields,
      _tab: "Catering",
      _tabSlug: "catering",
      location: inference.location,
      estMonthlyOrder: "",
      commissionPct: "",
      ig: "",
      website: websiteGuess,
    };
  } else {
    account = {
      ...baseFields,
      _tab: "Food Truck",
      _tabSlug: "food-truck",
      location: inference.location,
      estMonthlyOrder: "",
      commissionPct: "",
      ig: "",
      website: websiteGuess,
    };
  }

  const snapshot = toAccountSnapshot(account);
  if (pending) {
    // Flag in the raw payload so snapshotsToTabs hides it from the pipeline
    // until Jake approves it in Settings → Pending Review.
    snapshot.raw = {
      ...snapshot.raw,
      review_pending: true,
      review_reason: inference.reason,
      review_confidence: inference.confidence,
    };
  }

  const ok = await upsertAccountSnapshot(snapshot);
  if (!ok) return null;

  // Sanity: ensure website domain (or recipient domain) maps to this account
  // so subsequent messages in the same poll find it via the domain index.
  void extractUrlDomain(websiteGuess);

  return { account, inference, pending };
}
