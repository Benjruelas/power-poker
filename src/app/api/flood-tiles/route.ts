import { enforceIpRateLimit } from "@/lib/landrecords/rateLimit";

export const runtime = "nodejs";
export const maxDuration = 30;

/** FEMA NFHL MapServer — Flood Hazard Zones is layer 28. */
const FEMA_EXPORT =
  "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/export";

const TILE_CACHE_CONTROL =
  "public, max-age=86400, s-maxage=86400, stale-while-revalidate=3600";

/** Web Mercator tile → EPSG:3857 BBOX (minx,miny,maxx,maxy). */
function tileBBox3857(z: number, x: number, y: number): string {
  const origin = 20037508.342789244;
  const size = (origin * 2) / 2 ** z;
  const minX = -origin + x * size;
  const maxX = minX + size;
  const maxY = origin - y * size;
  const minY = maxY - size;
  return `${minX},${minY},${maxX},${maxY}`;
}

export async function GET(request: Request) {
  const limited = enforceIpRateLimit(request, "flood-tiles", 4000, 60);
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
  if (
    ![zi, xi, yi].every((n) => Number.isFinite(n) && n >= 0) ||
    zi > 22
  ) {
    return Response.json({ error: "invalid z, x, y" }, { status: 400 });
  }

  const url = new URL(FEMA_EXPORT);
  url.searchParams.set("bbox", tileBBox3857(zi, xi, yi));
  url.searchParams.set("bboxSR", "3857");
  url.searchParams.set("imageSR", "3857");
  url.searchParams.set("size", "256,256");
  url.searchParams.set("dpi", "96");
  url.searchParams.set("format", "png32");
  url.searchParams.set("transparent", "true");
  url.searchParams.set("layers", "show:28");
  url.searchParams.set("f", "image");

  let upstream: Response;
  try {
    upstream = await fetch(url.toString(), {
      headers: { Accept: "image/png" },
    });
  } catch (e) {
    console.error("FEMA flood tile fetch error:", e);
    return Response.json({ error: "upstream fetch failed" }, { status: 502 });
  }

  if (!upstream.ok) {
    return Response.json(
      { error: `upstream ${upstream.status}` },
      { status: upstream.status >= 500 ? 502 : upstream.status }
    );
  }

  const contentType = upstream.headers.get("content-type") || "";
  const buf = Buffer.from(await upstream.arrayBuffer());
  if (buf.length === 0 || !contentType.includes("image")) {
    return new Response(null, {
      status: 204,
      headers: { "Cache-Control": TILE_CACHE_CONTROL },
    });
  }

  return new Response(buf, {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": TILE_CACHE_CONTROL,
    },
  });
}
