import type { Shortlist, ShortlistItem, SubstationProperties } from "@/lib/types";

export const YES_SUBSTATION_LIST_ID = "yes";
export const NO_SUBSTATION_LIST_ID = "no";

export type SubstationReview = "yes" | "no";

export function emptyYesShortlist(
  createdAt = new Date().toISOString()
): Shortlist {
  return {
    id: YES_SUBSTATION_LIST_ID,
    name: "Yes",
    createdAt,
    items: [],
  };
}

export function emptyNoShortlist(
  createdAt = new Date().toISOString()
): Shortlist {
  return {
    id: NO_SUBSTATION_LIST_ID,
    name: "No",
    createdAt,
    items: [],
  };
}

/** Always exactly two global review lists: Yes + No. */
export function ensureReviewShortlists(lists: Shortlist[]): Shortlist[] {
  const yes = lists.find((l) => l.id === YES_SUBSTATION_LIST_ID);
  const no = lists.find((l) => l.id === NO_SUBSTATION_LIST_ID);
  const others = lists.filter(
    (l) => l.id !== YES_SUBSTATION_LIST_ID && l.id !== NO_SUBSTATION_LIST_ID
  );

  const yesItems: ShortlistItem[] = [...(yes?.items ?? [])];
  const noItems: ShortlistItem[] = [...(no?.items ?? [])];
  const yesIds = new Set(yesItems.map((i) => i.substationId));
  const noIds = new Set(noItems.map((i) => i.substationId));

  // Fold any legacy named shortlists into Yes
  for (const list of others) {
    for (const item of list.items) {
      if (yesIds.has(item.substationId) || noIds.has(item.substationId)) {
        continue;
      }
      yesItems.push(item);
      yesIds.add(item.substationId);
    }
  }

  // Can't be on both — Yes wins if duplicated
  const cleanedNo = noItems.filter((i) => !yesIds.has(i.substationId));

  return [
    {
      id: YES_SUBSTATION_LIST_ID,
      name: "Yes",
      createdAt: yes?.createdAt ?? new Date().toISOString(),
      items: yesItems,
    },
    {
      id: NO_SUBSTATION_LIST_ID,
      name: "No",
      createdAt: no?.createdAt ?? new Date().toISOString(),
      items: cleanedNo,
    },
  ];
}

export function getSubstationReviewFromLists(
  lists: Shortlist[],
  substationId: string
): SubstationReview | null {
  if (!substationId) return null;
  const yes = lists.find((l) => l.id === YES_SUBSTATION_LIST_ID);
  const no = lists.find((l) => l.id === NO_SUBSTATION_LIST_ID);
  if (yes?.items.some((i) => i.substationId === substationId)) return "yes";
  if (no?.items.some((i) => i.substationId === substationId)) return "no";
  return null;
}

/** IDs of substations on either Yes or No (hidden from the map). */
export function reviewedSubstationIds(lists: Shortlist[]): Set<string> {
  const ids = new Set<string>();
  for (const list of lists) {
    if (
      list.id !== YES_SUBSTATION_LIST_ID &&
      list.id !== NO_SUBSTATION_LIST_ID
    ) {
      continue;
    }
    for (const item of list.items) {
      if (item.substationId) ids.add(item.substationId);
    }
  }
  return ids;
}

export function toShortlistItem(
  s: SubstationProperties
): Omit<ShortlistItem, "addedAt" | "note"> {
  return {
    substationId: s.id,
    name: s.name,
    county: s.county,
    score: s.opportunityScore,
    maxVolt: s.maxVolt,
    queuedMw5mi: s.queuedMw5mi,
    latitude: s.latitude,
    longitude: s.longitude,
  };
}

/** True when shortlists have any reviewed sites (ignores empty Yes/No shells). */
export function shortlistsHaveItems(lists: Shortlist[]): boolean {
  return lists.some((l) => l.items.length > 0);
}
