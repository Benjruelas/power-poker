"use client";

import { useMemo, useState } from "react";
import { Download, Plus, Trash2 } from "lucide-react";
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
      {kind === "sites" ? <SiteListsSection /> : <ParcelListsSection />}
    </div>
  );
}

function SiteListsSection() {
  const shortlists = useAppStore((s) => s.shortlists);
  const activeListId = useAppStore((s) => s.activeListId);
  const createList = useAppStore((s) => s.createList);
  const deleteList = useAppStore((s) => s.deleteList);
  const setActiveListId = useAppStore((s) => s.setActiveListId);
  const updateNote = useAppStore((s) => s.updateNote);
  const removeFromList = useAppStore((s) => s.removeFromList);
  const setPanelTab = useAppStore((s) => s.setPanelTab);

  const [newName, setNewName] = useState("");
  const [sortKey, setSortKey] = useState<SiteSortKey>("score");

  const active = shortlists.find((l) => l.id === activeListId) ?? shortlists[0];

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

  const onCreate = () => {
    createList(newName || `Shortlist ${shortlists.length + 1}`);
    setNewName("");
  };

  const onExport = () => {
    if (!active) return;
    const csv = exportShortlistCsv(items);
    downloadCsv(csv, active.name);
  };

  return (
    <>
      <div className="space-y-3 border-b px-4 py-3">
        <h2 className="text-sm font-semibold">Site shortlists</h2>
        <div className="flex gap-2">
          <Input
            placeholder="New list name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onCreate()}
          />
          <Button size="sm" onClick={onCreate}>
            <Plus className="size-3.5" />
            Add
          </Button>
        </div>
        {shortlists.length > 0 && (
          <div className="flex items-center gap-2">
            <Select
              value={active?.id}
              onValueChange={(v) => setActiveListId(v ?? null)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select list">
                  {(value) => {
                    const list = shortlists.find((l) => l.id === value);
                    return list
                      ? `${list.name} (${list.items.length})`
                      : null;
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {shortlists.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name} ({l.items.length})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {active && (
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={() => deleteList(active.id)}
                title="Delete list"
              >
                <Trash2 className="size-3.5" />
              </Button>
            )}
          </div>
        )}
      </div>

      {!active ? (
        <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-muted-foreground">
          Create a shortlist, then bookmark substations from the map.
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
                  No sites yet. Open a substation and click the bookmark icon.
                </li>
              )}
              {items.map((item) => (
                <li key={item.substationId} className="rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <button
                      type="button"
                      className="text-left"
                      onClick={() => {
                        setPanelTab("details");
                        window.dispatchEvent(
                          new CustomEvent("bess:select-substation", {
                            detail: item.substationId,
                          })
                        );
                      }}
                    >
                      <div className="text-sm font-semibold">{item.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {item.county} · score {item.score} ·{" "}
                        {item.maxVolt || "?"} kV · {formatMw(item.queuedMw5mi)}{" "}
                        queued
                      </div>
                    </button>
                    <Button
                      size="icon-xs"
                      variant="ghost"
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
  const createParcelList = useAppStore((s) => s.createParcelList);
  const deleteParcelList = useAppStore((s) => s.deleteParcelList);
  const setActiveParcelListId = useAppStore((s) => s.setActiveParcelListId);
  const updateParcelNote = useAppStore((s) => s.updateParcelNote);
  const removeParcelFromList = useAppStore((s) => s.removeParcelFromList);
  const setParcelPopup = useAppStore((s) => s.setParcelPopup);
  const openParcelDetails = useAppStore((s) => s.openParcelDetails);

  const [newName, setNewName] = useState("");
  const [sortKey, setSortKey] = useState<ParcelSortKey>("address");

  const active =
    parcelLists.find((l) => l.id === activeParcelListId) ?? parcelLists[0];

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

  const onCreate = () => {
    createParcelList(newName || `Parcel list ${parcelLists.length + 1}`);
    setNewName("");
  };

  const onExport = () => {
    if (!active) return;
    downloadCsv(exportParcelListCsv(items), active.name);
  };

  const openItem = (item: (typeof items)[number]) => {
    const focus = {
      id: item.parcelId,
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
        detail: { lng: item.longitude, lat: item.latitude, zoom: 16 },
      })
    );
  };

  return (
    <>
      <div className="space-y-3 border-b px-4 py-3">
        <h2 className="text-sm font-semibold">Parcel lists</h2>
        <div className="flex gap-2">
          <Input
            placeholder="New list name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onCreate()}
          />
          <Button size="sm" onClick={onCreate}>
            <Plus className="size-3.5" />
            Add
          </Button>
        </div>
        {parcelLists.length > 0 && (
          <div className="flex items-center gap-2">
            <Select
              value={active?.id}
              onValueChange={(v) => setActiveParcelListId(v ?? null)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select list">
                  {(value) => {
                    const list = parcelLists.find((l) => l.id === value);
                    return list
                      ? `${list.name} (${list.items.length})`
                      : null;
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {parcelLists.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name} ({l.items.length})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {active && (
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={() => deleteParcelList(active.id)}
                title="Delete list"
              >
                <Trash2 className="size-3.5" />
              </Button>
            )}
          </div>
        )}
      </div>

      {!active ? (
        <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-muted-foreground">
          Create a parcel list, then add parcels from the map popup or details
          panel.
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
                  No parcels yet. Click a parcel, then use Add to list.
                </li>
              )}
              {items.map((item) => (
                <li key={item.parcelId} className="rounded-lg border p-3">
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
