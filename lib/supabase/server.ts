import { createClient } from "@supabase/supabase-js";

export function createServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
  }

  // Use service role key server-side so it bypasses RLS.
  // In production we require it; falling back to the anon key would quietly
  // undermine RLS and expose data if policies were ever tightened.
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (process.env.NODE_ENV === "production") {
    if (!serviceKey) {
      throw new Error(
        "SUPABASE_SERVICE_ROLE_KEY is required in production. Set it in Vercel env vars."
      );
    }
    return createClient(url, serviceKey);
  }

  const key = serviceKey || anonKey;
  if (!key) {
    throw new Error("Supabase key is not set (need SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY)");
  }
  return createClient(url, key);
}
