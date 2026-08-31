"use client";

import { useEffect } from "react";

/** Client redirect so crawlers still receive server-rendered OG metadata. */
export function OpenMapRedirect({ href }: { href: string }) {
  useEffect(() => {
    if (!href) return;
    window.location.replace(href);
  }, [href]);

  return null;
}
