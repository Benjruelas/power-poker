import * as turf from "@turf/turf";
import type {
  Feature,
  Geometry,
  LineString,
  Point,
  Polygon,
  Position,
} from "geojson";

import { newSitePlanId } from "./defaults";
import type {
  FreeLabel,
  LegendRow,
  ObjectShape,
  ObjectType,
  SitePlanDocument,
  SitePlanInstance,
} from "./types";

const FT = "feet" as const;

export function bearingToOffset(
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

/** Axis-aligned (then rotated) rectangle centered at lng/lat. */
export function rectanglePolygon(
  lng: number,
  lat: number,
  widthFt: number,
  heightFt: number,
  rotationDeg = 0
): Feature<Polygon> {
  const halfW = widthFt / 2;
  const halfH = heightFt / 2;
  // Local frame: +height along rotation bearing (north when 0), +width to the east of that
  const along = rotationDeg;
  const across = rotationDeg + 90;
  const c0 = bearingToOffset(lng, lat, across, -halfW);
  const c1 = bearingToOffset(lng, lat, across, halfW);
  const p0 = bearingToOffset(c0[0]!, c0[1]!, along, -halfH);
  const p1 = bearingToOffset(c1[0]!, c1[1]!, along, -halfH);
  const p2 = bearingToOffset(c1[0]!, c1[1]!, along, halfH);
  const p3 = bearingToOffset(c0[0]!, c0[1]!, along, halfH);
  return turf.polygon([[p0, p1, p2, p3, p0]]);
}

/** Circle approximated as polygon; radiusFt = max(width,height)/2 when from drag. */
export function circlePolygon(
  lng: number,
  lat: number,
  radiusFt: number,
  steps = 48
): Feature<Polygon> {
  return turf.circle(turf.point([lng, lat]), radiusFt, {
    units: FT,
    steps,
  }) as Feature<Polygon>;
}

/**
 * Snap candidate so the segment from `prev` is horizontal or vertical
 * in the **current map view** (not geographic north).
 */
export function orthoSnapViewAligned(
  map: {
    project: (lngLat: [number, number]) => { x: number; y: number };
    unproject: (point: [number, number]) => { lng: number; lat: number };
  },
  prev: Position,
  candidate: Position
): Position {
  const p0 = map.project([prev[0]!, prev[1]!]);
  const p1 = map.project([candidate[0]!, candidate[1]!]);
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    const ll = map.unproject([p0.x + dx, p0.y]);
    return [ll.lng, ll.lat];
  }
  const ll = map.unproject([p0.x, p0.y + dy]);
  return [ll.lng, ll.lat];
}

/**
 * Constrain opposite corner so the AABB is a square in feet,
 * keeping the drag quadrant from a → b (north-aligned). Prefer
 * viewAlignedDrawFromScreen for viewport-relative drawing.
 */
export function constrainCornerToSquare(a: Position, b: Position): Position {
  const widthFt = turf.distance(
    turf.point([a[0]!, a[1]!]),
    turf.point([b[0]!, a[1]!]),
    { units: FT }
  );
  const heightFt = turf.distance(
    turf.point([a[0]!, a[1]!]),
    turf.point([a[0]!, b[1]!]),
    { units: FT }
  );
  const side = Math.max(widthFt, heightFt, 0.5);
  const signX = b[0]! >= a[0]! ? 1 : -1;
  const signY = b[1]! >= a[1]! ? 1 : -1;
  const alongX = bearingToOffset(a[0]!, a[1]!, signX >= 0 ? 90 : 270, side);
  return bearingToOffset(alongX[0]!, alongX[1]!, signY >= 0 ? 0 : 180, side);
}

export type ViewAlignedDraw = {
  shape: "rectangle" | "circle";
  geometry: Polygon;
  widthFt: number;
  heightFt: number;
  /** Map bearing when drawn — keeps the shape level with the view. */
  rotationDeg: number;
};

type ScreenProjector = {
  project: (lngLat: [number, number]) => { x: number; y: number };
  unproject: (point: [number, number]) => { lng: number; lat: number };
  getBearing: () => number;
};

/**
 * Build a rect/circle from two drag corners in **screen / view** space so the
 * shape stays level with the user's rotated viewport (not forced north-up).
 */
