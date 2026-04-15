import { SignJWT, jwtVerify } from "jose";

const secret = () => new TextEncoder().encode(process.env.NEXTAUTH_SECRET ?? "fallback-secret");

export function validateAppPassword(submitted: string): boolean {
  const expected = process.env.APP_PASSWORD;
  if (!expected) return false;
  if (submitted.length !== expected.length) return false;
  let result = 0;
  for (let i = 0; i < submitted.length; i++) {
    result |= submitted.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return result === 0;
}

export async function createAppSession(): Promise<string> {
  return new SignJWT({ authenticated: true })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(secret());
}

export async function verifyAppSession(token: string): Promise<boolean> {
  try {
    await jwtVerify(token, secret());
    return true;
  } catch {
    return false;
  }
}
