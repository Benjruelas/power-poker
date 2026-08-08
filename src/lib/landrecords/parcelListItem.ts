import type { ParcelListItem } from "@/lib/types";
import type { SelectedParcel } from "./parcelPropertyMap";

function parseNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[$,]/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** Build a list row from the currently focused/selected parcel. */
export function toParcelListItem(
  parcel: SelectedParcel
): Omit<ParcelListItem, "addedAt" | "note"> {
  const acres =
    parseNum(parcel.properties.LL_GIS_ACRES) ??
    parseNum(parcel.properties.GIS_ACRES);
  return {
    parcelId: parcel.id,
    lrid: parcel.lrid || undefined,
    address: parcel.address || String(parcel.properties.SITUS_ADDR || parcel.id),
    ownerName: String(parcel.properties.OWNER_NAME || ""),
    county: String(parcel.properties.COUNTY || ""),
    acres,
    marketValue: parseNum(parcel.properties.MKT_VAL),
    latitude: parcel.lat,
    longitude: parcel.lng,
  };
}
