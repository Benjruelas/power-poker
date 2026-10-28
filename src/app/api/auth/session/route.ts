import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  AUTH_COOKIE,
  getAuthRole,
  getAuthSecret,
  isPasswordProtectionEnabled,
  type AuthRole,
} from "@/lib/auth/siteGate";

export const runtime = "nodejs";

/**
 * Session probe for SessionGuard. The middleware 401s this route when the
 * auth cookie is missing or from an older SESSION_VERSION; reaching the
 * handler means the session is valid. Returns the role for client nav.
 */
export async function GET() {
  if (!isPasswordProtectionEnabled()) {
    return NextResponse.json(
      { role: "full" as AuthRole },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  const jar = await cookies();
  const token = jar.get(AUTH_COOKIE)?.value ?? "";
  const role = await getAuthRole(token, getAuthSecret());
  if (!role) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }

  return NextResponse.json(
    { role },
    { headers: { "Cache-Control": "no-store" } }
  );
}
