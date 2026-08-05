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

export type PanelTab = "details" | "parcel" | "lists" | "about";

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
  createList: (name: string) => void;
  renameList: (id: string, name: string) => void;
  deleteList: (id: string) => void;
  setActiveListId: (id: string | null) => void;
  addToList: (
    listId: string,
    item: Omit<ShortlistItem, "addedAt" | "note"> & { note?: string }
  ) => void;
  removeFromList: (listId: string, substationId: string) => void;
  updateNote: (listId: string, substationId: string, note: string) => void;
  isInActiveList: (substationId: string) => boolean;
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
  /** Add/remove parcelFocus (or selectedParcel) from the active parcel list. */
  toggleParcelInActiveList: (parcel?: SelectedParcel | null) => void;
}

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
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
      shortlists: [],
      activeListId: null,
      createList: (name) => {
        const list: Shortlist = {
          id: uid(),
          name: name.trim() || "Untitled list",
          createdAt: new Date().toISOString(),
          items: [],
        };
        set((s) => ({
          shortlists: [...s.shortlists, list],
          activeListId: list.id,
        }));
      },
      renameList: (id, name) =>
        set((s) => ({
          shortlists: s.shortlists.map((l) =>
            l.id === id ? { ...l, name: name.trim() || l.name } : l
          ),
        })),
      deleteList: (id) =>
        set((s) => ({
          shortlists: s.shortlists.filter((l) => l.id !== id),
          activeListId: s.activeListId === id ? null : s.activeListId,
        })),
      setActiveListId: (activeListId) => set({ activeListId }),
      addToList: (listId, item) =>
        set((s) => ({
          shortlists: s.shortlists.map((l) => {
            if (l.id !== listId) return l;
            if (l.items.some((i) => i.substationId === item.substationId))
              return l;
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
          }),
        })),
      removeFromList: (listId, substationId) =>
        set((s) => ({
          shortlists: s.shortlists.map((l) =>
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
          shortlists: s.shortlists.map((l) =>
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
      isInActiveList: (substationId) => {
        const { activeListId, shortlists } = get();
        if (!activeListId) return false;
        const list = shortlists.find((l) => l.id === activeListId);
        return Boolean(list?.items.some((i) => i.substationId === substationId));
      },

      parcelLists: [],
      activeParcelListId: null,
      createParcelList: (name) => {
        const list: ParcelList = {
          id: uid(),
          name: name.trim() || "Untitled parcel list",
          createdAt: new Date().toISOString(),
          items: [],
        };
        set((s) => ({
          parcelLists: [...s.parcelLists, list],
          activeParcelListId: list.id,
        }));
      },
      deleteParcelList: (id) =>
        set((s) => ({
          parcelLists: s.parcelLists.filter((l) => l.id !== id),
          activeParcelListId:
            s.activeParcelListId === id ? null : s.activeParcelListId,
        })),
      setActiveParcelListId: (activeParcelListId) =>
        set({ activeParcelListId }),
      addParcelToList: (listId, item) =>
        set((s) => ({
          parcelLists: s.parcelLists.map((l) => {
            if (l.id !== listId) return l;
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
          }),
        })),
      removeParcelFromList: (listId, parcelId) =>
        set((s) => ({
          parcelLists: s.parcelLists.map((l) =>
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
          parcelLists: s.parcelLists.map((l) =>
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
        const { activeParcelListId, parcelLists } = get();
        if (!activeParcelListId) return false;
        const list = parcelLists.find((l) => l.id === activeParcelListId);
        return Boolean(list?.items.some((i) => i.parcelId === parcelId));
      },
      toggleParcelInActiveList: (parcel) => {
        const target =
          parcel ?? get().parcelFocus ?? get().selectedParcel ?? null;
        if (!target) return;
        let listId = get().activeParcelListId;
        if (!listId) {
          get().createParcelList("My parcels");
          listId = get().activeParcelListId;
        }
        if (!listId) return;
        if (get().isParcelInActiveList(target.id)) {
          get().removeParcelFromList(listId, target.id);
        } else {
          get().addParcelToList(listId, toParcelListItem(target));
        }
      },
    }),
    {
      name: "power-poker-v1",
      partialize: (s) => ({
        shortlists: s.shortlists,
        activeListId: s.activeListId,
        parcelLists: s.parcelLists,
        activeParcelListId: s.activeParcelListId,
        filters: s.filters,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<AppState>;
        return {
          ...current,
          ...p,
          filters: { ...DEFAULT_FILTERS, ...(p.filters ?? {}) },
          parcelLists: p.parcelLists ?? current.parcelLists,
          activeParcelListId:
            p.activeParcelListId ?? current.activeParcelListId,
        };
      },
    }
  )
);
