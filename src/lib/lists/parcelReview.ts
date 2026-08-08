import type { ParcelList, ParcelListItem } from "@/lib/types";

export const YES_PARCEL_LIST_ID = "yes";
export const NO_PARCEL_LIST_ID = "no";

export type ParcelReview = "yes" | "no";

export function emptyYesList(createdAt = new Date().toISOString()): ParcelList {
  return {
    id: YES_PARCEL_LIST_ID,
    name: "Yes",
    createdAt,
    items: [],
  };
}

export function emptyNoList(createdAt = new Date().toISOString()): ParcelList {
  return {
    id: NO_PARCEL_LIST_ID,
    name: "No",
    createdAt,
    items: [],
  };
}

/** Always exactly two global review lists: Yes + No. */
export function ensureReviewParcelLists(lists: ParcelList[]): ParcelList[] {
  const yes = lists.find((l) => l.id === YES_PARCEL_LIST_ID);
  const no = lists.find((l) => l.id === NO_PARCEL_LIST_ID);
  const others = lists.filter(
    (l) => l.id !== YES_PARCEL_LIST_ID && l.id !== NO_PARCEL_LIST_ID
  );

  const yesItems: ParcelListItem[] = [...(yes?.items ?? [])];
  const noItems: ParcelListItem[] = [...(no?.items ?? [])];
  const yesIds = new Set(yesItems.map((i) => i.parcelId));
  const noIds = new Set(noItems.map((i) => i.parcelId));

  // Fold any legacy custom lists into Yes (already-shortlisted parcels)
  for (const list of others) {
    for (const item of list.items) {
      if (yesIds.has(item.parcelId) || noIds.has(item.parcelId)) continue;
      yesItems.push(item);
      yesIds.add(item.parcelId);
    }
  }

  // A parcel can't be on both — Yes wins if duplicated
  const cleanedNo = noItems.filter((i) => !yesIds.has(i.parcelId));

  return [
    {
      id: YES_PARCEL_LIST_ID,
      name: "Yes",
      createdAt: yes?.createdAt ?? new Date().toISOString(),
      items: yesItems,
    },
    {
      id: NO_PARCEL_LIST_ID,
      name: "No",
      createdAt: no?.createdAt ?? new Date().toISOString(),
      items: cleanedNo,
    },
  ];
}

export function getParcelReviewFromLists(
  lists: ParcelList[],
  parcelId: string
): ParcelReview | null {
  if (!parcelId) return null;
  const yes = lists.find((l) => l.id === YES_PARCEL_LIST_ID);
  const no = lists.find((l) => l.id === NO_PARCEL_LIST_ID);
  if (yes?.items.some((i) => i.parcelId === parcelId || i.lrid === parcelId)) {
    return "yes";
  }
  if (no?.items.some((i) => i.parcelId === parcelId || i.lrid === parcelId)) {
    return "no";
  }
  return null;
}

/** MapLibre promoteId keys for a reviewed parcel (lrid preferred). */
export function reviewFeatureIds(item: ParcelListItem): string[] {
  const ids = new Set<string>();
  if (item.lrid) ids.add(item.lrid);
  if (item.parcelId) ids.add(item.parcelId);
  return [...ids];
}
