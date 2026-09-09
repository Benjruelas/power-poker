import { NextResponse } from "next/server";

import {
  AUTH_COOKIE,
  createAuthToken,
  getAppPassword,
  getAuthSecret,
  isPasswordProtectionEnabled,
  verifyPassword,
} from "@/lib/auth/siteGate";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isPasswordProtectionEnabled()) {
    return NextResponse.json({ ok: true });
  }

  let body: { password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const password = typeof body.password === "string" ? body.password : "";
  if (!verifyPassword(password, getAppPassword())) {
    return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
  }

  const token = await createAuthToken(getAuthSecret());
  const response = NextResponse.json({ ok: true });
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
