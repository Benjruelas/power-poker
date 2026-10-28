import { NextResponse } from "next/server";

import {
  AUTH_COOKIE,
  createAuthToken,
  getAuthSecret,
  isPasswordProtectionEnabled,
  resolveLoginRole,
} from "@/lib/auth/siteGate";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isPasswordProtectionEnabled()) {
    return NextResponse.json({ ok: true, role: "full" as const });
  }

  let body: { password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const password = typeof body.password === "string" ? body.password : "";
  const role = resolveLoginRole(password);
  if (!role) {
    return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
  }

  const token = await createAuthToken(getAuthSecret(), role);
  const response = NextResponse.json({ ok: true, role });
  response.cookies.set({
    name: AUTH_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}
