"use client";

import { usePathname } from "next/navigation";
import { ArrowLeft, BriefcaseBusiness, Map, Settings } from "lucide-react";

import {
  HeaderActionLink,
  HeaderBrand,
  HeaderNavLink,
  headerActionsClass,
  headerBarClass,
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
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <header className={headerBarClass}>
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <HeaderBrand subtitle="Parcel CRM" href="/" />
          {onDetail && (
            <HeaderActionLink href="/crm">
              <ArrowLeft className="size-4" strokeWidth={2.5} />
              <span className="hidden sm:inline">Pipeline</span>
            </HeaderActionLink>
          )}
          {!onDetail && (
            <nav className="flex items-center gap-1 rounded-lg border-2 border-neutral-800 bg-neutral-900 p-1">
              <HeaderNavLink href="/crm" active={onPipeline}>
                <BriefcaseBusiness className="size-4" strokeWidth={2.5} />
                Pipeline
              </HeaderNavLink>
              <HeaderNavLink href="/crm/settings" active={onSettings}>
                <Settings className="size-4" strokeWidth={2.5} />
                Settings
              </HeaderNavLink>
            </nav>
          )}
          {title ? (
            <span className="hidden min-w-0 truncate text-base font-medium text-neutral-400 lg:inline">
              · {title}
            </span>
          ) : null}
        </div>
        <div className={cn("flex shrink-0 items-center gap-2.5", headerActionsClass)}>
          {actions}
          <HeaderActionLink href="/">
            <Map className="size-4" strokeWidth={2.5} />
            Map
          </HeaderActionLink>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
