"use client";

import { createPortal } from "react-dom";
import { useEffect, useRef, type RefObject } from "react";
import { ChevronUp, ListPlus, ListChecks, X } from "lucide-react";
import type maplibregl from "maplibre-gl";

import type { ParcelPopupView } from "@/lib/landrecords/parcelPropertyMap";
import { useAppStore } from "@/lib/store";
import { usePopupPosition } from "./usePopupPosition";
import { cn } from "@/lib/utils";

export function ParcelPopup({
  popupData,
  mapRef,
  onClose,
  onOpenDetails,
}: {
  popupData: ParcelPopupView | null;
  mapRef: RefObject<maplibregl.Map | null>;
  onClose: () => void;
  onOpenDetails: () => void;
}) {
  const pos = usePopupPosition(mapRef, popupData?.lat, popupData?.lng);
  const cardRef = useRef<HTMLDivElement>(null);
  const parcelId = popupData?.parcelId;
  const inList = useAppStore((s) => {
    if (!parcelId) return false;
    const list = s.parcelLists.find((l) => l.id === s.activeParcelListId);
    return Boolean(list?.items.some((i) => i.parcelId === parcelId));
  });
  const toggleParcelInActiveList = useAppStore(
    (s) => s.toggleParcelInActiveList
  );

  useEffect(() => {
    if (!popupData) return;
    const handlePointerDown = (e: PointerEvent) => {
      const card = cardRef.current;
      if (!card) return;
      if (card.contains(e.target as Node)) return;
      const t = e.target as HTMLElement | null;
      if (
        t?.closest?.(
          [
            "[data-parcel-details-panel]",
            "[role=dialog]",
            ".maplibregl-ctrl",
            "aside",
            "header",
          ].join(",")
        )
      ) {
        return;
      }
      onClose();
    };
    document.addEventListener("pointerdown", handlePointerDown, true);
    return () =>
      document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [popupData, onClose]);

  if (!popupData || !pos || typeof document === "undefined") return null;

  const card = (
    <div
      ref={cardRef}
      className="fixed z-[10000] transition-all duration-200 ease-out"
      style={{
        left: pos.x,
        top: pos.y,
        transform: "translate(-50%, calc(-100% - 40px))",
      }}
    >
      <div className="min-w-[240px] max-w-[300px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-start gap-2 px-3 pb-2 pt-3">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-bold leading-tight text-slate-900">
              {popupData.loading ? "Loading…" : popupData.address}
            </h3>
            {popupData.addressSubtitle ? (
              <p className="mt-0.5 truncate text-xs text-slate-500">
                {popupData.addressSubtitle}
              </p>
            ) : null}
            {popupData.ownerName ? (
              <p className="mt-0.5 truncate text-xs text-slate-500">
                {popupData.ownerName}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded p-0.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close"
          >
            <X size={14} />
          </button>
        </div>

        <div className="flex flex-wrap gap-1.5 px-3">
          {popupData.assessorDataLimited ? (
            <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">
              Limited assessor data
            </span>
          ) : null}
          {popupData.ownerOccupied ? (
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium",
                popupData.ownerOccupied === "Yes"
                  ? "bg-emerald-500/15 text-emerald-700"
                  : "bg-amber-500/15 text-amber-700"
              )}
            >
              {popupData.ownerOccupied === "Yes"
                ? "Owner Occupied"
                : "Absentee Owner"}
            </span>
          ) : null}
          {popupData.age != null ? (
            <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">
              {popupData.age} yrs
            </span>
          ) : null}
        </div>

        <div
          className="flex items-center gap-1 px-3 pb-3 pt-2.5"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              queueMicrotask(() => onOpenDetails());
            }}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-slate-100 px-2 py-1.5 text-xs font-medium text-slate-800 transition-colors hover:bg-slate-200"
            title="More Details"
          >
            <ChevronUp size={12} />
            <span>Details</span>
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggleParcelInActiveList();
            }}
            className={cn(
              "rounded-lg p-2 transition-colors",
              inList
                ? "bg-emerald-600 text-white hover:bg-emerald-700"
                : "bg-blue-50 text-blue-700 hover:bg-blue-100"
            )}
            title={inList ? "Remove from list" : "Add to list"}
          >
            {inList ? <ListChecks size={13} /> : <ListPlus size={13} />}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(card, document.body);
}
