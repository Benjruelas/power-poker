import { enforceIpRateLimit } from "@/lib/landrecords/rateLimit";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Esri Living Atlas — FCC Broadband Data Collection (Dec 2025 / latest).
 * Scale-dependent polygon layers with UniqueProvidersFiber / ServedBSLsFiber.
 */
const BDC_FEATURE_SERVER =
  "https://services8.arcgis.com/peDZJliSvYims39Q/arcgis/rest/services/FCC_Broadband_Data_Collection_December_2024_View/FeatureServer";

const CACHE_CONTROL =
  "public, max-age=300, s-maxage=600, stale-while-revalidate=3600";

const EMPTY_FC = {
  type: "FeatureCollection" as const,
  features: [] as GeoJSON.Feature[],
};

/** Layer ids: 0 States, 1 Counties, 2 Tracts, 3 Block Groups, 4 Blocks, 5 H3 Res 8 */
function layerForZoom(z: number): number {
  if (z < 7) return 1; // Counties (states too coarse for screening)
  if (z < 9) return 2; // Tracts
  if (z < 11) return 3; // Block Groups
  if (z < 13) return 5; // H3 Resolution 8
  return 4; // Blocks
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
  const [w, s, e, n] = parts;
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

  const layerId = layerForZoom(z);
  const maxPages = z >= 12 ? 3 : z >= 10 ? 4 : 5;
  const pageSize = 1000;
  const features: GeoJSON.Feature[] = [];

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
      resultOffset: String(page * pageSize),
      resultRecordCount: String(pageSize),
    });
    const url = `${BDC_FEATURE_SERVER}/${layerId}/query?${params.toString()}`;
    const pageData = await fetchBdcPage(url);
    if (!pageData) {
      return page === 0 ? emptyResponse(false) : Response.json(
        { type: "FeatureCollection", features },
        { headers: { "Cache-Control": CACHE_CONTROL } }
      );
    }
    const batch = pageData.features ?? [];
    for (const f of batch) {
      features.push({
        type: "Feature",
        geometry: f.geometry,
        properties: {
          geoid: (f.properties as Record<string, unknown> | null)?.GEOID ?? null,
          uniqueProvidersFiber:
            (f.properties as Record<string, unknown> | null)
              ?.UniqueProvidersFiber ?? 0,
          servedBslsFiber:
            (f.properties as Record<string, unknown> | null)?.ServedBSLsFiber ??
            0,
          totalBsls:
            (f.properties as Record<string, unknown> | null)?.TotalBSLs ?? 0,
        },
        id: String(
          (f.properties as Record<string, unknown> | null)?.GEOID ??
            f.id ??
            `${page}-${features.length}`
        ),
      });
    }
    const exceeded =
      (pageData as { exceededTransferLimit?: boolean }).exceededTransferLimit ||
      (
        pageData as { properties?: { exceededTransferLimit?: boolean } }
      ).properties?.exceededTransferLimit ||
      batch.length >= pageSize;
    if (!exceeded || batch.length === 0) break;
  }

  return Response.json(
    { type: "FeatureCollection", features },
    { headers: { "Cache-Control": CACHE_CONTROL } }
  );
}
