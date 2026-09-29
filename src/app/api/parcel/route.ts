import { fetchParcelPropertiesFromTile } from "@/lib/landrecords/fetchParcelFromTile";
import { landRecordsFetch } from "@/lib/landrecords/landRecordsAuth";
import {
  pickParcelFeature,
  propertiesMatchRequestedLrid,
} from "@/lib/landrecords/parcelLookup";
import { enforceIpRateLimit } from "@/lib/landrecords/rateLimit";

export const runtime = "nodejs";
export const maxDuration = 30;

const WMS_BASE = "https://api.landrecords.us/pro/wms";
const WFS_BASE = "https://api.landrecords.us/pro/wfs";
const BBOX_DELTA = 0.00015;
const CENTROID_DELTA = 0.0015;

type GeoJsonFeature = {
  properties?: Record<string, unknown>;
  geometry?: {
    type: string;
    coordinates: unknown;
  };
};

async function parseFeatures(
  res: Response,
  upstreamStatuses?: number[]
): Promise<GeoJsonFeature[]> {
  if (!res.ok) {
    upstreamStatuses?.push(res.status);
    return [];
  }
  let data: {
    error?: unknown;
    features?: GeoJsonFeature[];
  };
  try {
    data = (await res.json()) as typeof data;
  } catch {
    return [];
  }
  if (data?.error) return [];
  return Array.isArray(data?.features) ? data.features : [];
}

async function fetchWmsFeaturesByPoint(
  lat: number,
  lng: number,
  apiKey: string,
  upstreamStatuses?: number[]
): Promise<GeoJsonFeature[]> {
  const minLat = lat - BBOX_DELTA;
  const maxLat = lat + BBOX_DELTA;
  const minLon = lng - BBOX_DELTA;
  const maxLon = lng + BBOX_DELTA;

  // WMS 1.3.0 + EPSG:4326 uses lat,lon axis order
  const url4326 = new URL(WMS_BASE);
  url4326.searchParams.set("service", "WMS");
  url4326.searchParams.set("version", "1.3.0");
  url4326.searchParams.set("request", "GetFeatureInfo");
  url4326.searchParams.set("layers", "pro:parcel_us");
  url4326.searchParams.set("query_layers", "pro:parcel_us");
  url4326.searchParams.set("crs", "EPSG:4326");
  url4326.searchParams.set("bbox", `${minLat},${minLon},${maxLat},${maxLon}`);
  url4326.searchParams.set("width", "101");
  url4326.searchParams.set("height", "101");
  url4326.searchParams.set("i", "50");
  url4326.searchParams.set("j", "50");
  url4326.searchParams.set("info_format", "application/json");
  // Overlapping school/city polygons are common; callers pick by lrid or smallest area.
  url4326.searchParams.set("feature_count", "10");

  const feats4326 = await parseFeatures(
    await landRecordsFetch(url4326.toString(), { apiKey }),
    upstreamStatuses
  );
  if (feats4326.length) return feats4326;

  // CRS:84 is lon,lat — some GeoServer setups only answer this reliably
  const url84 = new URL(WMS_BASE);
  url84.searchParams.set("service", "WMS");
  url84.searchParams.set("version", "1.3.0");
  url84.searchParams.set("request", "GetFeatureInfo");
  url84.searchParams.set("layers", "pro:parcel_us");
  url84.searchParams.set("query_layers", "pro:parcel_us");
  url84.searchParams.set("crs", "CRS:84");
  url84.searchParams.set("bbox", `${minLon},${minLat},${maxLon},${maxLat}`);
  url84.searchParams.set("width", "101");
  url84.searchParams.set("height", "101");
  url84.searchParams.set("i", "50");
  url84.searchParams.set("j", "50");
  url84.searchParams.set("info_format", "application/json");
  url84.searchParams.set("feature_count", "10");

  return parseFeatures(
    await landRecordsFetch(url84.toString(), { apiKey }),
    upstreamStatuses
  );
}

async function fetchWfsByLrid(
  lrid: string,
  apiKey: string,
  upstreamStatuses?: number[]
): Promise<Record<string, unknown> | null> {
  const url = new URL(WFS_BASE);
  url.searchParams.set("service", "WFS");
  url.searchParams.set("version", "2.0.0");
  url.searchParams.set("request", "GetFeature");
  url.searchParams.set("typeNames", "pro:parcel_us");
  url.searchParams.set("cql_filter", `lrid='${lrid.replace(/'/g, "''")}'`);
  url.searchParams.set("outputFormat", "application/json");
  url.searchParams.set("count", "1");

  const features = await parseFeatures(
    await landRecordsFetch(url.toString(), { apiKey }),
    upstreamStatuses
  );
  return features[0]?.properties ?? null;
}

/**
 * WFS bbox window around the click — works where WMS misses.
 * LandRecords now requires an indexed property or a spatial predicate
 * (BBOX/INTERSECTS/DWITHIN); `centroidx/centroidy BETWEEN` is rejected.
 */
