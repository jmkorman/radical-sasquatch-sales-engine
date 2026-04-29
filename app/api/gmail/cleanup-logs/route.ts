import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { summarizeEmail } from "@/lib/email/summarize";
import { logError } from "@/lib/errors/log";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // up to 5 minutes for batch jobs

const LEGACY_BODY_THRESHOLD = 400; // characters of body content beyond markers/subject
const MAX_PER_RUN = 60; // safety cap so one click doesn't burn through everything at once

interface ParsedLog {
  messageId: string | null;
  threadId: string | null;
  direction: "sent" | "received";
  subject: string;
  body: string;
}

function parseGmailNote(note: string): ParsedLog {
  const messageId = note.match(/\[gmail-message:([^\]]+)\]/)?.[1] ?? null;
  const threadId = note.match(/\[gmail-thread:([^\]]+)\]/)?.[1] ?? null;
  const sentMatch = note.match(/\[Sent\]\s*(.+?)$/m);
  const receivedMatch = note.match(/\[Received\]\s*(.+?)$/m);
  const direction: "sent" | "received" = receivedMatch && !sentMatch ? "received" : "sent";
  const subject = (sentMatch ?? receivedMatch)?.[1]?.trim() ?? "";

  // Strip markers and header lines to isolate the body
  const body = note
    .replace(/\[gmail-message:[^\]]+\]\n?/g, "")
    .replace(/\[gmail-thread:[^\]]+\]\n?/g, "")
    .replace(/\[Sent\]\s*.+\n?/g, "")
    .replace(/\[Received\]\s*.+\n?/g, "")
    .replace(/^From:.+\n?/m, "")
    .trim();

  return { messageId, threadId, direction, subject, body };
}

function rebuildNote(parsed: ParsedLog, summary: string): string {
  const lines = [
    parsed.messageId ? `[gmail-message:${parsed.messageId}]` : null,
    parsed.threadId ? `[gmail-thread:${parsed.threadId}]` : null,
    parsed.direction === "received"
      ? `[Received] ${parsed.subject}`
      : `[Sent] ${parsed.subject}`,
    "",
    summary,
  ].filter((line) => line !== null) as string[];
  return lines.join("\n").trim();
}

export async function POST(request: NextRequest) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }

  let dryRun = false;
  let limit = MAX_PER_RUN;
  try {
    const body = await request.json().catch(() => ({}));
    dryRun = Boolean(body?.dryRun);
    if (typeof body?.limit === "number" && body.limit > 0) {
      limit = Math.min(body.limit, MAX_PER_RUN);
    }
  } catch {
    // ignore malformed body
  }

  try {
    const supabase = createServerClient();

    // Pull a candidate batch — Gmail-source logs that are NOT already summarized.
    // Heuristic: total note length over LEGACY_BODY_THRESHOLD plus the marker overhead.
    const { data: candidates, error } = await supabase
      .from("activity_logs")
      .select("id, note, created_at")
      .eq("source", "gmail")
      .not("is_deleted", "eq", true)
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) throw error;

    const targets = (candidates ?? []).filter((row) => {
      const note = (row.note as string | null) ?? "";
      const parsed = parseGmailNote(note);
      // Only rewrite if body is genuinely long. Already-summarized logs end in
      // "..." OR are short. Skip them either way to avoid rewriting twice.
      return parsed.body.length > LEGACY_BODY_THRESHOLD;
    });

    const totalCandidates = targets.length;
    const slice = targets.slice(0, limit);

    if (dryRun) {
      return NextResponse.json({
        dryRun: true,
        totalCandidates,
        wouldProcess: slice.length,
      });
    }

    // Process with bounded concurrency (3 in flight) to keep within Anthropic rate limits.
    const concurrency = 3;
    let cursor = 0;
    let aiCount = 0;
    let fallbackCount = 0;
    let errorCount = 0;
    const sampleResults: Array<{ id: string; summary: string; source: string }> = [];

    const worker = async (): Promise<void> => {
      while (cursor < slice.length) {
        const idx = cursor++;
        const row = slice[idx];
        try {
          const note = (row.note as string | null) ?? "";
          const parsed = parseGmailNote(note);
          const result = await summarizeEmail({
            subject: parsed.subject,
            body: parsed.body,
            direction: parsed.direction,
          });
          if (result.source === "ai") aiCount++;
          else fallbackCount++;

          const newNote = rebuildNote(parsed, result.summary);
          const { error: updateError } = await supabase
            .from("activity_logs")
            .update({ note: newNote })
            .eq("id", row.id);
          if (updateError) throw updateError;

          if (sampleResults.length < 5) {
            sampleResults.push({
              id: row.id as string,
              summary: result.summary,
              source: result.source,
            });
          }
        } catch (err) {
          errorCount++;
          await logError("gmail-cleanup", err, { logId: row.id });
        }
      }
    }

    await Promise.all(Array.from({ length: concurrency }, () => worker()));

    return NextResponse.json({
      processed: slice.length,
      ai: aiCount,
      fallback: fallbackCount,
      errors: errorCount,
      remaining: Math.max(totalCandidates - slice.length, 0),
      totalCandidates,
      sampleResults,
    });
  } catch (error) {
    await logError("gmail-cleanup/top-level", error);
    return NextResponse.json({ error: "Cleanup failed" }, { status: 500 });
  }
}
