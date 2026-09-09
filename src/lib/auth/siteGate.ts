export const AUTH_COOKIE = "pp_auth";

const AUTH_PAYLOAD = "power-poker-authed";

export function isPasswordProtectionEnabled(): boolean {
  return Boolean(process.env.APP_PASSWORD?.trim());
}

export function getAppPassword(): string {
  return process.env.APP_PASSWORD?.trim() ?? "";
}

export function getAuthSecret(): string {
  return (
    process.env.APP_AUTH_SECRET?.trim() ||
    process.env.APP_PASSWORD?.trim() ||
    ""
  );
}

export async function createAuthToken(secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(AUTH_PAYLOAD)
  );
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function verifyAuthToken(
  token: string,
  secret: string
): Promise<boolean> {
  if (!token || !secret) return false;
  const expected = await createAuthToken(secret);
  return timingSafeEqual(token, expected);
}

export function verifyPassword(input: string, expected: string): boolean {
  if (!input || !expected) return false;
  return timingSafeEqual(input, expected);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
