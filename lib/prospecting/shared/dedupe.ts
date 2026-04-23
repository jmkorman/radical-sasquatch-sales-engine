import { createServerClient } from "@/lib/supabase/server";
import { getAccountsData } from "@/lib/accounts/source";
import { getAllAccounts } from "@/lib/accounts/snapshot";
import { normalizeAccountName } from "@/lib/accounts/identity";

export async function loadExistingNormalizedNames(): Promise<Set<string>> {
  const { data: accountData } = await getAccountsData();
  const accounts = getAllAccounts(accountData);

  const supabase = createServerClient();
  const { data: prospects } = await supabase.from("prospects").select("business_name");

  return new Set([
    ...accounts.map((a) => normalizeAccountName(a.account)),
    ...((prospects ?? []) as { business_name: string }[]).map((p) => normalizeAccountName(p.business_name)),
  ]);
}
