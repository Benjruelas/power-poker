/**
 * LandRecords sits behind Cloudflare. Node 18+ `fetch()` sends
 * `User-Agent: node`, which Bot Fight Mode 403s as HTML. A browser-like UA
 * gets through to the real API (401 without a key, 200 with one).
 */
export const LANDRECORDS_USER_AGENT =
  "PowerPoker/1.0 (+https://github.com/Benjruelas/power-poker)";

/** Path advertised by GET https://api.landrecords.us/ (XYZ, not TMS). */
export const LANDRECORDS_ADVERTISED_VECTOR_BASE =
  "https://api.landrecords.us/pro:parcel_us@EPSG:3857x2@pbf";

export const DEFAULT_LANDRECORDS_TMS_URL =
  "https://api.landrecords.us/pro/gwc/service/tms/1.0.0/pro:parcel_us@EPSG:3857x2@pbf";

export function landRecordsAuthHeaders(
  apiKey = process.env.LANDRECORDS_API_KEY
): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey || ""}`,
    "User-Agent": LANDRECORDS_USER_AGENT,
    Accept: "application/x-protobuf, application/json;q=0.9, */*;q=0.8",
  };
}

/**
 * Fetch LandRecords. On 401/403, retry once with `?token=` (their gateway
 * accepts header or token; Cloudflare sometimes strips Authorization).
 */
export async function landRecordsFetch(
  url: string,
  opts: {
    apiKey?: string;
    method?: string;
    body?: string;
    contentType?: string;
    signal?: AbortSignal;
  } = {}
): Promise<Response> {
  const {
    apiKey = process.env.LANDRECORDS_API_KEY,
    method = "GET",
    body,
    contentType,
    signal,
  } = opts;
  const headers = landRecordsAuthHeaders(apiKey);
  if (contentType) headers["Content-Type"] = contentType;
  if (method !== "GET" && method !== "HEAD") {
    headers.Accept = "application/json, application/geo+json, */*";
  }

  const send = (href: string) =>
    fetch(href, { method, headers, body, signal });
  let res = await send(url);
  if ((res.status === 401 || res.status === 403) && apiKey) {
    const retryUrl = new URL(url);
    if (!retryUrl.searchParams.has("token")) {
      retryUrl.searchParams.set("token", apiKey);
      res = await send(retryUrl.toString());
    }
  }
  return res;
}

export function isTmsTileBase(baseUrl: string): boolean {
  return /\/tms\//i.test(String(baseUrl || ""));
}

/** Origin URLs to try for MapLibre XYZ z/x/y. TMS bases need a Y flip. */
export function originParcelTileUrls(
  zi: number,
  xi: number,
  yi: number,
  baseUrl = process.env.LANDRECORDS_TILE_URL || DEFAULT_LANDRECORDS_TMS_URL
): string[] {
  const base = String(baseUrl || "").replace(/\/$/, "");
  const tmsY = 2 ** zi - 1 - yi;
  const urls: string[] = [];
  if (base) {
    const y = isTmsTileBase(base) ? tmsY : yi;
    urls.push(`${base}/${zi}/${xi}/${y}.pbf`);
  }
  const advertised = `${LANDRECORDS_ADVERTISED_VECTOR_BASE}/${zi}/${xi}/${yi}.pbf`;
  if (!urls.includes(advertised)) urls.push(advertised);
  return urls;
}
