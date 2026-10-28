import type { Feature, Polygon, Position } from "geojson";

import { emptySitePlanDocument, newSitePlanId } from "./defaults";
import {
  bearingToOffset,
  circlePolygon,
  createFreeLabel,
  flipGeometry,
  geometriesCentroid,
  geometryCentroid,
  lineFromPoints,
  placeTypedRectangle,
  polylineFromPoints,
  rectangleFromCorners,
  resizeInstanceKeepCenter,
  rotateGeometryAround,
  translateGeometry,
  type ViewAlignedDraw,
} from "./objects";
import type {
  DrawDefaults,
  FlipAxis,
  FreeLabel,
  InstanceStyleOverride,
  ObjectShape,
  ObjectType,
  SitePlanDocument,
  SitePlanInstance,
} from "./types";

/** Optional fields applied when creating an instance from a draw/place tool. */
export type InstanceCreateOptions = {
  legendTitle?: string | null;
  legendSubtitle?: string | null;
  labelOverride?: string | null;
  showLabel?: boolean;
  labelBackgroundColor?: string | null;
  labelColor?: string | null;
  legend?: boolean;
  styleOverride?: InstanceStyleOverride | null;
  /** When set, overrides footprint / line weight (place & lines). */
  widthFt?: number | null;
  heightFt?: number | null;
};

export function drawDefaultsFromTool(
  tool: "rect" | "circle" | "line" | "polyline" | "polygon" | "place"
): DrawDefaults {
  if (tool === "circle") {
    return {
      legendTitle: "",
      legendSubtitle: "",
      labelOverride: "",
      showLabel: false,
      labelBackground: false,
      labelBackgroundColor: "#ffffff",
      labelColor: "#0f172a",
      legend: false,
      fill: "#67e8f9",
      stroke: "#0e7490",
      borderColor: "#0e7490",
      borderWidth: 2,
      dashed: false,
      dashColor: "#0e7490",
      widthFt: 30,
      heightFt: 30,
    };
  }
  if (tool === "line" || tool === "polyline") {
    return {
      legendTitle: "",
      legendSubtitle: "",
      labelOverride: "",
      showLabel: false,
      labelBackground: false,
      labelBackgroundColor: "#ffffff",
      labelColor: "#0f172a",
      legend: false,
      fill: "#38bdf8",
      stroke: "#38bdf8",
      borderColor: "#0369a1",
      borderWidth: 2,
      dashed: false,
      dashColor: "#7dd3fc",
      widthFt: 2,
      heightFt: null,
    };
  }
  if (tool === "polygon") {
    return {
      legendTitle: "",
      legendSubtitle: "",
      labelOverride: "",
      showLabel: false,
      labelBackground: false,
      labelBackgroundColor: "#ffffff",
      labelColor: "#0f172a",
      legend: false,
      fill: "#facc15",
      stroke: "#854d0e",
      borderColor: "#854d0e",
      borderWidth: 2,
      dashed: false,
      dashColor: "#854d0e",
      widthFt: null,
      heightFt: null,
    };
  }
  return {
    legendTitle: "",
    legendSubtitle: "",
    labelOverride: "",
    showLabel: false,
    labelBackground: false,
    labelBackgroundColor: "#ffffff",
    labelColor: "#0f172a",
    legend: false,
    fill: "#facc15",
    stroke: "#854d0e",
    borderColor: "#854d0e",
    borderWidth: 2,
    dashed: false,
    dashColor: "#854d0e",
    widthFt: 40,
    heightFt: 40,
  };
}

export function drawDefaultsFromType(type: ObjectType): DrawDefaults {
  const hasBg = Boolean(type.labelBackgroundColor);
  return {
    legendTitle: type.name,
    legendSubtitle: type.legendSubtitle ?? "",
    labelOverride: "",
    showLabel: type.showLabel,
    labelBackground: hasBg,
    labelBackgroundColor: type.labelBackgroundColor || "#ffffff",
    labelColor: type.labelColor || "#0f172a",
    legend: type.legend,
    fill: type.fill,
    stroke: type.stroke,
    borderColor: type.borderColor || type.stroke,
    borderWidth: type.borderWidth ?? type.strokeWidth,
    dashed: Boolean(type.dashed),
    dashColor: type.dashColor || type.stroke,
    widthFt: type.widthFt,
    heightFt: type.heightFt,
  };
}

export function createOptionsFromDefaults(
  defaults: DrawDefaults,
  opts?: { omitSize?: boolean; freehandStyle?: boolean }
): InstanceCreateOptions {
  const styleOverride: InstanceStyleOverride = {
    fill: defaults.fill,
    stroke: defaults.stroke,
    borderColor: defaults.borderColor,
    borderWidth: defaults.borderWidth,
    dashed: defaults.dashed,
    dashColor: defaults.dashColor,
    strokeWidth: defaults.borderWidth,
  };
  return {
    legendTitle: defaults.legendTitle.trim() || null,
    legendSubtitle: defaults.legendSubtitle.trim() || null,
    labelOverride: defaults.labelOverride.trim() || null,
    showLabel: defaults.showLabel,
    labelBackgroundColor: defaults.labelBackground
      ? defaults.labelBackgroundColor
      : null,
    labelColor: defaults.labelBackground ? defaults.labelColor : null,
    legend: defaults.legend,
    styleOverride: opts?.freehandStyle === false ? null : styleOverride,
    ...(opts?.omitSize
      ? {}
      : {
          widthFt: defaults.widthFt,
          heightFt: defaults.heightFt,
        }),
  };
}

