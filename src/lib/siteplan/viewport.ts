import * as turf from "@turf/turf";
import type { Feature, Polygon, Position } from "geojson";

import type { ParcelSquareSide } from "./types";

const FT = "feet" as const;

export type ParcelEdge = {
  a: Position;
  b: Position;
  mid: Position;
  lengthFt: number;
  /** Geographic bearing of a→b, degrees. */
  bearing: number;
};

export function normalizeBearing(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

export function parcelEdges(poly: Feature<Polygon>): ParcelEdge[] {
  const ring = poly.geometry.coordinates[0];
  if (!ring || ring.length < 2) return [];
  const edges: ParcelEdge[] = [];
  for (let i = 0; i < ring.length - 1; i++) {
    const a = ring[i]!;
    const b = ring[i + 1]!;
    if (a[0] === b[0] && a[1] === b[1]) continue;
    const lengthFt = turf.distance(turf.point(a), turf.point(b), { units: FT });
    if (lengthFt < 1) continue;
    edges.push({
      a,
      b,
      mid: [(a[0]! + b[0]!) / 2, (a[1]! + b[1]!) / 2],
      lengthFt,
      bearing: turf.bearing(turf.point(a), turf.point(b)),
    });
  }
  return edges;
}

/**
 * Pick the best edge for a cardinal side: longest among edges on that side of
 * the centroid, preferring alignment with the corresponding E-W or N-S axis.
 */
export function pickParcelSideEdge(
  poly: Feature<Polygon>,
  side: ParcelSquareSide
): ParcelEdge | null {
  const edges = parcelEdges(poly);
  if (!edges.length) return null;
  const c = turf.centroid(poly).geometry.coordinates as Position;

  let best: { edge: ParcelEdge; score: number } | null = null;
  for (const edge of edges) {
    const dx = edge.mid[0]! - c[0]!;
    const dy = edge.mid[1]! - c[1]!;
    // Alignment: 1 = perfectly E-W or N-S for the requested side
    const absBearing = Math.abs(
      ((edge.bearing % 180) + 180) % 180
    );
    // Distance from E-W (90°) or N-S (0°)
    const ewAlign = 1 - Math.min(Math.abs(absBearing - 90), 90) / 90;
    const nsAlign = 1 - Math.min(Math.min(absBearing, 180 - absBearing), 90) / 90;

    let sideScore = 0;
    let align = 0;
    if (side === "south") {
      sideScore = -dy;
      align = ewAlign;
    } else if (side === "north") {
      sideScore = dy;
      align = ewAlign;
    } else if (side === "east") {
      sideScore = dx;
      align = nsAlign;
    } else {
      sideScore = -dx;
      align = nsAlign;
    }

    // Must be on the correct side of the centroid
    if (sideScore <= 0) continue;
    const score = edge.lengthFt * (0.35 + 0.65 * align) * (1 + sideScore * 1e5);
    if (!best || score > best.score) best = { edge, score };
  }

  // Fallback: longest edge overall if classification failed
  if (!best) {
    return edges.reduce((a, b) => (a.lengthFt >= b.lengthFt ? a : b));
  }
  return best.edge;
}

/**
 * Map bearing so the chosen edge is horizontal and the parcel centroid sits
 * above that edge (selected side toward the bottom of the viewport).
 */
export function bearingToSquareEdgeAtBottom(
  edge: ParcelEdge,
  centroid: Position
): number {
  const toCentroid = turf.bearing(turf.point(edge.mid), turf.point(centroid));
  const candidates = [edge.bearing - 90, edge.bearing + 90];

  for (const mb of candidates) {
    let screenAngle = normalizeBearing(toCentroid - mb);
    if (screenAngle > 180) screenAngle -= 360;
    if (Math.abs(screenAngle) <= 90) return normalizeBearing(mb);
  }
  return normalizeBearing(candidates[0]!);
}

export function computeSquareUpBearing(
  poly: Feature<Polygon>,
  side: ParcelSquareSide
): { bearingDeg: number; edge: ParcelEdge; center: Position } | null {
  const edge = pickParcelSideEdge(poly, side);
  if (!edge) return null;
  const center = turf.centroid(poly).geometry.coordinates as Position;
  return {
    bearingDeg: bearingToSquareEdgeAtBottom(edge, center),
    edge,
    center,
  };
}
