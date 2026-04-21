import { AnyAccount } from "@/types/accounts";
import { ActivityLog } from "@/types/activity";
import { daysSince, parseAppDate } from "@/lib/utils/dates";
import { getLatestContactLogForAccount, getResolvedFollowUpDate } from "@/lib/activity/timeline";

export interface AccountHealth {
  score: number;
  tone: "healthy" | "watch" | "at-risk" | "critical";
  label: string;
  reasons: string[];
}

export function getAccountHealth(account: AnyAccount, logs: ActivityLog[]): AccountHealth {
  let penalty = 0;
  const reasons: string[] = [];
  const latestContact = getLatestContactLogForAccount(logs, account);
  const lastTouch = latestContact?.created_at || account.contactDate || "";
  const days = daysSince(lastTouch);
  const followUpDate = getResolvedFollowUpDate(account, logs);
  const parsedFollowUp = followUpDate ? parseAppDate(followUpDate) : null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (!account.contactName) {
    penalty += 16;
    reasons.push("Missing contact");
  }

  if (!account.nextSteps) {
    penalty += 14;
    reasons.push("Missing next step");
  }

  if (!account.email && !account.phone) {
    penalty += 18;
    reasons.push("Missing contact channels");
  }

  if (days >= 30) {
    penalty += 28;
    reasons.push("No touch in 30+ days");
  } else if (days >= 14) {
    penalty += 18;
    reasons.push("No touch in 14+ days");
  } else if (days >= 7) {
    penalty += 10;
    reasons.push("No touch in 7+ days");
  }

  if (parsedFollowUp && parsedFollowUp.getTime() < today.getTime()) {
    penalty += 18;
    reasons.push("Overdue follow-up");
  }

  // Stage-specific staleness penalties
  if ((account.status === "Decision Pending") && days >= 3) {
    penalty += 20;
    reasons.push("Decision pending — needs close");
  } else if ((account.status === "Tasting Complete") && days >= 5) {
    penalty += 16;
    reasons.push("Tasting done — needs follow-up");
  } else if ((account.status === "Sample Sent") && days >= 7) {
    penalty += 14;
    reasons.push("Sample sent — no feedback yet");
  } else if ((account.status === "Connected" || account.status === "Following Up") && days >= 7) {
    penalty += 12;
  } else if ((account.status === "Reached Out" || account.status === "Contacted") && days >= 5) {
    penalty += 8;
  }

  const score = Math.max(0, 100 - penalty);

  if (score >= 80) return { score, tone: "healthy", label: "Healthy", reasons };
  if (score >= 60) return { score, tone: "watch", label: "Watch", reasons };
  if (score >= 40) return { score, tone: "at-risk", label: "At Risk", reasons };
  return { score, tone: "critical", label: "Critical", reasons };
}
