import { NextResponse } from "next/server";
import { readGmailCredentialRow, GmailAuthStatus } from "@/lib/gmail/credentials";
import { checkGmailConnectivity } from "@/lib/gmail/sent";

export const dynamic = "force-dynamic";

/**
 * Returns the current Gmail auth health for the in-app banner.
 *
 *   GET  /api/gmail/status        -> last persisted status (cheap, no API call)
 *   POST /api/gmail/status        -> live probe (Settings "Test Connection")
 *
 * The banner polls GET on an interval; the probe is gated to user-initiated
 * actions so we don't hammer Google with one getProfile() every 30s.
 */
export async function GET() {
  const row = await readGmailCredentialRow();

  // Distinguish "OAuth client not configured at all" from "we have an OAuth
  // client but no refresh token yet" so the banner can show the right CTA.
  const oauthClientConfigured = Boolean(
    process.env.GMAIL_CLIENT_ID && process.env.GMAIL_CLIENT_SECRET
  );
  const hasToken = Boolean(row.value) || Boolean(process.env.GMAIL_REFRESH_TOKEN);

  let status: GmailAuthStatus = row.status;
  if (!oauthClientConfigured) status = "not_configured";
  else if (!hasToken) status = "not_configured";

  return NextResponse.json({
    status,
    detail: row.statusDetail,
    email: row.statusEmail,
    checkedAt: row.statusCheckedAt,
    updatedAt: row.updatedAt,
    hasToken,
    oauthClientConfigured,
    tokenSource: row.value ? "supabase" : process.env.GMAIL_REFRESH_TOKEN ? "env" : null,
  });
}

export async function POST() {
  const result = await checkGmailConnectivity();
  return NextResponse.json(result, { status: result.status === "error" ? 503 : 200 });
}
