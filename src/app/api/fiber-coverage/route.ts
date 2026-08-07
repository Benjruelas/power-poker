import { enforceIpRateLimit } from "@/lib/landrecords/rateLimit";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Esri Living Atlas — FCC Broadband Data Collection (Dec 2024 View).
 * Scale-dependent polygon layers with UniqueProvidersFiber / ServedBSLsFiber.
 *
 * Completeness matters for site screening: we avoid H3 hexes on wide viewports
 * (they hit FeatureServer page caps and look like swiss cheese) and subdivide
 * the envelope when a query would otherwise truncate.
 */
const BDC_FEATURE_SERVER =
  "https://services8.arcgis.com/peDZJliSvYims39Q/arcgis/rest/services/FCC_Broadband_Data_Collection_December_2024_View/FeatureServer";

const CACHE_CONTROL =
  "public, max-age=300, s-maxage=600, stale-while-revalidate=3600";

const EMPTY_FC = {
  type: "FeatureCollection" as const,
  features: [] as GeoJSON.Feature[],
  truncated: false,
  layer: null as number | null,
};

const PAGE_SIZE = 1000;
/** Hard ceiling so a pathological viewport cannot exhaust the function. */
const MAX_FEATURES = 12_000;
/** One split level → up to 4 parallel envelopes (avoids 16-way fan-out). */
const MAX_SPLIT_DEPTH = 1;

type Bbox = [number, number, number, number];

type NormalizedFeature = GeoJSON.Feature & {
  id: string;
  properties: {
    geoid: unknown;
    uniqueProvidersFiber: unknown;
    servedBslsFiber: unknown;
    totalBsls: unknown;
  };
};

type QueryResult = {
  features: NormalizedFeature[];
  truncated: boolean;
};

/** Layer ids: 0 States, 1 Counties, 2 Tracts, 3 Block Groups, 4 Blocks, 5 H3 Res 8 */
function layerForZoom(z: number, spanDeg: number): number {
  if (z < 7) return 1; // Counties
  if (z < 9) return 2; // Tracts
  // Stay on block groups until the viewport is small enough for a complete fetch.
  // Wide H3 queries used to silently truncate → empty-looking hex holes.
  if (z < 12 || spanDeg >= 0.75) return 3; // Block Groups
  // H3 only on a tight mid-zoom viewport; zoom closer → census blocks (parcel-scale).
  if (z < 13 && spanDeg < 0.55) return 5; // H3 Resolution 8
  return 4; // Census Blocks
}

function pagesForLayer(layerId: number): number {
  // H3/blocks are denser — allow more pages per leaf before splitting.
  if (layerId >= 4) return 4;
  if (layerId === 3) return 4;
  return 5;
}

function emptyResponse(cacheable: boolean) {
  return Response.json(EMPTY_FC, {
    headers: {
      "Cache-Control": cacheable
        ? CACHE_CONTROL
        : "public, max-age=30, s-maxage=30",
    },
  });
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function isTransient(err: unknown): boolean {
  const code =
    err && typeof err === "object" && "cause" in err
      ? String((err as { cause?: { code?: string } }).cause?.code || "")
      : "";
  const msg = err instanceof Error ? err.message : String(err);
  return (
    code === "ECONNRESET" ||
    code === "ETIMEDOUT" ||
    code === "ECONNREFUSED" ||
    code === "UND_ERR_SOCKET" ||
    /fetch failed|ECONNRESET|socket|timeout/i.test(msg)
  );
}

async function fetchBdcPage(
  url: string
): Promise<GeoJSON.FeatureCollection | null> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const upstream = await fetch(url, {
        headers: {
          Accept: "application/json, application/geo+json",
          "User-Agent": "Power-Poker/1.0 (fiber coverage overlay; research)",
        },
        signal: AbortSignal.timeout(15_000),
      });
      if (!upstream.ok) {
        lastErr = new Error(`upstream ${upstream.status}`);
        if (
          (upstream.status >= 500 || upstream.status === 429) &&
          attempt < 3
        ) {
          await sleep(80 * attempt + Math.floor(Math.random() * 80));
          continue;
        }
        return null;
      }
      const data = (await upstream.json()) as GeoJSON.FeatureCollection & {
        error?: unknown;
        exceededTransferLimit?: boolean;
        properties?: { exceededTransferLimit?: boolean };
      };
      if (data.error) {
        lastErr = new Error("upstream error payload");
        return null;
      }
      return data;
    } catch (err) {
      lastErr = err;
      if (attempt < 3 && isTransient(err)) {
        await sleep(100 * attempt + Math.floor(Math.random() * 120));
        continue;
      }
      break;
    }
  }
  console.warn(
    "FCC BDC fiber coverage fetch failed:",
    lastErr instanceof Error ? lastErr.message : lastErr
  );
  return null;
}

