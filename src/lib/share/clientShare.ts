import type { SelectedParcel } from "@/lib/landrecords/parcelPropertyMap";
import { toParcelListItem } from "@/lib/landrecords/parcelListItem";

/** Client-safe acres formatter (mirrors server helper). */
export function formatAcres(acres: number | null | undefined): string {
  if (acres == null || !Number.isFinite(acres)) return "";
  if (acres >= 100) return `${Math.round(acres)} acres`;
  if (acres >= 10) return `${acres.toFixed(1)} acres`;
  return `${acres.toFixed(2)} acres`;
}

/** Body for POST /api/share-links — keep payload small (no full properties dump). */
export function toSharePayload(parcel: SelectedParcel) {
  const item = toParcelListItem(parcel);
  return {
    address: item.address,
    parcelId: item.parcelId,
    lrid: item.lrid,
    acres: item.acres,
    lat: item.latitude,
    lng: item.longitude,
    ownerName: item.ownerName,
    county: item.county,
  };
}

/**
 * Create a short absolute share URL for clipboard / Messages.
 * Prefers the path from the API + the browser origin so texts always include https://…
 */
export async function createShareUrl(parcel: SelectedParcel): Promise<string> {
  const res = await fetch("/api/share-links", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(toSharePayload(parcel)),
  });
  const data = (await res.json()) as {
    shareUrl?: string;
    path?: string;
    error?: string;
  };
  if (!res.ok || (!data.shareUrl && !data.path)) {
    throw new Error(data.error || "Failed to create share link");
  }

  if (data.path && typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}${data.path}`;
  }
  if (data.shareUrl) return data.shareUrl;
  throw new Error("Failed to create share link");
}
