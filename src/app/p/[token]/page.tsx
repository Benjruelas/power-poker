import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  decodeParcelShareToken,
  formatAcres,
  formatAddressLines,
  mapboxSatelliteUrl,
  previewDescription,
  previewTitle,
} from "@/lib/share/parcelShare";

type Props = { params: Promise<{ token: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  const preview = await decodeParcelShareToken(decodeURIComponent(token));
  if (!preview) {
    return {
      title: "Shared parcel · Power Poker",
      description: "This share link is invalid or expired.",
    };
  }

  const title = previewTitle(preview);
  const description = previewDescription(preview);

  return {
    title: `${title} · Power Poker`,
    description,
    openGraph: {
      type: "website",
      siteName: "Power Poker",
      title,
      description,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default async function ParcelSharePage({ params }: Props) {
  const { token } = await params;
  const preview = await decodeParcelShareToken(decodeURIComponent(token));
  if (!preview) notFound();

  const lines = formatAddressLines(preview.address);
  const acres = formatAcres(preview.acres);
  const sat = mapboxSatelliteUrl(preview.lat, preview.lng, 1200, 630, 16);
  const mapHref = `/?lat=${preview.lat}&lng=${preview.lng}&lrid=${encodeURIComponent(preview.parcelId)}`;

  return (
    <main className="min-h-dvh bg-slate-950 text-white">
      <div className="relative mx-auto max-w-lg overflow-hidden">
        <div
          className="relative aspect-[1200/630] w-full bg-slate-900"
          style={
            sat
              ? {
                  backgroundImage: `linear-gradient(rgba(0,0,0,.45), rgba(0,0,0,.65)), url(${sat})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }
              : undefined
          }
        >
          <div className="absolute inset-0 flex flex-col justify-end p-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-300">
              Power Poker
            </p>
            <h1 className="mt-2 text-2xl font-bold leading-tight">
              {lines[0] || preview.address || "Shared parcel"}
            </h1>
            {lines[1] ? (
              <p className="mt-1 text-base text-white/85">{lines[1]}</p>
            ) : null}
          </div>
        </div>

        <div className="space-y-4 px-6 py-6">
          <dl className="space-y-3 text-sm">
            {preview.parcelId ? (
              <div className="flex justify-between gap-4 border-b border-white/10 pb-2">
                <dt className="text-white/55">Parcel ID</dt>
                <dd className="text-right font-medium">{preview.parcelId}</dd>
              </div>
            ) : null}
            {acres ? (
              <div className="flex justify-between gap-4 border-b border-white/10 pb-2">
                <dt className="text-white/55">Acreage</dt>
                <dd className="text-right font-medium">{acres}</dd>
              </div>
            ) : null}
            {preview.county ? (
              <div className="flex justify-between gap-4 border-b border-white/10 pb-2">
                <dt className="text-white/55">County</dt>
                <dd className="text-right font-medium">{preview.county}</dd>
              </div>
            ) : null}
            {preview.ownerName ? (
              <div className="flex justify-between gap-4 border-b border-white/10 pb-2">
                <dt className="text-white/55">Owner</dt>
                <dd className="text-right font-medium">{preview.ownerName}</dd>
              </div>
            ) : null}
          </dl>

          <Link
            href={mapHref}
            className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-emerald-600 text-sm font-semibold text-white hover:bg-emerald-500"
          >
            Open in map
          </Link>
          <p className="text-center text-xs text-white/45">
            Shared screening link · expires in 30 days
          </p>
        </div>
      </div>
    </main>
  );
}
