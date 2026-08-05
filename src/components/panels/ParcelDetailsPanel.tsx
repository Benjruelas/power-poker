"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BookmarkCheck,
  BookmarkPlus,
  ExternalLink,
  MapPin,
  X,
} from "lucide-react";

import { useAppStore } from "@/lib/store";
import {
  buildCategorizedProperties,
  CATEGORIES,
  parcelQuickStats,
  type CategoryId,
  type DetailRow,
} from "@/lib/landrecords/parcelDetails";
import { computeOwnerOccupied } from "@/lib/landrecords/ownerOccupied";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "property", label: "Property" },
  { id: "valuation", label: "Value" },
  { id: "ownership", label: "Owner" },
  { id: "legal", label: "Legal" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function DataRows({ items }: { items: DetailRow[] }) {
  if (!items.length) {
    return (
      <p className="py-4 text-center text-xs text-muted-foreground">
        No data in this section
      </p>
    );
  }
  return (
    <div className="space-y-0">
      {items.map(({ key, label, value }) => (
        <div
          key={key}
          className="flex justify-between gap-4 border-b border-border/60 py-2 last:border-0"
        >
          <span className="shrink-0 text-xs font-medium text-muted-foreground">
            {label}
          </span>
          <span className="text-right text-xs text-foreground break-words">
            {value}
          </span>
        </div>
      ))}
    </div>
  );
}

export function ParcelDetailsPanel() {
  const selected = useAppStore((s) => s.selectedParcel);
  const clearSelectedParcel = useAppStore((s) => s.clearSelectedParcel);
  const toggleParcelInActiveList = useAppStore(
    (s) => s.toggleParcelInActiveList
  );
  const activeParcelListId = useAppStore((s) => s.activeParcelListId);
  const parcelLists = useAppStore((s) => s.parcelLists);
  const [tab, setTab] = useState<TabId>("overview");

  useEffect(() => {
    setTab("overview");
  }, [selected?.id]);

  const inList = Boolean(
    selected &&
      parcelLists
        .find((l) => l.id === activeParcelListId)
        ?.items.some((i) => i.parcelId === selected.id)
  );
  const activeListName =
    parcelLists.find((l) => l.id === activeParcelListId)?.name ?? "My parcels";

  const categorized = useMemo(() => {
    if (!selected) return null;
    return buildCategorizedProperties(selected.properties, {
      lat: selected.lat,
      lng: selected.lng,
      address: selected.address,
    });
  }, [selected]);

  if (!selected || !categorized) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-sm text-muted-foreground">
        <MapPin className="size-8 opacity-40" />
        <p className="font-medium text-foreground">Select a parcel</p>
        <p>
          Zoom to 15+, click a parcel outline, then tap Details for full
          assessor attributes.
        </p>
      </div>
    );
  }

  const ownerOccupied = computeOwnerOccupied(selected.properties);
  const ownerName = String(selected.properties.OWNER_NAME || "");
  const stats = parcelQuickStats(selected.properties, categorized);

  const overviewItems: DetailRow[] = [];
  const pick = (cat: CategoryId, keys: string[]) => {
    for (const k of keys) {
      const found = categorized[cat]?.find((i) => i.key === k);
      if (found) {
        overviewItems.push(found);
        return;
      }
    }
  };
  pick("valuation", ["MKT_VAL"]);
  pick("property", ["BLDG_SQFT"]);
  pick("property", ["YEAR_BUILT"]);
  pick("property", ["BEDROOMS"]);
  pick("property", ["BATHROOMS"]);
  pick("property", ["LL_GIS_ACRES", "GIS_ACRES", "CALC_AREA_SQM"]);
  pick("property", ["ZONING", "ZONING_CODE"]);
  pick("property", ["USE_DESC"]);
  pick("location", ["SCHOOL_DISTRICT"]);

  const tabCategoryMap: Record<Exclude<TabId, "overview">, CategoryId[]> = {
    property: ["property", "other"],
    valuation: ["valuation"],
    ownership: ["ownership", "mailing", "identification"],
    legal: ["legal", "location"],
  };

  const mapsUrl = `https://www.google.com/maps?q=${selected.lat},${selected.lng}`;

  return (
    <div
      className="flex h-full flex-col"
      data-parcel-details-panel
    >
      <div className="flex items-start gap-2 border-b px-4 py-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold leading-tight text-foreground">
            {selected.address}
          </h2>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {ownerName ? (
              <span className="text-sm text-muted-foreground">{ownerName}</span>
            ) : null}
            {ownerOccupied ? (
              <Badge
                variant="secondary"
                className={cn(
                  "text-[10px]",
                  ownerOccupied === "Yes"
                    ? "bg-emerald-500/15 text-emerald-700"
                    : "bg-amber-500/15 text-amber-700"
                )}
              >
                {ownerOccupied === "Yes" ? "Owner Occupied" : "Absentee"}
              </Badge>
            ) : null}
            {stats.isQOZ ? (
              <Badge
                variant="secondary"
                className="bg-violet-500/15 text-[10px] text-violet-700"
              >
                Opportunity Zone
              </Badge>
            ) : null}
          </div>
          {stats.value ? (
            <p className="mt-1.5 text-sm font-semibold text-foreground">
              {stats.value}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 gap-1">
          <Button
            variant={inList ? "default" : "outline"}
            size="icon"
            className="size-7"
            onClick={() => toggleParcelInActiveList(selected)}
            title={
              inList
                ? `Remove from ${activeListName}`
                : `Add to ${activeListName}`
            }
          >
            {inList ? (
              <BookmarkCheck className="size-3.5" />
            ) : (
              <BookmarkPlus className="size-3.5" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={() => clearSelectedParcel()}
            aria-label="Close parcel details"
          >
            <X className="size-4" />
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2">
        <a
          href={mapsUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-xs font-medium hover:bg-muted"
        >
          <ExternalLink className="size-3.5" />
          Directions
        </a>
        <span className="text-[11px] text-muted-foreground">
          List: {activeListName}
          {inList ? " · saved" : ""}
        </span>
      </div>

      <div className="flex gap-0.5 overflow-x-auto border-b px-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "shrink-0 border-b-2 px-3 py-2 text-xs font-medium transition-colors",
              tab === t.id
                ? "border-emerald-600 text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-4 px-4 py-3">
          {tab === "overview" ? (
            <>
              {overviewItems.length > 0 ? (
                <div className="grid grid-cols-2 gap-2">
                  {overviewItems.map((item) => (
                    <div
                      key={item.key}
                      className="rounded-lg bg-muted/50 px-3 py-2"
                    >
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        {item.label}
                      </div>
                      <div className="mt-0.5 text-sm font-semibold">
                        {item.value}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
              <Separator />
              <section>
                <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {CATEGORIES.identification.title}
                </h3>
                <DataRows items={categorized.identification} />
              </section>
              <section>
                <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {CATEGORIES.address.title}
                </h3>
                <DataRows items={categorized.address} />
              </section>
            </>
          ) : (
            tabCategoryMap[tab].map((cat) => {
              const items = categorized[cat];
              if (!items?.length) return null;
              const title =
                cat === "other"
                  ? "Other"
                  : CATEGORIES[cat as keyof typeof CATEGORIES].title;
              return (
                <section key={cat}>
                  <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {title}
                  </h3>
                  <DataRows items={items} />
                </section>
              );
            })
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
