"use client";

import { useMemo, useState } from "react";
import { Download, Trash2 } from "lucide-react";
import {
  NO_PARCEL_LIST_ID,
  YES_PARCEL_LIST_ID,
} from "@/lib/lists/parcelReview";
import {
  NO_SUBSTATION_LIST_ID,
  YES_SUBSTATION_LIST_ID,
} from "@/lib/lists/substationReview";
import { useAppStore } from "@/lib/store";
import {
  exportParcelListCsv,
  exportShortlistCsv,
  formatMw,
  formatUsd,
} from "@/lib/geo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type ListKind = "sites" | "parcels";
type SiteSortKey = "score" | "name" | "county" | "queued";
type ParcelSortKey = "address" | "owner" | "county" | "acres";

export function ShortlistPanel() {
  const [kind, setKind] = useState<ListKind>("sites");
  const listsStatus = useAppStore((s) => s.listsStatus);
  const listsSyncing = useAppStore((s) => s.listsSyncing);
  const listsError = useAppStore((s) => s.listsError);

  const syncLabel =
    listsStatus === "loading"
      ? "Loading shared lists…"
      : listsSyncing
        ? "Saving to team…"
        : listsStatus === "error"
          ? listsError || "Sync error"
          : "Shared with team";

  return (
    <div className="flex h-full flex-col">
      <div className="flex gap-0.5 border-b px-2 pt-2">
        {(
          [
            ["sites", "Sites"],
            ["parcels", "Parcels"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setKind(id)}
            className={cn(
              "shrink-0 border-b-2 px-3 py-2 text-xs font-medium transition-colors",
              kind === id
                ? "border-emerald-600 text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <p
        className={cn(
          "border-b px-4 py-1.5 text-[11px]",
          listsStatus === "error"
            ? "bg-amber-50 text-amber-800"
            : "text-muted-foreground"
        )}
      >
        {syncLabel}
      </p>
      {kind === "sites" ? <SiteListsSection /> : <ParcelListsSection />}
    </div>
  );
}

function SiteListsSection() {
  const shortlists = useAppStore((s) => s.shortlists);
  const activeListId = useAppStore((s) => s.activeListId);
  const setActiveListId = useAppStore((s) => s.setActiveListId);
  const updateNote = useAppStore((s) => s.updateNote);
  const removeFromList = useAppStore((s) => s.removeFromList);
  const setPanelTab = useAppStore((s) => s.setPanelTab);

  const [sortKey, setSortKey] = useState<SiteSortKey>("score");

  const yesList = shortlists.find((l) => l.id === YES_SUBSTATION_LIST_ID);
  const noList = shortlists.find((l) => l.id === NO_SUBSTATION_LIST_ID);
  const active =
    shortlists.find((l) => l.id === activeListId) ?? yesList ?? null;
  const isYes = active?.id === YES_SUBSTATION_LIST_ID;

  const items = useMemo(() => {
    const list = [...(active?.items ?? [])];
    list.sort((a, b) => {
      if (sortKey === "score") return b.score - a.score;
      if (sortKey === "queued") return a.queuedMw5mi - b.queuedMw5mi;
      if (sortKey === "county") return a.county.localeCompare(b.county);
      return a.name.localeCompare(b.name);
    });
    return list;
  }, [active?.items, sortKey]);

  const onExport = () => {
    if (!active) return;
    downloadCsv(exportShortlistCsv(items), active.name);
  };

  return (
    <>
      <div className="space-y-3 border-b px-4 py-3">
        <h2 className="text-sm font-semibold">Site review</h2>
        <p className="text-xs text-muted-foreground">
          Shared Yes / No lists. Reviewed substations are removed from the map.
        </p>
        <div className="flex gap-1 rounded-lg bg-muted/60 p-0.5">
          <button
            type="button"
            onClick={() => setActiveListId(YES_SUBSTATION_LIST_ID)}
            className={cn(
              "flex-1 rounded-md px-2 py-1.5 text-xs font-semibold transition-colors",
              isYes
                ? "bg-emerald-600 text-white shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Yes ({yesList?.items.length ?? 0})
          </button>
          <button
            type="button"
            onClick={() => setActiveListId(NO_SUBSTATION_LIST_ID)}
            className={cn(
              "flex-1 rounded-md px-2 py-1.5 text-xs font-semibold transition-colors",
              !isYes
                ? "bg-red-600 text-white shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            No ({noList?.items.length ?? 0})
          </button>
        </div>
      </div>

      {!active ? (
        <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-muted-foreground">
          Loading review lists…
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2 border-b px-4 py-2">
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground">Sort</Label>
              <Select
                value={sortKey}
                onValueChange={(v) => setSortKey((v as SiteSortKey) ?? "score")}
              >
                <SelectTrigger size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="score">Score</SelectItem>
                  <SelectItem value="name">Name</SelectItem>
                  <SelectItem value="county">County</SelectItem>
                  <SelectItem value="queued">Queued MW</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={onExport}
              disabled={!items.length}
            >
              <Download className="size-3.5" />
              CSV
            </Button>
          </div>
          <ScrollArea className="flex-1">
            <ul className="space-y-2 px-4 py-3">
              {items.length === 0 && (
                <li className="text-sm text-muted-foreground">
                  No sites yet. Open a substation and mark Yes or No.
                </li>
              )}
              {items.map((item) => (
                <li
                  key={item.substationId}
                  className={cn(
                    "rounded-lg border p-3",
                    isYes
                      ? "border-emerald-200 bg-emerald-500/5"
                      : "border-red-200 bg-red-500/5"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <button
                      type="button"
                      className="min-w-0 text-left"
                      onClick={() => {
                        setPanelTab("details");
                        window.dispatchEvent(
                          new CustomEvent("bess:select-substation", {
                            detail: item.substationId,
                          })
                        );
                      }}
                    >
                      <div className="truncate text-sm font-semibold">
                        {item.name}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {item.county} · score {item.score} ·{" "}
                        {item.maxVolt || "?"} kV · {formatMw(item.queuedMw5mi)}{" "}
                        queued
                      </div>
                    </button>
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      title="Clear review — show on map"
                      onClick={() =>
                        removeFromList(active.id, item.substationId)
                      }
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  </div>
                  <Input
                    className="mt-2 h-7 text-xs"
                    placeholder="Notes…"
                    value={item.note}
                    onChange={(e) =>
                      updateNote(active.id, item.substationId, e.target.value)
                    }
                  />
                </li>
              ))}
            </ul>
          </ScrollArea>
        </>
      )}
    </>
  );
}

function ParcelListsSection() {
  const parcelLists = useAppStore((s) => s.parcelLists);
  const activeParcelListId = useAppStore((s) => s.activeParcelListId);
  const setActiveParcelListId = useAppStore((s) => s.setActiveParcelListId);
  const updateParcelNote = useAppStore((s) => s.updateParcelNote);
  const removeParcelFromList = useAppStore((s) => s.removeParcelFromList);
  const setParcelPopup = useAppStore((s) => s.setParcelPopup);
  const openParcelDetails = useAppStore((s) => s.openParcelDetails);

  const [sortKey, setSortKey] = useState<ParcelSortKey>("address");

  const yesList = parcelLists.find((l) => l.id === YES_PARCEL_LIST_ID);
  const noList = parcelLists.find((l) => l.id === NO_PARCEL_LIST_ID);
  const active =
    parcelLists.find((l) => l.id === activeParcelListId) ?? yesList ?? null;
  const isYes = active?.id === YES_PARCEL_LIST_ID;

  const items = useMemo(() => {
    const list = [...(active?.items ?? [])];
    list.sort((a, b) => {
      if (sortKey === "acres") return (b.acres ?? -1) - (a.acres ?? -1);
      if (sortKey === "owner")
        return a.ownerName.localeCompare(b.ownerName);
      if (sortKey === "county") return a.county.localeCompare(b.county);
      return a.address.localeCompare(b.address);
    });
    return list;
  }, [active?.items, sortKey]);

  const onExport = () => {
    if (!active) return;
    downloadCsv(exportParcelListCsv(items), active.name);
  };

  const openItem = (item: (typeof items)[number]) => {
    const focus = {
      id: item.parcelId,
      lrid: item.lrid,
      lat: item.latitude,
      lng: item.longitude,
      address: item.address,
      properties: {
        PROP_ID: item.parcelId,
        OWNER_NAME: item.ownerName,
        COUNTY: item.county,
        SITUS_ADDR: item.address,
        LL_GIS_ACRES: item.acres ?? "",
        MKT_VAL: item.marketValue ?? "",
        LATITUDE: item.latitude,
        LONGITUDE: item.longitude,
      },
    };
    setParcelPopup(null, focus);
    openParcelDetails();
    window.dispatchEvent(
      new CustomEvent("bess:fly-to", {
        detail: {
          lng: item.longitude,
          lat: item.latitude,
          zoom: 16,
          ...(item.lrid ? { lrid: item.lrid } : {}),
        },
      })
    );
  };

  return (
    <>
      <div className="space-y-3 border-b px-4 py-3">
        <h2 className="text-sm font-semibold">Parcel review</h2>
        <p className="text-xs text-muted-foreground">
          Shared Yes / No lists. Reviewed parcels turn green or red on the map.
        </p>
        <div className="flex gap-1 rounded-lg bg-muted/60 p-0.5">
          <button
            type="button"
            onClick={() => setActiveParcelListId(YES_PARCEL_LIST_ID)}
            className={cn(
              "flex-1 rounded-md px-2 py-1.5 text-xs font-semibold transition-colors",
              isYes
                ? "bg-emerald-600 text-white shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Yes ({yesList?.items.length ?? 0})
          </button>
          <button
            type="button"
            onClick={() => setActiveParcelListId(NO_PARCEL_LIST_ID)}
            className={cn(
              "flex-1 rounded-md px-2 py-1.5 text-xs font-semibold transition-colors",
              !isYes
                ? "bg-red-600 text-white shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            No ({noList?.items.length ?? 0})
          </button>
        </div>
      </div>

      {!active ? (
        <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-muted-foreground">
          Loading review lists…
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2 border-b px-4 py-2">
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground">Sort</Label>
              <Select
                value={sortKey}
                onValueChange={(v) =>
                  setSortKey((v as ParcelSortKey) ?? "address")
                }
              >
                <SelectTrigger size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="address">Address</SelectItem>
                  <SelectItem value="owner">Owner</SelectItem>
                  <SelectItem value="county">County</SelectItem>
                  <SelectItem value="acres">Acres</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={onExport}
              disabled={!items.length}
            >
              <Download className="size-3.5" />
              CSV
            </Button>
          </div>
          <ScrollArea className="flex-1">
            <ul className="space-y-2 px-4 py-3">
              {items.length === 0 && (
                <li className="text-sm text-muted-foreground">
                  No parcels yet. Open a parcel and mark Yes or No.
                </li>
              )}
              {items.map((item) => (
                <li
                  key={item.parcelId}
                  className={cn(
                    "rounded-lg border p-3",
                    isYes
                      ? "border-emerald-200 bg-emerald-500/5"
                      : "border-red-200 bg-red-500/5"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <button
                      type="button"
                      className="min-w-0 text-left"
                      onClick={() => openItem(item)}
                    >
                      <div className="truncate text-sm font-semibold">
                        {item.address}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {[
                          item.ownerName || null,
                          item.county ? `${item.county} Co.` : null,
                          item.acres != null
                            ? `${item.acres.toLocaleString(undefined, { maximumFractionDigits: 2 })} ac`
                            : null,
                          item.marketValue != null
                            ? formatUsd(item.marketValue)
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                    </button>
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      title="Clear review"
                      onClick={() =>
                        removeParcelFromList(active.id, item.parcelId)
                      }
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  </div>
                  <Input
                    className="mt-2 h-7 text-xs"
                    placeholder="Notes…"
                    value={item.note}
                    onChange={(e) =>
                      updateParcelNote(active.id, item.parcelId, e.target.value)
                    }
                  />
                </li>
              ))}
            </ul>
          </ScrollArea>
        </>
      )}
    </>
  );
}

function downloadCsv(csv: string, name: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name.replace(/\s+/g, "_").toLowerCase()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
