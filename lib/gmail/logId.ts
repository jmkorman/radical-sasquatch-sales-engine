import { createHash } from "node:crypto";

export function buildGmailActivityLogId(messageId: string): string {
  const hex = createHash("sha1").update(`gmail-activity:${messageId}`).digest("hex").slice(0, 32);
  const chars = hex.split("");

  // UUID version 5 shape so Postgres uuid columns accept it.
  chars[12] = "5";
  chars[16] = ((parseInt(chars[16], 16) & 0x3) | 0x8).toString(16);

  return [
    chars.slice(0, 8).join(""),
    chars.slice(8, 12).join(""),
    chars.slice(12, 16).join(""),
    chars.slice(16, 20).join(""),
    chars.slice(20, 32).join(""),
  ].join("-");
}
