"use client";

import { useMemo, useState } from "react";
import { RotateCcw, Search, X } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { STAGE_LABELS } from "@/lib/types";

const FUEL_OPTIONS = [
  { id: "BAT", label: "Battery" },
  { id: "SOL", label: "Solar" },
  { id: "WIN", label: "Wind" },
  { id: "GAS", label: "Gas" },
  { id: "OTH", label: "Other" },
];

const STAGE_OPTIONS = Object.keys(STAGE_LABELS);

interface FilterSidebarProps {
  counties: string[];
  visibleSubCount: number;
  totalSubCount: number;
}

export function FilterSidebar({
  counties,
  visibleSubCount,
  totalSubCount,
}: FilterSidebarProps) {
  const filters = useAppStore((s) => s.filters);
  const setFilters = useAppStore((s) => s.setFilters);
  const resetFilters = useAppStore((s) => s.resetFilters);
  const [countyQuery, setCountyQuery] = useState("");

  const filteredCounties = useMemo(() => {
    const q = countyQuery.trim().toLowerCase();
    if (!q) return counties;
    return counties.filter((c) => c.toLowerCase().includes(q));
  }, [counties, countyQuery]);

  const resetCounties = () => {
    setFilters({ counties: [] });
    setCountyQuery("");
  };

  const toggleFuel = (fuel: string) => {
    const next = filters.fuels.includes(fuel)
      ? filters.fuels.filter((f) => f !== fuel)
      : [...filters.fuels, fuel];
    setFilters({ fuels: next.length ? next : [fuel] });
  };

  const toggleStage = (stage: string) => {
    const next = filters.stages.includes(stage)
      ? filters.stages.filter((s) => s !== stage)
      : [...filters.stages, stage];
    setFilters({ stages: next.length ? next : [stage] });
  };

  const toggleCounty = (county: string) => {
    const next = filters.counties.includes(county)
      ? filters.counties.filter((c) => c !== county)
      : [...filters.counties, county];
    setFilters({ counties: next });
  };

  return (
    <div className="flex h-full flex-col border-r bg-background/95 backdrop-blur">
      <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">Filters</h2>
          <p className="text-xs text-muted-foreground">
            {visibleSubCount.toLocaleString()} / {totalSubCount.toLocaleString()}{" "}
            substations
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={resetFilters}>
          <RotateCcw className="size-3.5" />
          Reset
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-5 px-4 py-4">
          <section className="space-y-3">
            <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Layers
            </Label>
            {(
              [
                ["showSubstations", "Substations"],
                ["showLines", "Transmission lines"],
                ["showProjects", "Queue projects"],
                ["showCounties", "County / state boundaries"],
                ["showParcels", "Parcels (zoom 15+)"],
                ["showFloodZones", "Flood zones"],
                ["showFiberCoverage", "Fiber service areas (FCC)"],
                ["satellite", "Satellite basemap"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex flex-col gap-1 text-sm">
                <span className="flex items-center gap-2">
                  <Checkbox
                    checked={filters[key]}
                    onCheckedChange={(v) => setFilters({ [key]: Boolean(v) })}
                  />
                  {label}
                </span>
                {key === "showFiberCoverage" && filters.showFiberCoverage && (
                  <span className="pl-6 text-[11px] leading-snug text-muted-foreground">
                    Teal = FCC-reported fiber. Zoom in for parcel-scale blocks;
                    empty gaps at wide zooms are not reliable “no fiber.”
                  </span>
                )}
              </label>
            ))}
          </section>

          <Separator />

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Min voltage
              </Label>
              <Badge variant="secondary">{filters.minVoltage}+ kV</Badge>
            </div>
            <Slider
              min={69}
              max={345}
              step={1}
              value={[filters.minVoltage]}
              onValueChange={(v) =>
                setFilters({ minVoltage: Array.isArray(v) ? v[0] : v })
              }
            />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>69</span>
              <span>138</span>
              <span>230</span>
              <span>345</span>
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Opportunity score
              </Label>
              <Badge variant="secondary">
                {filters.minScore}–{filters.maxScore}
              </Badge>
            </div>
            <Slider
              min={0}
              max={100}
              step={1}
              value={[filters.minScore, filters.maxScore]}
              onValueChange={(v) => {
                const arr = Array.isArray(v) ? v : [v];
                setFilters({
                  minScore: arr[0] ?? 0,
                  maxScore: arr[1] ?? 100,
                });
              }}
            />
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Max queued MW (5 mi)
              </Label>
              <Badge variant="secondary">
                {filters.maxQueuedMw >= 10000
                  ? "Any"
                  : `≤ ${filters.maxQueuedMw}`}
              </Badge>
            </div>
            <Slider
              min={0}
              max={10000}
              step={50}
              value={[filters.maxQueuedMw]}
              onValueChange={(v) =>
                setFilters({ maxQueuedMw: Array.isArray(v) ? v[0] : v })
              }
            />
            <p className="text-[11px] text-muted-foreground">
              Crowding filter — hide substations with more nearby queued MW than
              this threshold.
            </p>
          </section>

          <Separator />

          <section className="space-y-2">
            <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Queue fuel types
            </Label>
            {FUEL_OPTIONS.map((f) => (
              <label key={f.id} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={filters.fuels.includes(f.id)}
                  onCheckedChange={() => toggleFuel(f.id)}
                />
                {f.label}
              </label>
            ))}
          </section>

          <section className="space-y-2">
            <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Queue stage
            </Label>
            {STAGE_OPTIONS.map((s) => (
              <label key={s} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={filters.stages.includes(s)}
                  onCheckedChange={() => toggleStage(s)}
                />
                {STAGE_LABELS[s]}
              </label>
            ))}
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Project MW range
              </Label>
              <Badge variant="secondary">
                {filters.minProjectMw}–{filters.maxProjectMw}
              </Badge>
            </div>
            <Slider
              min={0}
              max={2000}
              step={10}
              value={[filters.minProjectMw, filters.maxProjectMw]}
              onValueChange={(v) => {
                const arr = Array.isArray(v) ? v : [v];
                setFilters({
                  minProjectMw: arr[0] ?? 0,
                  maxProjectMw: arr[1] ?? 2000,
                });
              }}
            />
          </section>

          <Separator />

          <section className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Counties
              </Label>
              <div className="flex items-center gap-1.5">
                {filters.counties.length > 0 && (
                  <Badge variant="secondary" className="text-[10px]">
                    {filters.counties.length} selected
                  </Badge>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={resetCounties}
                  disabled={
                    filters.counties.length === 0 && countyQuery.length === 0
                  }
                >
                  <RotateCcw className="size-3" />
                  Reset
                </Button>
              </div>
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={countyQuery}
                onChange={(e) => setCountyQuery(e.target.value)}
                placeholder="Search counties…"
                className="h-8 pr-8 pl-7 text-xs"
              />
              {countyQuery.length > 0 && (
                <button
                  type="button"
                  aria-label="Clear county search"
                  className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
                  onClick={() => setCountyQuery("")}
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>
            <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-2">
              {filteredCounties.length === 0 ? (
                <p className="px-1 py-2 text-xs text-muted-foreground">
                  No counties match “{countyQuery.trim()}”
                </p>
              ) : (
                filteredCounties.map((c) => (
                  <label key={c} className="flex items-center gap-2 text-xs">
                    <Checkbox
                      checked={filters.counties.includes(c)}
                      onCheckedChange={() => toggleCounty(c)}
                    />
                    {c}
                  </label>
                ))
              )}
            </div>
          </section>
        </div>
      </ScrollArea>
    </div>
  );
}
