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
 * Knockscout-style floating action bar: map stays full-bleed; each item opens
 * its panel as a full-screen sheet.
 */
export function MobileActionBar() {
  const mobilePanel = useAppStore((s) => s.mobilePanel);
  const openMobilePanel = useAppStore((s) => s.openMobilePanel);
  const closeMobilePanel = useAppStore((s) => s.closeMobilePanel);

  return (
    <nav
      aria-label="Panels"
      className="pointer-events-auto rounded-2xl border border-border/80 bg-background/95 shadow-lg shadow-black/10 backdrop-blur-md supports-backdrop-filter:bg-background/85"
    >
      <ul className="grid grid-cols-5 gap-0.5 px-1 py-1.5">
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
                  "flex w-full flex-col items-center gap-0.5 rounded-xl px-1 py-1.5 text-[10px] font-medium transition-colors",
                  active
                    ? "bg-emerald-600/15 text-emerald-700"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <Icon className="size-5 stroke-[1.75]" />
                <span className="leading-none">{label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
