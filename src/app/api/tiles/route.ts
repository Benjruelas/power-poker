import { fillSparseParcelTile } from "@/lib/landrecords/composeParcelTile";
import { enforceIpRateLimit } from "@/lib/landrecords/rateLimit";

export const runtime = "nodejs";
export const maxDuration = 30;

const DEFAULT_TILE_URL =
  "https://api.landrecords.us/pro/gwc/service/tms/1.0.0/pro:parcel_us@EPSG:3857x2@pbf";

/** Cache successful parcel tiles (including synthesized gap-fills). */
const TILE_CACHE_CONTROL =
  "public, max-age=86400, s-maxage=86400, stale-while-revalidate=3600";

/** Empty / miss — short cache so sparse GWC seeding can recover. */
const EMPTY_CACHE_CONTROL = "public, max-age=120, s-maxage=120";

/** Transient upstream failure — do not cache; MapLibre will refetch. */
const NO_STORE = "no-store";

const MAX_ATTEMPTS = 3;

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

/** True protobuf/MVT payload — reject GWC HTML/JSON error bodies. */
function looksLikeMvt(buf: Buffer): boolean {
  if (buf.length === 0) return false;
  // HTML / JSON / plain-text error pages
  const b0 = buf[0];
  if (b0 === 0x3c /* < */ || b0 === 0x7b /* { */ || b0 === 0x5b /* [ */) {
    return false;
  }
  const head = buf.subarray(0, Math.min(64, buf.length)).toString("utf8");
  if (/^\s*</.test(head) || /gwc\s*error/i.test(head)) return false;
  return true;
}

function emptyTile(cacheable: boolean) {
  return new Response(null, {
    status: 204,
    headers: {
      "Cache-Control": cacheable ? EMPTY_CACHE_CONTROL : NO_STORE,
    },
  });
}

function mvtResponse(buf: Buffer) {
  return new Response(Uint8Array.from(buf), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.mapbox-vector-tile",
      "Cache-Control": TILE_CACHE_CONTROL,
    },
  });
}

async function fetchUpstreamTile(
  url: string,
  apiKey: string
): Promise<
  { kind: "mvt"; buf: Buffer } | { kind: "empty" } | { kind: "error"; detail: string }
> {
  let lastDetail = "upstream fetch failed";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const upstream = await fetch(url, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/vnd.mapbox-vector-tile,application/x-protobuf,*/*",
        },
        signal: AbortSignal.timeout(12_000),
      });

      if (upstream.status === 404 || upstream.status === 204) {
        return { kind: "empty" };
      }

      const buf = Buffer.from(await upstream.arrayBuffer());

      if (upstream.ok && buf.length === 0) {
        return { kind: "empty" };
      }

      if (upstream.ok && looksLikeMvt(buf)) {
        return { kind: "mvt", buf };
      }

      // GWC often returns 400 + HTML "Problem communicating with GeoServer"
      const transientHttp =
        upstream.status === 408 ||
        upstream.status === 425 ||
        upstream.status === 429 ||
        upstream.status >= 500 ||
        upstream.status === 400;

      lastDetail = `upstream ${upstream.status}${
        buf.length && !looksLikeMvt(buf) ? " (non-mvt body)" : ""
      }`;

      if (transientHttp && attempt < MAX_ATTEMPTS) {
        await sleep(80 * attempt + Math.floor(Math.random() * 80));
        continue;
      }

      // Soft-fail: never hand MapLibre HTML/JSON (breaks the vector source)
      return { kind: "error", detail: lastDetail };
    } catch (err) {
      lastDetail = err instanceof Error ? err.message : String(err);
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

  return { kind: "error", detail: lastDetail };
}

function tileUrl(tileBase: string, z: number, x: number, y: number) {
  // TMS y-flip: tms_y = 2^z - 1 - y (use ** — << breaks for z >= 31)
  const tmsY = 2 ** z - 1 - y;
  return `${tileBase}/${z}/${x}/${tmsY}.pbf`;
}

export async function GET(request: Request) {
  // Soft-limit: prefer empty tile over JSON 429 so MapLibre doesn't hard-fail tiles
  const limited = enforceIpRateLimit(request, "tiles", 4000, 60);
  if (limited) {
    return emptyTile(false);
  }

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
    zi > 30
  ) {
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

  const fetchExact = async (tz: number, tx: number, ty: number) => {
    const result = await fetchUpstreamTile(
      tileUrl(tileBase, tz, tx, ty),
      apiKey
    );
    if (result.kind === "mvt") return result.buf;
    return null;
  };

  const exact = await fetchUpstreamTile(tileUrl(tileBase, zi, xi, yi), apiKey);

  if (exact.kind === "mvt") {
    return mvtResponse(exact.buf);
  }

  if (exact.kind === "error") {
    console.warn(
      "LandRecords tile error:",
      exact.detail,
      tileUrl(tileBase, zi, xi, yi)
    );
    // Still attempt gap-fill — sparse seeding often 404s while neighbors exist
  }

  // Sparse GWC: synthesize missing zooms from children (Cedar Hill/Houston) or parent (DeSoto)
  try {
    const filled = await fillSparseParcelTile(zi, xi, yi, fetchExact);
    if (filled && looksLikeMvt(filled)) {
      return mvtResponse(filled);
    }
  } catch (err) {
    console.warn(
      "LandRecords tile gap-fill failed:",
      err instanceof Error ? err.message : String(err),
      `${zi}/${xi}/${yi}`
    );
  }

  if (exact.kind === "empty") {
    return emptyTile(true);
  }

  return emptyTile(false);
}