export function viewAlignedDrawFromScreen(
  map: ScreenProjector,
  a: Position,
  b: Position,
  opts: { shape: "rectangle" | "circle"; square?: boolean }
): ViewAlignedDraw {
  const pa = map.project([a[0]!, a[1]!]);
  const pb = map.project([b[0]!, b[1]!]);
  let x0 = pa.x;
  let y0 = pa.y;
  let x1 = pb.x;
  let y1 = pb.y;

  const lockSquare = Boolean(opts.square) || opts.shape === "circle";
  if (lockSquare) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const side = Math.max(Math.abs(dx), Math.abs(dy), 1);
    x1 = x0 + (dx === 0 ? side : Math.sign(dx) * side);
    y1 = y0 + (dy === 0 ? side : Math.sign(dy) * side);
  }

  const minX = Math.min(x0, x1);
  const maxX = Math.max(x0, x1);
  const minY = Math.min(y0, y1);
  const maxY = Math.max(y0, y1);
  const bearing = map.getBearing();

  if (opts.shape === "circle") {
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const r = Math.max((maxX - minX) / 2, (maxY - minY) / 2, 1);
    const center = map.unproject([cx, cy]);
    const edge = map.unproject([cx + r, cy]);
    const radiusFt = Math.max(
      turf.distance(
        turf.point([center.lng, center.lat]),
        turf.point([edge.lng, edge.lat]),
        { units: FT }
      ),
      0.5
    );
    const diameter = radiusFt * 2;
    return {
      shape: "circle",
      geometry: circlePolygon(center.lng, center.lat, radiusFt).geometry,
      widthFt: diameter,
      heightFt: diameter,
      rotationDeg: bearing,
    };
  }

  const c00 = map.unproject([minX, minY]);
  const c10 = map.unproject([maxX, minY]);
  const c11 = map.unproject([maxX, maxY]);
  const c01 = map.unproject([minX, maxY]);
  const ring: Position[] = [
    [c00.lng, c00.lat],
    [c10.lng, c10.lat],
    [c11.lng, c11.lat],
    [c01.lng, c01.lat],
    [c00.lng, c00.lat],
  ];
  const widthFt = Math.max(
    turf.distance(
      turf.point([c00.lng, c00.lat]),
      turf.point([c10.lng, c10.lat]),
      { units: FT }
    ),
    0.5
  );
  const heightFt = Math.max(
    turf.distance(
      turf.point([c00.lng, c00.lat]),
      turf.point([c01.lng, c01.lat]),
      { units: FT }
    ),
    0.5
  );

  return {
    shape: "rectangle",
    geometry: { type: "Polygon", coordinates: [ring] },
    widthFt,
    heightFt,
    rotationDeg: bearing,
  };
}

/** Rectangle from two opposite corners (lng/lat). */
export function rectangleFromCorners(
  a: Position,
  b: Position,
  rotationDeg = 0
): { polygon: Feature<Polygon>; widthFt: number; heightFt: number; center: Position } {
  if (rotationDeg === 0) {
    const mid: Position = [(a[0]! + b[0]!) / 2, (a[1]! + b[1]!) / 2];
    const widthFt = turf.distance(
      turf.point([a[0]!, mid[1]!]),
      turf.point([b[0]!, mid[1]!]),
      { units: FT }
    );
    const heightFt = turf.distance(
      turf.point([mid[0]!, a[1]!]),
      turf.point([mid[0]!, b[1]!]),
      { units: FT }
    );
    const w = Math.max(widthFt, 0.5);
    const h = Math.max(heightFt, 0.5);
    return {
      polygon: rectanglePolygon(mid[0]!, mid[1]!, w, h, 0),
      widthFt: w,
      heightFt: h,
      center: mid,
    };
  }
  // Rotate B into local frame of A at rotationDeg, then build AABB in that frame
  const mid: Position = [(a[0]! + b[0]!) / 2, (a[1]! + b[1]!) / 2];
  const dist = turf.distance(turf.point(a), turf.point(b), { units: FT });
  const bearing = turf.bearing(turf.point(a), turf.point(b));
  const localBearing = bearing - rotationDeg;
  const dx = dist * Math.sin((localBearing * Math.PI) / 180);
  const dy = dist * Math.cos((localBearing * Math.PI) / 180);
  const w = Math.max(Math.abs(dx), 0.5);
  const h = Math.max(Math.abs(dy), 0.5);
  return {
    polygon: rectanglePolygon(mid[0]!, mid[1]!, w, h, rotationDeg),
    widthFt: w,
    heightFt: h,
    center: mid,
  };
}

