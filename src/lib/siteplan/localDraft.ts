import { normalizeSitePlanDocument } from "./defaults";
import type { SitePlanDocument } from "./types";

const PREFIX = "power-poker-site-plan-draft:";

export function draftKey(lrid: string): string {
  return `${PREFIX}${lrid}`;
}

export function loadLocalDraft(
  lrid: string,
  fallback: { parcelId: string; address: string }
): SitePlanDocument | null {
  if (typeof window === "undefined" || !lrid) return null;
  try {
    const raw = localStorage.getItem(draftKey(lrid));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return normalizeSitePlanDocument(parsed, {
      lrid,
      parcelId: fallback.parcelId,
      address: fallback.address,
    });
  } catch {
    return null;
  }
}

export function saveLocalDraft(doc: SitePlanDocument): void {
  if (typeof window === "undefined" || !doc.lrid) return;
  try {
    localStorage.setItem(draftKey(doc.lrid), JSON.stringify(doc));
  } catch {
    /* quota */
  }
}

export function clearLocalDraft(lrid: string): void {
  if (typeof window === "undefined" || !lrid) return;
  try {
    localStorage.removeItem(draftKey(lrid));
  } catch {
    /* ignore */
  }
}
