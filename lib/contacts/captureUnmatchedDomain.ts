import { createServerClient } from "@/lib/supabase/server";
import { insertProspects } from "@/lib/prospecting/shared/insert";

export interface UnmatchedDomainInput {
  /** Sender or recipient email that didn't match any account */
  email: string;
  /** Display name from the email header, if any */
  name?: string;
  /** Subject of the email — used as a context hint in the prospect notes */
  subject?: string;
  /** Whether you sent it (outbound) or received it (inbound) */
  direction: "outbound" | "inbound";
}

export interface CaptureUnmatchedResult {
  action: "created" | "skipped";
  reason?: string;
  prospectId?: string;
}

const GENERIC_LOCAL_PARTS = new Set([
  "info",
  "contact",
  "hello",
  "hi",
  "support",
  "sales",
  "team",
  "admin",
  "office",
  "inquiry",
  "inquiries",
]);

/**
 * "luckys.com"     -> "Luckys"
 * "the-spot.co"    -> "The Spot"
 * "downtown-deli"  -> "Downtown Deli"
 */
function guessBusinessName(domainBase: string): string {
  return domainBase
    .replace(/[-_]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

/**
 * Capture a person/domain that we sent to (or received from) but isn't yet
 * in the pipeline. Creates a prospect entry deduped by website domain so
 * repeated emails to the same company don't pile up.
 */
export async function captureUnmatchedDomain(
  input: UnmatchedDomainInput
): Promise<CaptureUnmatchedResult> {
  const email = input.email.trim().toLowerCase();
  if (!email.includes("@")) return { action: "skipped", reason: "invalid email" };

  const domain = email.split("@")[1];
  if (!domain || !domain.includes(".")) return { action: "skipped", reason: "invalid domain" };

  const domainBase = domain.split(".")[0];
  if (!domainBase || domainBase.length < 2) return { action: "skipped", reason: "domain too short" };

  const businessName = guessBusinessName(domainBase);
  const website = `https://${domain}`;

  try {
    const supabase = createServerClient();

    // Dedup: check if a prospect with this website OR business name already exists
    const { data: existing } = await supabase
      .from("prospects")
      .select("id, website, business_name")
      .or(`website.ilike.%${domain}%,business_name.ilike.${businessName}`)
      .limit(1);

    if (existing && existing.length > 0) {
      return { action: "skipped", reason: "prospect exists", prospectId: existing[0].id as string };
    }

    // Use a clean name when available; fall back to email local-part
    const localPart = email.split("@")[0];
    const cleanContactName =
      input.name && input.name.toLowerCase() !== email && input.name.toLowerCase() !== localPart
        ? input.name.trim()
        : "";

    const directionLabel = input.direction === "outbound" ? "Sent email to" : "Received email from";
    const subjectFragment = input.subject ? ` regarding "${input.subject.slice(0, 80)}"` : "";
    const contactFragment = cleanContactName ? `${cleanContactName} <${email}>` : email;

    const note =
      `${directionLabel} ${contactFragment}${subjectFragment} ` +
      `but no matching account exists in the pipeline. Auto-captured for review.`;

    const [created] = await insertProspects([
      {
        business_name: businessName,
        type: null,
        address: null,
        website,
        instagram: null,
        notes: note,
        source: "gmail-outbound",
        channel: "email",
        status: "new",
        added_to_sheet: false,
      },
    ]);

    return { action: "created", prospectId: created?.id };
  } catch (error) {
    return {
      action: "skipped",
      reason: error instanceof Error ? error.message : "insert failed",
    };
  }
}

/** Cheap heuristic to skip generic mailboxes — info@, sales@, etc. */
export function isLikelyPersonalEmail(email: string): boolean {
  const local = email.split("@")[0]?.toLowerCase() ?? "";
  if (!local) return false;
  return !GENERIC_LOCAL_PARTS.has(local);
}
