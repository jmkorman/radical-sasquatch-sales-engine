import Anthropic from "@anthropic-ai/sdk";
import { hasAnthropic } from "@/lib/prospecting/shared/anthropic";
import { decodeHtmlEntities } from "@/lib/utils/htmlEntities";

export interface EmailSummary {
  /** 1-2 sentence summary of what was said in the email */
  summary: string;
  /** Whether the summary came from AI or a fallback truncation */
  source: "ai" | "fallback";
}

const SYSTEM_PROMPT = `You summarize sent or received B2B sales emails for a CRM activity log.

Rules:
- Output ONE clear sentence (max 200 chars) that captures the substance.
- Skip greetings, signatures, quoted/forwarded threads, "Sent from my iPhone", auto-disclaimers.
- Use plain past-tense narration: "Sent intro about Radical Sasquatch dumplings and asked for tasting." or "Confirmed order for 8 cases delivering Tuesday."
- If it's a reply, lead with what they said: "Asked for pricing on full pallets" or "Confirmed they loved the samples."
- No quotes, no markdown, no preamble. Just the sentence.`;

function fallbackTruncate(body: string): string {
  const cleaned = body
    .replace(/^>.*$/gm, "") // quoted reply lines
    .replace(/-----Original Message-----[\s\S]*$/i, "")
    .replace(/On .+ wrote:[\s\S]*$/i, "")
    .replace(/Sent from my (?:iPhone|iPad|Android|phone)/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const sentence = cleaned.split(/(?<=[.!?])\s+/)[0]?.trim() ?? cleaned.slice(0, 200);
  return sentence.length > 200 ? `${sentence.slice(0, 197).trimEnd()}...` : sentence;
}

export async function summarizeEmail(input: {
  subject: string;
  body: string;
  direction?: "sent" | "received";
}): Promise<EmailSummary> {
  const trimmedBody = decodeHtmlEntities(input.body.trim());
  if (!trimmedBody) {
    return { summary: input.subject ? `Subject: ${input.subject}`.slice(0, 200) : "(no content)", source: "fallback" };
  }

  if (!hasAnthropic()) {
    return { summary: fallbackTruncate(trimmedBody), source: "fallback" };
  }

  try {
    const client = new Anthropic();
    const directionLabel = input.direction === "received" ? "Received reply" : "Sent email";
    const userPrompt = `${directionLabel}.
Subject: ${input.subject || "(no subject)"}

Body:
${trimmedBody.slice(0, 4000)}

Return only the one-sentence summary. No prefix.`;

    const res = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 150,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    });
    const text = res.content.find((b) => b.type === "text")?.text?.trim() ?? "";
    const cleaned = text.replace(/^["'`]+|["'`]+$/g, "").trim();
    if (!cleaned) return { summary: fallbackTruncate(trimmedBody), source: "fallback" };
    return {
      summary: cleaned.length > 220 ? `${cleaned.slice(0, 217).trimEnd()}...` : cleaned,
      source: "ai",
    };
  } catch {
    return { summary: fallbackTruncate(trimmedBody), source: "fallback" };
  }
}
