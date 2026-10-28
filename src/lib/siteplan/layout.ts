import * as turf from "@turf/turf";
import type {
  Feature,
  FeatureCollection,
  MultiPolygon,
  Polygon,
  Position,
} from "geojson";

import { newSitePlanId } from "./defaults";
import type {
  LayoutResult,
  SitePlanCorridor,
  SitePlanForm,
  SitePlanPoi,
  SitePlanRow,
  TransmissionSnap,
} from "./solarLegacy";

function planViewRowDepthFt(moduleLengthFt: number, tiltDeg: number): number {
  const tilt = Math.max(0, Math.min(89, tiltDeg));
  return moduleLengthFt * Math.cos((tilt * Math.PI) / 180);
}

const FT = "feet" as const;

function unionPolygons(
  a: Feature<Polygon | MultiPolygon>,
  b: Feature<Polygon | MultiPolygon>
): Feature<Polygon | MultiPolygon> | null {
  try {
    return turf.union(
      turf.featureCollection([a, b]) as FeatureCollection<Polygon | MultiPolygon>
    );
  } catch {
    return a;
  }
}

function asPolygon(
  geom: Feature<Polygon> | Feature | null | undefined
): Feature<Polygon> | null {
  if (!geom || !geom.geometry) return null;
  if (geom.geometry.type === "Polygon") {
    return geom as Feature<Polygon>;
  }
  if (geom.geometry.type === "MultiPolygon") {
    const polys = (geom.geometry.coordinates as Position[][][]).map((coords) =>
      turf.polygon(coords)
    );
    if (!polys.length) return null;
    let unioned: Feature<Polygon | MultiPolygon> | null = polys[0]!;
    for (let i = 1; i < polys.length; i++) {
      unioned = unionPolygons(unioned!, polys[i]!) ?? unioned;
    }
    if (unioned?.geometry?.type === "Polygon") {
      return unioned as Feature<Polygon>;
    }
    if (unioned?.geometry?.type === "MultiPolygon") {
      const first = unioned.geometry.coordinates[0];
      if (first) return turf.polygon(first);
    }
  }
  return null;
}

/** Negative buffer (setback) of the parcel polygon. */
export function buildableArea(
  parcel: Feature<Polygon>,
  setbackFt: number
): Feature<Polygon> | null {
  if (setbackFt <= 0) return asPolygon(parcel);
  try {
    const buffered = turf.buffer(parcel, -setbackFt, { units: FT });
    return asPolygon(buffered as Feature);
  } catch {
    return null;
  }
}

function bearingToOffset(
  lng: number,
  lat: number,
  bearingDeg: number,
  distanceFt: number
): Position {
  const dest = turf.destination(
    turf.point([lng, lat]),
    distanceFt,
    bearingDeg,
    { units: FT }
  );
  return dest.geometry.coordinates as Position;
}

/**
 * Rectangle footprint for one row: length along (azimuth+90), depth along azimuth.
 * Center is the row center; depthFt is plan-view module depth.
 */
function rowRectangle(
  center: Position,
  lengthFt: number,
  depthFt: number,
  azimuthDeg: number
): Feature<Polygon> {
  const halfL = lengthFt / 2;
  const halfD = depthFt / 2;
  const along = azimuthDeg;
  const across = azimuthDeg + 90;
  const c0 = bearingToOffset(center[0]!, center[1]!, across, -halfL);
  const c1 = bearingToOffset(center[0]!, center[1]!, across, halfL);
  const p0 = bearingToOffset(c0[0]!, c0[1]!, along, -halfD);
  const p1 = bearingToOffset(c1[0]!, c1[1]!, along, -halfD);
  const p2 = bearingToOffset(c1[0]!, c1[1]!, along, halfD);
  const p3 = bearingToOffset(c0[0]!, c0[1]!, along, halfD);
  return turf.polygon([[p0, p1, p2, p3, p0]]);
}

function longestChordLengthFt(
  poly: Feature<Polygon>,
  center: Position,
  acrossBearing: number
): number {
  // Sample distances along the across axis until outside the polygon.
  let maxHalf = 0;
  for (const dir of [acrossBearing, acrossBearing + 180]) {
    let lo = 0;
    let hi = 5000;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      const pt = bearingToOffset(center[0]!, center[1]!, dir, mid);
      if (turf.booleanPointInPolygon(turf.point(pt), poly)) {
        lo = mid;
      } else {
        hi = mid;
      }
    }
    maxHalf = Math.max(maxHalf, lo);
  }
  return maxHalf * 2;
}