/**
 * Snap a candidate point so the segment from `prev` is horizontal or vertical
 * in a local feet frame (ortho / 90° turns).
 */
export function orthoSnapPoint(prev: Position, candidate: Position): Position {
  const eastFt = turf.distance(
    turf.point(prev),
    turf.point([candidate[0]!, prev[1]!]),
    { units: FT }
  );
  const northFt = turf.distance(
    turf.point(prev),
    turf.point([prev[0]!, candidate[1]!]),
    { units: FT }
  );
  const eastSign = candidate[0]! >= prev[0]! ? 1 : -1;
  const northSign = candidate[1]! >= prev[1]! ? 1 : -1;
  if (eastFt >= northFt) {
    return bearingToOffset(prev[0]!, prev[1]!, 90 * eastSign, eastFt);
  }
  return bearingToOffset(prev[0]!, prev[1]!, northSign >= 0 ? 0 : 180, northFt);
}

export function translateGeometry(
  geometry: Geometry,
  dxLng: number,
  dyLat: number
): Geometry {
  const shift = (c: Position): Position => [c[0]! + dxLng, c[1]! + dyLat];
  if (geometry.type === "Point") {
    return { type: "Point", coordinates: shift(geometry.coordinates as Position) };
  }
  if (geometry.type === "LineString") {
    return {
      type: "LineString",
      coordinates: (geometry.coordinates as Position[]).map(shift),
    };
  }
  if (geometry.type === "Polygon") {
    return {
      type: "Polygon",
      coordinates: (geometry.coordinates as Position[][]).map((ring) =>
        ring.map(shift)
      ),
    };
  }
  return geometry;
}

function mapPositions(
  geometry: Geometry,
  fn: (c: Position) => Position
): Geometry {
  if (geometry.type === "Point") {
    return { type: "Point", coordinates: fn(geometry.coordinates as Position) };
  }
  if (geometry.type === "LineString") {
    return {
      type: "LineString",
      coordinates: (geometry.coordinates as Position[]).map(fn),
    };
  }
  if (geometry.type === "Polygon") {
    return {
      type: "Polygon",
      coordinates: (geometry.coordinates as Position[][]).map((ring) =>
        ring.map(fn)
      ),
    };
  }
  return geometry;
}

/**
 * Mirror geometry across a vertical (horizontal flip) or horizontal
 * (vertical flip) axis through `center`.
 */
export function flipGeometry(
  geometry: Geometry,
  center: Position,
  axis: "horizontal" | "vertical"
): Geometry {
  const cx = center[0]!;
  const cy = center[1]!;
  if (axis === "horizontal") {
    // Left ↔ right (reflect over vertical line)
    return mapPositions(geometry, (c) => [2 * cx - c[0]!, c[1]!]);
  }
  // Up ↔ down (reflect over horizontal line)
  return mapPositions(geometry, (c) => [c[0]!, 2 * cy - c[1]!]);
}

/** Combined centroid of many geometries (for group pivots). */
export function geometriesCentroid(geometries: Geometry[]): Position {
  const pts: Position[] = [];
  for (const g of geometries) {
    pts.push(geometryCentroid(g));
  }
  if (!pts.length) return [0, 0];
  const lng = pts.reduce((s, p) => s + p[0]!, 0) / pts.length;
  const lat = pts.reduce((s, p) => s + p[1]!, 0) / pts.length;
  return [lng, lat];
}

export type GeometryBounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  cx: number;
  cy: number;
};

function collectGeomPositions(geometry: Geometry): Position[] {
  if (geometry.type === "Point") return [geometry.coordinates as Position];
  if (geometry.type === "LineString") {
    return geometry.coordinates as Position[];
  }
  if (geometry.type === "Polygon") {
    return (geometry.coordinates[0] ?? []) as Position[];
  }
  return [];
}

