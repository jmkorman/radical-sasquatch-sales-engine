import Anthropic from "@anthropic-ai/sdk";

export function hasAnthropic(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export async function generateJSON<T>(opts: {
  system: string;
  user: string;
  maxTokens?: number;
}): Promise<T | null> {
  if (!hasAnthropic()) return null;
  try {
    const client = new Anthropic();
    const res = await client.messages.create({
      model: "claude-opus-4-6",
      max_tokens: opts.maxTokens ?? 2000,
      system: opts.system,
      messages: [{ role: "user", content: opts.user }],
    });
    const text = res.content.find((b) => b.type === "text")?.text ?? "";
    // Strip markdown fences if present
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) ?? text.match(/([\[{][\s\S]*[\]}])/);
    const raw = jsonMatch ? jsonMatch[1].trim() : text.trim();
    return JSON.parse(raw) as T;
  } catch (error) {
    console.error("generateJSON error:", error);
    return null;
  }
}
