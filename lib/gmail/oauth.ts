import { google } from "googleapis";
import { GaxiosError } from "gaxios";
import { logError } from "@/lib/errors/log";
import {
  getGmailRefreshToken,
  recordGmailAuthError,
  recordGmailAuthOk,
} from "@/lib/gmail/credentials";

/**
 * Shared OAuth2 client builder. Replaces three near-identical `getOAuthClient`
 * functions that lived in sent.ts / threads.ts / send.ts. The important
 * difference: this version sources the refresh token from the Supabase
 * `app_credentials` row first, so the in-app re-auth flow can swap it at
 * runtime without a redeploy.
 */
export async function getGmailOAuthClient() {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const refreshToken = await getGmailRefreshToken();

  if (!clientId || !clientSecret || !refreshToken) return null;

  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    process.env.GMAIL_REDIRECT_URI || "http://localhost:3000/api/gmail/auth"
  );
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  return oauth2Client;
}

/**
 * Classify a thrown error as a Gmail auth failure (expired / revoked /
 * invalid token) versus any other failure (network, rate limit, server
 * error). We only mark the credential unhealthy on auth failures — a 500
 * from Google doesn't mean the token is dead.
 */
export function isGmailAuthError(error: unknown): boolean {
  if (!error) return false;

  const status =
    error instanceof GaxiosError
      ? error.response?.status ?? error.status ?? null
      : (error as { response?: { status?: number }; status?: number }).response?.status ??
        (error as { status?: number }).status ??
        null;

  if (status === 401 || status === 403) return true;

  // OAuth2 refresh errors come through as 400 with `invalid_grant` /
  // `invalid_token` / `unauthorized_client` in the body.
  const messageParts: string[] = [];
  if (error instanceof Error && error.message) messageParts.push(error.message);
  const errData = (error as { response?: { data?: unknown } }).response?.data;
  if (errData) {
    try {
      messageParts.push(typeof errData === "string" ? errData : JSON.stringify(errData));
    } catch {
      /* ignore */
    }
  }
  const blob = messageParts.join(" ").toLowerCase();
  return /invalid_grant|invalid_token|token has been expired|token expired|revoked|unauthorized_client|invalid credentials/i.test(
    blob
  );
}

function describeError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown Gmail auth error";
  }
}

/**
 * Inspect a thrown error: if it looks like a Gmail auth failure, persist
 * that state to `app_credentials` (banner picks it up) and write a warn to
 * `error_logs`. Returns true when the error was auth-related so callers can
 * decide whether to short-circuit further work.
 */
export async function handleGmailError(source: string, error: unknown): Promise<boolean> {
  if (!isGmailAuthError(error)) return false;
  const detail = describeError(error);
  await recordGmailAuthError(detail);
  await logError(
    source,
    `Gmail auth failure — refresh token may be expired or revoked: ${detail}`,
    undefined,
    "warn"
  );
  return true;
}

/**
 * Convenience: wrap a Gmail API call so any auth failure is caught,
 * recorded, and rethrown / returned as configured. Non-auth errors are
 * passed through unchanged.
 */
export async function withGmailAuthCheck<T>(
  source: string,
  fn: () => Promise<T>
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    await handleGmailError(source, err);
    throw err;
  }
}

export { recordGmailAuthOk };
