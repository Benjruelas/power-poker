import { enforceIpRateLimit } from "@/lib/landrecords/rateLimit";

export const runtime = "nodejs";
export const maxDuration = 30;

const DEFAULT_TILE_URL =
  "https://api.landrecords.us/pro/gwc/service/tms/1.0.0/pro:parcel_us@EPSG:3857x2@pbf";

const TILE_CACHE_CONTROL =
  "public, max-age=86400, s-maxage=86400, stale-while-revalidate=3600";

export async function GET(request: Request) {
  const limited = enforceIpRateLimit(request, "tiles", 4000, 60);
  if (limited) return limited;

  const { searchParams } = new URL(request.url);
  const z = searchParams.get("z");
  const x = searchParams.get("x");
  const y = searchParams.get("y");
  if (z == null || x == null || y == null) {
    return Response.json({ error: "z, x, y required" }, { status: 400 });
  }

  const zi = parseInt(z, 10);
  const xi = parseInt(x, 10);
  const yi = parseInt(y, 10);
  if (![zi, xi, yi].every((n) => Number.isFinite(n) && n >= 0)) {
    return Response.json({ error: "invalid z, x, y" }, { status: 400 });
  }

  const apiKey = process.env.LANDRECORDS_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "LandRecords API not configured" },
      { status: 500 }
    );
  }

  const tileBase = process.env.LANDRECORDS_TILE_URL || DEFAULT_TILE_URL;
  // TMS y-flip: tms_y = 2^z - 1 - y
  const tmsY = (1 << zi) - 1 - yi;
  const url = `${tileBase}/${zi}/${xi}/${tmsY}.pbf`;

  let upstream: Response;
  try {
    upstream = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
  } catch (e) {
    console.error("LandRecords tile fetch error:", e);
    return Response.json({ error: "upstream fetch failed" }, { status: 502 });
  }

  if (upstream.status === 404 || upstream.status === 204) {
    return new Response(null, {
      status: 204,
      headers: { "Cache-Control": TILE_CACHE_CONTROL },
    });
  }

  if (!upstream.ok) {
    return Response.json(
      { error: `upstream ${upstream.status}` },
      { status: upstream.status }
    );
  }

  const buf = Buffer.from(await upstream.arrayBuffer());
  if (buf.length === 0) {
    return new Response(null, {
      status: 204,
      headers: { "Cache-Control": TILE_CACHE_CONTROL },
    });
  }

  return new Response(buf, {
    status: 200,
    headers: {
      "Content-Type": "application/x-protobuf",
      "Cache-Control": TILE_CACHE_CONTROL,
    },
  });
}
