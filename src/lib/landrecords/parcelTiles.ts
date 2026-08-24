/**
 * LandRecords vector tiles are a sparse pyramid and, in some metros, use two
 * MVT layer names in the same TMS set:
 *   - `parcel_us` — full assessor schema (owner, situs, parcelid)
 *   - `parcels`   — reduced schema (lrid + values, no situs/owner)
 *
 * Cedar Hill, TX is majority `parcels`; downtown Dallas is majority `parcel_us`.
 * Painting only `parcel_us` leaves checkerboard holes that look location-specific.
 *
 * Single MapLibre source (minzoom 14, maxzoom 17) + HTTP 410 for empty tiles
 * above minzoom keeps parent tiles in sparse areas (KnockScout pattern).
 */

export const PARCEL_SOURCE_MIN_ZOOM = 14;
export const PARCEL_LAYER_MIN_ZOOM = 15;
/** Some metros (e.g. Duncanville) are empty at z16 but populated at z17. */
export const PARCEL_TILE_MAXZOOM = 17;

export const PARCEL_SOURCE_ID = "parcels";

export const PARCEL_SOURCE_LAYERS = ["parcel_us", "parcels"] as const;
export type ParcelSourceLayer = (typeof PARCEL_SOURCE_LAYERS)[number];

/** Cache-bust after sparse-pyramid / maxzoom-17 tile handling. */
export const PARCEL_TILE_URL_VERSION = 4;

export function parcelFillLayerId(sourceLayer: ParcelSourceLayer): string {
  return sourceLayer === "parcel_us"
    ? "parcels-fill"
    : `parcels-fill-${sourceLayer}`;
}

export function parcelLineLayerId(sourceLayer: ParcelSourceLayer): string {
  return sourceLayer === "parcel_us"
    ? "parcels-line"
    : `parcels-line-${sourceLayer}`;
}

export function parcelLineHaloLayerId(sourceLayer: ParcelSourceLayer): string {
  return sourceLayer === "parcel_us"
    ? "parcels-line-halo"
    : `parcels-line-halo-${sourceLayer}`;
}

export const PARCEL_FILL_LAYERS = PARCEL_SOURCE_LAYERS.map(parcelFillLayerId);
export const PARCEL_LINE_LAYERS = PARCEL_SOURCE_LAYERS.map(parcelLineLayerId);
export const PARCEL_LINE_HALO_LAYERS =
  PARCEL_SOURCE_LAYERS.map(parcelLineHaloLayerId);

export const PARCEL_ALL_STYLE_LAYERS = [
  ...PARCEL_FILL_LAYERS,
  ...PARCEL_LINE_LAYERS,
  ...PARCEL_LINE_HALO_LAYERS,
] as const;

export function parcelPromoteId(): Record<ParcelSourceLayer, "lrid"> {
  return Object.fromEntries(
    PARCEL_SOURCE_LAYERS.map((layer) => [layer, "lrid"])
  ) as Record<ParcelSourceLayer, "lrid">;
}

export function parcelPromoteIdMatches(actual: unknown): boolean {
  if (!actual || typeof actual !== "object") return false;
  const obj = actual as Record<string, unknown>;
  return PARCEL_SOURCE_LAYERS.every((layer) => obj[layer] === "lrid");
}

/** Same-origin parcel vector tiles (LandRecords via /api/tiles). */
export function parcelTileUrl(origin = ""): string {
  return `${origin}/api/tiles?z={z}&x={x}&y={y}&v=${PARCEL_TILE_URL_VERSION}`;
}

/**
 * Must stay aligned with PARCEL_SOURCE_MIN_ZOOM.
 * Below this zoom the map never requests tiles; at this zoom there is no parent
 * to keep, so empty tiles are 204. Above it they are 410 so MapLibre keeps parents.
 */
export function emptyParcelTileStatus(
  zi: number,
  minZoom = PARCEL_SOURCE_MIN_ZOOM
): 204 | 410 {
  if (Number.isFinite(zi) && zi > minZoom) return 410;
  return 204;
}
