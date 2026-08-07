/**
 * Standalone fiber-routes snapshot builder (avoids full ISO queue rebuild).
 * Run: npx tsx scripts/build-fiber-routes.ts
 *
 * Sources:
 * - Public carrier polylines (Crown Castle / Fiberlight / Zayo / …) via
 *   Montgomery County MD UltraMontgomery Fiber_Routes_Commercial MapServer
 * - HIFLD USACE IENC submarine + overhead telephone cables
 * - OpenStreetMap communication / fibre ways
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import * as turf from "@turf/turf";
import type {
  Feature,
  FeatureCollection,
  LineString,
  MultiLineString,
} from "geojson";
import type { FiberRouteProperties } from "../src/lib/types";

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "public/data/fiber-routes.geojson");
const META = path.join(ROOT, "public/data/meta.json");
const REGION_BBOX: [number, number, number, number] = [-125.0, 24.3, -66.5, 49.5];

/** Historical carrier fiber snapshots published as a public MapServer. */
const CARRIER_MAPSERVER =
  "https://gis3.montgomerycountymd.gov/arcgis/rest/services/UltraMontgomery/Fiber_Routes_Commercial/MapServer";

const CARRIER_LAYERS: {
  id: number;
  source: FiberRouteProperties["source"];
  label: string;
}[] = [
  { id: 0, source: "carrier-crown-castle", label: "Crown Castle (2018)" },
  { id: 1, source: "carrier-dfi", label: "DF&I (2019)" },
  { id: 2, source: "carrier-fiberlight", label: "Fiberlight (2017)" },
  { id: 3, source: "carrier-windstream", label: "Windstream (2018)" },
  { id: 4, source: "carrier-zayo", label: "Zayo (2019)" },
];

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Power-Poker/1.0 (research; public data)" },
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`Fetch failed ${res.status}: ${url}`);
  return res.json() as Promise<T>;
}

async function fetchArcGis(
  baseUrl: string,
  where: string,
  opts?: { useRegionBbox?: boolean; maxAllowableOffset?: number }
) {
  const pageSize = 2000;
  let offset = 0;
  const features: Feature[] = [];
  for (;;) {
    const params = new URLSearchParams({
      where,
      outFields: "*",
      returnGeometry: "true",
      outSR: "4326",
      f: "geojson",
      resultOffset: String(offset),
      resultRecordCount: String(pageSize),
    });
    if (opts?.useRegionBbox !== false) {
      params.set("geometry", REGION_BBOX.join(","));
      params.set("geometryType", "esriGeometryEnvelope");
      params.set("inSR", "4326");
      params.set("spatialRel", "esriSpatialRelIntersects");
    }
    if (opts?.maxAllowableOffset != null) {
      params.set("maxAllowableOffset", String(opts.maxAllowableOffset));
    }
    console.log(`  fetching offset=${offset}…`);
    const page = await fetchJson<
      FeatureCollection & {
        exceededTransferLimit?: boolean;
        properties?: { exceededTransferLimit?: boolean };
      }
    >(`${baseUrl}?${params}`);
    const batch = page.features ?? [];
    features.push(...batch);
    const exceeded =
      page.exceededTransferLimit ||
      page.properties?.exceededTransferLimit ||
      batch.length === pageSize;
    if (!exceeded || batch.length === 0) break;
    offset += batch.length;
  }
  return features;
}

const HIFLD_SKIP_CATEGORIES = new Set([
  "powerline",
  "transmission line",
  "power",
]);

function mapHifld(
  raw: Feature[],
  source: FiberRouteProperties["source"]
): Feature<LineString | MultiLineString, FiberRouteProperties>[] {
  const out: Feature<LineString | MultiLineString, FiberRouteProperties>[] =
    [];
  for (const f of raw) {
    if (
      !f.geometry ||
      (f.geometry.type !== "LineString" &&
        f.geometry.type !== "MultiLineString")
    ) {
      continue;
    }
    const p = (f.properties ?? {}) as Record<string, unknown>;
    const category = String(p.Category_o ?? "unknown").trim() || "unknown";
    if (HIFLD_SKIP_CATEGORIES.has(category.toLowerCase())) continue;
    const oid = String(p.OBJECTID ?? p.OBJECTID_1 ?? out.length);
    const name = String(p.Object_Nam ?? p.NAME ?? `${source}-${oid}`).trim();
    out.push({
      type: "Feature",
      geometry: f.geometry,
      properties: {
        id: `${source}-${oid}`,
        name: name || `${source}-${oid}`,
        source,
        category,
      },
    });
  }
  return out;
}

