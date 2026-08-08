"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Loader2, MessageSquare, Share2 } from "lucide-react";

import type { SelectedParcel } from "@/lib/landrecords/parcelPropertyMap";
import { toParcelListItem } from "@/lib/landrecords/parcelListItem";
import { formatAcres, toSharePayload } from "@/lib/share/clientShare";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

function openSmsWithBody(body: string) {
  const encoded = encodeURIComponent(body);
  const isIOS =
    typeof navigator !== "undefined" &&
    /iPad|iPhone|iPod/i.test(navigator.userAgent);
  window.location.href = isIOS ? `sms:&body=${encoded}` : `sms:?body=${encoded}`;
}

export function ShareParcelSheet({ parcel }: { parcel: SelectedParcel }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  const item = toParcelListItem(parcel);
  const acresLabel = formatAcres(item.acres);

  useEffect(() => {
    setShareUrl("");
    setCopied(false);
    setError("");
  }, [parcel.id, parcel.lat, parcel.lng]);

  const ensureLink = async () => {
    if (shareUrl) return shareUrl;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/share-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toSharePayload(parcel)),
      });
      const data = (await res.json()) as { shareUrl?: string; error?: string };
      if (!res.ok || !data.shareUrl) {
        throw new Error(data.error || "Failed to create share link");
      }
      setShareUrl(data.shareUrl);
      return data.shareUrl;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to create link";
      setError(msg);
      throw e;
    } finally {
      setBusy(false);
    }
  };

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (next && !shareUrl && !busy) {
      void ensureLink().catch(() => undefined);
    }
    if (!next) {
      setCopied(false);
      setError("");
    }
  };

  const handleMessages = async () => {
    try {
      const url = await ensureLink();
      openSmsWithBody(url);
    } catch {
      /* error state set */
    }
  };

  const handleCopy = async () => {
    try {
      const url = await ensureLink();
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* error state set */
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger
        render={
          <Button
            variant="outline"
            size="icon"
            className="size-7"
            title="Share parcel"
            aria-label="Share parcel"
          />
        }
      >
        <Share2 className="size-3.5" />
      </SheetTrigger>
      <SheetContent side="bottom" className="mx-auto max-w-md rounded-t-xl">
        <SheetHeader>
          <SheetTitle>Share parcel</SheetTitle>
          <SheetDescription>
            Send a Messages link with a satellite preview — address, parcel ID,
            and acreage.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 px-4 pb-6">
          <div className="rounded-lg border bg-muted/40 px-3 py-2.5 text-sm">
            <p className="font-medium leading-snug">{item.address}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {[
                item.parcelId ? `Parcel ${item.parcelId}` : "",
                acresLabel,
                item.county ? `${item.county} County` : "",
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>

          <div className="flex gap-2">
            <Button
              className="flex-1 gap-2"
              onClick={() => void handleMessages()}
              disabled={busy}
            >
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <MessageSquare className="size-4" />
              )}
              Messages
            </Button>
            <Button
              variant="outline"
              className="flex-1 gap-2"
              onClick={() => void handleCopy()}
              disabled={busy}
            >
              {copied ? (
                <Check className="size-4" />
              ) : (
                <Copy className="size-4" />
              )}
              {copied ? "Copied" : "Copy link"}
            </Button>
          </div>

          {shareUrl ? (
            <p className="break-all rounded-md border bg-background px-2.5 py-2 text-[11px] text-muted-foreground">
              {shareUrl}
            </p>
          ) : null}
          {error ? (
            <p className="text-xs text-destructive">{error}</p>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