/** Axis-aligned lng/lat bounds + center for a geometry. */
export function geometryBounds(geometry: Geometry): GeometryBounds {
  const pts = collectGeomPositions(geometry);
  if (!pts.length) {
    const c = geometryCentroid(geometry);
    return { minX: c[0]!, maxX: c[0]!, minY: c[1]!, maxY: c[1]!, cx: c[0]!, cy: c[1]! };
  }
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p[0]!);
    maxX = Math.max(maxX, p[0]!);
    minY = Math.min(minY, p[1]!);
    maxY = Math.max(maxY, p[1]!);
  }
  return {
    minX,
    maxX,
    minY,
    maxY,
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
  };
}

export function rotateGeometryAround(
  geometry: Geometry,
  pivot: Position,
  angleDeg: number
): Geometry {
  if (!angleDeg) return geometry;
  const f = turf.feature(geometry);
  const rotated = turf.transformRotate(f, angleDeg, {
    pivot: pivot as [number, number],
  });
  return rotated.geometry as Geometry;
}

export function geometryCentroid(geometry: Geometry): Position {
  try {
    const c = turf.centroid(turf.feature(geometry));
    return c.geometry.coordinates as Position;
  } catch {
    if (geometry.type === "Point") return geometry.coordinates as Position;
    return [0, 0];
  }
}

export function instanceLabelText(
  inst: SitePlanInstance,
  type: ObjectType | undefined
): string {
  if (inst.labelOverride != null && inst.labelOverride !== "") {
    return inst.labelOverride;
  }
  return type?.name ?? "Object";
}

/** Resolved label plate colors; null background = halo text (no fill). */
export function resolveInstanceLabelStyle(
  inst: SitePlanInstance,
  type: ObjectType | undefined
): { backgroundColor: string | null; color: string } {
  const bg =
    inst.labelBackgroundColor ?? type?.labelBackgroundColor ?? null;
  const color =
    inst.labelColor ?? type?.labelColor ?? (bg ? "#0f172a" : "#f8fafc");
  return {
    backgroundColor: bg && bg !== "transparent" ? bg : null,
    color,
  };
}

/** MapLibre fill-color rejects "transparent"; normalize for paint. */
export function mapFillColor(fill: string | undefined | null): string {
  if (!fill || fill === "transparent") return "rgba(0,0,0,0)";
  return fill;
}

export function resolveInstanceStyle(
  inst: SitePlanInstance,
  type: ObjectType | undefined
): {
  fill: string;
  stroke: string;
  strokeWidth: number;
  dashed: boolean;
  dashColor: string;
  borderColor: string;
  borderWidth: number;
} {
  const base = type
    ? {
        fill: type.fill,
        stroke: type.stroke,
        strokeWidth: type.strokeWidth,
        dashed: Boolean(type.dashed),
        dashColor: type.dashColor,
        borderColor: type.borderColor,
        borderWidth: type.borderWidth,
      }
    : {
        fill: "#facc15",
        stroke: "#854d0e",
        strokeWidth: 2,
        dashed: false,
        dashColor: undefined as string | undefined,
        borderColor: undefined as string | undefined,
        borderWidth: undefined as number | undefined,
      };
  const merged = { ...base, ...(inst.styleOverride || {}) };
  const stroke = merged.stroke;
  // Dotted and solid share the same stroke color (no separate dash tint)
  return {
    fill: mapFillColor(merged.fill),
    stroke,
    strokeWidth: merged.strokeWidth,
    dashed: Boolean(merged.dashed),
    dashColor: stroke,
    borderColor: merged.borderColor || stroke,
    borderWidth:
      merged.borderWidth != null && Number.isFinite(merged.borderWidth)
        ? Math.max(0, merged.borderWidth)
        : merged.strokeWidth,
  };
}

/** To-scale line weight in feet (instance overrides type). */
export function resolveLineWidthFt(
  inst: SitePlanInstance,
  type: ObjectType | undefined
): number | null {
  const w = inst.widthFt ?? type?.widthFt ?? null;
  if (w == null || !Number.isFinite(w) || w <= 0) return null;
  return w;
}