function mapCarrier(
  raw: Feature[],
  source: FiberRouteProperties["source"],
  carrierLabel: string
): Feature<LineString | MultiLineString, FiberRouteProperties>[] {
  const out: Feature<LineString | MultiLineString, FiberRouteProperties>[] =
    [];
  for (const f of raw) {
    if (
      !f.geometry ||
      (f.geometry.type !== "LineString" &&
        f.geometry.type !== "MultiLineString")
    ) {
      continue;
    }
    const p = (f.properties ?? {}) as Record<string, unknown>;
    const oid = String(p.OBJECTID ?? p.OID ?? p.FID ?? out.length);
    const name = String(p.Name ?? p.NAME ?? `${carrierLabel}-${oid}`).trim();
    out.push({
      type: "Feature",
      geometry: f.geometry,
      properties: {
        id: `${source}-${oid}`,
        name: name && name !== "*no label*" ? name : `${carrierLabel} ${oid}`,
        source,
        category: carrierLabel,
      },
    });
  }
  return out;
}

const OVERPASS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.osm.ch/api/interpreter",
];
const BBOXES: [number, number, number, number][] = [
  [24.5, -125, 36, -110],
  [36, -125, 49.5, -110],
  [24.5, -110, 36, -95],
  [36, -110, 49.5, -95],
  [24.5, -95, 36, -80],
  [36, -95, 49.5, -80],
  [24.5, -80, 36, -66.5],
  [36, -80, 49.5, -66.5],
];

type OsmEl = {
  type: string;
  id: number;
  tags?: Record<string, string>;
  geometry?: { lat: number; lon: number }[];
};

async function osmTile(
  s: number,
  w: number,
  n: number,
  e: number
): Promise<OsmEl[]> {
  const query = `[out:json][timeout:90];
(
  way["communication"="line"](${s},${w},${n},${e});
  way["telecom"="line"](${s},${w},${n},${e});
  way["telecom"="cable"](${s},${w},${n},${e});
  way["telecom"="path"](${s},${w},${n},${e});
  way["telecom:medium"~"fibre|fiber",i](${s},${w},${n},${e});
  way["cables"~"fibre|fiber",i](${s},${w},${n},${e});
  way["utility"="telecom"](${s},${w},${n},${e});
  way["seamark:cable_submarine:category"~"fibre|fiber|telephone",i](${s},${w},${n},${e});
);
out geom;`;
  for (const ep of OVERPASS) {
    try {
      const res = await fetch(ep, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "Power-Poker/1.0",
        },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(100_000),
      });
      if (!res.ok) continue;
      const data = (await res.json()) as { elements?: OsmEl[] };
      return data.elements ?? [];
    } catch {
      /* try next */
    }
  }
  return [];
}

function lineLengthMiles(
  geom: LineString | MultiLineString
): number {
  const parts =
    geom.type === "LineString" ? [geom.coordinates] : geom.coordinates;
  let miles = 0;
  for (const coords of parts) {
    for (let i = 1; i < coords.length; i++) {
      const [lon1, lat1] = coords[i - 1]!;
      const [lon2, lat2] = coords[i]!;
      const midLat = ((lat1 + lat2) / 2) * (Math.PI / 180);
      const dx = (lon2 - lon1) * 69 * Math.cos(midLat);
      const dy = (lat2 - lat1) * 69;
      miles += Math.hypot(dx, dy);
    }
  }
  return miles;
}

function simplifyFeature(
  f: Feature<LineString | MultiLineString, FiberRouteProperties>,
  tolerance: number
): Feature<LineString | MultiLineString, FiberRouteProperties> {
  try {
    return turf.simplify(f, {
      tolerance,
      highQuality: false,
    }) as Feature<LineString | MultiLineString, FiberRouteProperties>;
  } catch {
    return f;
  }
}

