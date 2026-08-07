/**
 * Standalone fiber-routes snapshot builder (avoids full ISO queue rebuild).
 * Run: npx tsx scripts/build-fiber-routes.ts
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import * as turf from "@turf/turf";
import type { Feature, FeatureCollection, LineString, MultiLineString } from "geojson";
import type { FiberRouteProperties } from "../src/lib/types";

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "public/data/fiber-routes.geojson");
const META = path.join(ROOT, "public/data/meta.json");
const REGION_BBOX: [number, number, number, number] = [-125.0, 24.3, -66.5, 49.5];

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Power-Poker/1.0 (research; public data)" },
  });
  if (!res.ok) throw new Error(`Fetch failed ${res.status}: ${url}`);
  return res.json() as Promise<T>;
}

async function fetchArcGis(baseUrl: string, where: string) {
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
      geometry: REGION_BBOX.join(","),
      geometryType: "esriGeometryEnvelope",
      inSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
    });
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
    const oid = String(p.OBJECTID ?? p.OBJECTID_1 ?? out.length);
    const name = String(p.Object_Nam ?? p.NAME ?? `${source}-${oid}`).trim();
    out.push({
      type: "Feature",
      geometry: f.geometry,
      properties: {
        id: `${source}-${oid}`,
        name: name || `${source}-${oid}`,
        source,
        category: String(p.Category_o ?? "unknown"),
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
  way["cables"~"fibre|fiber",i](${s},${w},${n},${e});
  way["utility"="telecom"](${s},${w},${n},${e});
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

async function main() {
  const features: Feature<
    LineString | MultiLineString,
    FiberRouteProperties
  >[] = [];

  console.log("HIFLD submarine…");
  features.push(
    ...mapHifld(
      await fetchArcGis(
        "https://services5.arcgis.com/HDRa0B57OVrv2E1q/arcgis/rest/services/Submarine_Cable_Lines_USACE_IENC/FeatureServer/0/query",
        "1=1"
      ),
      "hifld-usace-submarine"
    )
  );
  console.log(" ", features.length);

  console.log("HIFLD overhead telephone…");
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

  const byId = new Map<
    number,
    Feature<LineString, FiberRouteProperties>
  >();
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
            tags.communication || tags.cables || tags.utility || "osm",
        },
      });
    }
    console.log("  unique osm", byId.size);
    await new Promise((r) => setTimeout(r, 1200));
  }
  features.push(...byId.values());

  const simplified = features.map((f) => {
    try {
      return turf.simplify(f, {
        tolerance: 0.0002,
        highQuality: false,
      }) as Feature<LineString | MultiLineString, FiberRouteProperties>;
    } catch {
      return f;
    }
  });

  const fc: FeatureCollection<
    LineString | MultiLineString,
    FiberRouteProperties
  > = { type: "FeatureCollection", features: simplified };
  await writeFile(OUT, JSON.stringify(fc));
  console.log("Wrote", OUT, "features", simplified.length);

  try {
    const meta = JSON.parse(await readFile(META, "utf8")) as {
      fiberRouteCount?: number;
      notes?: string[];
    };
    meta.fiberRouteCount = simplified.length;
    meta.notes = [
      ...(meta.notes ?? []).filter((note) => !note.startsWith("Fiber")),
      "Fiber coverage overlay: FCC BDC via Esri Living Atlas (live API).",
      "Fiber routes: OSM communication/fibre ways + HIFLD USACE IENC submarine/overhead telephone cables (partial; no national terrestrial ISP routes in HIFLD Open).",
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
