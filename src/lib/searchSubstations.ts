import type { FeatureCollection, Point } from "geojson";
import type { GeocodeSuggestion } from "@/lib/geocode";
import type { SubstationProperties } from "@/lib/types";

type SubsFC = FeatureCollection<Point, SubstationProperties>;

type IndexedSub = {
  id: string;
  idLower: string;
  name: string;
  nameLower: string;
  isUnknown: boolean;
  cityLower: string;
  countyLower: string;
  cityStateLower: string;
  countyStateLower: string;
  lng: number;
  lat: number;
  score: number;
  place: string;
  volts: string | null;
};

const indexCache = new WeakMap<SubsFC, IndexedSub[]>();

function buildIndex(data: SubsFC): IndexedSub[] {
  const cached = indexCache.get(data);
  if (cached) return cached;

  const out: IndexedSub[] = [];
  for (const f of data.features) {
    const p = f.properties;
    const lng = p.longitude;
    const lat = p.latitude;
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;

    const name = (p.name || "").trim();
    const city = (p.city || "").trim();
    const county = (p.county || "").trim();
    const state = (p.state || "").trim();
    const id = String(p.id ?? "");

    out.push({
      id,
      idLower: id.toLowerCase(),
      name,
      nameLower: name.toLowerCase(),
      isUnknown: /^unknown/i.test(name),
      cityLower: city.toLowerCase(),
      countyLower: county.toLowerCase(),
      cityStateLower: `${city}, ${state}`.toLowerCase(),
      countyStateLower: `${county}, ${state}`.toLowerCase(),
      lng,
      lat,
      score: p.opportunityScore ?? 0,
      place: [city, county, state].filter(Boolean).join(", "),
      volts: p.maxVolt > 0 ? `${Math.round(p.maxVolt)} kV` : null,
    });
  }

  indexCache.set(data, out);
  return out;
}

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

  const indexed = buildIndex(data);

  type Ranked = {
    suggestion: GeocodeSuggestion;
    rank: number;
    dist: number;
    score: number;
  };

  const hits: Ranked[] = [];

  for (let i = 0; i < indexed.length; i++) {
    const s = indexed[i]!;

    let rank = -1;
    if (s.id && s.idLower === q) rank = 0;
    else if (s.nameLower === q) rank = 1;
    else if (s.nameLower.startsWith(q)) rank = 2;
    else if (!s.isUnknown && s.nameLower.includes(q)) rank = 3;
    else if (s.cityLower.startsWith(q) || s.cityLower === q) rank = 4;
    else if (s.countyLower.startsWith(q)) rank = 5;
    else if (
      s.cityLower.includes(q) ||
      s.countyLower.includes(q) ||
      s.cityStateLower.includes(q) ||
      s.countyStateLower.includes(q)
    ) {
      rank = 6;
    } else if (s.isUnknown && s.id.includes(q)) {
      rank = 7;
    }

    if (rank < 0) continue;

    const scoreLabel =
      typeof s.score === "number" ? `Score ${s.score.toFixed(1)}` : null;

    hits.push({
      rank,
      dist:
        proximity != null
          ? haversineMiles(proximity[0], proximity[1], s.lng, s.lat)
          : Number.POSITIVE_INFINITY,
      score: s.score,
      suggestion: {
        id: `sub-${s.id}`,
        label: s.name || `Substation ${s.id}`,
        subtitle: [s.place, s.volts, scoreLabel].filter(Boolean).join(" · "),
        lng: s.lng,
        lat: s.lat,
        kind: "substation",
        substationId: s.id,
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
