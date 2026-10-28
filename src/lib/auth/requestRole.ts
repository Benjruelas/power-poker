import { cookies } from "next/headers";

import {
  AUTH_COOKIE,
  getAuthRole,
  getAuthSecret,
  isPasswordProtectionEnabled,
  type AuthRole,
} from "@/lib/auth/siteGate";

/** Resolve the signed-in role for a Route Handler. */
export async function getRequestRole(): Promise<AuthRole | null> {
  if (!isPasswordProtectionEnabled()) return "full";
  const jar = await cookies();
  const token = jar.get(AUTH_COOKIE)?.value ?? "";
  return getAuthRole(token, getAuthSecret());
}

export async function requireFullRole(): Promise<AuthRole | Response> {
  const role = await getRequestRole();
  if (!role) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (role !== "full") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  return role;
}

export async function requirePartnerOrFull(): Promise<AuthRole | Response> {
  const role = await getRequestRole();
  if (!role) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return role;
}
