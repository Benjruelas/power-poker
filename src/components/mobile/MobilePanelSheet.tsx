"use client";

import type { ReactNode } from "react";
import type { DataMeta } from "@/lib/types";
import type { FeatureCollection, Point } from "geojson";
import type { SubstationProperties } from "@/lib/types";

import { AboutPanel } from "@/components/panels/AboutPanel";
import { DetailPanel } from "@/components/panels/DetailPanel";
import { ParcelDetailsPanel } from "@/components/panels/ParcelDetailsPanel";
import { ShortlistPanel } from "@/components/panels/ShortlistPanel";
import { FilterSidebar } from "@/components/filters/FilterSidebar";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useAppStore, type MobilePanel } from "@/lib/store";

const TITLES: Record<MobilePanel, string> = {
  filters: "Filters",
  details: "Site",
  parcel: "Parcel",
  lists: "Lists",
  about: "About",
};

export function MobilePanelSheet({
  counties,
  visibleSubCount,
  totalSubCount,
  substations,
  meta,
}: {
  counties: string[];
  visibleSubCount: number;
  totalSubCount: number;
  substations: FeatureCollection<Point, SubstationProperties> | null;
  meta: DataMeta | null;
}) {
  const mobilePanel = useAppStore((s) => s.mobilePanel);
  const closeMobilePanel = useAppStore((s) => s.closeMobilePanel);

  const open = mobilePanel != null;
  const title = mobilePanel ? TITLES[mobilePanel] : "";

  let body: ReactNode = null;
  if (mobilePanel === "filters") {
    body = (
      <FilterSidebar
        counties={counties}
        visibleSubCount={visibleSubCount}
        totalSubCount={totalSubCount}
      />
    );
  } else if (mobilePanel === "details") {
    body = <DetailPanel />;
  } else if (mobilePanel === "parcel") {
    body = <ParcelDetailsPanel substations={substations} />;
  } else if (mobilePanel === "lists") {
    body = <ShortlistPanel />;
  } else if (mobilePanel === "about") {
    body = <AboutPanel meta={meta} />;
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) closeMobilePanel();
      }}
    >
      <SheetContent
        side="bottom"
        showCloseButton
        // Leave room for the docked tab bar so it stays tappable above the sheet.
        // Height uses --mobile-tab-bar-offset (content + safe-area) from globals.css.
        // !important beats Sheet defaults: data-[side=bottom]:bottom-0 and :h-auto.
        className="inset-x-0 !bottom-[var(--mobile-tab-bar-offset)] !h-[calc(100dvh-var(--mobile-tab-bar-offset))] max-h-[calc(100dvh-var(--mobile-tab-bar-offset))] w-full gap-0 overflow-hidden rounded-t-2xl border-x-0 border-b-0 border-t p-0 data-[side=bottom]:!bottom-[var(--mobile-tab-bar-offset)] data-[side=bottom]:!h-[calc(100dvh-var(--mobile-tab-bar-offset))] sm:max-w-none"
      >
        <div className="flex h-full min-h-0 flex-col bg-background">
          <div
            className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-muted-foreground/30"
            aria-hidden
          />
          {/* Filters already has its own header + Reset; other panels need a title. */}
          {mobilePanel === "filters" ? (
            <SheetHeader className="sr-only">
              <SheetTitle>{title}</SheetTitle>
            </SheetHeader>
          ) : (
            <SheetHeader className="shrink-0 flex-row items-center gap-2 border-b px-4 py-3 pr-12 text-left">
              <SheetTitle className="text-base font-semibold">
                {title}
              </SheetTitle>
            </SheetHeader>
          )}
          {/* flex-col + min-h-0 so nested panel ScrollAreas get a bounded height */}
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {body}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
