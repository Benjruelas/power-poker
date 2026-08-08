"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  AppFilters,
  ParcelList,
  ParcelListItem,
  Shortlist,
  ShortlistItem,
  SubstationProperties,
} from "./types";
import { DEFAULT_FILTERS } from "./types";
import type {
  ParcelPopupView,
  SelectedParcel,
} from "./landrecords/parcelPropertyMap";
import { toParcelListItem } from "./landrecords/parcelListItem";
import {
  ensureReviewParcelLists,
  getParcelReviewFromLists,
  NO_PARCEL_LIST_ID,
  YES_PARCEL_LIST_ID,
  type ParcelReview,
} from "./lists/parcelReview";
import {
  ensureReviewShortlists,
  getSubstationReviewFromLists,
  NO_SUBSTATION_LIST_ID,
  toShortlistItem,
  YES_SUBSTATION_LIST_ID,
  type SubstationReview,
} from "./lists/substationReview";

export type PanelTab = "details" | "parcel" | "lists" | "about";
export type { ParcelReview, SubstationReview };

interface AppState {
  filters: AppFilters;
  setFilters: (partial: Partial<AppFilters>) => void;
  resetFilters: () => void;
  selectedSubstationId: string | null;
  setSelectedSubstationId: (id: string | null) => void;
  selectedSubstation: SubstationProperties | null;
  setSelectedSubstation: (s: SubstationProperties | null) => void;
  parcelPopup: ParcelPopupView | null;
  parcelFocus: SelectedParcel | null;
  setParcelPopup: (
    popup: ParcelPopupView | null,
    focus?: SelectedParcel | null
  ) => void;
  selectedParcel: SelectedParcel | null;
  openParcelDetails: () => void;
  clearSelectedParcel: () => void;
  closeParcelPopup: () => void;
  panelTab: PanelTab;
  setPanelTab: (tab: PanelTab) => void;
  shortlists: Shortlist[];
  activeListId: string | null;
  /** @deprecated Fixed Yes/No lists only */
  createList: (name: string) => void;
  renameList: (id: string, name: string) => void;
  /** @deprecated Yes/No lists are permanent */
  deleteList: (id: string) => void;
  setActiveListId: (id: string | null) => void;
  addToList: (
    listId: string,
    item: Omit<ShortlistItem, "addedAt" | "note"> & { note?: string }
  ) => void;
  removeFromList: (listId: string, substationId: string) => void;
  updateNote: (listId: string, substationId: string, note: string) => void;
  /** @deprecated Prefer getSubstationReview */
  isInActiveList: (substationId: string) => boolean;
  getSubstationReview: (substationId: string) => SubstationReview | null;
  /** Put site on Yes or No (exclusive). Pass null to clear — shows on map again. */
  setSubstationReview: (
    substation: SubstationProperties | null | undefined,
    review: SubstationReview | null
  ) => void;
  parcelLists: ParcelList[];
  activeParcelListId: string | null;
  createParcelList: (name: string) => void;
  deleteParcelList: (id: string) => void;
  setActiveParcelListId: (id: string | null) => void;
  addParcelToList: (
    listId: string,
    item: Omit<ParcelListItem, "addedAt" | "note"> & { note?: string }
  ) => void;
  removeParcelFromList: (listId: string, parcelId: string) => void;
  updateParcelNote: (listId: string, parcelId: string, note: string) => void;
  isParcelInActiveList: (parcelId: string) => boolean;
  /** @deprecated Prefer setParcelReview — toggles Yes list membership */
  toggleParcelInActiveList: (parcel?: SelectedParcel | null) => void;
  getParcelReview: (parcelId: string) => ParcelReview | null;
  /** Put parcel on Yes or No (exclusive). Pass null to clear review. */
  setParcelReview: (
    parcel: SelectedParcel | null | undefined,
    review: ParcelReview | null
  ) => void;
  /** Shared global lists (Vercel Blob) sync metadata */
  listsHydrated: boolean;
  listsSyncing: boolean;
  listsVersion: number;
  listsUpdatedAt: string | null;
  listsStatus: "loading" | "live" | "error";
  listsError: string;
}