function applyCreateOptions(
  inst: SitePlanInstance,
  opts?: InstanceCreateOptions | null
): SitePlanInstance {
  if (!opts) return inst;
  return {
    ...inst,
    legendTitle:
      opts.legendTitle !== undefined ? opts.legendTitle : inst.legendTitle,
    legendSubtitle:
      opts.legendSubtitle !== undefined
        ? opts.legendSubtitle
        : inst.legendSubtitle,
    labelOverride:
      opts.labelOverride !== undefined
        ? opts.labelOverride
        : inst.labelOverride,
    showLabel: opts.showLabel !== undefined ? opts.showLabel : inst.showLabel,
    labelBackgroundColor:
      opts.labelBackgroundColor !== undefined
        ? opts.labelBackgroundColor
        : inst.labelBackgroundColor,
    labelColor:
      opts.labelColor !== undefined ? opts.labelColor : inst.labelColor,
    legend: opts.legend !== undefined ? opts.legend : inst.legend,
    styleOverride:
      opts.styleOverride !== undefined
        ? opts.styleOverride
        : inst.styleOverride,
    widthFt: opts.widthFt !== undefined ? opts.widthFt : inst.widthFt,
    heightFt: opts.heightFt !== undefined ? opts.heightFt : inst.heightFt,
  };
}

export function createInitialDocument(opts: {
  lrid: string;
  parcelId: string;
  address: string;
  parcel: Feature<Polygon> | null;
  title?: string;
}): SitePlanDocument {
  return emptySitePlanDocument({
    lrid: opts.lrid,
    parcelId: opts.parcelId,
    address: opts.address,
    parcelPolygon: opts.parcel,
    title: opts.title,
  });
}

export function upsertObjectType(
  doc: SitePlanDocument,
  type: ObjectType
): SitePlanDocument {
  const exists = doc.objectTypes.some((t) => t.id === type.id);
  return {
    ...doc,
    objectTypes: exists
      ? doc.objectTypes.map((t) => (t.id === type.id ? type : t))
      : [...doc.objectTypes, type],
    updatedAt: new Date().toISOString(),
  };
}

export function deleteObjectType(
  doc: SitePlanDocument,
  typeId: string
): SitePlanDocument {
  return {
    ...doc,
    objectTypes: doc.objectTypes.filter((t) => t.id !== typeId),
    instances: doc.instances.map((i) =>
      i.typeId === typeId ? { ...i, typeId: null } : i
    ),
    updatedAt: new Date().toISOString(),
  };
}

export function addInstance(
  doc: SitePlanDocument,
  instance: SitePlanInstance
): SitePlanDocument {
  return {
    ...doc,
    instances: [...doc.instances, instance],
    updatedAt: new Date().toISOString(),
  };
}

export function updateInstance(
  doc: SitePlanDocument,
  instance: SitePlanInstance
): SitePlanDocument {
  return {
    ...doc,
    instances: doc.instances.map((i) =>
      i.id === instance.id ? instance : i
    ),
    updatedAt: new Date().toISOString(),
  };
}

export function deleteInstance(
  doc: SitePlanDocument,
  instanceId: string
): SitePlanDocument {
  return {
    ...doc,
    instances: doc.instances.filter((i) => i.id !== instanceId),
    updatedAt: new Date().toISOString(),
  };
}

export function placeTypeAt(
  doc: SitePlanDocument,
  typeId: string,
  lng: number,
  lat: number,
  rotationDeg = 0,
  createOpts?: InstanceCreateOptions | null
): SitePlanDocument {
  const type = doc.objectTypes.find((t) => t.id === typeId);
  if (!type) return doc;
  if (type.shape === "line" || type.shape === "polyline" || type.shape === "polygon") {
    // Need multi-click tools — no single-click place
    return doc;
  }
  const inst = placeTypedRectangle(type, lng, lat, {
    rotationDeg,
    widthFt: createOpts?.widthFt ?? undefined,
    heightFt: createOpts?.heightFt ?? undefined,
    showLabel: createOpts?.showLabel,
  });
  // Place uses type defaults; apply prefill overrides (style + legend fields)
  const withOpts = applyCreateOptions(inst, {
    ...createOpts,
    // Keep type link; still allow styleOverride for one-off color tweaks
    widthFt: createOpts?.widthFt ?? inst.widthFt,
    heightFt: createOpts?.heightFt ?? inst.heightFt,
  });
  return addInstance(doc, withOpts);
}

