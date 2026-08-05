import {
  canonicalParcelId,
  mapProperties,
  type ParcelProperties,
} from "./parcelPropertyMap";

export async function fetchLandRecordsParcel(opts: {
  lat: number;
  lng: number;
  lrid?: string;
  signal?: AbortSignal;
}): Promise<{
  properties: ParcelProperties;
  parcelId: string;
  /** promoteId for MapLibre feature-state (lrid preferred). */
  lrid: string;
  source: string;
} | null> {
  const { lat, lng, lrid, signal } = opts;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const params = new URLSearchParams({
    lat: String(lat),
    lng: String(lng),
  });
  if (lrid) params.set("lrid", lrid);

  let res: Response;
  try {
    res = await fetch(`/api/parcel?${params}`, { signal });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") throw err;
    return null;
  }
  if (!res.ok) return null;

  const data = (await res.json()) as {
    properties?: Record<string, unknown>;
    source?: string;
  };
  const raw = data?.properties;
  if (!raw || typeof raw !== "object") return null;

  const properties = mapProperties(raw);
  const parcelId =
    canonicalParcelId(raw) || String(properties.PROP_ID || lrid || "");
  const featureStateId =
    (raw.lrid != null && String(raw.lrid)) ||
    (raw.parcelid != null && String(raw.parcelid)) ||
    lrid ||
    parcelId;

  return {
    properties,
    parcelId,
    lrid: featureStateId,
    source: data.source || "unknown",
  };
}
