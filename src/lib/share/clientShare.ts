import type { SelectedParcel } from "@/lib/landrecords/parcelPropertyMap";
import { toParcelListItem } from "@/lib/landrecords/parcelListItem";

/** Client-safe acres formatter (mirrors server helper). */
export function formatAcres(acres: number | null | undefined): string {
  if (acres == null || !Number.isFinite(acres)) return "";
  if (acres >= 100) return `${Math.round(acres)} acres`;
  if (acres >= 10) return `${acres.toFixed(1)} acres`;
  return `${acres.toFixed(2)} acres`;
}

/** Body for POST /api/share-links */
export function toSharePayload(parcel: SelectedParcel) {
  const item = toParcelListItem(parcel);
  return {
    parcel,
    address: item.address,
    parcelId: item.parcelId,
    acres: item.acres,
    lat: item.latitude,
    lng: item.longitude,
    ownerName: item.ownerName,
    county: item.county,
  };
}
