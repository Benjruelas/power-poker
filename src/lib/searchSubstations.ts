import type { FeatureCollection, Point } from "geojson";
import type { GeocodeSuggestion } from "@/lib/geocode";
import type { SubstationProperties } from "@/lib/types";

type SubsFC = FeatureCollection<Point, SubstationProperties>;

function haversineMiles(
  lng1: number,
  lat1: number,
  lng2: number,
  lat2: number
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 3958.8;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Client-side substation autocomplete against already-loaded GeoJSON.
 */
export function searchSubstations(
  rawQuery: string,
  data: SubsFC | null | undefined,
  proximity: [number, number] | null = null,
  limit = 6
): GeocodeSuggestion[] {
  const q = rawQuery.trim().toLowerCase();
  if (!data || q.length < 2) return [];

  type Ranked = {
    suggestion: GeocodeSuggestion;
    rank: number;
    dist: number;
    score: number;
  };

  const hits: Ranked[] = [];

  for (const f of data.features) {
    const p = f.properties;
    const name = (p.name || "").trim();
    const nameLower = name.toLowerCase();
    const city = (p.city || "").trim();
    const county = (p.county || "").trim();
    const state = (p.state || "").trim();
    const id = String(p.id ?? "");
    const isUnknown = /^unknown/i.test(name);

    let rank = -1;
    if (id && id.toLowerCase() === q) rank = 0;
    else if (nameLower === q) rank = 1;
    else if (nameLower.startsWith(q)) rank = 2;
    else if (!isUnknown && nameLower.includes(q)) rank = 3;
    else if (city.toLowerCase().startsWith(q) || city.toLowerCase() === q)
      rank = 4;
    else if (county.toLowerCase().startsWith(q)) rank = 5;
    else if (
      city.toLowerCase().includes(q) ||
      county.toLowerCase().includes(q) ||
      `${city}, ${state}`.toLowerCase().includes(q) ||
      `${county}, ${state}`.toLowerCase().includes(q)
    ) {
      rank = 6;
    } else if (isUnknown && id.includes(q)) {
      rank = 7;
    }

    if (rank < 0) continue;

    const lng = p.longitude;
    const lat = p.latitude;
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;

    const place = [city, county, state].filter(Boolean).join(", ");
    const volts =
      p.maxVolt > 0 ? `${Math.round(p.maxVolt)} kV` : null;
    const scoreLabel =
      typeof p.opportunityScore === "number"
        ? `Score ${p.opportunityScore.toFixed(1)}`
        : null;

    hits.push({
      rank,
      dist:
        proximity != null
          ? haversineMiles(proximity[0], proximity[1], lng, lat)
          : Number.POSITIVE_INFINITY,
      score: p.opportunityScore ?? 0,
      suggestion: {
        id: `sub-${id}`,
        label: name || `Substation ${id}`,
        subtitle: [place, volts, scoreLabel].filter(Boolean).join(" · "),
        lng,
        lat,
        kind: "substation",
        substationId: id,
      },
    });
  }

  hits.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    if (proximity && a.dist !== b.dist) return a.dist - b.dist;
    return b.score - a.score;
  });

  return hits.slice(0, limit).map((h) => h.suggestion);
}
