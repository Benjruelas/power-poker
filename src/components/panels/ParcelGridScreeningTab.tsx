"use client";

import { useMemo, useState } from "react";
import type { FeatureCollection, Point } from "geojson";
import { Zap } from "lucide-react";

import { formatMw, formatUsd } from "@/lib/geo";
import {
  findNearestSubstations,
  formatDistanceMiles,
  screenParcelGrid,
} from "@/lib/parcelGridScreening";
import type { SubstationProperties } from "@/lib/types";
import { useAppStore } from "@/lib/store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

type Props = {
  lat: number;
  lng: number;
  substations: FeatureCollection<Point, SubstationProperties> | null;
};

function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-md border px-2.5 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="text-sm font-semibold tabular-nums">{value}</div>
      {hint ? (
        <div className="mt-0.5 text-[10px] text-muted-foreground">{hint}</div>
      ) : null}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-right text-xs font-medium tabular-nums text-foreground">
        {value}
      </span>
    </div>
  );
}

function formatMwRange(low: number, high: number): string {
  if (!low && !high) return "—";
  if (low === high) return formatMw(low);
  return `${Math.round(low)}–${Math.round(high)} MW`;
}

function crowdingLabel(queuedMw: number): string {
  if (queuedMw <= 0) return "Clear";
  if (queuedMw < 100) return "Light";
  if (queuedMw < 750) return "Moderate";
  if (queuedMw < 1500) return "Heavy";
  return "Saturated";
}