export function drawRectFromCorners(
  doc: SitePlanDocument,
  typeId: string | null,
  a: Position,
  b: Position,
  opts?: {
    rotationDeg?: number;
    /** Used when typeId is null (freehand). */
    freehandShape?: "rectangle" | "circle";
  }
): SitePlanDocument {
  const rotationDeg = opts?.rotationDeg ?? 0;
  const type = typeId
    ? doc.objectTypes.find((t) => t.id === typeId)
    : undefined;
  const { polygon, widthFt, heightFt } = rectangleFromCorners(
    a,
    b,
    rotationDeg
  );
  const shape: ObjectShape =
    type?.shape === "circle"
      ? "circle"
      : !type && opts?.freehandShape === "circle"
        ? "circle"
        : "rectangle";
  let geometry = polygon.geometry;
  let outW = widthFt;
  let outH = heightFt;
  if (shape === "circle") {
    const radiusFt = Math.max(widthFt, heightFt, 0.5) / 2;
    const diameter = radiusFt * 2;
    geometry = circlePolygon(
      (a[0]! + b[0]!) / 2,
      (a[1]! + b[1]!) / 2,
      radiusFt
    ).geometry;
    outW = diameter;
    outH = diameter;
  }
  const inst: SitePlanInstance = {
    id: newSitePlanId("in"),
    typeId,
    geometry,
    rotationDeg,
    widthFt: outW,
    heightFt: outH,
    labelOverride: null,
    showLabel: type?.showLabel ?? false,
    styleOverride: type
      ? null
      : {
          fill: shape === "circle" ? "#67e8f9" : "#facc15",
          stroke: shape === "circle" ? "#0e7490" : "#854d0e",
          strokeWidth: 2,
        },
  };
  return addInstance(doc, inst);
}

/** Commit a viewport-aligned rect/circle computed on the map. */
export function addViewAlignedDraw(
  doc: SitePlanDocument,
  draw: ViewAlignedDraw,
  typeId: string | null = null,
  createOpts?: InstanceCreateOptions | null
): SitePlanDocument {
  const type = typeId
    ? doc.objectTypes.find((t) => t.id === typeId)
    : undefined;
  const inst: SitePlanInstance = {
    id: newSitePlanId("in"),
    typeId,
    geometry: draw.geometry,
    rotationDeg: draw.rotationDeg,
    widthFt: draw.widthFt,
    heightFt: draw.heightFt,
    labelOverride: null,
    showLabel: type?.showLabel ?? false,
    styleOverride: type
      ? null
      : {
          fill: draw.shape === "circle" ? "#67e8f9" : "#facc15",
          stroke: draw.shape === "circle" ? "#0e7490" : "#854d0e",
          strokeWidth: 2,
        },
  };
  // Dragged geometry owns size; apply style/legend prefill (keep drawn W×H)
  const { widthFt: _w, heightFt: _h, ...rest } = createOpts || {};
  return addInstance(
    doc,
    applyCreateOptions(inst, createOpts ? rest : null)
  );
}

export function addLineInstance(
  doc: SitePlanDocument,
  typeId: string | null,
  a: Position,
  b: Position,
  createOpts?: InstanceCreateOptions | null
): SitePlanDocument {
  const type = typeId
    ? doc.objectTypes.find((t) => t.id === typeId)
    : undefined;
  const line = lineFromPoints(a, b);
  const inst: SitePlanInstance = {
    id: newSitePlanId("in"),
    typeId,
    geometry: line.geometry,
    rotationDeg: 0,
    widthFt: type?.widthFt ?? 2,
    heightFt: null,
    labelOverride: null,
    showLabel: type?.showLabel ?? false,
    styleOverride: type
      ? null
      : {
          stroke: "#38bdf8",
          strokeWidth: 2,
          dashed: false,
          fill: "#38bdf8",
          dashColor: "#7dd3fc",
          borderColor: "#0369a1",
          borderWidth: 2,
        },
  };
  return addInstance(doc, applyCreateOptions(inst, createOpts));
}

export function addPolylineInstance(
  doc: SitePlanDocument,
  typeId: string | null,
  coords: Position[],
  createOpts?: InstanceCreateOptions | null
): SitePlanDocument {
  if (coords.length < 2) return doc;
  const type = typeId
    ? doc.objectTypes.find((t) => t.id === typeId)
    : undefined;
  const line = polylineFromPoints(coords);
  const inst: SitePlanInstance = {
    id: newSitePlanId("in"),
    typeId,
    geometry: line.geometry,
    rotationDeg: 0,
    widthFt: type?.widthFt ?? 2,
    heightFt: null,
    labelOverride: null,
    showLabel: type?.showLabel ?? false,
    styleOverride: type
      ? null
      : {
          stroke: "#38bdf8",
          strokeWidth: 2,
          dashed: false,
          fill: "#38bdf8",
          dashColor: "#7dd3fc",
          borderColor: "#0369a1",
          borderWidth: 2,
        },
  };
  return addInstance(doc, applyCreateOptions(inst, createOpts));
}