function coerceSubstationListId(id: string | null | undefined): string {
  return id === NO_SUBSTATION_LIST_ID
    ? NO_SUBSTATION_LIST_ID
    : YES_SUBSTATION_LIST_ID;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      filters: DEFAULT_FILTERS,
      setFilters: (partial) =>
        set((s) => ({ filters: { ...s.filters, ...partial } })),
      resetFilters: () => set({ filters: DEFAULT_FILTERS }),
      selectedSubstationId: null,
      setSelectedSubstationId: (id) => set({ selectedSubstationId: id }),
      selectedSubstation: null,
      setSelectedSubstation: (selectedSubstation) =>
        set({
          selectedSubstation,
          selectedSubstationId: selectedSubstation?.id ?? null,
          panelTab: selectedSubstation ? "details" : get().panelTab,
          parcelPopup: selectedSubstation ? null : get().parcelPopup,
          parcelFocus: selectedSubstation ? null : get().parcelFocus,
        }),
      parcelPopup: null,
      parcelFocus: null,
      setParcelPopup: (parcelPopup, focus) =>
        set((s) => ({
          parcelPopup,
          parcelFocus: focus === undefined ? s.parcelFocus : focus,
        })),
      selectedParcel: null,
      openParcelDetails: () => {
        const focus = get().parcelFocus;
        if (!focus) return;
        set({
          selectedParcel: focus,
          selectedSubstation: null,
          selectedSubstationId: null,
          panelTab: "parcel",
          parcelPopup: null,
        });
      },
      clearSelectedParcel: () =>
        set({
          selectedParcel: null,
          panelTab: get().panelTab === "parcel" ? "details" : get().panelTab,
        }),
      closeParcelPopup: () => set({ parcelPopup: null, parcelFocus: null }),
      panelTab: "about",
      setPanelTab: (panelTab) => set({ panelTab }),
      shortlists: ensureReviewShortlists([]),
      activeListId: YES_SUBSTATION_LIST_ID,
      createList: () => {
        set((s) => ({
          shortlists: ensureReviewShortlists(s.shortlists),
          activeListId: coerceSubstationListId(s.activeListId),
        }));
      },
      renameList: () => {
        /* Yes/No names are fixed */
      },
      deleteList: () => {
        /* Yes/No lists are permanent */
      },
      setActiveListId: (activeListId) =>
        set({ activeListId: coerceSubstationListId(activeListId) }),
      addToList: (listId, item) => {
        if (
          listId !== YES_SUBSTATION_LIST_ID &&
          listId !== NO_SUBSTATION_LIST_ID
        ) {
          return;
        }
        set((s) => {
          const lists = ensureReviewShortlists(s.shortlists).map((l) => {
            if (l.id !== listId) {
              return {
                ...l,
                items: l.items.filter(
                  (i) => i.substationId !== item.substationId
                ),
              };
            }
            if (l.items.some((i) => i.substationId === item.substationId)) {
              return l;
            }
            return {
              ...l,
              items: [
                ...l.items,
                {
                  ...item,
                  note: item.note ?? "",
                  addedAt: new Date().toISOString(),
                },
              ],
            };
          });
          return { shortlists: lists, activeListId: listId };
        });
      },
      removeFromList: (listId, substationId) =>
        set((s) => ({
          shortlists: ensureReviewShortlists(s.shortlists).map((l) =>
            l.id === listId
              ? {
                  ...l,
                  items: l.items.filter((i) => i.substationId !== substationId),
                }
              : l
          ),
        })),
      updateNote: (listId, substationId, note) =>
        set((s) => ({
          shortlists: ensureReviewShortlists(s.shortlists).map((l) =>
            l.id === listId
              ? {
                  ...l,
                  items: l.items.map((i) =>
                    i.substationId === substationId ? { ...i, note } : i
                  ),
                }
              : l
          ),
        })),
      isInActiveList: (substationId) =>
        get().getSubstationReview(substationId) != null,
      getSubstationReview: (substationId) =>
        getSubstationReviewFromLists(get().shortlists, substationId),
      setSubstationReview: (substation, review) => {
        const target = substation ?? get().selectedSubstation ?? null;
        if (!target) return;
        const item = toShortlistItem(target);
        set((s) => {
          let lists = ensureReviewShortlists(s.shortlists).map((l) => ({
            ...l,
            items: l.items.filter((i) => i.substationId !== item.substationId),
          }));
          if (review === "yes" || review === "no") {
            const listId =
              review === "yes"
                ? YES_SUBSTATION_LIST_ID
                : NO_SUBSTATION_LIST_ID;
            const priorNote =
              s.shortlists
                .flatMap((l) => l.items)
                .find((i) => i.substationId === item.substationId)?.note ?? "";
            lists = lists.map((l) =>
              l.id === listId
                ? {
                    ...l,
                    items: [
                      ...l.items,
                      {
                        ...item,
                        note: priorNote,
                        addedAt: new Date().toISOString(),
                      },
                    ],
                  }
                : l
            );
          }
          return {
            shortlists: lists,
            activeListId:
              review === "no"
                ? NO_SUBSTATION_LIST_ID
                : YES_SUBSTATION_LIST_ID,
          };
        });
      },

      parcelLists: ensureReviewParcelLists([]),
      activeParcelListId: YES_PARCEL_LIST_ID,
      createParcelList: () => {
        // Fixed Yes/No lists only — ensure they exist
        set((s) => ({
          parcelLists: ensureReviewParcelLists(s.parcelLists),
          activeParcelListId: s.activeParcelListId ?? YES_PARCEL_LIST_ID,
        }));
      },
      deleteParcelList: () => {
        /* Yes/No lists are permanent */
      },
      setActiveParcelListId: (activeParcelListId) =>
        set({
          activeParcelListId:
            activeParcelListId === NO_PARCEL_LIST_ID
              ? NO_PARCEL_LIST_ID
              : YES_PARCEL_LIST_ID,
        }),
      addParcelToList: (listId, item) => {
        if (listId !== YES_PARCEL_LIST_ID && listId !== NO_PARCEL_LIST_ID) {
          return;
        }
        set((s) => {
          const lists = ensureReviewParcelLists(s.parcelLists).map((l) => {
            // Exclusive membership
            if (l.id !== listId) {
              return {
                ...l,
                items: l.items.filter((i) => i.parcelId !== item.parcelId),
              };
            }
            if (l.items.some((i) => i.parcelId === item.parcelId)) return l;
            return {
              ...l,
              items: [
                ...l.items,
                {
                  ...item,
                  note: item.note ?? "",
                  addedAt: new Date().toISOString(),
                },
              ],
            };
          });
          return { parcelLists: lists, activeParcelListId: listId };
        });
      },
      removeParcelFromList: (listId, parcelId) =>
        set((s) => ({
          parcelLists: ensureReviewParcelLists(s.parcelLists).map((l) =>
            l.id === listId
              ? {
                  ...l,
                  items: l.items.filter((i) => i.parcelId !== parcelId),
                }
              : l
          ),
        })),
      updateParcelNote: (listId, parcelId, note) =>
        set((s) => ({
          parcelLists: ensureReviewParcelLists(s.parcelLists).map((l) =>
            l.id === listId
              ? {
                  ...l,
                  items: l.items.map((i) =>
                    i.parcelId === parcelId ? { ...i, note } : i
                  ),
                }
              : l
          ),
        })),
      isParcelInActiveList: (parcelId) => {
        return get().getParcelReview(parcelId) != null;
      },
      toggleParcelInActiveList: (parcel) => {
        const target =
          parcel ?? get().parcelFocus ?? get().selectedParcel ?? null;
        if (!target) return;
        const current = get().getParcelReview(target.id);
        get().setParcelReview(target, current === "yes" ? null : "yes");
      },
      getParcelReview: (parcelId) =>
        getParcelReviewFromLists(get().parcelLists, parcelId),
      setParcelReview: (parcel, review) => {
        const target =
          parcel ?? get().parcelFocus ?? get().selectedParcel ?? null;
        if (!target) return;
        const item = toParcelListItem(target);
        const sameParcel = (i: { parcelId: string; lrid?: string }) =>
          i.parcelId === item.parcelId ||
          (!!item.lrid &&
            (i.lrid === item.lrid || i.parcelId === item.lrid)) ||
          (!!i.lrid && i.lrid === item.parcelId);
        set((s) => {
          let lists = ensureReviewParcelLists(s.parcelLists).map((l) => ({
            ...l,
            items: l.items.filter((i) => !sameParcel(i)),
          }));
          if (review === "yes" || review === "no") {
            const listId =
              review === "yes" ? YES_PARCEL_LIST_ID : NO_PARCEL_LIST_ID;
            const priorNote =
              s.parcelLists
                .flatMap((l) => l.items)
                .find((i) => sameParcel(i))?.note ?? "";
            lists = lists.map((l) =>
              l.id === listId
                ? {
                    ...l,
                    items: [
                      ...l.items,
                      {
                        ...item,
                        note: priorNote,
                        addedAt: new Date().toISOString(),
                      },
                    ],
                  }
                : l
            );
          }
          return {
            parcelLists: lists,
            activeParcelListId:
              review === "no" ? NO_PARCEL_LIST_ID : YES_PARCEL_LIST_ID,
          };
        });
      },
      listsHydrated: false,
      listsSyncing: false,
      listsVersion: 0,
      listsUpdatedAt: null,
      listsStatus: "loading",
      listsError: "",
    }),
    {
      name: "power-poker-v1",
      // Lists live in shared Blob storage — only keep per-browser UI prefs here
      partialize: (s) => ({
        activeListId: s.activeListId,
        activeParcelListId: s.activeParcelListId,
        filters: s.filters,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<AppState>;
        const {
          showFiberRoutes: _removedFiberRoutes,
          ...persistedFilters
        } = (p.filters ?? {}) as Partial<AppState["filters"]> & {
          showFiberRoutes?: boolean;
        };
        return {
          ...current,
          filters: { ...DEFAULT_FILTERS, ...persistedFilters },
          activeListId: coerceSubstationListId(
            p.activeListId ?? current.activeListId
          ),
          activeParcelListId:
            p.activeParcelListId ?? current.activeParcelListId,
        };
      },
    }
  )
);
