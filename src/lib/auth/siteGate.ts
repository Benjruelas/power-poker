export const AUTH_COOKIE = "pp_auth";

export type AuthRole = "full" | "partner";

/**
 * Bump SESSION_VERSION to invalidate every issued auth cookie at once —
 * all clients are forced back to the password screen on their next request.
 */
const SESSION_VERSION = 3;

function authPayload(role: AuthRole): string {
  return `power-poker-authed:v${SESSION_VERSION}:${role}`;
}

export function isPasswordProtectionEnabled(): boolean {
  return Boolean(process.env.APP_PASSWORD?.trim());
}

export function getAppPassword(): string {
  return process.env.APP_PASSWORD?.trim() ?? "";
}

export function getPartnerPassword(): string {
  return process.env.PARTNER_PASSWORD?.trim() ?? "";
}

export function getAuthSecret(): string {
  return (
    process.env.APP_AUTH_SECRET?.trim() ||
    process.env.APP_PASSWORD?.trim() ||
    ""
  );
}

/**
 * Resolve which shared password was entered.
 * Identical APP_PASSWORD and PARTNER_PASSWORD prefer full access.
 */
export function resolveLoginRole(password: string): AuthRole | null {
  const app = getAppPassword();
  const partner = getPartnerPassword();
  if (app && verifyPassword(password, app)) return "full";
  if (partner && verifyPassword(password, partner)) return "partner";
  return null;
}

export async function createAuthToken(
  secret: string,
  role: AuthRole = "full"
): Promise<string> {
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
    new TextEncoder().encode(authPayload(role))
  );
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function verifyAuthToken(
  token: string,
  secret: string
): Promise<boolean> {
  return (await getAuthRole(token, secret)) !== null;
}

export async function getAuthRole(
  token: string,
  secret: string
): Promise<AuthRole | null> {
  if (!token || !secret) return null;
  const full = await createAuthToken(secret, "full");
  if (timingSafeEqual(token, full)) return "full";
  const partner = await createAuthToken(secret, "partner");
  if (timingSafeEqual(token, partner)) return "partner";
  return null;
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

/** Paths partner sessions may open (pages + matching APIs). */
export function isPartnerAllowedPath(pathname: string): boolean {
  if (pathname === "/partner" || pathname.startsWith("/partner/")) return true;
  if (pathname === "/api/partner" || pathname.startsWith("/api/partner/")) {
    return true;
  }
  if (pathname === "/api/auth/session") return true;
  return false;
}
