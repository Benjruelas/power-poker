"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

import { FUEL_COLORS } from "@/lib/types";
import { cn } from "@/lib/utils";

export function MapLegend({
  substationCount,
  projectCount,
}: {
  substationCount?: number;
  projectCount?: number;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="pointer-events-auto absolute bottom-3 left-3 z-50 max-w-[240px] rounded-lg border border-slate-200 bg-white text-xs text-slate-900 shadow-xl">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left font-semibold md:cursor-default md:pointer-events-none md:pb-0 md:pt-3"
        aria-expanded={open}
        aria-controls="map-legend-body"
      >
        <span>Legend</span>
        <ChevronDown
          className={cn(
            "size-3.5 shrink-0 text-slate-500 transition-transform md:hidden",
            open && "rotate-180"
          )}
        />
      </button>

      <div
        id="map-legend-body"
        className={cn("px-3 pb-3", open ? "block" : "hidden md:block")}
      >
        {(substationCount != null || projectCount != null) && (
          <p className="mb-2 text-[10px] text-slate-500">
            {substationCount != null && (
              <span>{substationCount.toLocaleString()} substations</span>
            )}
            {substationCount != null && projectCount != null && " · "}
            {projectCount != null && (
              <span>{projectCount.toLocaleString()} projects</span>
            )}
          </p>
        )}
        <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">
          Substation score
        </div>
        <div
          className="mb-2 h-2.5 rounded-full"
          style={{
            background:
              "linear-gradient(90deg,#ef4444,#f59e0b,#84cc16,#22c55e,#0d9488)",
          }}
        />
        <div className="mb-3 flex justify-between text-[10px] text-slate-500">
          <span>Low</span>
          <span>High</span>
        </div>
        <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">
          Queue projects
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1.5 text-slate-800">
          {(
            [
              ["BAT", "Battery"],
              ["SOL", "Solar"],
              ["WIN", "Wind"],
              ["GAS", "Gas"],
              ["OTH", "Other"],
            ] as const
          ).map(([id, label]) => (
            <span key={id} className="inline-flex items-center gap-1.5">
              <span
                className="size-2.5 shrink-0 rounded-full border border-slate-300"
                style={{ background: FUEL_COLORS[id] }}
              />
              {label}
            </span>
          ))}
        </div>
        <div className="mt-3 mb-1 text-[10px] uppercase tracking-wide text-slate-500">
          Parcels
        </div>
        <div className="mb-1 flex flex-wrap gap-x-3 gap-y-1 text-slate-800">
          <span className="inline-flex items-center gap-1.5">
            <span
              className="inline-block size-2.5 shrink-0 rounded-[2px] border-2 border-[#2563eb] bg-transparent"
              aria-hidden
            />
            Outline
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="inline-block size-2.5 shrink-0 rounded-[2px] border border-[#15803d] bg-[#16a34a]/70"
              aria-hidden
            />
            Yes
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="inline-block size-2.5 shrink-0 rounded-[2px] border border-[#b91c1c] bg-[#dc2626]/70"
              aria-hidden
            />
            No
          </span>
        </div>
        <p className="text-[10px] leading-snug text-slate-500">
          Outlines at zoom 15+. Reviewed parcels stay green (Yes) or red (No).
        </p>
        <div className="mt-3 mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-slate-500">
          <span
            className="inline-block size-2.5 shrink-0 rounded-[2px] border border-[#0f766e] bg-[#0d9488]/40"
            aria-hidden
          />
          Fiber service areas
        </div>
        <p className="text-[10px] leading-snug text-slate-500">
          Teal fill · FCC fiber (zoom in for parcel-scale)
        </p>
        <p className="mt-2 text-[10px] leading-snug text-slate-500">
          Rings: 1 mi parcel search · 5 mi queue proximity
        </p>
      </div>
    </div>
  );
}
