import { enforceIpRateLimit } from "@/lib/landrecords/rateLimit";

export const runtime = "nodejs";
export const maxDuration = 30;

const WMS_BASE = "https://api.landrecords.us/pro/wms";
const WFS_BASE = "https://api.landrecords.us/pro/wfs";
const BBOX_DELTA = 0.00015;

function authHeaders(apiKey: string) {
  return { Authorization: `Bearer ${apiKey}` };
}

async function fetchWmsByPoint(
  lat: number,
  lng: number,
  apiKey: string
): Promise<Record<string, unknown> | null> {
  const minLat = lat - BBOX_DELTA;
  const maxLat = lat + BBOX_DELTA;
  const minLon = lng - BBOX_DELTA;
  const maxLon = lng + BBOX_DELTA;
  const url = new URL(WMS_BASE);
  url.searchParams.set("service", "WMS");
  url.searchParams.set("version", "1.3.0");
  url.searchParams.set("request", "GetFeatureInfo");
  url.searchParams.set("layers", "pro:parcel_us");
  url.searchParams.set("query_layers", "pro:parcel_us");
  url.searchParams.set("crs", "EPSG:4326");
  url.searchParams.set("bbox", `${minLat},${minLon},${maxLat},${maxLon}`);
  url.searchParams.set("width", "101");
  url.searchParams.set("height", "101");
  url.searchParams.set("i", "50");
  url.searchParams.set("j", "50");
  url.searchParams.set("info_format", "application/json");
  url.searchParams.set("feature_count", "1");

  const res = await fetch(url.toString(), { headers: authHeaders(apiKey) });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    features?: { properties?: Record<string, unknown> }[];
  };
  return data?.features?.[0]?.properties ?? null;
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

  const res = await fetch(url.toString(), { headers: authHeaders(apiKey) });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    error?: unknown;
    features?: { properties?: Record<string, unknown> }[];
  };
  if (data?.error) return null;
  return data?.features?.[0]?.properties ?? null;
}

export async function GET(request: Request) {
  const limited = enforceIpRateLimit(request, "parcel", 2000, 60);
  if (limited) return limited;

  const { searchParams } = new URL(request.url);
  const lat = parseFloat(searchParams.get("lat") ?? "");
  const lng = parseFloat(searchParams.get("lng") ?? "");
  const lrid = (searchParams.get("lrid") ?? "").trim();

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

    if (lrid && /^[\w-]+$/.test(lrid)) {
      properties = await fetchWfsByLrid(lrid, apiKey);
      if (properties) source = "wfs";
    }

    if (!properties) {
      properties = await fetchWmsByPoint(lat, lng, apiKey);
      source = "wms";
    }

    if (!properties) {
      return Response.json({ error: "parcel not found" }, { status: 404 });
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
