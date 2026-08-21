/**
 * LandRecords vector tiles are a sparse pyramid and, in some metros, use two
 * MVT layer names in the same TMS set:
 *   - `parcel_us` — full assessor schema (owner, situs, parcelid)
 *   - `parcels`   — reduced schema (lrid + values, no situs/owner)
 *
 * Cedar Hill, TX is majority `parcels`; downtown Dallas is majority `parcel_us`.
 * Painting only `parcel_us` leaves checkerboard holes that look location-specific.
 */

export const PARCEL_SOURCE_MIN_ZOOM = 14;
export const PARCEL_LAYER_MIN_ZOOM = 15;
export const PARCEL_BASE_MAXZOOM = 15;
export const PARCEL_DETAIL_ZOOM = 16;

export const PARCEL_SOURCE_ID = "parcels";
export const PARCEL_SOURCE_ID_Z16 = "parcels-z16";
export const PARCEL_SOURCES = [PARCEL_SOURCE_ID, PARCEL_SOURCE_ID_Z16] as const;

export const PARCEL_SOURCE_LAYERS = ["parcel_us", "parcels"] as const;
export type ParcelSourceLayer = (typeof PARCEL_SOURCE_LAYERS)[number];

export function parcelFillLayerId(
  sourceLayer: ParcelSourceLayer,
  detail = false
): string {
  const base =
    sourceLayer === "parcel_us" ? "parcels-fill" : `parcels-fill-${sourceLayer}`;
  return detail ? base.replace("parcels-fill", "parcels-z16-fill") : base;
}

export function parcelLineLayerId(
  sourceLayer: ParcelSourceLayer,
  detail = false
): string {
  const base =
    sourceLayer === "parcel_us" ? "parcels-line" : `parcels-line-${sourceLayer}`;
  return detail ? base.replace("parcels-line", "parcels-z16-line") : base;
}

export function parcelLineHaloLayerId(
  sourceLayer: ParcelSourceLayer,
  detail = false
): string {
  const base =
    sourceLayer === "parcel_us"
      ? "parcels-line-halo"
      : `parcels-line-halo-${sourceLayer}`;
  return detail
    ? base.replace("parcels-line-halo", "parcels-z16-line-halo")
    : base;
}

export const PARCEL_FILL_LAYERS = [
  ...PARCEL_SOURCE_LAYERS.map((layer) => parcelFillLayerId(layer, false)),
  ...PARCEL_SOURCE_LAYERS.map((layer) => parcelFillLayerId(layer, true)),
] as const;

export const PARCEL_LINE_LAYERS = [
  ...PARCEL_SOURCE_LAYERS.map((layer) => parcelLineLayerId(layer, false)),
  ...PARCEL_SOURCE_LAYERS.map((layer) => parcelLineLayerId(layer, true)),
] as const;

export const PARCEL_LINE_HALO_LAYERS = [
  ...PARCEL_SOURCE_LAYERS.map((layer) => parcelLineHaloLayerId(layer, false)),
  ...PARCEL_SOURCE_LAYERS.map((layer) => parcelLineHaloLayerId(layer, true)),
] as const;

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