export function addPolygonInstance(
  doc: SitePlanDocument,
  typeId: string | null,
  coords: Position[],
  createOpts?: InstanceCreateOptions | null
): SitePlanDocument {
  if (coords.length < 3) return doc;
  const ring = [...coords];
  const first = ring[0]!;
  const last = ring[ring.length - 1]!;
  if (first[0] !== last[0] || first[1] !== last[1]) ring.push(first);
  const type = typeId
    ? doc.objectTypes.find((t) => t.id === typeId)
    : undefined;
  const inst: SitePlanInstance = {
    id: newSitePlanId("in"),
    typeId,
    geometry: { type: "Polygon", coordinates: [ring] },
    rotationDeg: 0,
    widthFt: null,
    heightFt: null,
    labelOverride: null,
    showLabel: type?.showLabel ?? false,
    styleOverride: null,
  };
  const { widthFt: _w, heightFt: _h, ...rest } = createOpts || {};
  return addInstance(
    doc,
    applyCreateOptions(inst, createOpts ? rest : null)
  );
}

export function moveInstance(
  doc: SitePlanDocument,
  instanceId: string,
  dxLng: number,
  dyLat: number
): SitePlanDocument {
  return moveInstances(doc, [instanceId], dxLng, dyLat);
}

export function moveInstances(
  doc: SitePlanDocument,
  instanceIds: string[],
  dxLng: number,
  dyLat: number
): SitePlanDocument {
  if (!instanceIds.length || (dxLng === 0 && dyLat === 0)) return doc;
  const idSet = new Set(instanceIds);
  return {
    ...doc,
    instances: doc.instances.map((i) =>
      idSet.has(i.id)
        ? { ...i, geometry: translateGeometry(i.geometry, dxLng, dyLat) }
        : i
    ),
    updatedAt: new Date().toISOString(),
  };
}

export function rotateInstance(
  doc: SitePlanDocument,
  instanceId: string,
  deltaDeg: number
): SitePlanDocument {
  return rotateInstances(doc, [instanceId], deltaDeg);
}

/** Rotate one or many instances around their combined centroid. */
export function rotateInstances(
  doc: SitePlanDocument,
  instanceIds: string[],
  deltaDeg: number
): SitePlanDocument {
  if (!deltaDeg || !instanceIds.length) return doc;
  const idSet = new Set(instanceIds);
  const targets = doc.instances.filter((i) => idSet.has(i.id));
  if (!targets.length) return doc;
  const pivot = geometriesCentroid(targets.map((i) => i.geometry));
  return {
    ...doc,
    instances: doc.instances.map((i) => {
      if (!idSet.has(i.id)) return i;
      const nextRot = ((i.rotationDeg + deltaDeg) % 360 + 360) % 360;
      return {
        ...i,
        rotationDeg: nextRot,
        geometry: rotateGeometryAround(i.geometry, pivot, deltaDeg),
      };
    }),
    updatedAt: new Date().toISOString(),
  };
}

/** Flip instances around their combined centroid. */
export function flipInstances(
  doc: SitePlanDocument,
  instanceIds: string[],
  axis: FlipAxis
): SitePlanDocument {
  if (!instanceIds.length) return doc;
  const idSet = new Set(instanceIds);
  const targets = doc.instances.filter((i) => idSet.has(i.id));
  if (!targets.length) return doc;
  const pivot = geometriesCentroid(targets.map((i) => i.geometry));
  return {
    ...doc,
    instances: doc.instances.map((i) => {
      if (!idSet.has(i.id)) return i;
      const nextRot =
        axis === "horizontal"
          ? (((-i.rotationDeg) % 360) + 360) % 360
          : (((180 - i.rotationDeg) % 360) + 360) % 360;
      return {
        ...i,
        rotationDeg: nextRot,
        geometry: flipGeometry(i.geometry, pivot, axis),
      };
    }),
    updatedAt: new Date().toISOString(),
  };
}

export function deleteInstances(
  doc: SitePlanDocument,
  instanceIds: string[]
): SitePlanDocument {
  if (!instanceIds.length) return doc;
  const idSet = new Set(instanceIds);
  return {
    ...doc,
    instances: doc.instances.filter((i) => !idSet.has(i.id)),
    updatedAt: new Date().toISOString(),
  };
}

/** Assign a shared groupId to the given instances. */
export function groupInstances(
  doc: SitePlanDocument,
  instanceIds: string[]
): { doc: SitePlanDocument; groupId: string } | null {
  const unique = [...new Set(instanceIds)];
  if (unique.length < 2) return null;
  const groupId = newSitePlanId("grp");
  const idSet = new Set(unique);
  return {
    groupId,
    doc: {
      ...doc,
      instances: doc.instances.map((i) => {
        if (!idSet.has(i.id)) return i;
        const prev = i.groupId ?? null;
        const prevNest = i.groupNest ?? [];
        // Push previous group as the next nesting level (rigid child unit)
        const groupNest = prev ? [prev, ...prevNest] : [...prevNest];
        return { ...i, groupId, groupNest };
      }),
      updatedAt: new Date().toISOString(),
    },
  };
}