async function main() {
  const features: Feature<
    LineString | MultiLineString,
    FiberRouteProperties
  >[] = [];

  console.log("Commercial carrier fiber (UltraMontgomery public MapServer)…");
  for (const layer of CARRIER_LAYERS) {
    console.log(`  ${layer.label}…`);
    try {
      const raw = await fetchArcGis(
        `${CARRIER_MAPSERVER}/${layer.id}/query`,
        "1=1",
        { useRegionBbox: true, maxAllowableOffset: 0.0008 }
      );
      const mapped = mapCarrier(raw, layer.source, layer.label);
      features.push(...mapped);
      console.log(`    +${mapped.length} (total ${features.length})`);
    } catch (err) {
      console.warn(
        `    ${layer.label} failed:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  console.log("HIFLD submarine…");
  try {
    const before = features.length;
    features.push(
      ...mapHifld(
        await fetchArcGis(
          "https://services5.arcgis.com/HDRa0B57OVrv2E1q/arcgis/rest/services/Submarine_Cable_Lines_USACE_IENC/FeatureServer/0/query",
          "1=1"
        ),
        "hifld-usace-submarine"
      )
    );
    console.log(" +", features.length - before);
  } catch (err) {
    console.warn("  HIFLD submarine failed:", err);
  }

  console.log("HIFLD overhead telephone…");
  try {
    const before = features.length;
    features.push(
      ...mapHifld(
        await fetchArcGis(
          "https://services5.arcgis.com/HDRa0B57OVrv2E1q/arcgis/rest/services/Overhead_Cables_USACE_IENC/FeatureServer/0/query",
          "Category_o='Telephone'"
        ),
        "hifld-usace-overhead"
      )
    );
    console.log(" +", features.length - before);
  } catch (err) {
    console.warn("  HIFLD overhead failed:", err);
  }

  const skipOsm = process.argv.includes("--skip-osm");
  if (skipOsm) {
    console.log("Skipping OSM (--skip-osm)");
  } else {
    const byId = new Map<number, Feature<LineString, FiberRouteProperties>>();
    for (const [s, w, n, e] of BBOXES) {
      console.log(`OSM ${s},${w},${n},${e}`);
      const els = await osmTile(s, w, n, e);
      for (const el of els) {
        if (
          el.type !== "way" ||
          !el.geometry ||
          el.geometry.length < 2 ||
          byId.has(el.id)
        ) {
          continue;
        }
        const tags = el.tags ?? {};
        byId.set(el.id, {
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates: el.geometry.map((g) => [g.lon, g.lat]),
          },
          properties: {
            id: `osm-${el.id}`,
            name: tags.name || tags.operator || `OSM ${el.id}`,
            source: "osm",
            category:
              tags["telecom:medium"] ||
              tags.telecom ||
              tags.communication ||
              tags.cables ||
              tags.utility ||
              "osm",
          },
        });
      }
      console.log("  unique osm", byId.size);
      await new Promise((r) => setTimeout(r, 1200));
    }
    features.push(...byId.values());
  }

  // Carrier geometry is dense — simplify harder; keep OSM/HIFLD sharper
  const simplified: Feature<
    LineString | MultiLineString,
    FiberRouteProperties
  >[] = [];
  for (const f of features) {
    const isCarrier = f.properties.source.startsWith("carrier-");
    const s = simplifyFeature(f, isCarrier ? 0.0012 : 0.0002);
    // Drop microscopic scraps that only add noise at site-finder zooms
    if (lineLengthMiles(s.geometry) < 0.02) continue;
    simplified.push(s);
  }

  const fc: FeatureCollection<
    LineString | MultiLineString,
    FiberRouteProperties
  > = { type: "FeatureCollection", features: simplified };
  await writeFile(OUT, JSON.stringify(fc));
  console.log(
    "Wrote",
    OUT,
    "features",
    simplified.length,
    `(${(JSON.stringify(fc).length / 1e6).toFixed(1)} MB)`
  );

  try {
    const meta = JSON.parse(await readFile(META, "utf8")) as {
      fiberRouteCount?: number;
      notes?: string[];
    };
    meta.fiberRouteCount = simplified.length;
    meta.notes = [
      ...(meta.notes ?? []).filter((note) => !note.startsWith("Fiber")),
      "Fiber coverage overlay: FCC BDC via Esri Living Atlas (live API).",
      skipOsm
        ? "Fiber routes: public carrier snapshots (Crown Castle / Fiberlight / Zayo / Windstream / DF&I via Montgomery County UltraMontgomery MapServer) + HIFLD USACE IENC cables. Partial coverage; not a complete national inventory."
        : "Fiber routes: public carrier snapshots (Crown Castle / Fiberlight / Zayo / Windstream / DF&I via Montgomery County UltraMontgomery MapServer) + OSM + HIFLD USACE IENC cables. Partial coverage; not a complete national inventory.",
    ];
    await writeFile(META, JSON.stringify(meta, null, 2));
    console.log("Updated meta.json");
  } catch (err) {
    console.warn("meta update skipped", err);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
