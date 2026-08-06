import { enforceIpRateLimit } from "@/lib/landrecords/rateLimit";

export const runtime = "nodejs";
export const maxDuration = 30;

/** FEMA NFHL MapServer — Flood Hazard Zones is layer 28. */
const FEMA_EXPORT =
  "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/export";

const TILE_CACHE_CONTROL =
  "public, max-age=86400, s-maxage=86400, stale-while-revalidate=3600";

/** 1×1 transparent PNG — avoids MapLibre AJAXError spam when FEMA resets. */
const TRANSPARENT_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

const MAX_ATTEMPTS = 3;

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

async function fetchFemaTile(url: string): Promise<Response | null> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const upstream = await fetch(url, {
        headers: {
          Accept: "image/png",
          "User-Agent": "Power-Poker/1.0 (flood overlay; research)",
        },
        // Avoid hanging forever on a half-open FEMA socket
        signal: AbortSignal.timeout(12_000),
      });
      if (upstream.ok) return upstream;
      // Retry 5xx / 429; don't retry 4xx
      if (upstream.status >= 500 || upstream.status === 429) {
        lastErr = new Error(`upstream ${upstream.status}`);
        if (attempt < MAX_ATTEMPTS) {
          await sleep(80 * attempt + Math.floor(Math.random() * 80));
          continue;
        }
        return null;
      }
      return null;
    } catch (err) {
      lastErr = err;
      if (attempt < MAX_ATTEMPTS && isTransient(err)) {
        await sleep(100 * attempt + Math.floor(Math.random() * 120));
        continue;
      }
      if (attempt < MAX_ATTEMPTS) {
        await sleep(100 * attempt);
        continue;
      }
      break;
    }
  }
  console.warn(
    "FEMA flood tile fetch failed after retries:",
    lastErr instanceof Error ? lastErr.message : lastErr
  );
  return null;
}

function emptyTile(cacheable: boolean) {
  return new Response(TRANSPARENT_PNG, {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      // Don't cache misses long — MapLibre will refetch on next view
      "Cache-Control": cacheable
        ? TILE_CACHE_CONTROL
        : "public, max-age=30, s-maxage=30",
    },
  });
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

  const upstream = await fetchFemaTile(url.toString());
  if (!upstream) return emptyTile(false);

  const contentType = upstream.headers.get("content-type") || "";
  const buf = Buffer.from(await upstream.arrayBuffer());
  if (buf.length === 0 || !contentType.includes("image")) {
    return emptyTile(true);
  }

  return new Response(buf, {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": TILE_CACHE_CONTROL,
    },
  });
}
