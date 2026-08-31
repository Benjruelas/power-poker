"use client";

import { useState } from "react";
import { Check, Copy, Loader2 } from "lucide-react";

import type { SelectedParcel } from "@/lib/landrecords/parcelPropertyMap";
import { createShareUrl } from "@/lib/share/clientShare";
import { Button } from "@/components/ui/button";

export function CopyParcelLinkButton({ parcel }: { parcel: SelectedParcel }) {
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);

  const handleCopy = async () => {
    if (busy) return;
    setBusy(true);
    setError(false);
    try {
      const url = await createShareUrl(parcel);
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError(true);
      window.setTimeout(() => setError(false), 2500);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="icon"
      className="size-7"
      title={error ? "Copy failed" : copied ? "Copied" : "Copy parcel link"}
      aria-label={error ? "Copy failed" : copied ? "Copied" : "Copy parcel link"}
      onClick={() => void handleCopy()}
      disabled={busy}
    >
      {busy ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : copied ? (
        <Check className="size-3.5" />
      ) : (
        <Copy className="size-3.5" />
      )}
    </Button>
  );
}
