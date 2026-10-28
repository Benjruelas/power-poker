"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import {
  ArrowLeft,
  BriefcaseBusiness,
  Settings,
  Users,
} from "lucide-react";

import {
  HeaderActionLink,
  HeaderBrand,
  HeaderNavLink,
  headerActionsClass,
  headerBarClass,
  headerLabelClass,
} from "@/components/shared/appHeader";
import type { AuthRole } from "@/lib/auth/siteGate";
import { cn } from "@/lib/utils";

export function PartnerShell({
  children,
  title,
  actions,
}: {
  children: React.ReactNode;
  title?: string;
  actions?: React.ReactNode;
}) {
  const pathname = usePathname();
  const onSettings = pathname.startsWith("/partner/settings");
  const onDetail =
    pathname.startsWith("/partner/") &&
    !pathname.startsWith("/partner/settings");
  const onPipeline = pathname === "/partner";
  const [role, setRole] = useState<AuthRole | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/session", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { role?: AuthRole } | null) => {
        if (!cancelled && data?.role) setRole(data.role);
      })
      .catch(() => null);
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex h-dvh max-h-[100dvh] flex-col overflow-hidden bg-background text-foreground">
      <header className={headerBarClass}>
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-4">
          <HeaderBrand
            subtitle="Partner CRM"
            href="/partner"
            compactOnMobile
          />
          {onDetail && (
            <HeaderActionLink href="/partner" aria-label="Back to pipeline">
              <ArrowLeft className="size-4" strokeWidth={2.5} />
              <span className={headerLabelClass}>Pipeline</span>
            </HeaderActionLink>
          )}
          {!onDetail && (
            <nav
              aria-label="Partner CRM sections"
              className="flex shrink-0 items-center gap-0.5 rounded-lg border-2 border-neutral-800 bg-neutral-900 p-0.5 sm:gap-1 sm:p-1"
            >
              <HeaderNavLink
                href="/partner"
                active={onPipeline}
                aria-label="Pipeline"
              >
                <Users className="size-4" strokeWidth={2.5} />
                <span className={headerLabelClass}>Pipeline</span>
              </HeaderNavLink>
              <HeaderNavLink
                href="/partner/settings"
                active={onSettings}
                aria-label="Settings"
              >
                <Settings className="size-4" strokeWidth={2.5} />
                <span className={headerLabelClass}>Settings</span>
              </HeaderNavLink>
            </nav>
          )}
          {title ? (
            <span className="hidden min-w-0 truncate text-base font-medium text-neutral-400 lg:inline">
              · {title}
            </span>
          ) : null}
        </div>
        <div
          className={cn(
            "flex items-center gap-1.5 sm:gap-2.5",
            headerActionsClass
          )}
        >
          {actions}
          {role === "full" && (
            <HeaderActionLink href="/crm" aria-label="CRM">
              <BriefcaseBusiness className="size-4" strokeWidth={2.5} />
              <span className={headerLabelClass}>CRM</span>
            </HeaderActionLink>
          )}
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
