"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useSheetStore } from "@/stores/useSheetStore";
import { AccountDetail } from "@/components/features/accounts/AccountDetail";
import { AnyAccount } from "@/types/accounts";
import { ActivityLog } from "@/types/activity";
import { Spinner } from "@/components/ui/Spinner";
import Link from "next/link";

export default function AccountPage() {
  const params = useParams();
  const { data } = useSheetStore();
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);

  const tab = params.tab as string;
  const id = parseInt(params.id as string, 10);

  useEffect(() => {
    async function loadLogs() {
      try {
        const res = await fetch(`/api/activity/${tab}_${id}`);
        if (res.ok) setLogs(await res.json());
      } catch {}
      setLoading(false);
    }
    loadLogs();
  }, [tab, id]);

  if (!data) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner />
      </div>
    );
  }

  // Find the account
  let account: AnyAccount | undefined;
  const allAccounts: AnyAccount[] = [
    ...data.restaurants,
    ...data.retail,
    ...data.catering,
    ...data.foodTruck,
    ...data.activeAccounts,
  ];
  account = allAccounts.find(
    (a) => a._tabSlug === tab && a._rowIndex === id
  );

  if (!account) {
    return (
      <div className="py-20 text-center">
        <p className="text-gray-400">Account not found</p>
        <Link href="/pipeline" className="text-rs-gold hover:underline mt-2 inline-block">
          Back to Pipeline
        </Link>
      </div>
    );
  }

  return (
    <div>
      <Link href="/pipeline" className="text-rs-gold hover:underline text-sm mb-4 inline-block">
        Back to Pipeline
      </Link>
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Spinner />
        </div>
      ) : (
        <AccountDetail account={account} logs={logs} />
      )}
    </div>
  );
}