/** Pop the outermost group; restore nested child groups when present. */
export function ungroupInstances(
  doc: SitePlanDocument,
  instanceIds: string[]
): SitePlanDocument {
  if (!instanceIds.length) return doc;
  const idSet = new Set(instanceIds);
  // Also ungroup any peers that share a groupId with the selection
  const groupIds = new Set(
    doc.instances
      .filter((i) => idSet.has(i.id) && i.groupId)
      .map((i) => i.groupId!)
  );
  return {
    ...doc,
    instances: doc.instances.map((i) => {
      if (!(idSet.has(i.id) || (i.groupId && groupIds.has(i.groupId)))) {
        return i;
      }
      const nest = i.groupNest ?? [];
      if (nest.length > 0) {
        const [restored, ...rest] = nest;
        return { ...i, groupId: restored!, groupNest: rest };
      }
      return { ...i, groupId: null, groupNest: [] };
    }),
    updatedAt: new Date().toISOString(),
  };
}

export function instanceIdsInGroup(
  doc: SitePlanDocument,
  groupId: string
): string[] {
  return doc.instances.filter((i) => i.groupId === groupId).map((i) => i.id);
}

/** True when every id shares the same non-null groupId (a real group). */
export function selectionIsGroup(
  doc: SitePlanDocument,
  instanceIds: string[]
): boolean {
  if (instanceIds.length < 2) return false;
  const groups = instanceIds.map(
    (id) => doc.instances.find((i) => i.id === id)?.groupId ?? null
  );
  const g = groups[0];
  return Boolean(g) && groups.every((x) => x === g);
}

export type ZOrderOp = "forward" | "backward" | "front" | "back";

/**
 * Stack order is array order: index 0 = back, last = front.
 * Moves the selected instances as a set relative to neighbors.
 */
export function reorderInstances(
  doc: SitePlanDocument,
  instanceIds: string[],
  op: ZOrderOp
): SitePlanDocument {
  const idSet = new Set(instanceIds);
  if (!idSet.size) return doc;
  const arr = [...doc.instances];
  const selected = arr.filter((i) => idSet.has(i.id));
  if (!selected.length) return doc;

  let next: SitePlanInstance[];
  if (op === "front") {
    next = [...arr.filter((i) => !idSet.has(i.id)), ...selected];
  } else if (op === "back") {
    next = [...selected, ...arr.filter((i) => !idSet.has(i.id))];
  } else if (op === "forward") {
    next = [...arr];
    for (let i = next.length - 2; i >= 0; i--) {
      const a = next[i]!;
      const b = next[i + 1]!;
      if (idSet.has(a.id) && !idSet.has(b.id)) {
        next[i] = b;
        next[i + 1] = a;
      }
    }
  } else {
    next = [...arr];
    for (let i = 1; i < next.length; i++) {
      const a = next[i]!;
      const b = next[i - 1]!;
      if (idSet.has(a.id) && !idSet.has(b.id)) {
        next[i] = b;
        next[i - 1] = a;
      }
    }
  }

  const changed = next.some((inst, i) => inst.id !== arr[i]?.id);
  if (!changed) return doc;
  return {
    ...doc,
    instances: next,
    updatedAt: new Date().toISOString(),
  };
}

type ScreenProjector = {
  project: (lngLat: [number, number]) => { x: number; y: number };
  unproject: (point: [number, number]) => { lng: number; lat: number };
};

/**
 * Partition a selection into rigid align/distribute units.
 * - Nested group (same groupId, multiple groupNest[0]): each child group is a unit
 * - Multiple top-level groups selected: each groupId is a unit
 * - Flat group / loose items: each instance is its own unit
 */
export function rigidAlignUnits(
  doc: SitePlanDocument,
  instanceIds: string[]
): string[][] {
  const unique = [...new Set(instanceIds)];
  const targets = unique
    .map((id) => doc.instances.find((i) => i.id === id))
    .filter(Boolean) as SitePlanInstance[];
  if (!targets.length) return [];

  const topGroups = new Set(
    targets.map((i) => i.groupId ?? null).filter((g): g is string => Boolean(g))
  );
  const hasLoose = targets.some((i) => !i.groupId);

  const bucket = (keyFn: (i: SitePlanInstance) => string): string[][] => {
    const map = new Map<string, string[]>();
    for (const i of targets) {
      const k = keyFn(i);
      const list = map.get(k);
      if (list) list.push(i.id);
      else map.set(k, [i.id]);
    }
    return [...map.values()];
  };

  // Several separate groups (and/or loose items) in the selection
  if (topGroups.size > 1 || (topGroups.size === 1 && hasLoose)) {
    return bucket((i) => (i.groupId ? `g:${i.groupId}` : `i:${i.id}`));
  }

  // One outer group — prefer immediate nested children as rigid units
  if (topGroups.size === 1) {
    const childKeys = new Set(
      targets
        .map((i) => i.groupNest?.[0] ?? null)
        .filter((g): g is string => Boolean(g))
    );
    const hasUngroupedChild = targets.some((i) => !i.groupNest?.[0]);
    if (childKeys.size >= 2 || (childKeys.size >= 1 && hasUngroupedChild)) {
      return bucket((i) =>
        i.groupNest?.[0] ? `n:${i.groupNest[0]}` : `i:${i.id}`
      );
    }
  }

  // Flat: one unit per instance
  return targets.map((i) => [i.id]);
}

