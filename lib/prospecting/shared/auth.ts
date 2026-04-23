import { NextRequest } from "next/server";

export function isAuthorizedCron(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  const isVercelCron = request.headers.get("user-agent")?.toLowerCase().includes("vercel-cron");
  if (cronSecret) return auth === `Bearer ${cronSecret}`;
  return Boolean(isVercelCron);
}
