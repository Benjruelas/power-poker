import type { SelectedParcel } from "@/lib/landrecords/parcelPropertyMap";
import { toParcelListItem } from "@/lib/landrecords/parcelListItem";
import type { ParcelListItem } from "@/lib/types";
import type { CrmLeadDetail } from "@/lib/crm/types";

/** Upsert a parcel into the CRM pipeline (duplicate-safe by parcelId). */
export async function promoteParcelToCrm(
  parcel: SelectedParcel | ParcelListItem
): Promise<CrmLeadDetail | null> {
  const item =
    "parcelId" in parcel && "latitude" in parcel && !("properties" in parcel)
      ? (parcel as ParcelListItem)
      : toParcelListItem(parcel as SelectedParcel);

  try {
    const res = await fetch("/api/crm/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        parcelId: item.parcelId,
        lrid: item.lrid,
        address: item.address,
        ownerName: item.ownerName,
        county: item.county,
        acres: item.acres,
        marketValue: item.marketValue,
        latitude: item.latitude,
        longitude: item.longitude,
        note: "note" in item && item.note ? item.note : undefined,
      }),
    });
    if (!res.ok) {
      console.error("promoteParcelToCrm failed", await res.text());
      return null;
    }
    const data = (await res.json()) as { lead: CrmLeadDetail };
    return data.lead;
  } catch (e) {
    console.error("promoteParcelToCrm", e);
    return null;
  }
}
