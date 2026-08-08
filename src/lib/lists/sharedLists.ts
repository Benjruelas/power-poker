import type { ParcelList, Shortlist } from "@/lib/types";
import { ensureReviewParcelLists } from "@/lib/lists/parcelReview";
import {
  ensureReviewShortlists,
  shortlistsHaveItems,
} from "@/lib/lists/substationReview";

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
    shortlists: ensureReviewShortlists([]),
    parcelLists: ensureReviewParcelLists([]),
  };
}

export function normalizeSharedLists(
  doc: SharedListsDocument
): SharedListsDocument {
  return {
    ...doc,
    shortlists: ensureReviewShortlists(doc.shortlists ?? []),
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
  const normalized = normalizeSharedLists(server);
  const hasServer =
    shortlistsHaveItems(normalized.shortlists) ||
    normalized.parcelLists.some((l) => l.items.length > 0);
  if (hasServer) return normalized;

  const shortlists = local.shortlists ?? [];
  const parcelLists = local.parcelLists ?? [];
  if (shortlists.length === 0 && parcelLists.length === 0) {
    return normalized;
  }

  return normalizeSharedLists({
    version: Math.max(1, server.version + 1),
    updatedAt: new Date().toISOString(),
    shortlists,
    parcelLists,
  });
}
