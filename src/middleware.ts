import { NextResponse, type NextRequest } from "next/server";

import {
  AUTH_COOKIE,
  getAuthRole,
  getAuthSecret,
  isPartnerAllowedPath,
  isPasswordProtectionEnabled,
} from "@/lib/auth/siteGate";

// /api/parcel/health is public (and IP rate-limited) so LandRecords outages
// can be diagnosed without a session; it exposes statuses only, no secrets.
const PUBLIC_PATHS = new Set([
  "/login",
  "/api/auth/login",
  "/api/parcel/health",
]);

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
  const secret = getAuthSecret();
  const token = request.cookies.get(AUTH_COOKIE)?.value;
  const role = token ? await getAuthRole(token, secret) : null;

  if (isPublicPath(pathname)) {
    if (pathname === "/login" && role) {
      const dest = role === "partner" ? "/partner" : "/";
      return NextResponse.redirect(new URL(dest, request.url));
    }
    return NextResponse.next();
  }

  if (!role) {
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

  if (role === "partner" && !isPartnerAllowedPath(pathname)) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.redirect(new URL("/partner", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|manifest\\.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|webmanifest)$).*)",
  ],
};
