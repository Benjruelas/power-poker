import {
  decodeParcelShareToken,
  type ParcelSharePreview,
} from "./parcelShare";
import { getSharePreview, isShortShareId } from "./shareStore";

/** Resolve `/p/{token}` — short Blob ids or legacy signed JWTs. */
export async function resolveParcelSharePreview(
  token: string
): Promise<ParcelSharePreview | null> {
  const raw = decodeURIComponent(String(token || "").trim());
  if (!raw) return null;
  if (isShortShareId(raw)) {
    return getSharePreview(raw);
  }
  return decodeParcelShareToken(raw);
}
