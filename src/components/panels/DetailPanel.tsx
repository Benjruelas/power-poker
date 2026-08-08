"use client";

import { useMemo, useState } from "react";
import { ExternalLink, MapPin, X } from "lucide-react";
import { useAppStore } from "@/lib/store";
import {
  estimateAcres,
  estimateDevCost,
  estimateMwFromAcres,
} from "@/lib/scoring";
import { formatMw, formatUsd, interconnectionFyiUrl } from "@/lib/geo";
import { STATE_NAMES } from "@/lib/states";
import { STAGE_LABELS } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  SubstationReviewBadge,
  SubstationReviewButtons,
} from "@/components/substation/SubstationReviewButtons";

export function DetailPanel() {
  const selected = useAppStore((s) => s.selectedSubstation);
  const setSelectedSubstation = useAppStore((s) => s.setSelectedSubstation);
  const review = useAppStore((s) =>
    selected ? s.getSubstationReview(selected.id) : null
  );

  const [mw, setMw] = useState(100);
  const [duration, setDuration] = useState(4);
  const [acresInput, setAcresInput] = useState(20);
  const [mode, setMode] = useState<"mw" | "acres">("mw");

  const calc = useMemo(() => {
    if (mode === "mw") {
      const acres = estimateAcres(mw, duration);
      const midAcres = (acres.low + acres.high) / 2;
      const cost = estimateDevCost(mw, midAcres);
      return { acres, mwLow: mw, mwHigh: mw, mwh: mw * duration, cost };
    }
    const sizing = estimateMwFromAcres(acresInput, duration);
    const midMw = (sizing.mwLow + sizing.mwHigh) / 2;
    const cost = estimateDevCost(midMw, acresInput);
    return {
      acres: { low: acresInput, high: acresInput },
      mwLow: sizing.mwLow,
      mwHigh: sizing.mwHigh,
      mwh: sizing.mwhHigh,
      cost,
    };
  }, [mode, mw, duration, acresInput]);

  if (!selected) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-sm text-muted-foreground">
        <MapPin className="size-8 opacity-40" />
        <p className="font-medium text-foreground">Select a substation</p>
        <p>
          Click a scored site on the map to see queue neighbors, sizing, and a
          rough develop-to-sell cost sketch.
        </p>
      </div>
    );
  }

  const mapsUrl = `https://www.google.com/maps/@${selected.latitude},${selected.longitude},18z/data=!3m1!1e3`;
  const stateName = STATE_NAMES[selected.state] || selected.state || "Texas";
  const cadUrl = `https://www.google.com/search?q=${encodeURIComponent(
    `${selected.county} County ${stateName} appraisal district`
  )}`;

  const preciseNearby = selected.nearbyProjects.filter(
    (p) => p.matchedBy !== "county"
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-2 border-b px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-base font-semibold">{selected.name}</h2>
            <SubstationReviewBadge substationId={selected.id} />
          </div>
          <p className="text-xs text-muted-foreground">
            {selected.county} County · {selected.city || "—"} ·{" "}
            {selected.voltageClass}
          </p>
        </div>
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={() => setSelectedSubstation(null)}
        >
          <X className="size-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-4 px-4 py-4">
          <div className="space-y-1.5">
            <SubstationReviewButtons
              substationId={selected.id}
              substation={selected}
            />
            {review && (
              <p className="text-[11px] text-muted-foreground">
                Hidden from the map. Clear Yes/No to show the dot again.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Metric
              label="Opportunity"
              value={`${selected.opportunityScore}/100`}
            />
            <Metric
              label="Max voltage"
              value={selected.maxVolt ? `${selected.maxVolt} kV` : "Unknown"}
            />
            <Metric
              label="Queued (5 mi)"
              value={formatMw(selected.queuedMw5mi)}
            />
            <Metric
              label="Battery projects"
              value={String(selected.batteryProjectCount5mi)}
            />
            <Metric label="Lines" value={String(selected.lines)} />
            <Metric
              label="Active projects"
              value={String(selected.activeProjectCount5mi)}
            />
          </div>

          <div className="rounded-lg border bg-muted/40 p-3 text-xs">
            <p className="mb-2 font-medium">Score breakdown</p>
            <ul className="space-y-1 text-muted-foreground">
              <li>Voltage: {selected.scoreBreakdown.voltage}/35</li>
              <li>Low crowding: {selected.scoreBreakdown.crowding}/35</li>
              <li>BESS signal: {selected.scoreBreakdown.bessSignal}/20</li>
              <li>Connectivity: {selected.scoreBreakdown.connectivity}/10</li>
            </ul>
          </div>

          <div className="flex flex-wrap gap-2">
            <a
              href={mapsUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-7 items-center gap-1 rounded-lg border border-border bg-background px-2.5 text-[0.8rem] font-medium hover:bg-muted"
            >
              <ExternalLink className="size-3.5" />
              Satellite
            </a>
            <a
              href={cadUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-7 items-center gap-1 rounded-lg border border-border bg-background px-2.5 text-[0.8rem] font-medium hover:bg-muted"
            >
              <ExternalLink className="size-3.5" />
              County CAD
            </a>
          </div>

          <Separator />

          <section className="space-y-3">
            <h3 className="text-sm font-semibold">BESS sizing calculator</h3>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={mode === "mw" ? "default" : "outline"}
                onClick={() => setMode("mw")}
              >
                MW → acres
              </Button>
              <Button
                size="sm"
                variant={mode === "acres" ? "default" : "outline"}
                onClick={() => setMode("acres")}
              >
                Acres → MW
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {mode === "mw" ? (
                <div className="space-y-1">
                  <Label className="text-xs">Target MW</Label>
                  <Input
                    type="number"
                    min={1}
                    value={mw}
                    onChange={(e) => setMw(Number(e.target.value) || 0)}
                  />
                </div>
              ) : (
                <div className="space-y-1">
                  <Label className="text-xs">Parcel acres</Label>
                  <Input
                    type="number"
                    min={1}
                    value={acresInput}
                    onChange={(e) => setAcresInput(Number(e.target.value) || 0)}
                  />
                </div>
              )}
              <div className="space-y-1">
                <Label className="text-xs">Duration</Label>
                <Select
                  value={String(duration)}
                  onValueChange={(v) => setDuration(Number(v ?? 4))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="2">2-hour</SelectItem>
                    <SelectItem value="4">4-hour</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="rounded-lg border p-3 text-sm">
              {mode === "mw" ? (
                <p>
                  ~<strong>{calc.acres.low}</strong>–
                  <strong>{calc.acres.high}</strong> acres all-in for{" "}
                  {mw} MW / {duration}h ({mw * duration} MWh), at ~5–10 MW/acre
                  adjusted for duration, setbacks, and BOP.
                </p>
              ) : (
                <p>
                  ~<strong>{calc.mwLow}</strong>–<strong>{calc.mwHigh}</strong>{" "}
                  MW ({calc.mwLow * duration}–{calc.mwHigh * duration} MWh) on{" "}
                  {acresInput} acres at {duration}h.
                </p>
              )}
              <p className="mt-2 text-xs text-muted-foreground">
                Playbook target: 10–30 acre parcels within ~1 mile of a
                promising substation.
              </p>
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold">Development cost sketch</h3>
            <div className="rounded-lg border p-3 text-xs space-y-1.5">
              <Row
                label="Interconnection studies"
                value={`${formatUsd(calc.cost.studyLow)}–${formatUsd(calc.cost.studyHigh)}`}
              />
              <Row
                label="Land option (3 yr)"
                value={`${formatUsd(calc.cost.optionLow)}–${formatUsd(calc.cost.optionHigh)}`}
              />
              <Row
                label="Early diligence"
                value={`~${formatUsd(calc.cost.diligence)}`}
              />
              <Separator className="my-1" />
              <Row
                label="At-risk capital"
                value={`${formatUsd(calc.cost.totalLow)}–${formatUsd(calc.cost.totalHigh)}`}
                strong
              />
              <Row
                label="Timeline"
                value={`${calc.cost.timelineMonthsLow}–${calc.cost.timelineMonthsHigh} months`}
              />
              <Row
                label="Exit value (indicative)"
                value={`${formatUsd(calc.cost.exitPerMwLow)}–${formatUsd(calc.cost.exitPerMwHigh)}/MW`}
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              Not a quote — rough ranges from typical develop-to-sell
              economics (ERCOT / SPP). Interconnection upgrade risk can zero a
              position.
            </p>
          </section>

          <Separator />

          <section className="space-y-2">
            <h3 className="text-sm font-semibold">
              Nearby queue ({preciseNearby.length})
            </h3>
            {preciseNearby.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No POI/proximity-matched projects within 5 miles.
              </p>
            ) : (
              <ul className="space-y-2">
                {preciseNearby.map((p) => (
                  <li
                    key={p.inr}
                    className="rounded-md border px-2.5 py-2 text-xs"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <a
                        href={interconnectionFyiUrl(p.inr, p.market ?? "ERCOT")}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium leading-snug text-foreground underline-offset-2 hover:underline"
                      >
                        {p.name}
                        <ExternalLink className="ml-1 inline size-3 opacity-50" />
                      </a>
                      <Badge variant="secondary" className="shrink-0">
                        {formatMw(p.capacityMw)}
                      </Badge>
                    </div>
                    <div className="mt-1 text-muted-foreground">
                      {p.fuelDisplay} · {STAGE_LABELS[p.funnelStage] ?? p.funnelStage}{" "}
                      · {p.distanceMiles} mi · {p.matchedBy}
                    </div>
                    {p.projectedCod && (
                      <div className="text-muted-foreground">
                        COD {p.projectedCod}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <p className="text-[11px] text-muted-foreground">
              County-centroid queue points are on the map for context but do not
              affect this site&apos;s score.
            </p>
          </section>

        </div>
      </ScrollArea>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border px-2.5 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="text-sm font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function Row({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className={strong ? "font-semibold" : ""}>{value}</span>
    </div>
  );
}
