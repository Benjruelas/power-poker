import { NextResponse, type NextRequest } from "next/server";

import {
  AUTH_COOKIE,
  createAuthToken,
  getAuthSecret,
  isPasswordProtectionEnabled,
  verifyAuthToken,
} from "@/lib/auth/siteGate";

const PUBLIC_PATHS = new Set(["/login", "/api/auth/login"]);

export async function middleware(request: NextRequest) {
  if (!isPasswordProtectionEnabled()) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.has(pathname)) {
    const token = request.cookies.get(AUTH_COOKIE)?.value;
    if (
      pathname === "/login" &&
      token &&
      (await verifyAuthToken(token, getAuthSecret()))
    ) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  const token = request.cookies.get(AUTH_COOKIE)?.value;
  if (token && (await verifyAuthToken(token, getAuthSecret()))) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const loginUrl = new URL("/login", request.url);
  const redirectTarget = `${pathname}${request.nextUrl.search}`;
  if (redirectTarget && redirectTarget !== "/") {
    loginUrl.searchParams.set("redirect", redirectTarget);
  }
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
