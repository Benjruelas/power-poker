import {
  buildParcelSharePreview,
  encodeParcelShareToken,
  parcelSharePath,
  type ParcelSharePreview,
} from "@/lib/share/parcelShare";
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

  const token = await encodeParcelShareToken(preview);
  const path = parcelSharePath(token);
  const origin = new URL(request.url).origin;
  const shareUrl = `${origin}${path}`;

  return Response.json(
    { shareUrl, path, token, preview },
    {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    }
  );
}
