import { NextResponse } from "next/server";
import { readGmailCredentialRow, GmailAuthStatus } from "@/lib/gmail/credentials";
import { checkGmailConnectivity } from "@/lib/gmail/sent";
import { logError } from "@/lib/errors/log";

export const dynamic = "force-dynamic";

/**
 * Returns the current Gmail auth health for the in-app banner.
 *
 *   GET  /api/gmail/status        -> last persisted status (cheap, no API call)
 *   POST /api/gmail/status        -> live probe (Settings "Test Connection")
 *
 * The banner polls GET on an interval; the probe is gated to user-initiated
 * actions so we don't hammer Google with one getProfile() every 30s.
 *
 * Both handlers must always return JSON — the in-app banner crashes if the
 * response isn't parseable. Catch + log so an unhandled throw doesn't render
 * Next's default HTML 500.
 */
export async function GET() {
  try {
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
  } catch (error) {
    await logError("gmail/status/GET", error);
    return NextResponse.json(
      {
        status: "error" as GmailAuthStatus,
        detail: "Failed to read Gmail credential row",
        email: null,
        checkedAt: null,
        updatedAt: null,
        hasToken: false,
        oauthClientConfigured: Boolean(
          process.env.GMAIL_CLIENT_ID && process.env.GMAIL_CLIENT_SECRET
        ),
        tokenSource: null,
      },
      { status: 503 }
    );
  }
}

export async function POST() {
  try {
    const result = await checkGmailConnectivity();
    return NextResponse.json(result, { status: result.status === "error" ? 503 : 200 });
  } catch (error) {
    await logError("gmail/status/POST", error);
    return NextResponse.json(
      { status: "error", detail: "Gmail probe failed" },
      { status: 503 }
    );
  }
}