/** Buffer a centerline to a true-scale corridor polygon. */
export function bufferLineWidthFt(
  geometry: LineString,
  widthFt: number
): Feature<Polygon> | null {
  if (widthFt <= 0) return null;
  try {
    const buffered = turf.buffer(turf.feature(geometry), widthFt / 2, {
      units: FT,
      steps: 8,
    });
    if (!buffered?.geometry) return null;
    if (buffered.geometry.type === "Polygon") {
      return buffered as Feature<Polygon>;
    }
    if (buffered.geometry.type === "MultiPolygon") {
      const first = buffered.geometry.coordinates[0];
      if (!first) return null;
      return turf.polygon(first);
    }
  } catch {
    /* skip */
  }
  return null;
}

/**
 * True-scale dotted corridor: buffer dash segments along the centerline
 * (MapLibre can't dash a fill, so we cut the width into on/off chunks).
 */
export function bufferDashedLineWidthFt(
  geometry: LineString,
  widthFt: number,
  dashFt?: number,
  gapFt?: number
): Feature<Polygon>[] {
  if (widthFt <= 0) return [];
  const on = dashFt ?? Math.max(widthFt * 1.1, 3.5);
  const off = gapFt ?? Math.max(widthFt * 0.85, 2.5);
  try {
    const line = turf.feature(geometry);
    const total = turf.length(line, { units: FT });
    if (!(total > 0)) return [];
    const out: Feature<Polygon>[] = [];
    let d = 0;
    while (d < total) {
      const end = Math.min(d + on, total);
      if (end - d >= 0.35) {
        const slice = turf.lineSliceAlong(line, d, end, { units: FT });
        if (slice?.geometry?.type === "LineString") {
          const buffered = bufferLineWidthFt(slice.geometry, widthFt);
          if (buffered) out.push(buffered);
        }
      }
      d += on + off;
    }
    return out;
  } catch {
    return [];
  }
}

function legendSizeLabel(
  shape: ObjectShape,
  widthFt: number | null | undefined,
  heightFt: number | null | undefined,
  dashed?: boolean
): string | null {
  const ft2 = (n: number) => (Math.round(n * 100) / 100).toFixed(2);
  if (shape === "line" || shape === "polyline") {
    if (widthFt != null) {
      return `${ft2(widthFt)} ft wide${dashed ? " · dotted" : ""}`;
    }
    return dashed ? "dotted" : null;
  }
  if (widthFt != null && heightFt != null) {
    return `${ft2(widthFt)}×${ft2(heightFt)} ft`;
  }
  return null;
}

function shapeFromInstanceGeometry(
  geometry: SitePlanInstance["geometry"]
): ObjectShape {
  if (geometry.type === "LineString") {
    return geometry.coordinates.length > 2 ? "polyline" : "line";
  }
  if (geometry.type === "Polygon") return "rectangle";
  if (geometry.type === "Point") return "circle";
  return "polygon";
}

function legendSubtitleLine(
  explicit: string | null | undefined,
  sizeLabel: string | null
): string | null {
  const sub = explicit?.trim() || "";
  if (sub && sizeLabel) return `${sub} · ${sizeLabel}`;
  if (sub) return sub;
  return sizeLabel;
}

