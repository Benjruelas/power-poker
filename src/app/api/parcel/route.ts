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

async function parseFeatures(res: Response): Promise<GeoJsonFeature[]> {
  if (!res.ok) return [];
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
  apiKey: string
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
    await landRecordsFetch(url4326.toString(), { apiKey })
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
    await landRecordsFetch(url84.toString(), { apiKey })
  );
}

async function fetchWfsByLrid(
  lrid: string,
  apiKey: string
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
    await landRecordsFetch(url.toString(), { apiKey })
  );
  return features[0]?.properties ?? null;
}

/** WFS centroid window — works where geometry queries / WMS miss. */
async function fetchWfsByCentroid(
  lat: number,
  lng: number,
  apiKey: string,
  lrid?: string
): Promise<Record<string, unknown> | null> {
  const d = CENTROID_DELTA;
  const url = new URL(WFS_BASE);
  url.searchParams.set("service", "WFS");
  url.searchParams.set("version", "2.0.0");
  url.searchParams.set("request", "GetFeature");
  url.searchParams.set("typeNames", "pro:parcel_us");
  url.searchParams.set(
    "cql_filter",
    `centroidx BETWEEN ${lng - d} AND ${lng + d} AND centroidy BETWEEN ${lat - d} AND ${lat + d}`
  );
  url.searchParams.set("outputFormat", "application/json");
  url.searchParams.set("count", "8");

  const features = await parseFeatures(
    await landRecordsFetch(url.toString(), { apiKey })
  );
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

    if (safeLrid) {
      properties = await fetchWfsByLrid(safeLrid, apiKey);
      if (properties) source = "wfs";
    }

    if (!properties) {
      const wmsFeature = pickParcelFeature(
        await fetchWmsFeaturesByPoint(lat, lng, apiKey),
        safeLrid || null
      );
      properties = wmsFeature?.properties || null;
      if (properties) source = "wms";
    }

    if (properties && !propertiesMatchRequestedLrid(properties, safeLrid || null)) {
      properties = null;
    }

    if (!properties) {
      properties = await fetchWfsByCentroid(
        lat,
        lng,
        apiKey,
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

    if (!properties) {
      // Expected when WFS/WMS lag vector tiles — 200 keeps the browser console quiet.
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
