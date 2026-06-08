import { createServerClient } from "@/lib/supabase/server";

/**
 * Runtime storage for the Gmail refresh token + last observed auth status.
 *
 * Background: the refresh token used to be read straight from
 * `GMAIL_REFRESH_TOKEN`. When Google revokes/expires it (user revoke,
 * 6-month inactivity, OAuth app churn), the only recovery was a developer
 * editing env vars + redeploying. Moving it into `app_credentials` means the
 * in-app re-auth flow can write a new token at runtime — no redeploy.
 *
 * Reads still fall back to the env var so the existing local dev setup keeps
 * working until the table is provisioned (and so multi-environment overrides
 * still work).
 */

const GMAIL_KEY = "gmail";

export type GmailAuthStatus = "ok" | "error" | "not_configured" | "unknown";

export interface GmailCredentialRow {
  value: string | null;
  status: GmailAuthStatus;
  statusDetail: string | null;
  statusEmail: string | null;
  statusCheckedAt: string | null;
  updatedAt: string | null;
}

const EMPTY_ROW: GmailCredentialRow = {
  value: null,
  status: "unknown",
  statusDetail: null,
  statusEmail: null,
  statusCheckedAt: null,
  updatedAt: null,
};

/**
 * Returns the row exactly as stored. Caller is responsible for falling back
 * to env vars / interpreting absence. Never throws — DB errors degrade to
 * the empty row so we don't take down the whole Gmail integration when the
 * `app_credentials` table hasn't been provisioned yet.
 */
export async function readGmailCredentialRow(): Promise<GmailCredentialRow> {
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("app_credentials")
      .select("value, status, status_detail, status_email, status_checked_at, updated_at")
      .eq("key", GMAIL_KEY)
      .maybeSingle();
    if (error) return EMPTY_ROW;
    if (!data) return EMPTY_ROW;
    return {
      value: (data.value as string | null) ?? null,
      status: ((data.status as GmailAuthStatus | null) ?? "unknown"),
      statusDetail: (data.status_detail as string | null) ?? null,
      statusEmail: (data.status_email as string | null) ?? null,
      statusCheckedAt: (data.status_checked_at as string | null) ?? null,
      updatedAt: (data.updated_at as string | null) ?? null,
    };
  } catch {
    return EMPTY_ROW;
  }
}

/**
 * Resolve the active refresh token: prefer the DB row (writable at runtime),
 * fall back to the env var (legacy / first-run before the user re-auths
 * inside the app).
 */
export async function getGmailRefreshToken(): Promise<string | null> {
  const row = await readGmailCredentialRow();
  if (row.value && row.value.trim()) return row.value.trim();
  const fromEnv = process.env.GMAIL_REFRESH_TOKEN;
  return fromEnv && fromEnv.trim() ? fromEnv.trim() : null;
}

/**
 * Cheap presence check used by gates that previously read the env var
 * directly. Does not validate the token — just confirms one exists.
 */
export async function hasGmailRefreshToken(): Promise<boolean> {
  return Boolean(await getGmailRefreshToken());
}

async function upsertGmail(fields: Record<string, unknown>): Promise<void> {
  try {
    const supabase = createServerClient();
    await supabase
      .from("app_credentials")
      .upsert(
        { key: GMAIL_KEY, ...fields, updated_at: new Date().toISOString() },
        { onConflict: "key" }
      );
  } catch (err) {
    // Never throw — credential writes are best-effort. If the table is
    // missing the caller still completes the OAuth flow / API call and the
    // banner just won't update until the table is provisioned.
    console.error("[gmail/credentials] upsert failed", err);
  }
}

/**
 * Persist a freshly-issued refresh token from the OAuth callback. Marks
 * status='ok' so the banner clears immediately on a successful re-auth.
 */
export async function setGmailRefreshToken(token: string, email?: string): Promise<void> {
  await upsertGmail({
    value: token,
    status: "ok",
    status_detail: null,
    status_email: email ?? null,
    status_checked_at: new Date().toISOString(),
  });
}

export async function recordGmailAuthOk(email?: string): Promise<void> {
  await upsertGmail({
    status: "ok",
    status_detail: null,
    status_email: email ?? null,
    status_checked_at: new Date().toISOString(),
  });
}

export async function recordGmailAuthError(detail: string): Promise<void> {
  await upsertGmail({
    status: "error",
    status_detail: detail.slice(0, 500),
    status_checked_at: new Date().toISOString(),
  });
}

export async function recordGmailNotConfigured(): Promise<void> {
  await upsertGmail({
    status: "not_configured",
    status_detail: null,
    status_checked_at: new Date().toISOString(),
  });
}
