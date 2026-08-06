import type { GeocodeSuggestion } from "@/lib/geocode";

const WFS_BASE = "https://api.landrecords.us/pro/wfs";
const PROPERTY_NAME = [
  "lrid",
  "parcelid",
  "parcelid2",
  "ogparcelid",
  "ogparcelid2",
  "taxacctnum",
  "ownername",
  "parceladdr",
  "parcelcity",
  "parcelstate",
  "countyname",
  "centroidx",
  "centroidy",
].join(",");

type WfsFeature = {
  id?: string;
  properties?: Record<string, unknown>;
  geometry?: { type?: string; coordinates?: unknown };
};

function escapeCql(value: string): string {
  return value.replace(/'/g, "''");
}

function authHeaders(apiKey: string) {
  return {
    Authorization: `Bearer ${apiKey}`,
    Accept: "application/json",
  };
}

function str(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

function num(v: unknown): number | null {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : null;
}

/** Parcel / APN / LRID-shaped token (not a street address). */
export function looksLikeParcelId(raw: string): boolean {
  const q = raw.trim();
  if (q.length < 3 || q.length > 64) return false;
  if (
    /\b(st|street|ave|avenue|rd|road|dr|drive|ln|lane|blvd|boulevard|way|ct|court|hwy|highway|pkwy|parkway)\b/i.test(
      q
    )
  ) {
    return false;
  }
  if (/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(q)) return true;
  // Digits / alphanumerics with common APN separators; allow internal spaces
  const compact = q.replace(/\s+/g, "");
  if (!/^[A-Za-z0-9][A-Za-z0-9.\-\/]*$/.test(compact)) return false;
  // Pure letter tokens are treated as owner names, not parcel IDs
  if (/^[A-Za-z]+$/.test(compact)) return false;
  return /[\d]/.test(compact) || compact.includes("-") || compact.includes("/");
}

/** Owner-name shaped query (letters; not a clear street address). */
export function looksLikeOwnerQuery(raw: string): boolean {
  const q = raw.trim();
  if (q.length < 3 || q.length > 80) return false;
  if (!/[A-Za-z]{2,}/.test(q)) return false;
  if (
    /\b(st|street|ave|avenue|rd|road|dr|drive|ln|lane|blvd|boulevard|way|ct|court|hwy|highway)\b/i.test(
      q
    )
  ) {
    return false;
  }
  // Leading house number → address
  if (/^\d+\s+[A-Za-z]/.test(q)) return false;
  return true;
}

function featureToSuggestion(
  f: WfsFeature,
  kind: "owner" | "parcel",
  index: number,
  matchedQuery?: string
): GeocodeSuggestion | null {
  const p = f.properties ?? {};
  const lng = num(p.centroidx);
  const lat = num(p.centroidy);
  if (lng == null || lat == null) return null;

  const owner = str(p.ownername);
  const idCandidates = [
    str(p.parcelid),
    str(p.parcelid2),
    str(p.ogparcelid),
    str(p.ogparcelid2),
    str(p.taxacctnum),
    str(p.lrid),
  ].filter(Boolean);
  const qNorm = matchedQuery?.trim().toLowerCase() ?? "";
  const matchedId =
    qNorm &&
    idCandidates.find(
      (id) =>
        id.toLowerCase() === qNorm ||
        id.replace(/\s+/g, "").toLowerCase() === qNorm.replace(/\s+/g, "")
    );
  const parcelId = matchedId || idCandidates[0] || "";
  const addr = [str(p.parceladdr), str(p.parcelcity), str(p.parcelstate)]
    .filter(Boolean)
    .join(", ");
  const county = str(p.countyname);
  const lrid = str(p.lrid) || undefined;

  let label: string;
  let subtitle: string | undefined;

  if (kind === "owner") {
    label = owner || parcelId || "Parcel";
    subtitle = [addr || county, parcelId ? `APN ${parcelId}` : null]
      .filter(Boolean)
      .join(" · ");
  } else {
    label = parcelId ? `Parcel ${parcelId}` : owner || "Parcel";
    subtitle = [owner, addr || county].filter(Boolean).join(" · ");
  }

  return {
    id: lrid ? `lr-${lrid}` : `lr-${kind}-${index}-${lng}-${lat}`,
    label,
    subtitle: subtitle || undefined,
    lng,
    lat,
    kind,
    lrid,
  };
}

async function wfsGetFeatures(
  cqlFilter: string,
  apiKey: string,
  count: number,
  signal?: AbortSignal
): Promise<WfsFeature[]> {
  const url = new URL(WFS_BASE);
  url.searchParams.set("service", "WFS");
  url.searchParams.set("version", "2.0.0");
  url.searchParams.set("request", "GetFeature");
  url.searchParams.set("typeNames", "pro:parcel_us");
  url.searchParams.set("outputFormat", "application/json");
  url.searchParams.set("count", String(count));
  url.searchParams.set("propertyName", PROPERTY_NAME);
  url.searchParams.set("cql_filter", cqlFilter);

  const res = await fetch(url.toString(), {
    headers: authHeaders(apiKey),
    signal,
  });
  if (!res.ok) return [];
  const data = (await res.json()) as {
    error?: unknown;
    features?: WfsFeature[];
  };
  if (data?.error) return [];
  return data.features ?? [];
}

async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  fallback: T
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function dedupeSuggestions(
  items: GeocodeSuggestion[]
): GeocodeSuggestion[] {
  const seen = new Set<string>();
  const out: GeocodeSuggestion[] = [];
  for (const s of items) {
    const key = s.lrid || s.id || `${s.lng},${s.lat},${s.label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

function proximityFilter(
  proximity: [number, number],
  deltaDeg: number
): string {
  const [lng, lat] = proximity;
  const minX = lng - deltaDeg;
  const maxX = lng + deltaDeg;
  const minY = lat - deltaDeg;
  const maxY = lat + deltaDeg;
  return `centroidx BETWEEN ${minX} AND ${maxX} AND centroidy BETWEEN ${minY} AND ${maxY}`;
}

const LRID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function searchExactParcelIds(
  q: string,
  apiKey: string,
  signal?: AbortSignal
): Promise<GeocodeSuggestion[]> {
  const trimmed = q.trim();
  const id = escapeCql(trimmed);
  const compact = escapeCql(trimmed.replace(/\s+/g, ""));
  // lrid is a UUID column — non-UUID values make the whole OR filter 400
  if (LRID_RE.test(trimmed)) {
    const feats = await wfsGetFeatures(`lrid='${id}'`, apiKey, 6, signal);
    return feats
      .map((f, i) => featureToSuggestion(f, "parcel", i, trimmed))
      .filter((s): s is GeocodeSuggestion => s != null);
  }

  const parts = [
    `parcelid='${id}'`,
    `parcelid2='${id}'`,
    `ogparcelid='${id}'`,
    `ogparcelid2='${id}'`,
    `taxacctnum='${id}'`,
  ];
  if (compact !== id) {
    parts.push(
      `parcelid='${compact}'`,
      `parcelid2='${compact}'`,
      `ogparcelid='${compact}'`,
      `ogparcelid2='${compact}'`,
      `taxacctnum='${compact}'`
    );
  }
  const feats = await wfsGetFeatures(`(${parts.join(" OR ")})`, apiKey, 6, signal);
  return feats
    .map((f, i) => featureToSuggestion(f, "parcel", i, trimmed))
    .filter((s): s is GeocodeSuggestion => s != null);
}

async function searchOwnerPrefix(
  q: string,
  apiKey: string,
  signal?: AbortSignal
): Promise<GeocodeSuggestion[]> {
  const needle = escapeCql(q.trim().toLowerCase());
  const feats = await wfsGetFeatures(
    `strToLowerCase(ownername) LIKE '${needle}%'`,
    apiKey,
    6,
    signal
  );
  return feats
    .map((f, i) => featureToSuggestion(f, "owner", i))
    .filter((s): s is GeocodeSuggestion => s != null);
}

async function searchOwnerNear(
  q: string,
  proximity: [number, number],
  apiKey: string,
  signal?: AbortSignal
): Promise<GeocodeSuggestion[]> {
  const needle = escapeCql(q.trim().toLowerCase());
  // ~0.2° ≈ 12–14 mi — keeps contains search under LandRecords timeouts
  const spatial = proximityFilter(proximity, 0.2);
  const feats = await wfsGetFeatures(
    `${spatial} AND strToLowerCase(ownername) LIKE '%${needle}%'`,
    apiKey,
    6,
    signal
  );
  return feats
    .map((f, i) => featureToSuggestion(f, "owner", i))
    .filter((s): s is GeocodeSuggestion => s != null);
}

async function searchParcelIdNear(
  q: string,
  proximity: [number, number],
  apiKey: string,
  signal?: AbortSignal
): Promise<GeocodeSuggestion[]> {
  const id = escapeCql(q.trim());
  const compact = escapeCql(q.trim().replace(/\s+/g, ""));
  const spatial = proximityFilter(proximity, 0.35);
  const idClause = [
    `parcelid LIKE '${id}%'`,
    `parcelid2 LIKE '${id}%'`,
    `ogparcelid LIKE '${id}%'`,
    `ogparcelid2 LIKE '${id}%'`,
    `taxacctnum LIKE '${id}%'`,
  ];
  if (compact !== id) {
    idClause.push(
      `parcelid LIKE '${compact}%'`,
      `parcelid2 LIKE '${compact}%'`,
      `taxacctnum LIKE '${compact}%'`
    );
  }
  const feats = await wfsGetFeatures(
    `${spatial} AND (${idClause.join(" OR ")})`,
    apiKey,
    6,
    signal
  );
  return feats
    .map((f, i) => featureToSuggestion(f, "parcel", i, q.trim()))
    .filter((s): s is GeocodeSuggestion => s != null);
}

/**
 * Search LandRecords parcels by owner name and/or parcel / APN / LRID.
 * Uses prefix owner match nationwide; contains + partial APN when map proximity is provided.
 */
export async function searchParcelsByOwnerOrId(
  rawQuery: string,
  proximity: [number, number] | null,
  options?: { signal?: AbortSignal; timeoutMs?: number }
): Promise<GeocodeSuggestion[]> {
  const apiKey = process.env.LANDRECORDS_API_KEY;
  if (!apiKey) return [];

  const q = rawQuery.trim();
  if (q.length < 3) return [];

  const signal = options?.signal;
  const timeoutMs = options?.timeoutMs ?? 5000;
  const nearTimeoutMs = options?.timeoutMs ?? 8000;
  const tasks: Promise<GeocodeSuggestion[]>[] = [];

  const asParcel = looksLikeParcelId(q) || LRID_RE.test(q);
  const asOwner = looksLikeOwnerQuery(q);

  if (asParcel) {
    tasks.push(
      withTimeout(searchExactParcelIds(q, apiKey, signal), timeoutMs, [])
    );
    if (proximity && !LRID_RE.test(q)) {
      tasks.push(
        withTimeout(
          searchParcelIdNear(q, proximity, apiKey, signal),
          nearTimeoutMs,
          []
        )
      );
    }
  }

  if (asOwner) {
    tasks.push(withTimeout(searchOwnerPrefix(q, apiKey, signal), timeoutMs, []));
    if (proximity) {
      tasks.push(
        withTimeout(
          searchOwnerNear(q, proximity, apiKey, signal),
          nearTimeoutMs,
          []
        )
      );
    }
  }

  if (tasks.length === 0) return [];

  const batches = await Promise.all(tasks);
  return dedupeSuggestions(batches.flat()).slice(0, 8);
}
