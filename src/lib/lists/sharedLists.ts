import type { ParcelList, Shortlist } from "@/lib/types";
import { ensureReviewParcelLists } from "@/lib/lists/parcelReview";

export type SharedListsDocument = {
  version: number;
  updatedAt: string;
  shortlists: Shortlist[];
  parcelLists: ParcelList[];
};

export const SHARED_LISTS_BLOB_PATH = "power-poker/shared-lists.json";

export function emptySharedLists(): SharedListsDocument {
  return {
    version: 0,
    updatedAt: new Date(0).toISOString(),
    shortlists: [],
    parcelLists: ensureReviewParcelLists([]),
  };
}

export function normalizeSharedLists(
  doc: SharedListsDocument
): SharedListsDocument {
  return {
    ...doc,
    parcelLists: ensureReviewParcelLists(doc.parcelLists ?? []),
  };
}

export function isSharedListsDocument(v: unknown): v is SharedListsDocument {
  if (!v || typeof v !== "object") return false;
  const d = v as SharedListsDocument;
  return (
    typeof d.version === "number" &&
    Array.isArray(d.shortlists) &&
    Array.isArray(d.parcelLists)
  );
}

/** Merge local browser lists into an empty/missing server doc (one-time migrate). */
export function mergeLocalIntoShared(
  server: SharedListsDocument,
  local: { shortlists?: Shortlist[]; parcelLists?: ParcelList[] }
): SharedListsDocument {
  const hasServer =
    server.shortlists.length > 0 ||
    server.parcelLists.some((l) => l.items.length > 0);
  if (hasServer) return normalizeSharedLists(server);

  const shortlists = local.shortlists ?? [];
  const parcelLists = local.parcelLists ?? [];
  if (shortlists.length === 0 && parcelLists.length === 0) {
    return normalizeSharedLists(server);
  }

  return normalizeSharedLists({
    version: Math.max(1, server.version + 1),
    updatedAt: new Date().toISOString(),
    shortlists,
    parcelLists,
  });
}
