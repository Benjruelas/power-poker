"use client";

import { useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";

import { headerBtnOutlineClass, headerLabelClass } from "@/components/shared/appHeader";
import { Button } from "@/components/ui/button";
import type { PropertyRadarInput } from "@/lib/propertyRadar";
import { cn } from "@/lib/utils";

type Variant = "panel" | "header";

type Props = {
  parcel: PropertyRadarInput;
  variant?: Variant;
  className?: string;
};

export function PropertyRadarButton({
  parcel,
  variant = "panel",
  className,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function openInPropertyRadar() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/propertyradar/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parcel),
      });
      const data = (await res.json()) as {
        url?: string;
        radarId?: string;
        error?: string;
      };
      if (!res.ok || !data.url) {
        throw new Error(data.error || "PropertyRadar lookup failed");
      }
      window.open(data.url, "_blank", "noopener,noreferrer");
    } catch (e) {
      setError(e instanceof Error ? e.message : "PropertyRadar lookup failed");
    } finally {
      setLoading(false);
    }
  }

  if (variant === "header") {
    return (
      <div className="flex flex-col items-end gap-1">
        <Button
          type="button"
          variant="outline"
          className={cn(headerBtnOutlineClass, className)}
          disabled={loading}
          aria-label="Open in PropertyRadar"
          onClick={() => void openInPropertyRadar()}
        >
          {loading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <ExternalLink className="size-4" strokeWidth={2.5} />
          )}
          <span className={headerLabelClass}>PropertyRadar</span>
        </Button>
        {error ? (
          <p className="max-w-[14rem] text-right text-[10px] text-red-300">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        disabled={loading}
        onClick={() => void openInPropertyRadar()}
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-xs font-medium hover:bg-muted disabled:opacity-60",
          className
        )}
      >
        {loading ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <ExternalLink className="size-3.5" />
        )}
        PropertyRadar
      </button>
      {error ? (
        <p className="text-[10px] text-destructive">{error}</p>
      ) : null}
    </div>
  );
}
