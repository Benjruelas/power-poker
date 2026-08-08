"use client";

import { Check, X } from "lucide-react";

import type { SubstationReview } from "@/lib/lists/substationReview";
import type { SubstationProperties } from "@/lib/types";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";

export function SubstationReviewButtons({
  substationId,
  substation,
  size = "md",
}: {
  substationId: string;
  /** When provided, review uses this site; otherwise selected store substation */
  substation?: SubstationProperties | null;
  size?: "sm" | "md";
}) {
  const review = useAppStore((s) => s.getSubstationReview(substationId));
  const setSubstationReview = useAppStore((s) => s.setSubstationReview);

  const toggle = (next: SubstationReview) => {
    setSubstationReview(substation ?? null, review === next ? null : next);
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
        title={
          review === "yes"
            ? "Clear Yes — show on map again"
            : "Mark Yes — hide from map"
        }
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
        title={
          review === "no"
            ? "Clear No — show on map again"
            : "Mark No — hide from map"
        }
      >
        <X className={size === "sm" ? "size-3" : "size-3.5"} />
        No
      </button>
    </div>
  );
}

export function SubstationReviewBadge({
  substationId,
}: {
  substationId: string;
}) {
  const review = useAppStore((s) => s.getSubstationReview(substationId));
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
