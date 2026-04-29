import { createServerClient } from "@/lib/supabase/server";

export type ErrorSeverity = "error" | "warn";

export interface LoggedError {
  id: string;
  created_at: string;
  source: string;
  severity: ErrorSeverity;
  message: string;
  details: Record<string, unknown> | null;
  acknowledged: boolean;
}

/**
 * Write an error to the Supabase error_logs table so it surfaces in Settings.
 * Designed to NEVER throw — if the log insert fails, we fall back to console.
 */
export async function logError(
  source: string,
  error: unknown,
  context?: Record<string, unknown>,
  severity: ErrorSeverity = "error"
): Promise<void> {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "Unknown error";

  const details: Record<string, unknown> = { ...(context ?? {}) };
  if (error instanceof Error && error.stack) {
    details.stack = error.stack;
  }

  // Always log to console so Vercel's log tail still catches it
  console.error(`[${source}] ${message}`, details);

  try {
    const supabase = createServerClient();
    await supabase.from("error_logs").insert({
      source,
      severity,
      message,
      details: Object.keys(details).length ? details : null,
    });
  } catch (logErr) {
    console.error("[errors/log] Failed to persist error_log row", logErr);
  }
}

export async function getRecentErrors(limit = 50): Promise<LoggedError[]> {
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("error_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []) as LoggedError[];
  } catch (error) {
    console.error("[errors/log] Failed to read error_logs", error);
    return [];
  }
}

export async function acknowledgeError(id: string): Promise<boolean> {
  try {
    const supabase = createServerClient();
    const { error } = await supabase
      .from("error_logs")
      .update({ acknowledged: true })
      .eq("id", id);
    if (error) throw error;
    return true;
  } catch (error) {
    console.error("[errors/log] Failed to acknowledge error", error);
    return false;
  }
}

export async function acknowledgeAllErrors(): Promise<boolean> {
  try {
    const supabase = createServerClient();
    const { error } = await supabase
      .from("error_logs")
      .update({ acknowledged: true })
      .eq("acknowledged", false);
    if (error) throw error;
    return true;
  } catch (error) {
    console.error("[errors/log] Failed to acknowledge all errors", error);
    return false;
  }
}
