"use client";

import {
  Info,
  LandPlot,
  ListFilter,
  MapPinned,
  SlidersHorizontal,
} from "lucide-react";

import { useAppStore, type MobilePanel } from "@/lib/store";
import { cn } from "@/lib/utils";

const ITEMS: {
  id: MobilePanel;
  label: string;
  icon: typeof MapPinned;
}[] = [
  { id: "filters", label: "Filters", icon: SlidersHorizontal },
  { id: "details", label: "Site", icon: MapPinned },
  { id: "parcel", label: "Parcel", icon: LandPlot },
  { id: "lists", label: "Lists", icon: ListFilter },
  { id: "about", label: "About", icon: Info },
];

/**
 * iOS-style bottom tab bar: full-bleed, rounded top, safe-area padding inside
 * so the home indicator sits on the bar chrome (not on the labels).
 */
export function MobileActionBar() {
  const mobilePanel = useAppStore((s) => s.mobilePanel);
  const openMobilePanel = useAppStore((s) => s.openMobilePanel);
  const closeMobilePanel = useAppStore((s) => s.closeMobilePanel);

  return (
    <nav
      aria-label="Panels"
      className="pointer-events-auto rounded-t-2xl border-t border-border/80 bg-background/95 shadow-[0_-8px_24px_rgba(0,0,0,0.08)] backdrop-blur-md supports-backdrop-filter:bg-background/90"
    >
      <ul
        className="grid grid-cols-5 gap-0.5 px-1 pt-1.5"
        style={{
          paddingBottom: "max(0.5rem, env(safe-area-inset-bottom, 0px))",
        }}
      >
        {ITEMS.map(({ id, label, icon: Icon }) => {
          const active = mobilePanel === id;
          return (
            <li key={id}>
              <button
                type="button"
                aria-pressed={active}
                aria-label={label}
                onClick={() => {
                  if (active) closeMobilePanel();
                  else openMobilePanel(id);
                }}
                className={cn(
                  "flex min-h-11 w-full flex-col items-center justify-center gap-1 rounded-xl px-1 py-1.5 text-[11px] font-semibold leading-none tracking-tight transition-colors touch-manipulation",
                  active
                    ? "bg-emerald-600/15 text-emerald-700"
                    : "text-muted-foreground active:bg-muted hover:bg-muted hover:text-foreground"
                )}
              >
                <Icon className="size-5 shrink-0 stroke-[1.75]" aria-hidden />
                <span>{label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
