import * as turf from "@turf/turf";
import type {
  Feature,
  FeatureCollection,
  MultiPolygon,
  Polygon,
  Position,
} from "geojson";
import type maplibregl from "maplibre-gl";

import {
  PARCEL_SOURCE_ID,
  PARCEL_SOURCE_LAYERS,
} from "@/lib/landrecords/parcelTiles";

function unionPolygons(
  a: Feature<Polygon | MultiPolygon>,
  b: Feature<Polygon | MultiPolygon>
): Feature<Polygon | MultiPolygon> | null {
  try {
    return turf.union(
      turf.featureCollection([a, b]) as FeatureCollection<Polygon | MultiPolygon>
    );
  } catch {
    return a;
  }
}

function asPolygonFeature(
  geometry: Polygon | MultiPolygon | null | undefined,
  properties: Record<string, unknown> = {}
): Feature<Polygon> | null {
  if (!geometry) return null;
  if (geometry.type === "Polygon") {
    return turf.polygon(geometry.coordinates, properties);
  }
  if (geometry.type === "MultiPolygon") {
    const polys = geometry.coordinates.map((c) => turf.polygon(c));
    if (!polys.length) return null;
    let merged: Feature<Polygon | MultiPolygon> | null = polys[0]!;
    for (let i = 1; i < polys.length; i++) {
      merged = unionPolygons(merged!, polys[i]!) ?? merged;
    }
    if (merged?.geometry?.type === "Polygon") {
      return merged as Feature<Polygon>;
    }
    if (merged?.geometry?.type === "MultiPolygon") {
      const first = merged.geometry.coordinates[0];
      if (first) return turf.polygon(first, properties);
    }
  }
  return null;
}

/**
 * Union MapLibre vector-tile features for an lrid / parcelid from the parcels source.
 * Best path for Texas where WFS often misses parcels.
 */
export function parcelPolygonFromMap(
  map: maplibregl.Map,
  opts: { lrid?: string; parcelId?: string }
): Feature<Polygon> | null {
  if (!map.getSource(PARCEL_SOURCE_ID)) return null;

  const needles = [opts.lrid, opts.parcelId]
    .filter(Boolean)
    .map((s) => String(s).trim().toLowerCase());
  if (!needles.length) return null;

  const matches: Feature<Polygon>[] = [];

  for (const sourceLayer of PARCEL_SOURCE_LAYERS) {
    let features: maplibregl.MapGeoJSONFeature[] = [];
    try {
      features = map.querySourceFeatures(PARCEL_SOURCE_ID, { sourceLayer });
    } catch {
      continue;
    }
    for (const f of features) {
      const props = (f.properties ?? {}) as Record<string, unknown>;
      const ids = [props.lrid, props.parcelid, props.PROP_ID, f.id]
        .filter((v) => v != null && v !== "")
        .map((v) => String(v).trim().toLowerCase());
      if (!ids.some((id) => needles.includes(id))) continue;
      const geom = f.geometry as Polygon | MultiPolygon | null;
      const poly = asPolygonFeature(geom, props);
      if (poly) matches.push(poly);
    }
  }

  if (!matches.length) return null;
  if (matches.length === 1) return matches[0]!;

  let merged: Feature<Polygon | MultiPolygon> | null = matches[0]!;
  for (let i = 1; i < matches.length; i++) {
    merged = unionPolygons(merged!, matches[i]!) ?? merged;
  }
  if (merged?.geometry?.type === "Polygon") {
    return merged as Feature<Polygon>;
  }
  if (merged?.geometry?.type === "MultiPolygon") {
    const first = merged.geometry.coordinates[0];
    if (first) return turf.polygon(first);
  }
  return matches[0]!;
}

/**
 * Fetch parcel polygon from /api/parcel when the response includes geometry.
 * Extends the existing identify API with `geometry=1`.
 */
export async function fetchParcelPolygon(opts: {
  lat: number;
  lng: number;
  lrid?: string;
  signal?: AbortSignal;
}): Promise<Feature<Polygon> | null> {
  const params = new URLSearchParams({
    lat: String(opts.lat),
    lng: String(opts.lng),
    geometry: "1",
  });
  if (opts.lrid) params.set("lrid", opts.lrid);

  let res: Response;
  try {
    res = await fetch(`/api/parcel?${params}`, { signal: opts.signal });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") throw err;
    return null;
  }
  if (!res.ok) return null;

  const data = (await res.json()) as {
    geometry?: Polygon | MultiPolygon | null;
    properties?: Record<string, unknown>;
  };
  return asPolygonFeature(data.geometry ?? null, data.properties ?? {});
}

/** Build a rough rectangle around a point when no parcel outline is available. */
export function fallbackParcelRectangle(
  lng: number,
  lat: number,
  acres = 5
): Feature<Polygon> {
  const sideFt = Math.sqrt(Math.max(acres, 0.5) * 43560);
  const half = sideFt / 2;
  const sw = turf.destination(turf.point([lng, lat]), half * Math.SQRT2, 225, {
    units: "feet",
  });
  const se = turf.destination(turf.point([lng, lat]), half * Math.SQRT2, 135, {
    units: "feet",
  });
  const ne = turf.destination(turf.point([lng, lat]), half * Math.SQRT2, 45, {
    units: "feet",
  });
  const nw = turf.destination(turf.point([lng, lat]), half * Math.SQRT2, 315, {
    units: "feet",
  });
  return turf.polygon([
    [
      sw.geometry.coordinates as Position,
      se.geometry.coordinates as Position,
      ne.geometry.coordinates as Position,
      nw.geometry.coordinates as Position,
      sw.geometry.coordinates as Position,
    ],
  ]);
}

export function sitePlanHref(opts: {
  lrid?: string;
  parcelId?: string;
  lat?: number;
  lng?: number;
  address?: string;
}): string {
  const params = new URLSearchParams();
  if (opts.lrid) params.set("lrid", opts.lrid);
  if (opts.parcelId) params.set("parcelId", opts.parcelId);
  if (opts.lat != null && Number.isFinite(opts.lat)) {
    params.set("lat", String(opts.lat));
  }
  if (opts.lng != null && Number.isFinite(opts.lng)) {
    params.set("lng", String(opts.lng));
  }
  if (opts.address) params.set("address", opts.address);
  return `/site-plan?${params.toString()}`;
}
