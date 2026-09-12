import { NextResponse, type NextRequest } from "next/server";

import {
  AUTH_COOKIE,
  getAuthSecret,
  isPasswordProtectionEnabled,
  verifyAuthToken,
} from "@/lib/auth/siteGate";

const PUBLIC_PATHS = new Set(["/login", "/api/auth/login"]);

/** Share landing + OG image must stay public so Messages can unfurl link previews. */
function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  // `/p/{token}` page and `/p/{token}/opengraph-image` (and related metadata routes)
  if (pathname === "/p" || pathname.startsWith("/p/")) return true;
  return false;
}

export async function middleware(request: NextRequest) {
  if (!isPasswordProtectionEnabled()) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) {
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
    "/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|manifest\\.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|webmanifest)$).*)",
  ],
};