function clipRowToBuildable(
  row: Feature<Polygon>,
  buildable: Feature<Polygon>
): Feature<Polygon> | null {
  try {
    const inter = turf.intersect(
      turf.featureCollection([row, buildable]) as FeatureCollection<
        Polygon | MultiPolygon
      >
    );
    return asPolygon(inter as Feature | null);
  } catch {
    return null;
  }
}

function corridorStrip(
  center: Position,
  lengthFt: number,
  widthFt: number,
  azimuthDeg: number
): Feature<Polygon> {
  return rowRectangle(center, lengthFt, widthFt, azimuthDeg);
}

/**
 * Pack scaled module rows into the buildable area until target DC kW or space runs out.
 */
export function layoutArray(
  parcel: Feature<Polygon>,
  form: SitePlanForm
): LayoutResult {
  const warnings: string[] = [];
  const depthFt = planViewRowDepthFt(form.moduleLengthFt, form.tiltDeg);
  if (form.rowPitchFt <= depthFt) {
    warnings.push(
      `Row pitch (${form.rowPitchFt} ft) must exceed plan-view row depth (${depthFt.toFixed(1)} ft).`
    );
  }

  const buildable = buildableArea(parcel, form.setbackFt);
  if (!buildable) {
    warnings.push("Setback leaves no buildable area.");
    return {
      rows: [],
      corridors: [],
      totals: {
        moduleCount: 0,
        dcKw: 0,
        acKw: form.inverterKw * form.inverterCount,
      },
      buildable: null,
      warnings,
    };
  }

  const centroid = turf.centroid(buildable);
  const [cx, cy] = centroid.geometry.coordinates as [number, number];
  const azimuth = form.azimuthDeg;
  const across = azimuth + 90;

  // Extent along azimuth (depth axis) via binary search both directions.
  let backFt = 0;
  let frontFt = 0;
  for (const [dir, assign] of [
    [azimuth + 180, (v: number) => (backFt = v)] as const,
    [azimuth, (v: number) => (frontFt = v)] as const,
  ]) {
    let lo = 0;
    let hi = 8000;
    for (let i = 0; i < 28; i++) {
      const mid = (lo + hi) / 2;
      const pt = bearingToOffset(cx, cy, dir, mid);
      if (turf.booleanPointInPolygon(turf.point(pt), buildable)) lo = mid;
      else hi = mid;
    }
    assign(lo);
  }

  const totalDepthFt = backFt + frontFt;
  const startOffset = -backFt + depthFt / 2;
  const gapFt = Math.max(0, form.rowPitchFt - depthFt);
  const group = Math.max(1, Math.round(form.rowsPerFireLaneGroup));

  const rows: SitePlanRow[] = [];
  const corridors: SitePlanCorridor[] = [];
  let moduleCount = 0;
  let dcKw = 0;
  let cursor = startOffset;
  let rowIndexInGroup = 0;
  let safety = 0;

  while (cursor < frontFt - depthFt / 2 && safety < 400) {
    safety += 1;
    if (dcKw >= form.targetDcKw && form.targetDcKw > 0) break;

    const center = bearingToOffset(cx, cy, azimuth, cursor);
    // Probe length at this center
    const probe = turf.point(center);
    if (!turf.booleanPointInPolygon(probe, buildable)) {
      cursor += form.rowPitchFt;
      continue;
    }

    const chordFt = Math.max(
      form.moduleWidthFt,
      longestChordLengthFt(buildable, center, across) - 4
    );
    // Pack a compact block (like a capacity-check sketch) instead of one
    // parcel-spanning mega-row when the lot is much larger than the array.
    const modulesNeeded = Math.max(
      1,
      Math.ceil((form.targetDcKw * 1000) / Math.max(form.moduleWatts, 1))
    );
    const remainingModules = Math.max(1, modulesNeeded - moduleCount);
    const idealPerRow = Math.max(
      4,
      Math.ceil(Math.sqrt(remainingModules))
    );
    const lengthFt = Math.min(
      chordFt,
      idealPerRow * form.moduleWidthFt + form.moduleWidthFt
    );
    const raw = rowRectangle(center, lengthFt, depthFt, azimuth);
    const clipped = clipRowToBuildable(raw, buildable);
    if (!clipped) {
      cursor += form.rowPitchFt;
      continue;
    }

    const areaSqFt = turf.area(clipped) * 10.7639; // m² → ft²
    const moduleArea = form.moduleWidthFt * depthFt;
    const count = Math.max(
      1,
      Math.floor(areaSqFt / Math.max(moduleArea, 0.01))
    );
    const rowDc = (count * form.moduleWatts) / 1000;

    rows.push({
      id: newSitePlanId("row"),
      polygon: clipped,
      moduleCount: count,
      dcKw: Math.round(rowDc * 100) / 100,
    });
    moduleCount += count;
    dcKw += rowDc;

    rowIndexInGroup += 1;
    cursor += form.rowPitchFt;

    // After a group of rows, insert a fire lane gap (and optional corridor strip).
    if (rowIndexInGroup >= group && cursor < frontFt) {
      const laneCenter = bearingToOffset(
        cx,
        cy,
        azimuth,
        cursor - form.rowPitchFt + depthFt / 2 + form.fireLaneWidthFt / 2
      );
      const laneLen = Math.max(
        20,
        longestChordLengthFt(buildable, laneCenter, across)
      );
      const lanePoly = corridorStrip(
        laneCenter,
        laneLen,
        form.fireLaneWidthFt,
        azimuth
      );
      const laneClipped = clipRowToBuildable(lanePoly, buildable);
      if (laneClipped) {
        corridors.push({
          id: newSitePlanId("fl"),
          kind: "firelane",
          widthFt: form.fireLaneWidthFt,
          polygon: laneClipped,
          label: `Firelane (${form.fireLaneWidthFt}ft)`,
        });
      }
      // Extra gap for the fire lane beyond normal pitch
      cursor += Math.max(0, form.fireLaneWidthFt - gapFt);
      rowIndexInGroup = 0;
    }
  }

  if (totalDepthFt < form.rowPitchFt) {
    warnings.push("Parcel is too shallow for the chosen row pitch and setback.");
  }
  if (dcKw < form.targetDcKw * 0.95 && form.targetDcKw > 0) {
    warnings.push(
      `Laid out ${dcKw.toFixed(1)} kW-DC of target ${form.targetDcKw} kW-DC.`
    );
  }

  return {
    rows,
    corridors,
    totals: {
      moduleCount,
      dcKw: Math.round(dcKw * 10) / 10,
      acKw: Math.round(form.inverterKw * form.inverterCount * 10) / 10,
    },
    buildable,
    warnings,
  };
}