async function fetchWfsWindowFeatures(
  lat: number,
  lng: number,
  apiKey: string,
  upstreamStatuses?: number[]
): Promise<GeoJsonFeature[]> {
  const d = CENTROID_DELTA;
  const url = new URL(WFS_BASE);
  url.searchParams.set("service", "WFS");
  url.searchParams.set("version", "2.0.0");
  url.searchParams.set("request", "GetFeature");
  url.searchParams.set("typeNames", "pro:parcel_us");
  url.searchParams.set(
    "cql_filter",
    `BBOX(geom,${lng - d},${lat - d},${lng + d},${lat + d})`
  );
  url.searchParams.set("outputFormat", "application/json");
  url.searchParams.set("count", "8");

  return parseFeatures(
    await landRecordsFetch(url.toString(), { apiKey }),
    upstreamStatuses
  );
}

/** Parcels whose polygon contains the point — exact even in dense downtowns. */
async function fetchWfsByPointIntersects(
  lat: number,
  lng: number,
  apiKey: string,
  upstreamStatuses?: number[]
): Promise<GeoJsonFeature[]> {
  const url = new URL(WFS_BASE);
  url.searchParams.set("service", "WFS");
  url.searchParams.set("version", "2.0.0");
  url.searchParams.set("request", "GetFeature");
  url.searchParams.set("typeNames", "pro:parcel_us");
  url.searchParams.set("cql_filter", `INTERSECTS(geom, POINT(${lng} ${lat}))`);
  url.searchParams.set("outputFormat", "application/json");
  url.searchParams.set("count", "5");

  return parseFeatures(
    await landRecordsFetch(url.toString(), { apiKey }),
    upstreamStatuses
  );
}

function pickFromWindow(
  features: GeoJsonFeature[],
  lat: number,
  lng: number,
  lrid?: string
): Record<string, unknown> | null {
  if (!features.length) return null;

  if (lrid) {
    const matched = pickParcelFeature(features, lrid);
    return matched?.properties ?? null;
  }

  let best: Record<string, unknown> | null = null;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const f of features) {
    const p = f.properties;
    if (!p) continue;
    const cx = Number(p.centroidx ?? p.surfpointx);
    const cy = Number(p.centroidy ?? p.surfpointy);
    if (!Number.isFinite(cx) || !Number.isFinite(cy)) continue;
    const dist = (cx - lng) ** 2 + (cy - lat) ** 2;
    if (dist < bestDist) {
      bestDist = dist;
      best = p;
    }
  }
  if (best) return best;
  const smallest = pickParcelFeature(features, null);
  return smallest?.properties ?? null;
}

function hasOwnerName(props: Record<string, unknown> | null): boolean {
  return Boolean(String(props?.ownername ?? "").trim());
}

/** Even-odd ray casting over Polygon / MultiPolygon rings (handles holes). */
function pointInGeometry(
  geometry: GeoJsonFeature["geometry"],
  lng: number,
  lat: number
): boolean {
  if (!geometry) return false;
  const polys =
    geometry.type === "Polygon"
      ? [geometry.coordinates as number[][][]]
      : geometry.type === "MultiPolygon"
        ? (geometry.coordinates as number[][][][])
        : [];
  for (const rings of polys) {
    let inside = false;
    for (const ring of rings || []) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i]!;
        const [xj, yj] = ring[j]!;
        if (
          yi! > lat !== yj! > lat &&
          lng < ((xj! - xi!) * (lat - yi!)) / (yj! - yi!) + xi!
        ) {
          inside = !inside;
        }
      }
    }
    if (inside) return true;
  }
  return false;
}

function geometryBboxArea(geometry: GeoJsonFeature["geometry"]): number {
  if (!geometry?.coordinates) return Infinity;
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  const scan = (coords: unknown): void => {
    if (!Array.isArray(coords)) return;
    if (typeof coords[0] === "number" && typeof coords[1] === "number") {
      minX = Math.min(minX, coords[0]);
      maxX = Math.max(maxX, coords[0]);
      minY = Math.min(minY, coords[1] as number);
      maxY = Math.max(maxY, coords[1] as number);
      return;
    }
    for (const c of coords) scan(c);
  };
  scan(geometry.coordinates);
  if (minX === Infinity) return Infinity;
  return (maxX - minX) * (maxY - minY);
}

/**
 * Tile lrids can be a different data vintage than WFS/WMS in some counties
 * (e.g. Parker County TX): every lrid-constrained lookup misses even though
 * the parcel exists upstream with full owner data. Pick the smallest feature
 * whose polygon contains the clicked point — geometric containment gives the
 * same wrong-polygon protection the lrid check was for.
 */
function pickPointContainingOwner(
  features: GeoJsonFeature[],
  lat: number,
  lng: number
): Record<string, unknown> | null {
  const containing = features.filter(
    (f) => f.properties && pointInGeometry(f.geometry, lng, lat)
  );
  if (!containing.length) return null;
  const owned = containing.filter((f) => hasOwnerName(f.properties ?? null));
  const pool = owned.length ? owned : containing;
  pool.sort(
    (a, b) => geometryBboxArea(a.geometry) - geometryBboxArea(b.geometry)
  );
  return pool[0]?.properties ?? null;
}