function applyUnitDeltas(
  doc: SitePlanDocument,
  deltas: Map<string, { dx: number; dy: number }>
): SitePlanDocument {
  let changed = false;
  const instances = doc.instances.map((i) => {
    const d = deltas.get(i.id);
    if (!d || (d.dx === 0 && d.dy === 0)) return i;
    changed = true;
    return {
      ...i,
      geometry: translateGeometry(i.geometry, d.dx, d.dy),
    };
  });
  if (!changed) return doc;
  return {
    ...doc,
    instances,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Align rigid units in **view** space (works when the map is rotated):
 * - horizontal → same screen Y (row)
 * - vertical → same screen X (column)
 * Nested / multi-groups move as wholes; flat groups still align members.
 */
export function alignInstances(
  doc: SitePlanDocument,
  instanceIds: string[],
  axis: "horizontal" | "vertical",
  map?: ScreenProjector | null
): SitePlanDocument {
  const units = rigidAlignUnits(doc, instanceIds);
  if (units.length < 2) return doc;

  const unitMeta = units.map((ids) => {
    const geoms = ids
      .map((id) => doc.instances.find((i) => i.id === id)?.geometry)
      .filter(Boolean) as SitePlanInstance["geometry"][];
    const c = geometriesCentroid(geoms);
    return { ids, c };
  });

  const deltas = new Map<string, { dx: number; dy: number }>();

  if (map) {
    const items = unitMeta.map((u) => ({
      ...u,
      p: map.project([u.c[0]!, u.c[1]!]),
    }));
    const avgX = items.reduce((s, it) => s + it.p.x, 0) / items.length;
    const avgY = items.reduce((s, it) => s + it.p.y, 0) / items.length;
    for (const it of items) {
      const screen =
        axis === "horizontal"
          ? { x: it.p.x, y: avgY }
          : { x: avgX, y: it.p.y };
      const ll = map.unproject([screen.x, screen.y]);
      const dx = ll.lng - it.c[0]!;
      const dy = ll.lat - it.c[1]!;
      for (const id of it.ids) deltas.set(id, { dx, dy });
    }
  } else {
    const avgCx =
      unitMeta.reduce((s, u) => s + u.c[0]!, 0) / unitMeta.length;
    const avgCy =
      unitMeta.reduce((s, u) => s + u.c[1]!, 0) / unitMeta.length;
    for (const u of unitMeta) {
      const dx = axis === "vertical" ? avgCx - u.c[0]! : 0;
      const dy = axis === "horizontal" ? avgCy - u.c[1]! : 0;
      for (const id of u.ids) deltas.set(id, { dx, dy });
    }
  }

  return applyUnitDeltas(doc, deltas);
}

/**
 * Space rigid-unit centers evenly in **view** space between first and last.
 */
export function distributeInstances(
  doc: SitePlanDocument,
  instanceIds: string[],
  axis: "horizontal" | "vertical",
  map?: ScreenProjector | null
): SitePlanDocument {
  const units = rigidAlignUnits(doc, instanceIds);
  if (units.length < 3) return doc;

  const unitMeta = units.map((ids) => {
    const geoms = ids
      .map((id) => doc.instances.find((i) => i.id === id)?.geometry)
      .filter(Boolean) as SitePlanInstance["geometry"][];
    const c = geometriesCentroid(geoms);
    return { ids, c };
  });

  const deltas = new Map<string, { dx: number; dy: number }>();

  if (map) {
    const items = unitMeta.map((u) => ({
      ...u,
      p: map.project([u.c[0]!, u.c[1]!]),
    }));
    items.sort((a, b) =>
      axis === "horizontal" ? a.p.x - b.p.x : a.p.y - b.p.y
    );
    const first = items[0]!;
    const last = items[items.length - 1]!;
    const start = axis === "horizontal" ? first.p.x : first.p.y;
    const end = axis === "horizontal" ? last.p.x : last.p.y;
    const step = (end - start) / (items.length - 1);
    items.forEach((item, idx) => {
      const t = start + step * idx;
      const screen =
        axis === "horizontal"
          ? { x: t, y: item.p.y }
          : { x: item.p.x, y: t };
      const ll = map.unproject([screen.x, screen.y]);
      const dx = ll.lng - item.c[0]!;
      const dy = ll.lat - item.c[1]!;
      for (const id of item.ids) deltas.set(id, { dx, dy });
    });
  } else {
    const items = [...unitMeta];
    items.sort((a, b) =>
      axis === "horizontal" ? a.c[0]! - b.c[0]! : a.c[1]! - b.c[1]!
    );
    const first = items[0]!;
    const last = items[items.length - 1]!;
    const start = axis === "horizontal" ? first.c[0]! : first.c[1]!;
    const end = axis === "horizontal" ? last.c[0]! : last.c[1]!;
    const step = (end - start) / (items.length - 1);
    items.forEach((item, idx) => {
      const target = start + step * idx;
      const dx = axis === "horizontal" ? target - item.c[0]! : 0;
      const dy = axis === "horizontal" ? 0 : target - item.c[1]!;
      for (const id of item.ids) deltas.set(id, { dx, dy });
    });
  }

  return applyUnitDeltas(doc, deltas);
}

/** Expand a clicked instance id to the full group (or just itself). */
export function expandSelectionIds(
  doc: SitePlanDocument,
  instanceId: string
): string[] {
  const inst = doc.instances.find((i) => i.id === instanceId);
  if (!inst?.groupId) return [instanceId];
  return instanceIdsInGroup(doc, inst.groupId);
}

/** Set absolute rotation (degrees), updating geometry by the delta. */
export function setInstanceRotation(
  doc: SitePlanDocument,
  instanceId: string,
  rotationDeg: number
): SitePlanDocument {
  const inst = doc.instances.find((i) => i.id === instanceId);
  if (!inst) return doc;
  const target = ((rotationDeg % 360) + 360) % 360;
  const delta = target - (((inst.rotationDeg % 360) + 360) % 360);
  return rotateInstance(doc, instanceId, delta);
}

export function setInstanceSize(
  doc: SitePlanDocument,
  instanceId: string,
  widthFt: number,
  heightFt: number
): SitePlanDocument {
  const w = Math.round(widthFt * 100) / 100;
  const h = Math.round(heightFt * 100) / 100;
  return {
    ...doc,
    instances: doc.instances.map((i) => {
      if (i.id !== instanceId) return i;
      const type = i.typeId
        ? doc.objectTypes.find((t) => t.id === i.typeId)
        : undefined;
      const shape = type?.shape === "circle" ? "circle" : "rectangle";
      return resizeInstanceKeepCenter(i, w, h, shape);
    }),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Clone an instance offset east by `offsetFt` (default 25 ft).
 * Returns the new document and the new instance id.
 */
export function duplicateInstance(
  doc: SitePlanDocument,
  instanceId: string,
  offsetFt = 25
): { doc: SitePlanDocument; newId: string } | null {
  const result = duplicateInstances(doc, [instanceId], offsetFt);
  if (!result || !result.newIds.length) return null;
  return { doc: result.doc, newId: result.newIds[0]! };
}

/** Duplicate many instances; shared groupId is remapped so copies stay grouped. */
export function duplicateInstances(
  doc: SitePlanDocument,
  instanceIds: string[],
  offsetFt = 25
): { doc: SitePlanDocument; newIds: string[] } | null {
  const unique = [...new Set(instanceIds)];
  const targets = unique
    .map((id) => doc.instances.find((i) => i.id === id))
    .filter(Boolean) as SitePlanInstance[];
  if (!targets.length) return null;

  const pivot = geometriesCentroid(targets.map((i) => i.geometry));
  const dest = bearingToOffset(pivot[0]!, pivot[1]!, 90, offsetFt);
  const dx = dest[0]! - pivot[0]!;
  const dy = dest[1]! - pivot[1]!;

  const groupMap = new Map<string, string>();
  const remapGroup = (id: string | null | undefined): string | null => {
    if (!id) return null;
    if (!groupMap.has(id)) groupMap.set(id, newSitePlanId("grp"));
    return groupMap.get(id)!;
  };
  const copies: SitePlanInstance[] = targets.map((inst) => {
    return {
      ...inst,
      id: newSitePlanId("in"),
      groupId: remapGroup(inst.groupId),
      groupNest: (inst.groupNest ?? [])
        .map((id) => remapGroup(id))
        .filter((id): id is string => Boolean(id)),
      geometry: translateGeometry(inst.geometry, dx, dy),
      styleOverride: inst.styleOverride ? { ...inst.styleOverride } : null,
    };
  });

  return {
    doc: {
      ...doc,
      instances: [...doc.instances, ...copies],
      updatedAt: new Date().toISOString(),
    },
    newIds: copies.map((c) => c.id),
  };
}

/** Paste a clipboard instance (deep clone) offset from original center. */
export function pasteInstance(
  doc: SitePlanDocument,
  template: SitePlanInstance,
  offsetFt = 25
): { doc: SitePlanDocument; newId: string } {
  const center = geometryCentroid(template.geometry);
  const dest = bearingToOffset(center[0]!, center[1]!, 45, offsetFt);
  const dx = dest[0]! - center[0]!;
  const dy = dest[1]! - center[1]!;
  const newId = newSitePlanId("in");
  const copy: SitePlanInstance = {
    ...structuredClone(template),
    id: newId,
    geometry: translateGeometry(template.geometry, dx, dy),
  };
  return { doc: addInstance(doc, copy), newId };
}

export function addFreeLabelToDoc(
  doc: SitePlanDocument,
  text: string,
  position: Position
): SitePlanDocument {
  return {
    ...doc,
    freeLabels: [...doc.freeLabels, createFreeLabel(text, position)],
    updatedAt: new Date().toISOString(),
  };
}

export function addScaleBarToDoc(
  doc: SitePlanDocument,
  position: Position,
  lengthFt = 100,
  units: "ft" | "m" | "both" = "both"
): SitePlanDocument {
  return {
    ...doc,
    scaleBars: [
      ...(doc.scaleBars || []),
      {
        id: newSitePlanId("sb"),
        position,
        lengthFt,
        units,
      },
    ],
    updatedAt: new Date().toISOString(),
  };
}

export function updateScaleBar(
  doc: SitePlanDocument,
  bar: SitePlanDocument["scaleBars"][number]
): SitePlanDocument {
  return {
    ...doc,
    scaleBars: (doc.scaleBars || []).map((b) => (b.id === bar.id ? bar : b)),
    updatedAt: new Date().toISOString(),
  };
}

export function deleteScaleBar(
  doc: SitePlanDocument,
  barId: string
): SitePlanDocument {
  return {
    ...doc,
    scaleBars: (doc.scaleBars || []).filter((b) => b.id !== barId),
    updatedAt: new Date().toISOString(),
  };
}

export function updateFreeLabel(
  doc: SitePlanDocument,
  label: FreeLabel
): SitePlanDocument {
  return {
    ...doc,
    freeLabels: doc.freeLabels.map((l) => (l.id === label.id ? label : l)),
    updatedAt: new Date().toISOString(),
  };
}

export function deleteFreeLabel(
  doc: SitePlanDocument,
  labelId: string
): SitePlanDocument {
  return {
    ...doc,
    freeLabels: doc.freeLabels.filter((l) => l.id !== labelId),
    updatedAt: new Date().toISOString(),
  };
}

export function moveFreeLabel(
  doc: SitePlanDocument,
  labelId: string,
  position: Position
): SitePlanDocument {
  return {
    ...doc,
    freeLabels: doc.freeLabels.map((l) =>
      l.id === labelId ? { ...l, position } : l
    ),
    updatedAt: new Date().toISOString(),
  };
}

export function newObjectTypeDraft(
  partial?: Partial<ObjectType>
): ObjectType {
  return {
    id: newSitePlanId("ot"),
    name: "New object",
    shape: "rectangle",
    fill: "#4ade80",
    stroke: "#166534",
    strokeWidth: 2,
    widthFt: 40,
    heightFt: 40,
    showLabel: true,
    legend: true,
    ...partial,
  };
}

function shapeFromGeometry(geometry: SitePlanInstance["geometry"]): ObjectShape {
  if (geometry.type === "LineString") {
    return geometry.coordinates.length > 2 ? "polyline" : "line";
  }
  if (geometry.type === "Polygon") {
    const ring = geometry.coordinates[0];
    // Closed ring with many vertices ≈ circle we drew; treat as polygon unless ≈48 steps
    if (ring && ring.length >= 40) return "circle";
    return "polygon";
  }
  return "rectangle";
}

/**
 * Create a library type from a drawn instance and link that instance to it.
 * Freehand drawings become reusable placeable types.
 */
export function promoteInstanceToType(
  doc: SitePlanDocument,
  instanceId: string,
  name?: string
): { doc: SitePlanDocument; typeId: string } | null {
  const inst = doc.instances.find((i) => i.id === instanceId);
  if (!inst) return null;

  const existing = inst.typeId
    ? doc.objectTypes.find((t) => t.id === inst.typeId)
    : undefined;
  const style = inst.styleOverride;
  const inferred = shapeFromGeometry(inst.geometry);
  // Prefer rectangle when W×H known (dragged box), even if polygon
  const shape: ObjectShape =
    inst.widthFt != null &&
    inst.heightFt != null &&
    inst.geometry.type === "Polygon" &&
    inferred !== "circle"
      ? "rectangle"
      : existing?.shape ?? inferred;

  const type = newObjectTypeDraft({
    name:
      name?.trim() ||
      inst.legendTitle?.trim() ||
      inst.labelOverride?.trim() ||
      existing?.name ||
      "Saved object",
    shape,
    fill: style?.fill ?? existing?.fill ?? "#4ade80",
    stroke: style?.stroke ?? existing?.stroke ?? "#166534",
    strokeWidth: style?.strokeWidth ?? existing?.strokeWidth ?? 2,
    dashed: style?.dashed ?? existing?.dashed,
    dashColor: style?.dashColor ?? existing?.dashColor,
    borderColor: style?.borderColor ?? existing?.borderColor,
    borderWidth: style?.borderWidth ?? existing?.borderWidth,
    widthFt: inst.widthFt ?? existing?.widthFt ?? null,
    heightFt: inst.heightFt ?? existing?.heightFt ?? null,
    showLabel: inst.showLabel,
    labelBackgroundColor:
      inst.labelBackgroundColor ?? existing?.labelBackgroundColor ?? null,
    labelColor: inst.labelColor ?? existing?.labelColor ?? null,
    legend: inst.legend !== false,
    legendSubtitle: inst.legendSubtitle ?? existing?.legendSubtitle ?? null,
  });

  return {
    typeId: type.id,
    doc: {
      ...doc,
      objectTypes: [...doc.objectTypes, type],
      instances: doc.instances.map((i) =>
        i.id === instanceId
          ? {
              ...i,
              typeId: type.id,
              // Type owns legend membership once saved
              legend: false,
              legendTitle: null,
              legendSubtitle: null,
              labelOverride: null,
            }
          : i
      ),
      updatedAt: new Date().toISOString(),
    },
  };
}
