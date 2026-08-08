import type { GeocodeSuggestion } from "@/lib/geocode";
import { enforceIpRateLimit } from "@/lib/landrecords/rateLimit";
import { searchParcelsByOwnerOrId } from "@/lib/landrecords/searchParcels";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Unified place search: Mapbox address/POI + LandRecords owner / parcel ID.
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
};

function parseCoordinateQuery(raw: string): { lat: number; lng: number } | null {
  const m = raw.trim().match(/^(-?\d+\.?\d*)\s*[,;]\s*(-?\d+\.?\d*)$/);
  if (!m) return null;
  const lat = parseFloat(m[1]!);
  const lng = parseFloat(m[2]!);
  if (!(lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180)) return null;
  return { lat, lng };
}

function parseProximity(
  raw: string | null
): [number, number] | null {
  if (!raw || !/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(raw)) return null;
  const [lng, lat] = raw.split(",").map(Number) as [number, number];
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  return [lng, lat];
}

async function searchMapbox(
  q: string,
  accessToken: string,
  proximity: [number, number] | null
): Promise<GeocodeSuggestion[]> {
  const url = new URL(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json`
  );
  url.searchParams.set("access_token", accessToken);
  url.searchParams.set("limit", "5");
  url.searchParams.set("country", "us");
  url.searchParams.set("types", "address,poi");
  url.searchParams.set("autocomplete", "true");
  if (proximity) {
    url.searchParams.set("proximity", `${proximity[0]},${proximity[1]}`);
  }

  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) return [];
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
      kind: "address",
    });
  }
  return suggestions;
}

export async function GET(req: Request) {
  const limited = enforceIpRateLimit(req, "geocode", 60, 60);
  if (limited) return limited;

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
          kind: "coord",
        },
      ] satisfies GeocodeSuggestion[],
    });
  }

  const proximity = parseProximity(searchParams.get("proximity"));
  const accessToken = getMapboxToken();
  const hasLandRecords = Boolean(process.env.LANDRECORDS_API_KEY);

  if (!accessToken && !hasLandRecords) {
    return Response.json(
      { error: "Search is not configured." },
      { status: 500 }
    );
  }

  try {
    // Mapbox is usually <300ms; LandRecords WFS can hang. Cap total wait so
    // address results aren't held hostage by owner/APN lookups.
    const TOTAL_BUDGET_MS = 2200;
    const started = Date.now();
    const mapboxPromise = accessToken
      ? searchMapbox(q, accessToken, proximity).catch(() => [])
      : Promise.resolve([] as GeocodeSuggestion[]);
    const parcelsPromise =
      hasLandRecords && q.length >= 3
        ? searchParcelsByOwnerOrId(q, proximity, { timeoutMs: 1800 }).catch(
            () => []
          )
        : Promise.resolve([] as GeocodeSuggestion[]);

    const mapbox = await mapboxPromise;
    const remaining = Math.max(0, TOTAL_BUDGET_MS - (Date.now() - started));
    const parcels = await Promise.race([
      parcelsPromise,
      new Promise<GeocodeSuggestion[]>((resolve) =>
        setTimeout(() => resolve([]), remaining)
      ),
    ]);

    // Owner / APN first, then addresses
    const suggestions = [...parcels, ...mapbox].slice(0, 10);

    return Response.json({ suggestions });
  } catch {
    return Response.json({ error: "Search unavailable" }, { status: 502 });
  }
}
