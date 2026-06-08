-- Writable credentials store. The Gmail refresh token used to live in the
-- GMAIL_REFRESH_TOKEN env var, which meant a revoked / expired token could
-- only be recovered by editing Vercel env vars and redeploying. Moving it
-- to this table lets the in-app re-auth flow update it at runtime.
--
-- Status columns track the most recent observed health of the credential so
-- the UI can render a persistent banner without waiting on the (now daily)
-- health cron. Updates happen in three places:
--   1. /api/gmail/auth callback after a fresh OAuth exchange (-> 'ok')
--   2. Gmail API wrappers when they catch an auth error (-> 'error')
--   3. checkGmailConnectivity() probes from the health cron and the
--      Settings "Test Connection" button (-> 'ok' or 'error')
--
-- Run this once in the Supabase SQL editor.

create table if not exists public.app_credentials (
  key text primary key,                              -- e.g. 'gmail'
  value text,                                        -- the secret (refresh token)
  status text not null default 'unknown',            -- 'ok' | 'error' | 'not_configured' | 'unknown'
  status_detail text,                                -- error message when status='error'
  status_email text,                                 -- account that probe confirmed (Gmail address)
  status_checked_at timestamptz,                     -- last time status was observed
  updated_at timestamptz not null default now()
);
