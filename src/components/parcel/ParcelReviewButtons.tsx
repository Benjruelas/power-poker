"use client";

import { Check, X } from "lucide-react";

import type { SelectedParcel } from "@/lib/landrecords/parcelPropertyMap";
import type { ParcelReview } from "@/lib/lists/parcelReview";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";

export function ParcelReviewButtons({
  parcelId,
  parcel,
  size = "md",
}: {
  parcelId: string;
  /** When provided, review uses this parcel; otherwise focus/selected store parcel */
  parcel?: SelectedParcel | null;
  size?: "sm" | "md";
}) {
  const review = useAppStore((s) => {
    const byId = s.getParcelReview(parcelId);
    if (byId) return byId;
    if (parcel?.lrid) return s.getParcelReview(parcel.lrid);
    if (parcel?.id) return s.getParcelReview(parcel.id);
    return null;
  });
  const setParcelReview = useAppStore((s) => s.setParcelReview);

  const toggle = (next: ParcelReview) => {
    setParcelReview(parcel ?? null, review === next ? null : next);
  };

  const btn =
    size === "sm"
      ? "inline-flex flex-1 items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors"
      : "inline-flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold transition-colors";

  return (
    <div className="flex gap-1.5">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          toggle("yes");
        }}
        className={cn(
          btn,
          review === "yes"
            ? "bg-emerald-600 text-white hover:bg-emerald-700"
            : "bg-emerald-500/10 text-emerald-800 hover:bg-emerald-500/20"
        )}
        title={review === "yes" ? "Clear Yes review" : "Mark Yes"}
      >
        <Check className={size === "sm" ? "size-3" : "size-3.5"} />
        Yes
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          toggle("no");
        }}
        className={cn(
          btn,
          review === "no"
            ? "bg-red-600 text-white hover:bg-red-700"
            : "bg-red-500/10 text-red-800 hover:bg-red-500/20"
        )}
        title={review === "no" ? "Clear No review" : "Mark No"}
      >
        <X className={size === "sm" ? "size-3" : "size-3.5"} />
        No
      </button>
    </div>
  );
}

export function ParcelReviewBadge({
  parcelId,
  altId,
}: {
  parcelId: string;
  altId?: string;
}) {
  const review = useAppStore((s) => {
    return (
      s.getParcelReview(parcelId) ??
      (altId ? s.getParcelReview(altId) : null)
    );
  });
  if (!review) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        review === "yes"
          ? "bg-emerald-500/15 text-emerald-700"
          : "bg-red-500/15 text-red-700"
      )}
    >
      {review === "yes" ? "Yes" : "No"}
    </span>
  );
}
