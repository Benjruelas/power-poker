import { enforceIpRateLimit } from "@/lib/landrecords/rateLimit";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Proxy Esri World Imagery / place labels so MapLibre can load them from our
 * origin. Direct browser requests to server.arcgisonline.com often fail CORS
 * (and occasional 502) on Vercel production.
 *
 * Esri tile path order is z/y/x (not z/x/y).
 */
const LAYERS = {
  imagery:
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile",
  labels:
    "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile",
} as const;

type LayerKey = keyof typeof LAYERS;

const TILE_CACHE_CONTROL =
  "public, max-age=86400, s-maxage=86400, stale-while-revalidate=3600";

const NO_STORE = "no-store";
const MAX_ATTEMPTS = 3;

/** 1×1 transparent PNG — soft-fail so MapLibre doesn't hard-error the source. */
const TRANSPARENT_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

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
    /fetch failed|ECONNRESET|socket|timeout|502|503/i.test(msg)
  );
}

function emptyTile(cacheable: boolean) {
  return new Response(TRANSPARENT_PNG, {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": cacheable
        ? "public, max-age=60, s-maxage=60"
        : NO_STORE,
    },
  });
}

async function fetchEsriTile(url: string): Promise<Response | null> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const upstream = await fetch(url, {
        headers: {
          Accept: "image/jpeg,image/png,image/*;q=0.8,*/*;q=0.5",
          "User-Agent":
            "PowerPoker/1.0 (+https://github.com/Benjruelas/power-poker)",
          Referer: "https://www.arcgis.com/",
        },
        signal: AbortSignal.timeout(12_000),
      });
      if (upstream.ok) return upstream;
      if (
        (upstream.status >= 500 || upstream.status === 429) &&
        attempt < MAX_ATTEMPTS
      ) {
        lastErr = new Error(`upstream ${upstream.status}`);
        await sleep(80 * attempt + Math.floor(Math.random() * 80));
        continue;
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
    }
  }
  console.warn(
    "Esri basemap tile fetch failed:",
    lastErr instanceof Error ? lastErr.message : lastErr
  );
  return null;
}

export async function GET(request: Request) {
  // Soft-limit: transparent tile (not JSON) so MapLibre keeps the raster source
  const limited = enforceIpRateLimit(request, "esri-tiles", 6000, 60);
  if (limited) return emptyTile(false);

  const { searchParams } = new URL(request.url);
  const z = searchParams.get("z");
  const x = searchParams.get("x");
  const y = searchParams.get("y");
  const layerParam = (searchParams.get("layer") || "imagery").toLowerCase();
  const layer: LayerKey =
    layerParam === "labels" ? "labels" : "imagery";

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

  // Esri: /tile/{z}/{y}/{x}
  const url = `${LAYERS[layer]}/${zi}/${yi}/${xi}`;
  const upstream = await fetchEsriTile(url);
  if (!upstream) return emptyTile(false);

  const contentType = upstream.headers.get("content-type") || "";
  const buf = Buffer.from(await upstream.arrayBuffer());
  if (buf.length === 0) return emptyTile(true);

  // Imagery is usually JPEG; labels PNG. Pass through when image/*; else soft-fail.
  if (!contentType.includes("image") && buf[0] !== 0xff && buf[0] !== 0x89) {
    return emptyTile(true);
  }

  return new Response(buf, {
    status: 200,
    headers: {
      "Content-Type": contentType.includes("image")
        ? contentType
        : layer === "labels"
          ? "image/png"
          : "image/jpeg",
      "Cache-Control": TILE_CACHE_CONTROL,
    },
  });
}