function normalizeFeature(
  f: GeoJSON.Feature,
  page: number,
  index: number
): NormalizedFeature {
  const props = (f.properties ?? {}) as Record<string, unknown>;
  const geoid = props.GEOID ?? null;
  return {
    type: "Feature",
    geometry: f.geometry,
    properties: {
      geoid,
      uniqueProvidersFiber: props.UniqueProvidersFiber ?? 0,
      servedBslsFiber: props.ServedBSLsFiber ?? 0,
      totalBsls: props.TotalBSLs ?? 0,
    },
    id: String(geoid ?? f.id ?? `${page}-${index}`),
  };
}

function splitBbox([w, s, e, n]: Bbox): Bbox[] {
  const mx = (w + e) / 2;
  const my = (s + n) / 2;
  return [
    [w, s, mx, my],
    [mx, s, e, my],
    [w, my, mx, n],
    [mx, my, e, n],
  ];
}

function mergeUnique(into: Map<string, NormalizedFeature>, batch: NormalizedFeature[]) {
  for (const f of batch) {
    if (into.size >= MAX_FEATURES) return;
    if (!into.has(f.id)) into.set(f.id, f);
  }
}

/**
 * Page through one envelope. If still truncated and we can split, recurse into quads.
 */
async function queryEnvelope(
  layerId: number,
  bbox: Bbox,
  depth: number
): Promise<QueryResult> {
  const [w, s, e, n] = bbox;
  const maxPages = pagesForLayer(layerId);
  const pageFeatures: NormalizedFeature[] = [];
  let stillExceeded = false;

  for (let page = 0; page < maxPages; page++) {
    const params = new URLSearchParams({
      where: "UniqueProvidersFiber>0",
      geometry: `${w},${s},${e},${n}`,
      geometryType: "esriGeometryEnvelope",
      inSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
      outFields: "GEOID,UniqueProvidersFiber,ServedBSLsFiber,TotalBSLs",
      returnGeometry: "true",
      outSR: "4326",
      f: "geojson",
      resultOffset: String(page * PAGE_SIZE),
      resultRecordCount: String(PAGE_SIZE),
    });
    const url = `${BDC_FEATURE_SERVER}/${layerId}/query?${params.toString()}`;
    const pageData = await fetchBdcPage(url);
    if (!pageData) {
      // Partial success on later pages is better than empty; first page fail → empty
      return {
        features: pageFeatures,
        truncated: page === 0 ? false : true,
      };
    }
    const batch = pageData.features ?? [];
    for (let i = 0; i < batch.length; i++) {
      pageFeatures.push(normalizeFeature(batch[i]!, page, i));
    }
    const exceeded =
      (pageData as { exceededTransferLimit?: boolean }).exceededTransferLimit ||
      (
        pageData as { properties?: { exceededTransferLimit?: boolean } }
      ).properties?.exceededTransferLimit ||
      batch.length >= PAGE_SIZE;
    if (!exceeded || batch.length === 0) {
      stillExceeded = false;
      break;
    }
    stillExceeded = true;
  }

  if (!stillExceeded) {
    return { features: pageFeatures, truncated: false };
  }
  if (depth >= MAX_SPLIT_DEPTH) {
    return { features: pageFeatures, truncated: true };
  }

  // Incomplete envelope — drop partial pages and cover with parallel quads
  const children = await Promise.all(
    splitBbox(bbox).map((quad) => queryEnvelope(layerId, quad, depth + 1))
  );
  const merged = new Map<string, NormalizedFeature>();
  let truncated = false;
  for (const child of children) {
    mergeUnique(merged, child.features);
    if (child.truncated) truncated = true;
  }
  if (merged.size >= MAX_FEATURES) truncated = true;

  return {
    features: Array.from(merged.values()),
    truncated,
  };
}

export async function GET(request: Request) {
  const limited = enforceIpRateLimit(request, "fiber-coverage", 120, 60);
  if (limited) return limited;

  const { searchParams } = new URL(request.url);
  const bbox = searchParams.get("bbox");
  const zRaw = searchParams.get("z");
  if (!bbox || zRaw == null) {
    return Response.json(
      { error: "bbox and z required (bbox=W,S,E,N)" },
      { status: 400 }
    );
  }

  const parts = bbox.split(",").map((s) => Number(s.trim()));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
    return Response.json({ error: "invalid bbox" }, { status: 400 });
  }
  const [w, s, e, n] = parts as Bbox;
  if (w >= e || s >= n) {
    return Response.json({ error: "invalid bbox order" }, { status: 400 });
  }
  // Guard against huge envelopes that hammer the FeatureServer
  if (e - w > 40 || n - s > 30) {
    return emptyResponse(true);
  }

  const z = parseInt(zRaw, 10);
  if (!Number.isFinite(z) || z < 0 || z > 22) {
    return Response.json({ error: "invalid z" }, { status: 400 });
  }

  const spanDeg = Math.max(e - w, n - s);
  const layerId = layerForZoom(z, spanDeg);
  const result = await queryEnvelope(layerId, [w, s, e, n], 0);

  return Response.json(
    {
      type: "FeatureCollection",
      features: result.features,
      truncated: result.truncated,
      layer: layerId,
    },
    { headers: { "Cache-Control": CACHE_CONTROL } }
  );
}