export async function GET(request: Request) {
  const limited = enforceIpRateLimit(request, "parcel", 2000, 60);
  if (limited) return limited;

  const { searchParams } = new URL(request.url);
  const lat = parseFloat(searchParams.get("lat") ?? "");
  const lng = parseFloat(searchParams.get("lng") ?? "");
  const lrid = (searchParams.get("lrid") ?? "").trim();
  const safeLrid = lrid && /^[\w-]+$/.test(lrid) ? lrid : "";

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return Response.json(
      { error: "lat and lng are required" },
      { status: 400 }
    );
  }

  const apiKey = process.env.LANDRECORDS_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "LandRecords API not configured" },
      { status: 500 }
    );
  }

  try {
    let properties: Record<string, unknown> | null = null;
    let source = "wms";
    const upstreamStatuses: number[] = [];
    let wmsFeatures: GeoJsonFeature[] | null = null;
    let windowFeatures: GeoJsonFeature[] | null = null;

    if (safeLrid) {
      properties = await fetchWfsByLrid(safeLrid, apiKey, upstreamStatuses);
      if (properties) source = "wfs";
    }

    if (!properties) {
      wmsFeatures = await fetchWmsFeaturesByPoint(
        lat,
        lng,
        apiKey,
        upstreamStatuses
      );
      const wmsFeature = pickParcelFeature(wmsFeatures, safeLrid || null);
      properties = wmsFeature?.properties || null;
      if (properties) source = "wms";
    }

    if (properties && !propertiesMatchRequestedLrid(properties, safeLrid || null)) {
      properties = null;
    }

    if (!properties) {
      windowFeatures = await fetchWfsWindowFeatures(
        lat,
        lng,
        apiKey,
        upstreamStatuses
      );
      properties = pickFromWindow(
        windowFeatures,
        lat,
        lng,
        safeLrid || undefined
      );
      if (properties) source = "wfs-centroid";
    }

    if (properties && !propertiesMatchRequestedLrid(properties, safeLrid || null)) {
      properties = null;
    }

    // TX (and some other states) are present in vector tiles but absent from WFS
    if (!properties) {
      properties = await fetchParcelPropertiesFromTile(
        lat,
        lng,
        apiKey,
        safeLrid || undefined
      );
      if (properties) source = "mvt";
    }

    if (properties && !propertiesMatchRequestedLrid(properties, safeLrid || null)) {
      properties = null;
    }

    // Counties where tile lrids don't exist in WFS/WMS (data-vintage mismatch,
    // e.g. Parker County TX) end up here with no properties or owner-less
    // sparse ones. Re-select by geometric containment and keep the requested
    // lrid so the client's lrid check and tile highlight still work.
    if (!hasOwnerName(properties)) {
      if (!wmsFeatures) {
        wmsFeatures = await fetchWmsFeaturesByPoint(
          lat,
          lng,
          apiKey,
          upstreamStatuses
        );
      }
      const intersecting = await fetchWfsByPointIntersects(
        lat,
        lng,
        apiKey,
        upstreamStatuses
      );
      const contained = pickPointContainingOwner(
        [...wmsFeatures, ...intersecting, ...(windowFeatures ?? [])],
        lat,
        lng
      );
      if (contained && hasOwnerName(contained)) {
        const rebased: Record<string, unknown> = { ...contained };
        if (safeLrid && !propertiesMatchRequestedLrid(rebased, safeLrid)) {
          rebased.lrid_upstream = rebased.lrid;
          rebased.lrid = safeLrid;
        }
        // Keep non-empty fields from the earlier (same-vintage) hit
        if (properties) {
          for (const [k, v] of Object.entries(properties)) {
            if (v == null || String(v).trim() === "") continue;
            const cur = rebased[k];
            if (cur == null || String(cur).trim() === "") rebased[k] = v;
          }
        }
        properties = rebased;
        source = "point-match";
      }
    }

    if (!properties) {
      // A key/quota rejection must not masquerade as "no parcel here" —
      // that is how a provider outage silently blanks owner names app-wide.
      const rejectedStatus = upstreamStatuses.find(
        (s) => s === 401 || s === 402 || s === 403 || s === 429
      );
      if (rejectedStatus) {
        console.error(
          "parcel lookup rejected upstream:",
          upstreamStatuses.join(",")
        );
        return Response.json(
          {
            error: "parcel provider rejected the request",
            upstreamStatus: rejectedStatus,
            hint: "Check /api/parcel/health for LandRecords key/quota diagnostics",
          },
          { status: 502, headers: { "Cache-Control": "no-store" } }
        );
      }

      // Expected when WFS/WMS lag vector tiles — keeps the browser console quiet.
      return Response.json(
        { error: "parcel not found" },
        {
          status: 404,
          headers: { "Cache-Control": "private, max-age=60" },
        }
      );
    }

    return Response.json(
      { properties, source },
      {
        status: 200,
        headers: { "Cache-Control": "private, max-age=300" },
      }
    );
  } catch (e) {
    console.error("parcel lookup error:", e);
    return Response.json({ error: "parcel lookup failed" }, { status: 502 });
  }
}
