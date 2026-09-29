"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

const CHECK_INTERVAL_MS = 5 * 60_000;

/**
 * Kicks stale clients (long-lived tabs, resumed iOS PWA sessions) back to the
 * login page when their auth cookie is no longer valid — e.g. after a
 * SESSION_VERSION bump. The full navigation also loads the latest build.
 */
export function SessionGuard() {
  const pathname = usePathname();
  const isPublic =
    pathname === "/login" || pathname === "/p" || pathname.startsWith("/p/");

  useEffect(() => {
    if (isPublic) return;
    let cancelled = false;

    const check = async () => {
      let res: Response;
      try {
        res = await fetch("/api/auth/session", { cache: "no-store" });
      } catch {
        return; // offline / network blip — never boot the user for that
      }
      if (!cancelled && res.status === 401) {
        window.location.replace("/login");
      }
    };

    check();
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVisible);
    const timer = setInterval(check, CHECK_INTERVAL_MS);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(timer);
    };
  }, [isPublic]);

  return null;
}