export function ParcelGridScreeningTab({ lat, lng, substations }: Props) {
  const setSelectedSubstation = useAppStore((s) => s.setSelectedSubstation);
  const [showAssumptions, setShowAssumptions] = useState(false);
  const [ampacityOverride, setAmpacityOverride] = useState<string>("");
  const [rOverride, setROverride] = useState<string>("");

  const nearestList = useMemo(
    () => findNearestSubstations(lat, lng, substations, 3),
    [lat, lng, substations]
  );

  const screening = useMemo(() => {
    const nearest = nearestList[0];
    if (!nearest) return null;
    const amp = Number(ampacityOverride);
    const r = Number(rOverride);
    return screenParcelGrid(nearest, {
      ampacityA: Number.isFinite(amp) && amp > 0 ? amp : undefined,
      rOhmPerMile: Number.isFinite(r) && r > 0 ? r : undefined,
    });
  }, [nearestList, ampacityOverride, rOverride]);

  if (!substations) {
    return (
      <p className="py-6 text-center text-xs text-muted-foreground">
        Loading substations…
      </p>
    );
  }

  if (!screening) {
    return (
      <p className="py-6 text-center text-xs text-muted-foreground">
        No substations in the dataset to screen against.
      </p>
    );
  }

  const { nearest, tier } = screening;
  const sub = nearest.properties;

  const openSite = (props: SubstationProperties) => {
    setSelectedSubstation(props);
  };

  return (
    <div className="space-y-4">
      <section>
        <div className="mb-2 flex items-center gap-2">
          <Zap className="size-3.5 text-emerald-600" />
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Nearest grid
          </h3>
        </div>
        <button
          type="button"
          onClick={() => openSite(sub)}
          className="w-full rounded-lg border bg-muted/40 px-3 py-2.5 text-left transition-colors hover:bg-muted/70"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{sub.name}</p>
              <p className="text-xs text-muted-foreground">
                {sub.county} County · {sub.voltageClass || tier.label}
              </p>
            </div>
            <Badge variant="secondary" className="shrink-0 text-[10px]">
              {formatDistanceMiles(nearest.distanceMiles)}
            </Badge>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <Metric
              label="Voltage"
              value={sub.maxVolt ? `${Math.round(sub.maxVolt)} kV` : "—"}
            />
            <Metric
              label="Queued 5 mi"
              value={formatMw(sub.queuedMw5mi)}
              hint={crowdingLabel(sub.queuedMw5mi)}
            />
            <Metric label="Score" value={`${sub.opportunityScore}/100`} />
          </div>
        </button>
        {nearestList.length > 1 ? (
          <ul className="mt-2 space-y-1">
            {nearestList.slice(1).map((n) => (
              <li key={n.properties.id}>
                <button
                  type="button"
                  onClick={() => openSite(n.properties)}
                  className="flex w-full items-center justify-between gap-2 rounded-md px-1 py-1 text-left text-xs hover:bg-muted/50"
                >
                  <span className="truncate text-muted-foreground">
                    {n.properties.name}
                    {n.properties.maxVolt
                      ? ` · ${Math.round(n.properties.maxVolt)} kV`
                      : ""}
                  </span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {formatDistanceMiles(n.distanceMiles)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <Separator />

      <section className="space-y-2">
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Deliverable MW screen
        </h3>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          {tier.connection}. Voltage class sets the typical ceiling; distance
          mainly hits cost (and feeder voltage drop at distribution).
        </p>
        <div className="grid grid-cols-2 gap-2">
          <Metric
            label="Typical band"
            value={formatMwRange(
              screening.typicalMwLow,
              screening.typicalMwHigh
            )}
            hint="By voltage class"
          />
          <Metric
            label="Screening ceiling"
            value={formatMw(screening.screeningCeilingMw)}
            hint={`Bound by ${screening.bindingConstraint}`}
          />
          <Metric
            label="Thermal (practical)"
            value={formatMw(screening.thermalPracticalMw)}
            hint={`√3·V·I ≈ ${screening.thermalMva.toFixed(0)} MVA`}
          />
          <Metric
            label="Voltage-drop limit"
            value={
              Number.isFinite(screening.voltageDropMw)
                ? formatMw(screening.voltageDropMw)
                : "—"
            }
            hint={`${(screening.assumptions.voltageDropFraction * 100).toFixed(0)}% drop · ${screening.assumptions.rOhmPerMile} Ω/mi`}
          />
        </div>
        {screening.silMw != null ? (
          <p className="text-[11px] text-muted-foreground">
            SIL reference ≈ {formatMw(screening.silMw)} (V²/400); short lines
            can exceed SIL up to thermal.
          </p>
        ) : null}
      </section>

      <section className="rounded-lg border p-3 text-xs space-y-1">
        <p className="font-medium text-foreground">Interconnection cost sketch</p>
        <Row
          label={`Line build (${formatDistanceMiles(nearest.distanceMiles)})`}
          value={`${formatUsd(screening.lineCostLow)}–${formatUsd(screening.lineCostHigh)}`}
        />
        <Row
          label="New substation (if needed)"
          value={`${formatUsd(screening.newSubCostLow)}–${formatUsd(screening.newSubCostHigh)}+`}
        />
        <p
          className={cn(
            "pt-1 text-[11px]",
            screening.likelyNeedsNewSub
              ? "text-amber-700 dark:text-amber-400"
              : "text-muted-foreground"
          )}
        >
          {screening.likelyNeedsNewSub
            ? "Distance / voltage class suggests a new substation or long lateral is plausible — treat line-only cost as a floor."
            : "Nearby sub may allow a tap or short lateral; still confirm with the utility."}
        </p>
      </section>

      <section className="space-y-2">
        <button
          type="button"
          onClick={() => setShowAssumptions((v) => !v)}
          className="text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400"
        >
          {showAssumptions ? "Hide assumptions" : "Adjust assumptions"}
        </button>
        {showAssumptions ? (
          <div className="grid grid-cols-2 gap-3 rounded-lg border p-3">
            <div className="space-y-1">
              <Label className="text-[11px]">Conductor ampacity (A)</Label>
              <Input
                type="number"
                min={100}
                placeholder={String(tier.defaultAmpacityA)}
                value={ampacityOverride}
                onChange={(e) => setAmpacityOverride(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Effective r (Ω/mile)</Label>
              <Input
                type="number"
                min={0.05}
                step={0.05}
                placeholder={String(tier.defaultROhmPerMile)}
                value={rOverride}
                onChange={(e) => setROverride(e.target.value)}
              />
            </div>
            <p className="col-span-2 text-[10px] text-muted-foreground">
              Defaults: {tier.defaultAmpacityA} A · {tier.defaultROhmPerMile}{" "}
              Ω/mi · 5% voltage-drop allowance. Clear fields to reset.
            </p>
          </div>
        ) : null}
      </section>

      <section className="space-y-1.5">
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Caveats
        </h3>
        <ul className="list-disc space-y-1 pl-4 text-[11px] leading-relaxed text-muted-foreground">
          {screening.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
          <li>
            Upstream transmission constraints and queue subscription only show
            up in a utility / ERCOT study — not from map geometry.
          </li>
        </ul>
      </section>

      <Button
        variant="outline"
        size="sm"
        className="w-full"
        onClick={() => openSite(sub)}
      >
        Open nearest site details
      </Button>
    </div>
  );
}