export function buildLegend(doc: SitePlanDocument): LegendRow[] {
  const counts = new Map<string, number>();
  for (const inst of doc.instances) {
    if (!inst.typeId) continue;
    counts.set(inst.typeId, (counts.get(inst.typeId) || 0) + 1);
  }
  const rows: LegendRow[] = [];
  for (const t of doc.objectTypes) {
    if (!t.legend) continue;
    const count = counts.get(t.id) || 0;
    if (count === 0) continue;
    const sizeLabel = legendSizeLabel(t.shape, t.widthFt, t.heightFt, t.dashed);
    const title = t.name;
    const subtitle = legendSubtitleLine(t.legendSubtitle, sizeLabel);
    rows.push({
      typeId: t.id,
      name: title,
      title,
      subtitle,
      fill: t.fill,
      stroke: t.stroke,
      strokeWidth: t.strokeWidth,
      dashed: t.dashed,
      dashColor: t.dashColor,
      borderColor: t.borderColor,
      borderWidth: t.borderWidth,
      shape: t.shape,
      sizeLabel,
      count,
    });
  }

  // Freehand / instance-level legend entries (no library type required)
  type FhBucket = {
    key: string;
    title: string;
    subtitle: string | null;
    style: ReturnType<typeof resolveInstanceStyle>;
    shape: ObjectShape;
    widthFt: number | null;
    heightFt: number | null;
    count: number;
  };
  const freehand = new Map<string, FhBucket>();
  for (const inst of doc.instances) {
    if (!inst.legend) continue;
    // Typed items already covered when their type.legend is on
    if (inst.typeId) {
      const t = doc.objectTypes.find((x) => x.id === inst.typeId);
      if (t?.legend) continue;
    }
    const type = inst.typeId
      ? doc.objectTypes.find((t) => t.id === inst.typeId)
      : undefined;
    const style = resolveInstanceStyle(inst, type);
    const shape = type?.shape ?? shapeFromInstanceGeometry(inst.geometry);
    const title =
      inst.legendTitle?.trim() ||
      inst.labelOverride?.trim() ||
      type?.name?.trim() ||
      "Untitled object";
    const w = inst.widthFt ?? type?.widthFt ?? null;
    const h = inst.heightFt ?? type?.heightFt ?? null;
    const sizeLabel = legendSizeLabel(shape, w, h, style.dashed);
    const subtitle = legendSubtitleLine(
      inst.legendSubtitle ?? type?.legendSubtitle,
      sizeLabel
    );
    const key = [
      title,
      subtitle ?? "",
      shape,
      style.fill,
      style.stroke,
      style.dashed ? "1" : "0",
      w ?? "",
      h ?? "",
    ].join("|");
    const existing = freehand.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      freehand.set(key, {
        key: `fh:${key}`,
        title,
        subtitle,
        style,
        shape,
        widthFt: w,
        heightFt: h,
        count: 1,
      });
    }
  }
  for (const bucket of freehand.values()) {
    const sizeLabel = legendSizeLabel(
      bucket.shape,
      bucket.widthFt,
      bucket.heightFt,
      bucket.style.dashed
    );
    rows.push({
      typeId: bucket.key,
      name: bucket.title,
      title: bucket.title,
      subtitle: bucket.subtitle,
      fill: bucket.style.fill,
      stroke: bucket.style.stroke,
      strokeWidth: bucket.style.strokeWidth,
      dashed: bucket.style.dashed,
      dashColor: bucket.style.dashColor,
      borderColor: bucket.style.borderColor,
      borderWidth: bucket.style.borderWidth,
      shape: bucket.shape,
      sizeLabel,
      count: bucket.count,
    });
  }

  return rows;
}

export function shapeLabel(shape: ObjectShape): string {
  switch (shape) {
    case "rectangle":
      return "Rectangle";
    case "circle":
      return "Circle";
    case "polygon":
      return "Polygon";
    case "line":
      return "Line";
    case "polyline":
      return "Polyline";
    default:
      return shape;
  }
}

export function placeTypedRectangle(
  type: ObjectType,
  lng: number,
  lat: number,
  opts?: {
    widthFt?: number;
    heightFt?: number;
    rotationDeg?: number;
    showLabel?: boolean;
  }
): SitePlanInstance {
  const w = opts?.widthFt ?? type.widthFt ?? 40;
  const h = opts?.heightFt ?? type.heightFt ?? 40;
  const rot = opts?.rotationDeg ?? 0;
  const poly =
    type.shape === "circle"
      ? circlePolygon(lng, lat, Math.max(w, h) / 2)
      : rectanglePolygon(lng, lat, w, h, rot);
  return {
    id: newSitePlanId("in"),
    typeId: type.id,
    geometry: poly.geometry,
    rotationDeg: rot,
    widthFt: w,
    heightFt: h,
    labelOverride: null,
    showLabel: opts?.showLabel ?? type.showLabel,
    styleOverride: null,
  };
}

export function resizeInstanceKeepCenter(
  inst: SitePlanInstance,
  widthFt: number,
  heightFt: number,
  shape: ObjectType["shape"]
): SitePlanInstance {
  const center = geometryCentroid(inst.geometry);
  const poly =
    shape === "circle"
      ? circlePolygon(center[0]!, center[1]!, Math.max(widthFt, heightFt) / 2)
      : rectanglePolygon(
          center[0]!,
          center[1]!,
          widthFt,
          heightFt,
          inst.rotationDeg
        );
  return {
    ...inst,
    geometry: poly.geometry,
    widthFt,
    heightFt,
  };
}

