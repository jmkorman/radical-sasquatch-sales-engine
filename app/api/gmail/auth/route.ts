import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForTokens } from "@/lib/gmail/threads";

// OAuth callback — exchanges the code for tokens and shows the refresh token
// to copy into .env.local as GMAIL_REFRESH_TOKEN
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const error = request.nextUrl.searchParams.get("error");

  if (error) {
    return new NextResponse(
      `<html><body style="font-family:sans-serif;padding:40px;background:#100726;color:#fff4e8;">
        <h2 style="color:#ff4f9f;">Gmail Authorization Failed</h2>
        <p>Error: ${error}</p>
        <p><a href="/settings" style="color:#64f5ea;">Back to Settings</a></p>
      </body></html>`,
      { headers: { "Content-Type": "text/html" } }
    );
  }

  if (!code) {
    return NextResponse.json({ error: "No authorization code received" }, { status: 400 });
  }

  try {
    const tokens = await exchangeCodeForTokens(code);

    if (!tokens?.refresh_token) {
      return new NextResponse(
        `<html><body style="font-family:sans-serif;padding:40px;background:#100726;color:#fff4e8;">
          <h2 style="color:#ffb321;">No Refresh Token</h2>
          <p>Google did not return a refresh token. This happens when the app was already authorized.</p>
          <p>To force a new token: <a href="https://myaccount.google.com/permissions" style="color:#64f5ea;" target="_blank">revoke access here</a>, then try connecting again.</p>
          <p><a href="/settings" style="color:#64f5ea;">Back to Settings</a></p>
        </body></html>`,
        { headers: { "Content-Type": "text/html" } }
      );
    }

    return new NextResponse(
      `<html><body style="font-family:sans-serif;padding:40px;background:#100726;color:#fff4e8;max-width:700px;">
        <h2 style="color:#64f5ea;">Gmail Connected</h2>
        <p>Copy the refresh token below and add it to your <code style="background:#1a0f45;padding:2px 6px;border-radius:4px;">.env.local</code> file:</p>
        <pre style="background:#1a0f45;padding:20px;border-radius:8px;border:1px solid #49308c;overflow-x:auto;margin:16px 0;">GMAIL_REFRESH_TOKEN=${tokens.refresh_token}</pre>
        <p style="color:#d8ccfb;">Then restart the dev server (<code style="background:#1a0f45;padding:2px 6px;border-radius:4px;">npm run dev</code>) for the change to take effect.</p>
        <p style="margin-top:24px;"><a href="/settings" style="color:#64f5ea;">Back to Settings</a></p>
      </body></html>`,
      { headers: { "Content-Type": "text/html" } }
    );
  } catch (err) {
    console.error("Gmail auth error:", err);
    return new NextResponse(
      `<html><body style="font-family:sans-serif;padding:40px;background:#100726;color:#fff4e8;">
        <h2 style="color:#ff4f9f;">Error</h2>
        <p>Failed to exchange authorization code. Check server logs.</p>
        <p><a href="/settings" style="color:#64f5ea;">Back to Settings</a></p>
      </body></html>`,
      { headers: { "Content-Type": "text/html" } }
    );
  }
}
