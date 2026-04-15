"use client";

import { AnyAccount } from "@/types/accounts";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { formatPhone } from "@/lib/utils/phone";
import { daysSince } from "@/lib/utils/dates";
import Link from "next/link";

interface AccountCardProps {
  account: AnyAccount;
  reason: string;
  lastActivityDate: string | null;
  onLogOutreach: () => void;
}

export function AccountCard({
  account,
  reason,
  lastActivityDate,
  onLogOutreach,
}: AccountCardProps) {
  const daysAgo = lastActivityDate ? daysSince(lastActivityDate) : null;
  const contactName = "contactName" in account ? account.contactName : "";

  return (
    <Card>
      <div className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <Link
              href={`/accounts/${account._tabSlug}/${account._rowIndex}`}
              className="font-semibold text-rs-cream hover:text-rs-gold transition-colors"
            >
              {account.account}
            </Link>
            <div className="flex items-center gap-2 mt-1">
              <Badge status={account.status} />
              <span className="text-xs text-[#d8ccfb]">{account.type}</span>
              {"location" in account && account.location && (
                <span className="text-xs text-[#af9fe6]">{account.location}</span>
              )}
            </div>
          </div>
          <Button size="sm" onClick={onLogOutreach}>
            Log Outreach
          </Button>
        </div>

        <div className="inline-flex w-fit rounded-full border border-rs-punch/40 bg-rs-punch/10 px-2.5 py-1 text-xs font-medium text-[#ffd6e8]">
          {reason}
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          {contactName && (
            <div className="text-[#ece5ff]">
              <span className="text-[#af9fe6]">Contact: </span>
              {contactName}
            </div>
          )}
          {account.phone && (
            <div>
              <a href={`tel:${account.phone}`} className="text-[#ece5ff] hover:text-rs-gold">
                {formatPhone(account.phone)}
              </a>
            </div>
          )}
          {account.email && (
            <div className="col-span-2 truncate">
              <a href={`mailto:${account.email}`} className="text-[#ece5ff] hover:text-rs-gold">
                {account.email}
              </a>
            </div>
          )}
        </div>

        {account.nextSteps && (
          <div className="border-t border-rs-border/70 pt-2 text-sm text-[#d8ccfb]">
            <span className="text-[#af9fe6]">Next steps: </span>
            {account.nextSteps}
          </div>
        )}

        {daysAgo !== null && daysAgo !== Infinity && (
          <div className="text-xs text-[#af9fe6]">
            Last activity: {daysAgo === 0 ? "Today" : `${daysAgo} days ago`}
          </div>
        )}
      </div>
    </Card>
  );
}
