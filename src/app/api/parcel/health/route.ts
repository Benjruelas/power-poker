import { createRequire } from "node:module";

import {
  DEFAULT_LANDRECORDS_TMS_URL,
  landRecordsFetch,
  originParcelTileUrls,
} from "@/lib/landrecords/landRecordsAuth";
import { PARCEL_SOURCE_LAYERS } from "@/lib/landrecords/parcelTiles";
import { enforceIpRateLimit } from "@/lib/landrecords/rateLimit";

export const runtime = "nodejs";
export const maxDuration = 30;

const require = createRequire(import.meta.url);
const Pbf = require("pbf") as new (buf?: Uint8Array | Buffer) => unknown;
const { VectorTile } = require("@mapbox/vector-tile") as {
  VectorTile: new (pbf: unknown) => {
    layers: Record<
      string,
      | {
          length: number;
          feature: (i: number) => { properties: Record<string, unknown> };
        }
      | undefined
    >;
  };
};

const WMS_BASE = "https://api.landrecords.us/pro/wms";
const WFS_BASE = "https://api.landrecords.us/pro/wfs";

// Downtown Dallas, TX — dense parcel_us coverage, stable test target.
const TEST_LAT = 32.7767;
const TEST_LNG = -96.797;
const TEST_ZOOM = 16;
const CHECK_TIMEOUT_MS = 10_000;

type CheckResult = {
  ok: boolean;
  status: number | null;
  ms: number;
  featureCount?: number;
  hasOwnerName?: boolean;
  layers?: Record<string, number>;
  bytes?: number;
  error?: string;
};

function snippet(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, 300);
}

async function timed(
  run: () => Promise<CheckResult>
): Promise<CheckResult> {
  const started = Date.now();
  try {
    const result = await run();
    return { ...result, ms: Date.now() - started };
  } catch (err) {
    return {
      ok: false,
      status: null,
      ms: Date.now() - started,
      error: snippet(err instanceof Error ? err.message : String(err)),
    };
  }
}

async function geoJsonCheck(url: string, apiKey: string): Promise<CheckResult> {
  const res = await landRecordsFetch(url, {
    apiKey,
    signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
  });
  const body = await res.text();
  if (!res.ok) {
    return { ok: false, status: res.status, ms: 0, error: snippet(body) };
  }
  let data: { error?: unknown; features?: { properties?: Record<string, unknown> }[] };
  try {
    data = JSON.parse(body) as typeof data;
  } catch {
    return { ok: false, status: res.status, ms: 0, error: snippet(body) };
  }
  if (data?.error) {
    return { ok: false, status: res.status, ms: 0, error: snippet(String(data.error)) };
  }
  const features = Array.isArray(data?.features) ? data.features : [];
  return {
    ok: true,
    status: res.status,
    ms: 0,
    featureCount: features.length,
    hasOwnerName: features.some((f) =>
      Boolean(String(f?.properties?.ownername ?? "").trim())
    ),
  };
}

function checkRoot(apiKey: string): Promise<CheckResult> {
  return timed(async () => {
    const res = await landRecordsFetch("https://api.landrecords.us/", {
      apiKey,
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
    });
    const body = await res.text();
    return {
      ok: res.ok,
      status: res.status,
      ms: 0,
      ...(res.ok ? {} : { error: snippet(body) }),
    };
  });
}

function checkWms(apiKey: string): Promise<CheckResult> {
  return timed(() => {
    const d = 0.00015;
    const url = new URL(WMS_BASE);
    url.searchParams.set("service", "WMS");
    url.searchParams.set("version", "1.3.0");
    url.searchParams.set("request", "GetFeatureInfo");
    url.searchParams.set("layers", "pro:parcel_us");
    url.searchParams.set("query_layers", "pro:parcel_us");
    url.searchParams.set("crs", "EPSG:4326");
    url.searchParams.set(
      "bbox",
      `${TEST_LAT - d},${TEST_LNG - d},${TEST_LAT + d},${TEST_LNG + d}`
    );
    url.searchParams.set("width", "101");
    url.searchParams.set("height", "101");
    url.searchParams.set("i", "50");
    url.searchParams.set("j", "50");
    url.searchParams.set("info_format", "application/json");
    url.searchParams.set("feature_count", "5");
    return geoJsonCheck(url.toString(), apiKey);
  });
}