/** Buffer a centerline path into a corridor polygon of given width (ft). */
export function corridorFromPath(
  from: Position,
  to: Position,
  widthFt: number,
  kind: SitePlanCorridor["kind"]
): SitePlanCorridor {
  const line = turf.lineString([from, to]);
  const buffered = turf.buffer(line, widthFt / 2, { units: FT });
  const poly =
    asPolygon(buffered as Feature) ??
    turf.polygon([
      [
        from,
        to,
        [to[0]! + 0.00001, to[1]!],
        [from[0]! + 0.00001, from[1]!],
        from,
      ],
    ]);
  const distFt = turf.distance(turf.point(from), turf.point(to), {
    units: FT,
  });
  return {
    id: newSitePlanId(kind === "firelane" ? "fl" : "pc"),
    kind,
    widthFt,
    polygon: poly,
    label:
      kind === "firelane"
        ? `Firelane (${widthFt}ft)`
        : `Power Corridor (${widthFt}ft) · ~${Math.round(distFt)}ft`,
  };
}

export function nearestArrayEdgePoint(
  rows: SitePlanRow[],
  target: Position
): Position | null {
  if (!rows.length) return null;
  const targetPt = turf.point(target);
  let best: Position | null = null;
  let bestDist = Infinity;
  for (const row of rows) {
    const coords = row.polygon.geometry.coordinates[0] ?? [];
    for (const c of coords) {
      const d = turf.distance(targetPt, turf.point(c), { units: FT });
      if (d < bestDist) {
        bestDist = d;
        best = c as Position;
      }
    }
    try {
      const nearest = turf.nearestPointOnLine(
        turf.polygonToLine(row.polygon) as ReturnType<typeof turf.lineString>,
        targetPt,
        { units: FT }
      );
      const d = nearest.properties.dist ?? Infinity;
      if (d < bestDist) {
        bestDist = d;
        best = nearest.geometry.coordinates as Position;
      }
    } catch {
      /* skip */
    }
  }
  return best;
}

