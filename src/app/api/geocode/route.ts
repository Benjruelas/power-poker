import type { GeocodeSuggestion } from "@/lib/geocode";

export const runtime = "nodejs";

/**
 * Mapbox Geocoding autocomplete — same approach as property_list_builder's
 * AddressAutocompleteField / useMapboxGeocode (address + poi, US, autocomplete).
 */
function getMapboxToken(): string {
  return (
    process.env.MAPBOX_ACCESS_TOKEN ||
    process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN ||
    ""
  );
}

type MapboxFeature = {
  id?: string;
  place_name?: string;
  center?: [number, number];
  geometry?: { coordinates?: [number, number] };
  context?: { id?: string; text?: string; short_code?: string }[];
};

function parseCoordinateQuery(raw: string): { lat: number; lng: number } | null {
  const m = raw.trim().match(/^(-?\d+\.?\d*)\s*[,;]\s*(-?\d+\.?\d*)$/);
  if (!m) return null;
  const lat = parseFloat(m[1]!);
  const lng = parseFloat(m[2]!);
  if (!(lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180)) return null;
  return { lat, lng };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim();
  if (q.length < 2) {
    return Response.json({ suggestions: [] as GeocodeSuggestion[] });
  }
  if (q.length > 200) {
    return Response.json({ error: "Query too long" }, { status: 400 });
  }

  const coord = parseCoordinateQuery(q);
  if (coord) {
    const label = `${coord.lat.toFixed(6)}, ${coord.lng.toFixed(6)}`;
    return Response.json({
      suggestions: [
        {
          id: `coord-${coord.lat}-${coord.lng}`,
          label,
          lng: coord.lng,
          lat: coord.lat,
        },
      ] satisfies GeocodeSuggestion[],
    });
  }

  const accessToken = getMapboxToken();
  if (!accessToken) {
    return Response.json(
      { error: "Mapbox access token not configured." },
      { status: 500 }
    );
  }

  const proximity = searchParams.get("proximity"); // optional "lng,lat"
  const url = new URL(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json`
  );
  url.searchParams.set("access_token", accessToken);
  url.searchParams.set("limit", "6");
  url.searchParams.set("country", "us");
  url.searchParams.set("types", "address,poi");
  url.searchParams.set("autocomplete", "true");
  if (proximity && /^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(proximity)) {
    url.searchParams.set("proximity", proximity);
  }

  try {
    const res = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      return Response.json(
        { error: body.message || `Mapbox error: ${res.status}` },
        { status: 502 }
      );
    }
    const data = (await res.json()) as { features?: MapboxFeature[] };
    const suggestions: GeocodeSuggestion[] = [];

    for (const [i, f] of (data.features ?? []).entries()) {
      const [lng, lat] = f.center || f.geometry?.coordinates || [];
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
      const label = (f.place_name || q).trim();
      if (!label) continue;
      suggestions.push({
        id: f.id || `mapbox-${i}`,
        label,
        lng: lng as number,
        lat: lat as number,
      });
    }

    return Response.json({ suggestions });
  } catch {
    return Response.json({ error: "Geocoder unavailable" }, { status: 502 });
  }
}
