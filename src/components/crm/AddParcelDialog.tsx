"use client";

import { useEffect, useState } from "react";
import { Loader2, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { GeocodeSuggestion } from "@/lib/geocode";

export function AddParcelDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const [q, setQ] = useState("");
  const [suggestions, setSuggestions] = useState<GeocodeSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) {
      setQ("");
      setSuggestions([]);
      setError("");
      return;
    }
  }, [open]);

  useEffect(() => {
    if (!open || q.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(
          `/api/geocode?q=${encodeURIComponent(q.trim())}`
        );
        const data = await res.json();
        setSuggestions((data.suggestions ?? []) as GeocodeSuggestion[]);
      } catch {
        setSuggestions([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [q, open]);

  const createFromSuggestion = async (s: GeocodeSuggestion) => {
    setCreating(true);
    setError("");
    try {
      // Enrich with parcel API when possible
      let parcelId = s.id;
      let address = s.label;
      let ownerName = "";
      let county = "";
      let acres: number | null = null;
      let marketValue: number | null = null;
      let lrid: string | undefined;

      try {
        const params = new URLSearchParams({
          lat: String(s.lat),
          lng: String(s.lng),
        });
        if (s.kind === "parcel" && s.id) params.set("lrid", s.id);
        const parcelRes = await fetch(`/api/parcel?${params}`);
        if (parcelRes.ok) {
          const pdata = await parcelRes.json();
          const props = (pdata.properties ?? pdata.parcel?.properties ?? {}) as Record<
            string,
            string | number
          >;
          parcelId =
            String(props.PROP_ID || props.LL_UUID || props.LL_STABLE_ID || s.id);
          address = String(
            props.SITUS_ADDR || pdata.address || s.label
          );
          ownerName = String(props.OWNER_NAME || "");
          county = String(props.COUNTY || "");
          const ac =
            props.LL_GIS_ACRES ?? props.GIS_ACRES ?? null;
          acres =
            ac != null && ac !== ""
              ? parseFloat(String(ac).replace(/[$,]/g, ""))
              : null;
          if (!Number.isFinite(acres)) acres = null;
          const mv = props.MKT_VAL;
          marketValue =
            mv != null && mv !== ""
              ? parseFloat(String(mv).replace(/[$,]/g, ""))
              : null;
          if (!Number.isFinite(marketValue)) marketValue = null;
          lrid = pdata.lrid
            ? String(pdata.lrid)
            : props.LL_UUID
              ? String(props.LL_UUID)
              : s.lrid;
        }
      } catch {
        // use geocode fallback
      }

      const res = await fetch("/api/crm/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parcelId,
          lrid,
          address,
          ownerName,
          county,
          acres,
          marketValue,
          latitude: s.lat,
          longitude: s.lng,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create lead");
      onOpenChange(false);
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create lead");
    } finally {
      setCreating(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <button
        type="button"
        className="absolute inset-0"
        aria-label="Close"
        onClick={() => onOpenChange(false)}
      />
      <div className="relative z-10 w-full max-w-lg rounded-xl border bg-background shadow-xl">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Add parcel to CRM</h2>
          <p className="text-xs text-muted-foreground">
            Search by address, owner, or parcel ID.
          </p>
        </div>
        <div className="space-y-3 p-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Search</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-8"
                autoFocus
                placeholder="123 Main St, owner name, or parcel ID…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
          </div>
          {error && (
            <p className="text-xs text-destructive">{error}</p>
          )}
          <ul className="max-h-64 space-y-1 overflow-y-auto">
            {searching && (
              <li className="flex items-center gap-2 px-2 py-3 text-xs text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" />
                Searching…
              </li>
            )}
            {!searching && q.trim().length >= 2 && suggestions.length === 0 && (
              <li className="px-2 py-3 text-xs text-muted-foreground">
                No results
              </li>
            )}
            {suggestions.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  disabled={creating}
                  onClick={() => void createFromSuggestion(s)}
                  className="w-full rounded-lg border px-3 py-2 text-left text-sm hover:bg-muted/50 disabled:opacity-50"
                >
                  <div className="font-medium">{s.label}</div>
                  <div className="text-[11px] text-muted-foreground capitalize">
                    {s.kind}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex justify-end gap-2 border-t px-4 py-3">
          <Button
            size="sm"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={creating}
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