export function buildPoi(
  rows: SitePlanRow[],
  form: SitePlanForm,
  lng: number,
  lat: number,
  snap: TransmissionSnap | null
): SitePlanPoi {
  const poiPos: Position = [lng, lat];
  const edge = nearestArrayEdgePoint(rows, poiPos);
  const from = edge ?? poiPos;
  const distFt = edge
    ? turf.distance(turf.point(from), turf.point(poiPos), { units: FT })
    : null;
  const corridor =
    edge && distFt != null && distFt > 1
      ? corridorFromPath(from, poiPos, form.corridorWidthFt, "power")
      : null;

  let description = form.poiDescription;
  if (snap?.voltageKv != null && snap.voltageKv > 0) {
    description = `${snap.voltageKv}kV Overhead Line`;
  }

  return {
    lng,
    lat,
    description,
    snappedVoltageKv: snap?.voltageKv ?? null,
    distanceFt: distFt != null ? Math.round(distFt) : null,
    corridor,
  };
}

/**
 * Snap a click to the nearest transmission line within maxFt.
 * Lines should be LineString features with optional `voltage` property (kV).
 */
export function snapToTransmission(
  lng: number,
  lat: number,
  lines: Feature[],
  maxFt = 200
): TransmissionSnap | null {
  const pt = turf.point([lng, lat]);
  let best: TransmissionSnap | null = null;

  for (const f of lines) {
    if (!f.geometry) continue;
    const geoms: Feature[] = [];
    if (f.geometry.type === "LineString") {
      geoms.push(f);
    } else if (f.geometry.type === "MultiLineString") {
      for (const coords of f.geometry.coordinates) {
        geoms.push(turf.lineString(coords, f.properties ?? {}));
      }
    } else {
      continue;
    }

    for (const g of geoms) {
      try {
        const nearest = turf.nearestPointOnLine(
          g as ReturnType<typeof turf.lineString>,
          pt,
          { units: FT }
        );
        const dist = nearest.properties.dist ?? Infinity;
        if (dist > maxFt) continue;
        if (best && dist >= best.distanceFt) continue;
        const voltage =
          typeof f.properties?.voltage === "number"
            ? f.properties.voltage
            : typeof f.properties?.VOLTAGE === "number"
              ? f.properties.VOLTAGE
              : null;
        best = {
          lng: nearest.geometry.coordinates[0]!,
          lat: nearest.geometry.coordinates[1]!,
          voltageKv: voltage,
          distanceFt: dist,
        };
      } catch {
        /* skip */
      }
    }
  }
  return best;
}

/** Translate all row/corridor polygons by lng/lat delta. */
export function translateLayout(
  rows: SitePlanRow[],
  corridors: SitePlanCorridor[],
  dx: number,
  dy: number
): { rows: SitePlanRow[]; corridors: SitePlanCorridor[] } {
  if (dx === 0 && dy === 0) return { rows, corridors };
  const shift = (poly: Feature<Polygon>): Feature<Polygon> => {
    const moved = turf.transformTranslate(
      poly,
      turf.distance(
        turf.point([0, 0]),
        turf.point([dx, dy]),
        { units: FT }
      ),
      turf.bearing(turf.point([0, 0]), turf.point([dx, dy])),
      { units: FT }
    );
    // transformTranslate with bearing from (0,0) is wrong for lon/lat deltas.
    // Apply a simple coordinate shift instead.
    void moved;
    return {
      ...poly,
      geometry: {
        type: "Polygon",
        coordinates: poly.geometry.coordinates.map((ring) =>
          ring.map((c) => [c[0]! + dx, c[1]! + dy] as Position)
        ),
      },
    };
  };
  return {
    rows: rows.map((r) => ({ ...r, polygon: shift(r.polygon) })),
    corridors: corridors.map((c) => ({ ...c, polygon: shift(c.polygon) })),
  };
}

/** Rotate layout around centroid by additional degrees. */
export function rotateLayout(
  rows: SitePlanRow[],
  corridors: SitePlanCorridor[],
  angleDeg: number
): { rows: SitePlanRow[]; corridors: SitePlanCorridor[] } {
  if (!angleDeg || !rows.length) return { rows, corridors };
  const fc = turf.featureCollection(rows.map((r) => r.polygon));
  const center = turf.centroid(fc);
  const pivot = center.geometry.coordinates as [number, number];
  const rot = (poly: Feature<Polygon>) =>
    turf.transformRotate(poly, angleDeg, { pivot }) as Feature<Polygon>;
  return {
    rows: rows.map((r) => ({ ...r, polygon: rot(r.polygon) })),
    corridors: corridors.map((c) => ({ ...c, polygon: rot(c.polygon) })),
  };
}