function checkWfs(apiKey: string): Promise<CheckResult> {
  return timed(() => {
    const d = 0.0015;
    const url = new URL(WFS_BASE);
    url.searchParams.set("service", "WFS");
    url.searchParams.set("version", "2.0.0");
    url.searchParams.set("request", "GetFeature");
    url.searchParams.set("typeNames", "pro:parcel_us");
    url.searchParams.set(
      "cql_filter",
      `BBOX(geom,${TEST_LNG - d},${TEST_LAT - d},${TEST_LNG + d},${TEST_LAT + d})`
    );
    url.searchParams.set("outputFormat", "application/json");
    url.searchParams.set("count", "5");
    return geoJsonCheck(url.toString(), apiKey);
  });
}

function lngLatToTile(lng: number, lat: number, z: number) {
  const latRad = (lat * Math.PI) / 180;
  const n = 2 ** z;
  const x = Math.floor(((lng + 180) / 360) * n);
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n
  );
  return { x, y };
}

function checkTile(apiKey: string): Promise<CheckResult> {
  return timed(async () => {
    const { x, y } = lngLatToTile(TEST_LNG, TEST_LAT, TEST_ZOOM);
    const urls = originParcelTileUrls(
      TEST_ZOOM,
      x,
      y,
      process.env.LANDRECORDS_TILE_URL || DEFAULT_LANDRECORDS_TMS_URL
    );

    let lastStatus: number | null = null;
    let lastError = "no tile URL succeeded";
    for (const url of urls) {
      const res = await landRecordsFetch(url, {
        apiKey,
        signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
      });
      lastStatus = res.status;
      const buf = Buffer.from(await res.arrayBuffer());
      if (!res.ok || !buf.length) {
        lastError = snippet(buf.toString("utf8")) || `upstream ${res.status}`;
        continue;
      }

      const tile = new VectorTile(new Pbf(buf));
      const layers: Record<string, number> = {};
      let featureCount = 0;
      let hasOwnerName = false;
      for (const layerName of PARCEL_SOURCE_LAYERS) {
        const layer = tile.layers[layerName];
        if (!layer) continue;
        layers[layerName] = layer.length;
        featureCount += layer.length;
        for (let i = 0; i < layer.length && !hasOwnerName; i++) {
          const props = layer.feature(i).properties;
          if (String(props.ownername ?? "").trim()) hasOwnerName = true;
        }
      }
      return {
        ok: true,
        status: res.status,
        ms: 0,
        bytes: buf.length,
        layers,
        featureCount,
        hasOwnerName,
      };
    }
    return { ok: false, status: lastStatus, ms: 0, error: lastError };
  });
}

function diagnose(checks: Record<string, CheckResult>): string {
  const statuses = Object.values(checks)
    .map((c) => c.status)
    .filter((s): s is number => s != null);

  if (statuses.some((s) => s === 401 || s === 403)) {
    return (
      "LandRecords rejected the configured API key (401/403). The key is " +
      "likely expired, revoked, or the subscription lapsed — this would make " +
      "parcel outlines, owner names, and parcel details all fail to load."
    );
  }
  if (statuses.some((s) => s === 402)) {
    return "LandRecords returned 402 Payment Required — the subscription needs renewal.";
  }
  if (statuses.some((s) => s === 429)) {
    return "LandRecords returned 429 — the account is rate-limited or over quota.";
  }
  if (statuses.some((s) => s >= 500)) {
    return "LandRecords is returning server errors (5xx) — upstream outage; retry later.";
  }
  const failed = Object.entries(checks).filter(([, c]) => !c.ok);
  if (failed.length) {
    return `Some LandRecords checks failed: ${failed
      .map(([name, c]) => `${name} (${c.status ?? c.error ?? "error"})`)
      .join(", ")}.`;
  }
  return "All LandRecords checks passed — upstream is healthy from this server.";
}

export async function GET(request: Request) {
  const limited = enforceIpRateLimit(request, "parcel-health", 30, 60);
  if (limited) return limited;

  const apiKey = process.env.LANDRECORDS_API_KEY;
  if (!apiKey) {
    return Response.json(
      {
        keyConfigured: false,
        summary:
          "LANDRECORDS_API_KEY is not set in this deployment — parcel tiles, " +
          "owner names, and parcel lookups cannot work without it.",
      },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  }

  const [root, wms, wfs, tile] = await Promise.all([
    checkRoot(apiKey),
    checkWms(apiKey),
    checkWfs(apiKey),
    checkTile(apiKey),
  ]);

  const checks = { root, wms, wfs, tile };
  return Response.json(
    {
      keyConfigured: true,
      testPoint: { lat: TEST_LAT, lng: TEST_LNG, zoom: TEST_ZOOM },
      checks,
      summary: diagnose(checks),
    },
    { status: 200, headers: { "Cache-Control": "no-store" } }
  );
}