export function createFreeLabel(
  text: string,
  position: Position,
  fontSize = 12,
  opts?: { color?: string; backgroundColor?: string }
): FreeLabel {
  return {
    id: newSitePlanId("lb"),
    text,
    position,
    fontSize,
    color: opts?.color ?? "#0f172a",
    backgroundColor: opts?.backgroundColor ?? "#ffffff",
  };
}

/** Nice round scale length near a preferred size (ft). */
export function snapScaleLengthFt(preferredFt: number): number {
  const choices = [25, 50, 100, 200, 250, 500, 1000, 2000, 5000];
  let best = choices[0]!;
  let bestDiff = Math.abs(preferredFt - best);
  for (const c of choices) {
    const d = Math.abs(preferredFt - c);
    if (d < bestDiff) {
      best = c;
      bestDiff = d;
    }
  }
  return best;
}

/**
 * Build scale-bar endpoints so the bar is horizontal on screen at the
 * current map bearing, with true ground length `lengthFt`.
 */
export function scaleBarLineCoords(
  position: Position,
  lengthFt: number,
  mapBearingDeg: number
): [Position, Position] {
  const screenEast = mapBearingDeg + 90;
  const end = turf.destination(turf.point(position), lengthFt, screenEast, {
    units: FT,
  });
  return [position, end.geometry.coordinates as Position];
}

export function scaleBarCaption(
  lengthFt: number,
  units: "ft" | "m" | "both"
): string {
  const m = lengthFt * 0.3048;
  const ftStr =
    lengthFt >= 100 ? `${Math.round(lengthFt)} ft` : `${lengthFt} ft`;
  const mStr =
    m >= 100 ? `${Math.round(m)} m` : `${Math.round(m * 10) / 10} m`;
  if (units === "m") return mStr;
  if (units === "both") return `${ftStr} / ${mStr}`;
  return ftStr;
}

export function lineFromPoints(a: Position, b: Position): Feature<LineString> {
  return turf.lineString([a, b]);
}

export function polylineFromPoints(coords: Position[]): Feature<LineString> {
  return turf.lineString(coords);
}

export function distanceFt(a: Position, b: Position): number {
  return turf.distance(turf.point(a), turf.point(b), { units: FT });
}

export function hitTestInstance(
  instances: SitePlanInstance[],
  lng: number,
  lat: number,
  maxFt = 15
): SitePlanInstance | null {
  const pt = turf.point([lng, lat]);
  let best: { inst: SitePlanInstance; d: number } | null = null;
  for (const inst of instances) {
    try {
      if (inst.geometry.type === "Polygon") {
        if (turf.booleanPointInPolygon(pt, turf.feature(inst.geometry))) {
          return inst;
        }
      }
      const c = geometryCentroid(inst.geometry);
      const d = distanceFt([lng, lat], c);
      if (d <= maxFt && (!best || d < best.d)) best = { inst, d };
      if (inst.geometry.type === "LineString") {
        const nearest = turf.nearestPointOnLine(
          turf.feature(inst.geometry) as Feature<LineString>,
          pt,
          { units: FT }
        );
        const nd = nearest.properties.dist ?? Infinity;
        if (nd <= maxFt && (!best || nd < best.d)) {
          best = { inst, d: nd };
        }
      }
    } catch {
      /* skip */
    }
  }
  return best?.inst ?? null;
}

export function hitTestFreeLabel(
  labels: FreeLabel[],
  lng: number,
  lat: number,
  maxFt = 25
): FreeLabel | null {
  let best: { lb: FreeLabel; d: number } | null = null;
  for (const lb of labels) {
    const d = distanceFt([lng, lat], lb.position);
    if (d <= maxFt && (!best || d < best.d)) best = { lb, d };
  }
  return best?.lb ?? null;
}

export function instanceAsPointFeature(
  inst: SitePlanInstance,
  type: ObjectType | undefined
): Feature<Point> {
  return {
    type: "Feature",
    properties: {
      id: inst.id,
      kind: "instance",
      label: instanceLabelText(inst, type),
      showLabel: inst.showLabel,
      ...resolveInstanceStyle(inst, type),
    },
    geometry: {
      type: "Point",
      coordinates: geometryCentroid(inst.geometry),
    },
  };
}
