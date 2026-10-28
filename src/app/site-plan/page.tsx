"use client";

import { Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import type { Feature, Polygon } from "geojson";

import { SitePlanEditor } from "@/components/siteplan/SitePlanEditor";

function readSessionPolygon(lrid: string): Feature<Polygon> | null {
  if (typeof window === "undefined" || !lrid) return null;
  try {
    const raw = sessionStorage.getItem(`power-poker-site-plan-poly:${lrid}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Feature<Polygon>;
    if (parsed?.geometry?.type === "Polygon") return parsed;
  } catch {
    /* ignore */
  }
  return null;
}

function SitePlanPageInner() {
  const params = useSearchParams();
  const lrid = (params.get("lrid") || params.get("parcelId") || "").trim();
  const parcelId = (params.get("parcelId") || lrid).trim();
  const address = (params.get("address") || "Parcel").trim();
  const lat = parseFloat(params.get("lat") || "");
  const lng = parseFloat(params.get("lng") || "");

  const initialPolygon = useMemo(
    () => (lrid ? readSessionPolygon(lrid) : null),
    [lrid]
  );

  if (!lrid || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-2 px-6 text-center text-sm text-muted-foreground">
        <p className="font-medium text-foreground">Missing parcel</p>
        <p>
          Open a site plan from a parcel on the map (needs lrid, lat, and lng).
        </p>
        <a href="/" className="text-sm font-medium text-foreground underline">
          Back to map
        </a>
      </div>
    );
  }

  return (
    <SitePlanEditor
      lrid={lrid}
      parcelId={parcelId}
      address={address}
      lat={lat}
      lng={lng}
      initialPolygon={initialPolygon}
    />
  );
}

export default function SitePlanPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-dvh items-center justify-center text-sm text-muted-foreground">
          Loading…
        </div>
      }
    >
      <SitePlanPageInner />
    </Suspense>
  );
}
