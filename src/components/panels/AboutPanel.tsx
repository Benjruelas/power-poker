"use client";

import type { DataMeta } from "@/lib/types";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

export function AboutPanel({ meta }: { meta: DataMeta | null }) {
  return (
    <ScrollArea className="h-full">
      <div className="space-y-4 px-4 py-4 text-sm">
        <div>
          <h2 className="text-base font-semibold">Power Poker</h2>
          <p className="mt-1 text-muted-foreground">
            Screen substations across the major US ISOs (ERCOT, SPP, MISO, PJM,
            CAISO, NYISO, ISO-NE) for develop-to-sell battery storage
            opportunities using public interconnection queue and transmission
            infrastructure data.
          </p>
        </div>

        <Separator />

        <section className="space-y-2">
          <h3 className="font-medium">How to use</h3>
          <ol className="list-decimal space-y-1 pl-4 text-muted-foreground">
            <li>Filter by voltage, score, crowding, county, and queue fuel.</li>
            <li>Click a substation — rings show 1 mi (parcel) and 5 mi (queue) radii.</li>
            <li>Use the sizing calculator for acreage / MW estimates.</li>
            <li>Bookmark sites and parcels into lists and export CSV.</li>
          </ol>
        </section>

        <section className="space-y-2">
          <h3 className="font-medium">Opportunity score (0–100)</h3>
          <ul className="list-disc space-y-1 pl-4 text-muted-foreground">
            <li>
              <strong className="text-foreground">Voltage (0–35)</strong> — higher
              interconnect voltage preferred
            </li>
            <li>
              <strong className="text-foreground">Crowding (0–35)</strong> — less
              nearby queued MW is better
            </li>
            <li>
              <strong className="text-foreground">BESS signal (0–20)</strong> — a
              few nearby batteries validate; many = competition
            </li>
            <li>
              <strong className="text-foreground">Connectivity (0–10)</strong> —
              more lines into the substation
            </li>
          </ul>
          <p className="text-xs text-muted-foreground">
            Metrics use POI-matched and proximity-matched queue projects only.
            County-centroid projects are shown for context but excluded from the
            score. Cost-sketch ranges are multi-market heuristics. Border states
            may show more than one ISO queue. Non-ISO West / Southeast utility
            queues are not included.
          </p>
        </section>

        <section className="space-y-2">
          <h3 className="font-medium">Data snapshot</h3>
          {meta ? (
            <ul className="space-y-1 text-muted-foreground">
              <li>Generated: {new Date(meta.generatedAt).toLocaleString()}</li>
              <li>Source report: {meta.sourceReport}</li>
              <li>
                {meta.substationCount.toLocaleString()} substations ·{" "}
                {meta.projectCount.toLocaleString()} projects ·{" "}
                {meta.lineCount.toLocaleString()} lines
              </li>
            </ul>
          ) : (
            <p className="text-muted-foreground">
              Run <code className="rounded bg-muted px-1">npm run data</code> to
              build the snapshot.
            </p>
          )}
        </section>

        <section className="space-y-2">
          <h3 className="font-medium">Sources</h3>
          <ul className="list-disc space-y-1 pl-4 text-muted-foreground">
            <li>HIFLD Open — Electric Substations & Transmission Lines</li>
            <li>ERCOTQueue — Texas ERCOT queue</li>
            <li>SPP OpsPortal GI Summary CSV</li>
            <li>MISO GI getprojects API</li>
            <li>PJM Planning API ExportToXls</li>
            <li>CAISO Public Queue Report</li>
            <li>NYISO Interconnection Queue workbook</li>
            <li>ISO-NE IRTT public queue</li>
            <li>US Census county boundaries — CONUS</li>
          </ul>
        </section>

        <p className="text-xs text-muted-foreground">
          Screening tool only — not interconnection advice. Hosting capacity and
          upgrade costs require TSP / ISO studies.
        </p>
      </div>
    </ScrollArea>
  );
}
