"use client";

import { usePathname } from "next/navigation";
import { ArrowLeft, BriefcaseBusiness, Map, Settings } from "lucide-react";

import {
  HeaderActionLink,
  HeaderBrand,
  HeaderNavLink,
  headerActionsClass,
  headerBarClass,
  headerLabelClass,
} from "@/components/shared/appHeader";
import { cn } from "@/lib/utils";

export function CrmShell({
  children,
  title,
  actions,
}: {
  children: React.ReactNode;
  title?: string;
  actions?: React.ReactNode;
}) {
  const pathname = usePathname();
  const onSettings = pathname.startsWith("/crm/settings");
  const onDetail =
    pathname.startsWith("/crm/") && !pathname.startsWith("/crm/settings");
  const onPipeline = pathname === "/crm";

  return (
    <div className="flex h-dvh max-h-[100dvh] flex-col overflow-hidden bg-background text-foreground">
      <header className={headerBarClass}>
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-4">
          <HeaderBrand
            subtitle="Parcel CRM"
            href="/"
            compactOnMobile
          />
          {onDetail && (
            <HeaderActionLink href="/crm" aria-label="Back to pipeline">
              <ArrowLeft className="size-4" strokeWidth={2.5} />
              <span className={headerLabelClass}>Pipeline</span>
            </HeaderActionLink>
          )}
          {!onDetail && (
            <nav
              aria-label="CRM sections"
              className="flex shrink-0 items-center gap-0.5 rounded-lg border-2 border-neutral-800 bg-neutral-900 p-0.5 sm:gap-1 sm:p-1"
            >
              <HeaderNavLink
                href="/crm"
                active={onPipeline}
                aria-label="Pipeline"
              >
                <BriefcaseBusiness className="size-4" strokeWidth={2.5} />
                <span className={headerLabelClass}>Pipeline</span>
              </HeaderNavLink>
              <HeaderNavLink
                href="/crm/settings"
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
          <HeaderActionLink href="/" aria-label="Map">
            <Map className="size-4" strokeWidth={2.5} />
            <span className={headerLabelClass}>Map</span>
          </HeaderActionLink>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
