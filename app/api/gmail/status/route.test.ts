// Tests for /api/gmail/status — confirms both handlers always return JSON,
// even when their collaborators throw. The in-app banner crashes if the
// status endpoint ever returns HTML, so this guard matters.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const readGmailCredentialRow = vi.fn();
const checkGmailConnectivity = vi.fn();

vi.mock("@/lib/gmail/credentials", () => ({
  readGmailCredentialRow: (...args: unknown[]) => readGmailCredentialRow(...args),
  // Re-export the type alias as a noop value so the route can import it.
  GmailAuthStatus: undefined,
}));
vi.mock("@/lib/gmail/sent", () => ({
  checkGmailConnectivity: (...args: unknown[]) => checkGmailConnectivity(...args),
}));
vi.mock("@/lib/errors/log", () => ({
  logError: vi.fn(async () => undefined),
}));

const ORIGINAL_CLIENT_ID = process.env.GMAIL_CLIENT_ID;
const ORIGINAL_CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;
const ORIGINAL_REFRESH = process.env.GMAIL_REFRESH_TOKEN;

beforeEach(() => {
  readGmailCredentialRow.mockReset();
  checkGmailConnectivity.mockReset();
  process.env.GMAIL_CLIENT_ID = "client-id";
  process.env.GMAIL_CLIENT_SECRET = "client-secret";
  delete process.env.GMAIL_REFRESH_TOKEN;
});

afterEach(() => {
  if (ORIGINAL_CLIENT_ID === undefined) delete process.env.GMAIL_CLIENT_ID;
  else process.env.GMAIL_CLIENT_ID = ORIGINAL_CLIENT_ID;
  if (ORIGINAL_CLIENT_SECRET === undefined) delete process.env.GMAIL_CLIENT_SECRET;
  else process.env.GMAIL_CLIENT_SECRET = ORIGINAL_CLIENT_SECRET;
  if (ORIGINAL_REFRESH === undefined) delete process.env.GMAIL_REFRESH_TOKEN;
  else process.env.GMAIL_REFRESH_TOKEN = ORIGINAL_REFRESH;
  vi.clearAllMocks();
});

import { GET, POST } from "@/app/api/gmail/status/route";

describe("GET /api/gmail/status", () => {
  it("returns 200 JSON when the credential row reads cleanly", async () => {
    readGmailCredentialRow.mockResolvedValue({
      value: "token",
      status: "ok",
      statusDetail: null,
      statusEmail: "rs@example.com",
      statusCheckedAt: "2026-06-07T00:00:00Z",
      updatedAt: "2026-06-07T00:00:00Z",
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("ok");
    expect(json.hasToken).toBe(true);
    expect(json.tokenSource).toBe("supabase");
  });

  it("returns 503 JSON (never HTML) when the credential read throws", async () => {
    readGmailCredentialRow.mockRejectedValue(new Error("connection refused"));

    const res = await GET();
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.status).toBe("error");
    expect(json.detail).toMatch(/credential/i);
    expect(json.hasToken).toBe(false);
  });

  it("reports not_configured when OAuth client env vars are missing", async () => {
    delete process.env.GMAIL_CLIENT_ID;
    readGmailCredentialRow.mockResolvedValue({
      value: "token",
      status: "ok",
      statusDetail: null,
      statusEmail: null,
      statusCheckedAt: null,
      updatedAt: null,
    });

    const res = await GET();
    const json = await res.json();
    expect(json.status).toBe("not_configured");
    expect(json.oauthClientConfigured).toBe(false);
  });
});

describe("POST /api/gmail/status", () => {
  it("returns 200 when the probe reports ok", async () => {
    checkGmailConnectivity.mockResolvedValue({ status: "ok", email: "rs@example.com" });
    const res = await POST();
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("ok");
  });

  it("returns 503 with the probe payload when the probe reports error", async () => {
    checkGmailConnectivity.mockResolvedValue({ status: "error", detail: "bad token" });
    const res = await POST();
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.status).toBe("error");
    expect(json.detail).toBe("bad token");
  });

  it("returns 503 JSON when the probe itself throws", async () => {
    checkGmailConnectivity.mockRejectedValue(new Error("network down"));
    const res = await POST();
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.status).toBe("error");
    expect(json.detail).toMatch(/probe failed/i);
  });
});
