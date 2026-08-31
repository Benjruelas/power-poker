import {
  absoluteShareUrl,
  buildParcelSharePreview,
  encodeParcelShareToken,
  parcelSharePath,
  type ParcelSharePreview,
} from "@/lib/share/parcelShare";
import {
  newShareId,
  putSharePreview,
  shareStorageAvailable,
} from "@/lib/share/shareStore";
import type { SelectedParcel } from "@/lib/landrecords/parcelPropertyMap";
import { enforceIpRateLimit } from "@/lib/landrecords/rateLimit";

export const runtime = "nodejs";

type Body = {
  address?: string;
  parcelId?: string;
  acres?: number | null;
  lat?: number;
  lng?: number;
  ownerName?: string;
  county?: string;
  lrid?: string;
  /** Full selected parcel — preferred when available */
  parcel?: SelectedParcel;
};

export async function POST(request: Request) {
  const limited = enforceIpRateLimit(request, "share-links", 60, 60);
  if (limited) return limited;

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  let preview: ParcelSharePreview;
  if (body.parcel && Number.isFinite(body.parcel.lat)) {
    preview = buildParcelSharePreview(body.parcel);
  } else {
    const lat = Number(body.lat);
    const lng = Number(body.lng);
    const parcelId = String(body.parcelId || "").trim();
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !parcelId) {
      return Response.json(
        { error: "parcelId, lat, and lng are required" },
        { status: 400 }
      );
    }
    preview = {
      address: String(body.address || `Parcel ${parcelId}`).trim(),
      parcelId,
      lrid: body.lrid ? String(body.lrid).trim() : undefined,
      acres:
        body.acres == null || !Number.isFinite(Number(body.acres))
          ? null
          : Number(body.acres),
      lat,
      lng,
      ownerName: body.ownerName ? String(body.ownerName) : undefined,
      county: body.county ? String(body.county) : undefined,
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30,
    };
  }

  let token: string;
  if (shareStorageAvailable()) {
    let stored = false;
    token = newShareId();
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await putSharePreview(token, preview);
        stored = true;
        break;
      } catch (e) {
        console.error("short share store attempt failed", e);
        token = newShareId();
      }
    }
    if (!stored) {
      token = await encodeParcelShareToken(preview);
    }
  } else {
    token = await encodeParcelShareToken(preview);
  }

  const path = parcelSharePath(token);
  const shareUrl = absoluteShareUrl(path, request);

  return Response.json(
    { shareUrl, path, token, preview },
    {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    }
  );
}
