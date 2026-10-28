"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import type {
  Feature,
  FeatureCollection,
  LineString,
  Point,
  Polygon,
  Position,
} from "geojson";
import * as turf from "@turf/turf";

import { buildSitePlanMapStyle } from "@/lib/siteplan/mapStyle";
import {
  bufferDashedLineWidthFt,
  bufferLineWidthFt,
  geometryCentroid,
  instanceLabelText,
  mapFillColor,
  orthoSnapViewAligned,
  resolveInstanceLabelStyle,
  resolveInstanceStyle,
  resolveLineWidthFt,
  viewAlignedDrawFromScreen,
  type ViewAlignedDraw,
} from "@/lib/siteplan/objects";
import type {
  EditorTool,
  ObjectShape,
  SitePlanDocument,
} from "@/lib/siteplan/types";

import "maplibre-gl/dist/maplibre-gl.css";

export type MapSelection =
  | { kind: "instance"; id: string }
  | { kind: "instances"; ids: string[] }
  | { kind: "label"; id: string }
  | null;

type Props = {
  doc: SitePlanDocument;
  tool: EditorTool;
  ortho: boolean;
  unlockSize: boolean;
  activeTypeId: string | null;
  /** Shape of the active library type — drives rect vs circle draw preview. */
  activeShape: ObjectShape | null;
  selection: MapSelection;
  draftCoords: Position[];
  onMapReady: (map: maplibregl.Map) => void;
  /**
   * Second arg: Shift multi-select toggle.
   * Third arg: isolate one member of an already-selected group (double-click).
   * Fourth arg: Alt/Option pick — select stack member under (no group expand).
   */
  onSelect: (
    sel: MapSelection,
    shiftKey?: boolean,
    isolateMember?: boolean,
    pickUnder?: boolean
  ) => void;
  onPlace: (lng: number, lat: number) => void;
  onDrawComplete: (draw: ViewAlignedDraw) => void;
  onVertex: (pos: Position, finish: boolean) => void;
  onLabelPlace: (lng: number, lat: number) => void;
  onMeasure: (a: Position, b: Position) => void;
  onDeleteAt: (lng: number, lat: number) => void;
  onMoveInstance: (id: string, dx: number, dy: number) => void;
};

function roundFt2(n: number): number {
  return Math.round(n * 100) / 100;
}

function formatLen(ft: number): string {
  const m = ft * 0.3048;
  const ftStr = roundFt2(ft).toFixed(2);
  const mStr = roundFt2(m).toFixed(2);
  return `${ftStr} ft / ${mStr} m`;
}

function formatRectDim(wFt: number, hFt: number): string {
  const f = (n: number) => roundFt2(n).toFixed(2);
  return `${f(wFt)} x ${f(hFt)} ft / ${f(wFt * 0.3048)} x ${f(hFt * 0.3048)} m`;
}

function lineDims(
  coords: Position[],
  cursor: Position | null
): { at: Position; text: string } | null {
  const pts = cursor ? [...coords, cursor] : [...coords];
  if (pts.length < 2) return null;
  const at = pts[pts.length - 1]!;
  if (cursor && coords.length > 0) {
    const segFt = turf.distance(
      turf.point(coords[coords.length - 1]!),
      turf.point(cursor),
      { units: "feet" }
    );
    let totalFt = segFt;
    for (let i = 1; i < coords.length; i++) {
      totalFt += turf.distance(
        turf.point(coords[i - 1]!),
        turf.point(coords[i]!),
        { units: "feet" }
      );
    }
    const text =
      coords.length >= 2
        ? `${formatLen(segFt)}  (total ${formatLen(totalFt)})`
        : formatLen(segFt);
    return { at, text };
  }
  let totalFt = 0;
  for (let i = 1; i < pts.length; i++) {
    totalFt += turf.distance(
      turf.point(pts[i - 1]!),
      turf.point(pts[i]!),
      { units: "feet" }
    );
  }
  return { at, text: formatLen(totalFt) };
}

function draftPreviewViewAligned(
  map: maplibregl.Map,
  a: Position,
  b: Position,
  shape: "rectangle" | "circle",
  square: boolean
): FeatureCollection {
  const draw = viewAlignedDrawFromScreen(map, a, b, { shape, square });
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {},
        geometry: draw.geometry,
      },
    ],
  };
}

function dimForViewAligned(
  map: maplibregl.Map,
  a: Position,
  b: Position,
  shape: "rectangle" | "circle",
  square: boolean
): { at: Position; text: string } {
  const draw = viewAlignedDrawFromScreen(map, a, b, { shape, square });
  const text =
    shape === "circle"
      ? `dia ${formatLen(draw.widthFt)}`
      : formatRectDim(draw.widthFt, draw.heightFt);
  return { at: b, text };
}

function draftPreviewFromVertices(
  map: maplibregl.Map | null,
  coords: Position[],
  cursor: Position | null,
  tool: EditorTool,
  snapOrtho: boolean
): FeatureCollection {
  const pts = [...coords];
  if (cursor) {
    let c = cursor;
    if (snapOrtho && pts.length > 0 && map) {
      c = orthoSnapViewAligned(map, pts[pts.length - 1]!, c);
    }
    pts.push(c);
  }
  if (pts.length === 0) return emptyFC();
  if (pts.length === 1) {
    return { type: "FeatureCollection", features: [turf.point(pts[0]!)] };
  }
  if (tool === "polygon" && pts.length >= 3) {
    const ring = [...pts, pts[0]!];
    return {
      type: "FeatureCollection",
      features: [turf.polygon([ring]), turf.lineString(pts)],
    };
  }
  return {
    type: "FeatureCollection",
    features: [turf.lineString(pts)],
  };
}

function snapCursor(
  map: maplibregl.Map | null,
  coords: Position[],
  cursor: Position,
  snapOrtho: boolean
): Position {
  if (snapOrtho && coords.length > 0 && map) {
    return orthoSnapViewAligned(map, coords[coords.length - 1]!, cursor);
  }
  return cursor;
}

function emptyFC(): FeatureCollection {
  return { type: "FeatureCollection", features: [] };
}

function docLayers(doc: SitePlanDocument): {
  parcel: FeatureCollection<Polygon>;
  fills: FeatureCollection<Polygon>;
  lines: FeatureCollection<LineString>;
  labels: FeatureCollection<Point>;
  freeLabels: FeatureCollection<Point>;
} {
  const parcel: FeatureCollection<Polygon> = {
    type: "FeatureCollection",
    features: doc.parcelPolygon ? [doc.parcelPolygon] : [],
  };

  const fills: Feature<Polygon>[] = [];
  const lines: Feature<LineString>[] = [];
  const labels: Feature<Point>[] = [];

  for (const inst of doc.instances) {
    const type = inst.typeId
      ? doc.objectTypes.find((t) => t.id === inst.typeId)
      : undefined;
    const style = resolveInstanceStyle(inst, type);
    const labelStyle = resolveInstanceLabelStyle(inst, type);
    const props = {
      id: inst.id,
      kind: "instance",
      ...style,
      label: instanceLabelText(inst, type),
      showLabel: inst.showLabel,
      hasLabelBg: Boolean(labelStyle.backgroundColor),
      labelBg: labelStyle.backgroundColor || "#ffffff",
      labelColor: labelStyle.color,
    };

    if (inst.geometry.type === "Polygon") {
      fills.push({
        type: "Feature",
        properties: {
          ...props,
          stroke: style.borderColor,
          strokeWidth: style.borderWidth,
        },
        geometry: inst.geometry,
      });
    } else if (inst.geometry.type === "LineString") {
      const widthFt = resolveLineWidthFt(inst, type);
      const hasCorridor = widthFt != null && widthFt >= 0.5;
      if (hasCorridor) {
        const fillColor = mapFillColor(
          style.fill !== "rgba(0,0,0,0)" ? style.fill : style.stroke
        );
        const corridors = style.dashed
          ? bufferDashedLineWidthFt(inst.geometry, widthFt!)
          : (() => {
              const one = bufferLineWidthFt(inst.geometry, widthFt!);
              return one ? [one] : [];
            })();
        for (const corridor of corridors) {
          fills.push({
            type: "Feature",
            properties: {
              ...props,
              fill: fillColor,
              stroke: style.stroke,
              // Dotted: no outline (gaps would get stroked); solid keeps edge
              strokeWidth: style.dashed ? 0 : style.borderWidth,
            },
            geometry: corridor.geometry,
          });
        }
        // Width is the line — no separate center stroke
      } else {
        // Hairline (no width ft): MapLibre stroke, dashed via filter
        lines.push({
          type: "Feature",
          properties: {
            ...props,
            dashed: style.dashed ? 1 : 0,
            stroke: style.stroke,
            strokeWidth: Math.max(style.strokeWidth, 2.5),
          },
          geometry: inst.geometry,
        });
      }
    } else if (inst.geometry.type === "Point") {
      labels.push({
        type: "Feature",
        properties: props,
        geometry: inst.geometry,
      });
    }

    if (inst.showLabel && inst.geometry.type !== "Point") {
      labels.push({
        type: "Feature",
        properties: { ...props, kind: "instance-label" },
        geometry: {
          type: "Point",
          coordinates: geometryCentroid(inst.geometry),
        },
      });
    }
  }

  const freeLabels: FeatureCollection<Point> = {
    type: "FeatureCollection",
    features: doc.freeLabels.map((lb) => ({
      type: "Feature",
      properties: {
        id: lb.id,
        kind: "freeLabel",
        label: lb.text,
        fontSize: lb.fontSize,
        color: lb.color || "#0f172a",
        backgroundColor: lb.backgroundColor || "#ffffff",
      },
      geometry: { type: "Point", coordinates: lb.position },
    })),
  };

  return {
    parcel,
    fills: { type: "FeatureCollection", features: fills },
    lines: { type: "FeatureCollection", features: lines },
    labels: { type: "FeatureCollection", features: labels },
    freeLabels,
  };
}

function ensureSources(map: maplibregl.Map) {
  const add = (id: string) => {
    if (!map.getSource(id)) {
      map.addSource(id, { type: "geojson", data: emptyFC() });
    }
  };
  add("sp-parcel");
  add("sp-fills");
  add("sp-lines");
  add("sp-labels");
  add("sp-free-labels");
  add("sp-scale-lines");
  add("sp-scale-labels");
  add("sp-draft");
  add("sp-selection");

  if (!map.getLayer("sp-parcel-fill")) {
    map.addLayer({
      id: "sp-parcel-fill",
      type: "fill",
      source: "sp-parcel",
      paint: { "fill-color": "#ffffff", "fill-opacity": 0.06 },
    });
    map.addLayer({
      id: "sp-parcel-line",
      type: "line",
      source: "sp-parcel",
      paint: {
        "line-color": "#ffffff",
        "line-width": 2.75,
        "line-opacity": 0.95,
      },
    });
    map.addLayer({
      id: "sp-fills-fill",
      type: "fill",
      source: "sp-fills",
      paint: {
        "fill-color": ["coalesce", ["get", "fill"], "#facc15"],
        "fill-opacity": 0.75,
      },
    });
    map.addLayer({
      id: "sp-fills-line",
      type: "line",
      source: "sp-fills",
      paint: {
        "line-color": ["coalesce", ["get", "stroke"], "#854d0e"],
        "line-width": ["coalesce", ["get", "strokeWidth"], 2],
      },
    });
    map.addLayer({
      id: "sp-lines-solid",
      type: "line",
      source: "sp-lines",
      filter: ["!=", ["get", "dashed"], 1],
      paint: {
        "line-color": ["coalesce", ["get", "stroke"], "#334155"],
        "line-width": ["coalesce", ["get", "strokeWidth"], 3],
        "line-opacity": 0.95,
      },
    });
    map.addLayer({
      id: "sp-lines-dashed",
      type: "line",
      source: "sp-lines",
      filter: ["==", ["get", "dashed"], 1],
      paint: {
        "line-color": ["coalesce", ["get", "stroke"], "#334155"],
        "line-width": ["coalesce", ["get", "strokeWidth"], 3],
        "line-opacity": 0.95,
        // Clear dash pattern (same color/width as solid)
        "line-dasharray": [1.25, 1.25],
      },
    });
    // Screen-fixed label size (not geographic) so zoom does not rescale text
    ensureLabelPlateImage(map);
    map.addLayer({
      id: "sp-labels-plated",
      type: "symbol",
      source: "sp-labels",
      filter: [
        "all",
        ["==", ["get", "showLabel"], true],
        ["==", ["get", "hasLabelBg"], true],
      ],
      layout: {
        "text-field": ["get", "label"],
        "text-size": 11,
        "text-anchor": "center",
        "text-font": ["Open Sans Regular", "Arial Unicode MS Regular"],
        "text-allow-overlap": true,
        "icon-image": "sp-label-plate",
        "icon-text-fit": "both",
        "icon-text-fit-padding": [4, 6, 4, 6],
        "icon-allow-overlap": true,
      },
      paint: {
        "text-color": ["get", "labelColor"],
        "icon-color": ["get", "labelBg"],
        "icon-opacity": 0.96,
      },
    });
    map.addLayer({
      id: "sp-labels-text",
      type: "symbol",
      source: "sp-labels",
      filter: [
        "all",
        ["==", ["get", "showLabel"], true],
        ["!=", ["get", "hasLabelBg"], true],
      ],
      layout: {
        "text-field": ["get", "label"],
        "text-size": 11,
        "text-anchor": "center",
        "text-font": ["Open Sans Regular", "Arial Unicode MS Regular"],
        "text-allow-overlap": true,
      },
      paint: {
        "text-color": "#f8fafc",
        "text-halo-color": "#0f172a",
        "text-halo-width": 1.25,
      },
    });
    // Free labels use HTML markers (true plates); keep screen-fixed via viewport alignment.
    // Keep an invisible hit target via circle on the same source.
    map.addLayer({
      id: "sp-free-labels-hit",
      type: "circle",
      source: "sp-free-labels",
      paint: {
        "circle-radius": 10,
        "circle-opacity": 0,
        "circle-color": "#000000",
      },
    });
    map.addLayer({
      id: "sp-scale-lines",
      type: "line",
      source: "sp-scale-lines",
      paint: {
        "line-color": "#0f172a",
        "line-width": 2.5,
        "line-opacity": 0.95,
      },
    });
    map.addLayer({
      id: "sp-scale-labels",
      type: "symbol",
      source: "sp-scale-labels",
      layout: {
        "text-field": ["get", "label"],
        "text-size": 11,
        "text-anchor": "bottom",
        "text-offset": [0, -0.4],
        "text-font": ["Open Sans Regular", "Arial Unicode MS Regular"],
        "text-allow-overlap": true,
      },
      paint: {
        "text-color": "#0f172a",
        "text-halo-color": "#ffffff",
        "text-halo-width": 3,
        "text-halo-blur": 0,
      },
    });
    map.addLayer({
      id: "sp-draft-fill",
      type: "fill",
      source: "sp-draft",
      filter: ["==", ["geometry-type"], "Polygon"],
      paint: {
        "fill-color": "#38bdf8",
        "fill-opacity": 0.28,
      },
    });
    map.addLayer({
      id: "sp-draft-line",
      type: "line",
      source: "sp-draft",
      paint: {
        "line-color": "#38bdf8",
        "line-width": 2.5,
        "line-dasharray": [2, 1],
      },
    });
    map.addLayer({
      id: "sp-draft-points",
      type: "circle",
      source: "sp-draft",
      filter: ["==", ["geometry-type"], "Point"],
      paint: {
        "circle-radius": 4,
        "circle-color": "#38bdf8",
        "circle-stroke-width": 1.5,
        "circle-stroke-color": "#0f172a",
      },
    });
    map.addLayer({
      id: "sp-selection-line",
      type: "line",
      source: "sp-selection",
      paint: {
        "line-color": "#f8fafc",
        "line-width": 3,
        "line-dasharray": [1, 1],
      },
    });
  }
  // Drop broken glyph-based dim layer if a prior build added it
  if (map.getLayer("sp-draft-dim")) {
    map.removeLayer("sp-draft-dim");
  }
  // Keep dashed filters in sync (1/0 — boolean props are unreliable in MapLibre)
  if (map.getLayer("sp-lines-solid")) {
    map.setFilter("sp-lines-solid", ["!=", ["get", "dashed"], 1]);
  }
  if (map.getLayer("sp-lines-dashed")) {
    map.setFilter("sp-lines-dashed", ["==", ["get", "dashed"], 1]);
    map.setPaintProperty("sp-lines-dashed", "line-dasharray", [1.25, 1.25]);
  }
  // HMR-safe: plated instance labels (screen-fixed size)
  ensureLabelPlateImage(map);
  if (!map.getLayer("sp-labels-plated") && map.getSource("sp-labels")) {
    const before = map.getLayer("sp-labels-text")
      ? "sp-labels-text"
      : undefined;
    map.addLayer(
      {
        id: "sp-labels-plated",
        type: "symbol",
        source: "sp-labels",
        filter: [
          "all",
          ["==", ["get", "showLabel"], true],
          ["==", ["get", "hasLabelBg"], true],
        ],
        layout: {
          "text-field": ["get", "label"],
          "text-size": 11,
          "text-anchor": "center",
          "text-font": ["Open Sans Regular", "Arial Unicode MS Regular"],
          "text-allow-overlap": true,
          "icon-image": "sp-label-plate",
          "icon-text-fit": "both",
          "icon-text-fit-padding": [4, 6, 4, 6],
          "icon-allow-overlap": true,
        },
        paint: {
          "text-color": ["get", "labelColor"],
          "icon-color": ["get", "labelBg"],
          "icon-opacity": 0.96,
        },
      },
      before
    );
  }
  // HMR-safe: add scale layers if an older map session skipped them
  if (!map.getLayer("sp-scale-lines") && map.getSource("sp-scale-lines")) {
    map.addLayer({
      id: "sp-scale-lines",
      type: "line",
      source: "sp-scale-lines",
      paint: {
        "line-color": "#0f172a",
        "line-width": 2.5,
        "line-opacity": 0.95,
      },
    });
  }
  if (!map.getLayer("sp-scale-labels") && map.getSource("sp-scale-labels")) {
    map.addLayer({
      id: "sp-scale-labels",
      type: "symbol",
      source: "sp-scale-labels",
      layout: {
        "text-field": ["get", "label"],
        "text-size": 11,
        "text-anchor": "bottom",
        "text-offset": [0, -0.4],
        "text-font": ["Open Sans Regular", "Arial Unicode MS Regular"],
        "text-allow-overlap": true,
      },
      paint: {
        "text-color": "#0f172a",
        "text-halo-color": "#ffffff",
        "text-halo-width": 3,
      },
    });
  }
  if (!map.getLayer("sp-free-labels-hit") && map.getSource("sp-free-labels")) {
    if (map.getLayer("sp-free-labels-text")) {
      map.removeLayer("sp-free-labels-text");
    }
    map.addLayer({
      id: "sp-free-labels-hit",
      type: "circle",
      source: "sp-free-labels",
      paint: {
        "circle-radius": 10,
        "circle-opacity": 0,
        "circle-color": "#000000",
      },
    });
  }
}

function asFeatureCollection(data: unknown): FeatureCollection {
  if (
    data &&
    typeof data === "object" &&
    (data as FeatureCollection).type === "FeatureCollection" &&
    Array.isArray((data as FeatureCollection).features)
  ) {
    return data as FeatureCollection;
  }
  // Recover accidental { fc, dim } wrappers from stale HMR handlers
  const wrapped = data as { fc?: unknown } | null;
  if (wrapped?.fc) return asFeatureCollection(wrapped.fc);
  return emptyFC();
}

function setData(map: maplibregl.Map, id: string, data: unknown) {
  (map.getSource(id) as maplibregl.GeoJSONSource | undefined)?.setData(
    asFeatureCollection(data)
  );
}

export function SitePlanMap({
  doc,
  tool,
  ortho,
  unlockSize,
  activeTypeId,
  activeShape,
  selection,
  draftCoords,
  onMapReady,
  onSelect,
  onPlace,
  onDrawComplete,
  onVertex,
  onLabelPlace,
  onMeasure,
  onDeleteAt,
  onMoveInstance,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const toolRef = useRef(tool);
  const orthoRef = useRef(ortho);
  const unlockRef = useRef(unlockSize);
  const activeTypeRef = useRef(activeTypeId);
  const activeShapeRef = useRef(activeShape);
  const draftRef = useRef(draftCoords);
  const docRef = useRef(doc);
  const selectionRef = useRef(selection);
  const shiftRef = useRef(false);
  const suppressClickRef = useRef(false);
  const dimElRef = useRef<HTMLDivElement>(null);
  const labelMarkersRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const dragRef = useRef<{
    mode: "draw" | "measure";
    start?: Position;
  } | null>(null);

  const showDim = (
    map: maplibregl.Map,
    dim: { at: Position; text: string } | null
  ) => {
    const el = dimElRef.current;
    if (!el) return;
    if (!dim) {
      el.style.display = "none";
      return;
    }
    const p = map.project(dim.at as [number, number]);
    el.style.display = "block";
    el.style.transform = `translate(${p.x + 14}px, ${p.y - 10}px)`;
    el.textContent = dim.text;
  };
  const hideDim = () => {
    const el = dimElRef.current;
    if (el) el.style.display = "none";
  };
  const handlers = useRef({
    onSelect,
    onPlace,
    onDrawComplete,
    onVertex,
    onLabelPlace,
    onMeasure,
    onDeleteAt,
    onMoveInstance,
  });

  toolRef.current = tool;
  orthoRef.current = ortho;
  unlockRef.current = unlockSize;
  activeTypeRef.current = activeTypeId;
  activeShapeRef.current = activeShape;
  draftRef.current = draftCoords;
  docRef.current = doc;
  selectionRef.current = selection;
  handlers.current = {
    onSelect,
    onPlace,
    onDrawComplete,
    onVertex,
    onLabelPlace,
    onMeasure,
    onDeleteAt,
    onMoveInstance,
  };

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }

    const center: [number, number] = doc.parcelPolygon
      ? (turf.centroid(doc.parcelPolygon).geometry.coordinates as [
          number,
          number,
        ])
      : [-97.5, 31.5];

    const initialBearing = doc.view?.bearingDeg ?? 0;
    const map = new maplibregl.Map({
      container: el,
      style: buildSitePlanMapStyle(),
      center,
      zoom: 16,
      bearing: initialBearing,
      preserveDrawingBuffer: true,
      // Shift is used for ortho snap while drawing — don't steal Shift+click for box zoom
      boxZoom: false,
      // Double-click selects / finishes draws — never zoom the map
      doubleClickZoom: false,
    });
    map.doubleClickZoom.disable();
    map.addControl(
      new maplibregl.NavigationControl({ visualizePitch: false }),
      "top-right"
    );
    mapRef.current = map;

    map.on("load", () => {
      ensureSources(map);
      paintDoc(map, docRef.current, null, labelMarkersRef.current);
      const view = docRef.current.view;
      if (docRef.current.parcelPolygon) {
        const b = turf.bbox(docRef.current.parcelPolygon);
        // Prefer saved export framing on reopen if present; else fit parcel.
        if (view?.exportZoom != null && view.exportCenter) {
          map.jumpTo({
            center: view.exportCenter,
            zoom: view.exportZoom,
            bearing: view.bearingDeg ?? 0,
          });
        } else {
          map.fitBounds(
            [
              [b[0], b[1]],
              [b[2], b[3]],
            ],
            {
              padding: 60,
              maxZoom: 18,
              bearing: view?.bearingDeg ?? 0,
            }
          );
        }
      }
      onMapReady(map);
    });

    map.on("mousedown", (e) => {
      if (e.originalEvent.button !== 0) return;
      const t = toolRef.current;
      const { lng, lat } = e.lngLat;
      const pos: Position = [lng, lat];

      if (t === "rect" || t === "circle") {
        dragRef.current = { mode: "draw", start: pos };
        map.dragPan.disable();
        return;
      }
      if (t === "measure") {
        dragRef.current = { mode: "measure", start: pos };
        map.dragPan.disable();
        return;
      }
      // Select tool: click only selects — drag-to-move is via the floating Move handle.
    });

    const shapeForDrawTool = (): "rectangle" | "circle" => {
      const t = toolRef.current;
      if (t === "circle") return "circle";
      if (activeShapeRef.current === "circle") return "circle";
      return "rectangle";
    };

    map.on("mousemove", (e) => {
      const drag = dragRef.current;
      const pos: Position = [e.lngLat.lng, e.lngLat.lat];
      const t = toolRef.current;

      if (drag?.mode === "draw" && drag.start) {
        const shape = shapeForDrawTool();
        const square = e.originalEvent.shiftKey;
        setData(
          map,
          "sp-draft",
          draftPreviewViewAligned(map, drag.start, pos, shape, square)
        );
        showDim(
          map,
          dimForViewAligned(map, drag.start, pos, shape, square)
        );
        return;
      }
      if (drag?.mode === "measure" && drag.start) {
        const ft = turf.distance(turf.point(drag.start), turf.point(pos), {
          units: "feet",
        });
        setData(map, "sp-draft", {
          type: "FeatureCollection",
          features: [turf.lineString([drag.start, pos])],
        });
        showDim(map, { at: pos, text: formatLen(ft) });
        return;
      }

      // Live rubber-band for vertex tools
      if (
        (t === "line" || t === "polyline" || t === "polygon") &&
        draftRef.current.length > 0
      ) {
        shiftRef.current = e.originalEvent.shiftKey;
        const snap = orthoRef.current || shiftRef.current;
        const cursor = snapCursor(map, draftRef.current, pos, snap);
        setData(
          map,
          "sp-draft",
          draftPreviewFromVertices(map, draftRef.current, cursor, t, false)
        );
        showDim(map, lineDims(draftRef.current, cursor));
      }
    });

    map.on("mouseup", (e) => {
      const drag = dragRef.current;
      const pos: Position = [e.lngLat.lng, e.lngLat.lat];
      map.dragPan.enable();
      if (!drag) return;
      if (drag.mode === "draw" && drag.start) {
        const shape = shapeForDrawTool();
        const draw = viewAlignedDrawFromScreen(map, drag.start, pos, {
          shape,
          square: e.originalEvent.shiftKey,
        });
        // Optimistic paint so the shape is visible immediately
        const pendingDoc: SitePlanDocument = {
          ...docRef.current,
          instances: [
            ...docRef.current.instances,
            {
              id: `pending_${Date.now()}`,
              typeId: null,
              geometry: draw.geometry,
              rotationDeg: draw.rotationDeg,
              widthFt: draw.widthFt,
              heightFt: draw.heightFt,
              labelOverride: null,
              showLabel: false,
              styleOverride: {
                fill: draw.shape === "circle" ? "#67e8f9" : "#facc15",
                stroke: draw.shape === "circle" ? "#0e7490" : "#854d0e",
                strokeWidth: 2,
              },
            },
          ],
        };
        paintDoc(map, pendingDoc, selectionRef.current);
        setData(map, "sp-draft", emptyFC());
        hideDim();
        map.triggerRepaint();
        suppressClickRef.current = true;
        handlers.current.onDrawComplete(draw);
      }
      if (drag.mode === "measure" && drag.start) {
        handlers.current.onMeasure(drag.start, pos);
        setData(map, "sp-draft", emptyFC());
        hideDim();
      }
      dragRef.current = null;
    });

    map.on("click", (e) => {
      if (dragRef.current) return;
      if (suppressClickRef.current) {
        suppressClickRef.current = false;
        return;
      }
      const t = toolRef.current;
      const { lng, lat } = e.lngLat;
      let pos: Position = [lng, lat];
      shiftRef.current = e.originalEvent.shiftKey;
      const snap = orthoRef.current || shiftRef.current;

      if (t === "select") {
        const doc = docRef.current;
        const labelHit = findLabelHit(doc, lng, lat);
        // Full stack (incl. lines) for Alt-cycle; prefer shapes for normal click
        const stack = findInstanceHitsTopFirst(doc, map, lng, lat);
        const preferred = preferShapeHits(doc, stack);
        const alt = e.originalEvent.altKey;
        let hit: MapSelection = null;
        let pickUnder = false;
        if (alt && stack.length > 1) {
          // Alt/Option+click cycles through overlapping stack (top → under → …)
          const sel = selectionRef.current;
          const cur =
            sel?.kind === "instance"
              ? sel.id
              : sel?.kind === "instances"
                ? sel.ids[0]
                : null;
          const idx = cur ? stack.indexOf(cur) : -1;
          const hitId = stack[(idx + 1) % stack.length] ?? stack[0]!;
          hit = { kind: "instance", id: hitId };
          pickUnder = true;
        } else if (labelHit) {
          hit = labelHit;
        } else if (preferred[0]) {
          hit = { kind: "instance", id: preferred[0] };
        }
        // detail===2 = second click of a double-click → isolate group member
        const isolate = e.originalEvent.detail >= 2 && !pickUnder;
        handlers.current.onSelect(
          hit,
          e.originalEvent.shiftKey,
          isolate,
          pickUnder
        );
        return;
      }
      if (t === "place") {
        handlers.current.onPlace(lng, lat);
        requestAnimationFrame(() => {
          paintDoc(map, docRef.current, selectionRef.current);
          map.triggerRepaint();
        });
        return;
      }
      if (t === "label") {
        handlers.current.onLabelPlace(lng, lat);
        return;
      }
      if (t === "delete") {
        handlers.current.onDeleteAt(lng, lat);
        requestAnimationFrame(() => {
          paintDoc(map, docRef.current, selectionRef.current);
          map.triggerRepaint();
        });
        return;
      }
      if (t === "line" || t === "polyline" || t === "polygon") {
        // Second click of a double-click: let dblclick finish polylines/polygons
        // so we don't commit the same geometry twice.
        if (
          e.originalEvent.detail === 2 &&
          (t === "polyline" || t === "polygon")
        ) {
          return;
        }
        const draft = draftRef.current;
        if (snap && draft.length > 0) {
          pos = orthoSnapViewAligned(map, draft[draft.length - 1]!, pos);
        }
        const finish = t === "line" && draft.length >= 1;
        if (finish) {
          const coords = [...draft, pos].slice(-2);
          if (coords.length >= 2) {
            paintDoc(
              map,
              {
                ...docRef.current,
                instances: [
                  ...docRef.current.instances,
                  {
                    id: `pending_${Date.now()}`,
                    typeId: null,
                    geometry: { type: "LineString", coordinates: coords },
                    rotationDeg: 0,
                    widthFt: 2,
                    heightFt: null,
                    labelOverride: null,
                    showLabel: false,
                    styleOverride: {
                      stroke: "#38bdf8",
                      strokeWidth: 2,
                      dashed: false,
                      fill: "transparent",
                    },
                  },
                ],
              },
              null
            );
            setData(map, "sp-draft", emptyFC());
            hideDim();
            map.triggerRepaint();
          }
        }
        handlers.current.onVertex(pos, finish);
      }
    });

    map.on("dblclick", (e) => {
      // Always block MapLibre's default zoom; select isolate is handled on click detail≥2
      e.preventDefault();
      const t = toolRef.current;
      if (t === "select") return;
      if (t === "polyline" || t === "polygon") {
        e.preventDefault();
        let pos: Position = [e.lngLat.lng, e.lngLat.lat];
        const draft = draftRef.current;
        if (draft.length < 1) return; // already finished
        shiftRef.current = e.originalEvent.shiftKey;
        const snap = orthoRef.current || shiftRef.current;
        if (snap) {
          pos = orthoSnapViewAligned(map, draft[draft.length - 1]!, pos);
        }
        const coords = [...draft, pos];
        if (coords.length >= 2) {
          let geometry: SitePlanDocument["instances"][number]["geometry"] = {
            type: "LineString",
            coordinates: coords,
          };
          let styleOverride: NonNullable<
            SitePlanDocument["instances"][number]["styleOverride"]
          > = {
            stroke: "#38bdf8",
            strokeWidth: 2,
            dashed: false,
            fill: "transparent",
          };
          let widthFt: number | null = 2;
          if (t === "polygon" && coords.length >= 3) {
            const ring = [...coords];
            const f = ring[0]!;
            const l = ring[ring.length - 1]!;
            if (f[0] !== l[0] || f[1] !== l[1]) ring.push(f);
            geometry = { type: "Polygon", coordinates: [ring] };
            styleOverride = {
              fill: "#facc15",
              stroke: "#854d0e",
              strokeWidth: 2,
            };
            widthFt = null;
          }
          paintDoc(
            map,
            {
              ...docRef.current,
              instances: [
                ...docRef.current.instances,
                {
                  id: `pending_${Date.now()}`,
                  typeId: null,
                  geometry,
                  rotationDeg: 0,
                  widthFt,
                  heightFt: null,
                  labelOverride: null,
                  showLabel: false,
                  styleOverride,
                },
              ],
            },
            null
          );
          setData(map, "sp-draft", emptyFC());
          hideDim();
          map.triggerRepaint();
        }
        handlers.current.onVertex(pos, true);
      }
    });

    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === "Shift") shiftRef.current = true;
      if (ev.key === "Enter") {
        const t = toolRef.current;
        if (t === "polyline" || t === "polygon") {
          const draft = draftRef.current;
          if (draft.length) {
            handlers.current.onVertex(draft[draft.length - 1]!, true);
            requestAnimationFrame(() => {
              paintDoc(map, docRef.current, selectionRef.current);
              setData(map, "sp-draft", emptyFC());
              hideDim();
              map.triggerRepaint();
            });
          }
        }
      }
      if (ev.key === "Escape") {
        setData(map, "sp-draft", emptyFC());
        hideDim();
        dragRef.current = null;
      }
    };
    const onKeyUp = (ev: KeyboardEvent) => {
      if (ev.key === "Shift") shiftRef.current = false;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    const onResize = () => map.resize();
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("resize", onResize);
      for (const m of labelMarkersRef.current.values()) m.remove();
      labelMarkersRef.current.clear();
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount once; handlers use refs
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    ensureSources(map);
    paintDoc(map, doc, selection, labelMarkersRef.current);
    map.triggerRepaint();
    // Clear drag preview once committed geometry is on the map
    if (!dragRef.current && draftCoords.length === 0) {
      setData(map, "sp-draft", emptyFC());
      hideDim();
    }
  }, [doc, selection, draftCoords.length]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    if (dragRef.current) return; // mouse drag owns the draft source
    const t = toolRef.current;
    if (
      (t === "line" || t === "polyline" || t === "polygon") &&
      draftCoords.length > 0
    ) {
      setData(
        map,
        "sp-draft",
        draftPreviewFromVertices(map, draftCoords, null, t, false)
      );
      showDim(map, lineDims(draftCoords, null));
      return;
    }
    if (draftCoords.length === 0 && !dragRef.current) {
      setData(map, "sp-draft", emptyFC());
      hideDim();
    }
  }, [draftCoords]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.getCanvas().style.cursor =
      tool === "select"
        ? ""
        : tool === "delete"
          ? "not-allowed"
          : "crosshair";
    map.doubleClickZoom.disable();
  }, [tool]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
      <div
        ref={dimElRef}
        className="pointer-events-none absolute left-0 top-0 z-10 whitespace-nowrap rounded bg-sky-950/90 px-2 py-1 font-mono text-[11px] font-semibold tracking-tight text-sky-50 shadow-md ring-1 ring-sky-400/40"
        style={{ display: "none" }}
        aria-hidden
      />
    </div>
  );
}

/** Stretchable SDF plate so icon-color can tint per feature; stays screen-fixed with zoom. */
function ensureLabelPlateImage(map: maplibregl.Map) {
  if (map.hasImage("sp-label-plate")) return;
  const w = 32;
  const h = 16;
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const edge = x < 2 || y < 2 || x >= w - 2 || y >= h - 2;
      const i = (y * w + x) * 4;
      // SDF-ish: opaque white center, soft edge
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = edge ? 180 : 255;
    }
  }
  map.addImage(
    "sp-label-plate",
    { width: w, height: h, data },
    {
      sdf: true,
      pixelRatio: 2,
      stretchX: [
        [2, w - 2],
      ],
      stretchY: [
        [2, h - 2],
      ],
      content: [2, 2, w - 2, h - 2],
    }
  );
}

function makePlateEl(): HTMLDivElement {
  // Inner content only — MapLibre owns transform on the outer marker root
  const d = document.createElement("div");
  d.className = "sp-label-plate-marker";
  d.style.cssText =
    "pointer-events:none;padding:3px 7px;border-radius:4px;font-family:ui-sans-serif,system-ui,sans-serif;font-weight:600;font-size:12px;line-height:1.2;white-space:nowrap;box-shadow:0 1px 2px rgba(0,0,0,.25);border:1px solid rgba(15,23,42,.15);transform:none";
  return d;
}

function syncFreeLabelMarkers(
  map: maplibregl.Map,
  doc: SitePlanDocument,
  markerMap: Map<string, maplibregl.Marker>
) {
  const seen = new Set<string>();
  for (const lb of doc.freeLabels) {
    seen.add(lb.id);
    let marker = markerMap.get(lb.id);
    const el = marker?.getElement() ?? makePlateEl();
    el.textContent = lb.text;
    // Fixed screen px — do not scale with map zoom
    el.style.fontSize = `${lb.fontSize || 12}px`;
    el.style.color = lb.color || "#0f172a";
    el.style.backgroundColor = lb.backgroundColor || "#ffffff";
    if (!marker) {
      marker = new maplibregl.Marker({
        element: el,
        anchor: "center",
        pitchAlignment: "viewport",
        rotationAlignment: "viewport",
      })
        .setLngLat(lb.position as [number, number])
        .addTo(map);
      markerMap.set(lb.id, marker);
    } else {
      marker.setLngLat(lb.position as [number, number]);
      marker.setPitchAlignment("viewport");
      marker.setRotationAlignment("viewport");
    }
  }

  for (const [id, marker] of markerMap) {
    // Drop legacy instance HTML plates — those are GL symbols now
    if (!seen.has(id) || id.startsWith("inst:")) {
      marker.remove();
      markerMap.delete(id);
    }
  }
}

function paintDoc(
  map: maplibregl.Map,
  doc: SitePlanDocument,
  selection: MapSelection,
  markerMap?: Map<string, maplibregl.Marker>
) {
  const layers = docLayers(doc);
  setData(map, "sp-parcel", layers.parcel);
  setData(map, "sp-fills", layers.fills);
  setData(map, "sp-lines", layers.lines);
  setData(map, "sp-labels", layers.labels);
  // Keep points for hit-testing; visible text comes from HTML markers
  setData(map, "sp-free-labels", layers.freeLabels);
  // Scale bar is title-sheet only (auto on PDF/PNG export) — keep map layers empty
  setData(map, "sp-scale-lines", emptyFC());
  setData(map, "sp-scale-labels", emptyFC());
  if (markerMap) syncFreeLabelMarkers(map, doc, markerMap);

  const selectedIds =
    selection?.kind === "instance"
      ? [selection.id]
      : selection?.kind === "instances"
        ? selection.ids
        : [];
  if (selectedIds.length) {
    const features: Feature[] = [];
    for (const id of selectedIds) {
      const inst = doc.instances.find((i) => i.id === id);
      if (!inst) continue;
      const g = inst.geometry;
      if (g.type === "Polygon") {
        const line = turf.polygonToLine(turf.feature(g) as Feature<Polygon>);
        if (line.type === "FeatureCollection") {
          features.push(...line.features);
        } else {
          features.push(line as Feature);
        }
      } else {
        features.push(turf.feature(g) as Feature);
      }
    }
    setData(map, "sp-selection", {
      type: "FeatureCollection",
      features,
    });
    return;
  }
  setData(map, "sp-selection", emptyFC());
}

function findLabelHit(
  doc: SitePlanDocument,
  lng: number,
  lat: number
): MapSelection {
  const pt = turf.point([lng, lat]);
  for (const lb of doc.freeLabels) {
    const d = turf.distance(pt, turf.point(lb.position), { units: "feet" });
    if (d < 30) return { kind: "label", id: lb.id };
  }
  return null;
}

/** ~px screen tolerance converted to feet at the click location. */
function screenToleranceFt(
  map: maplibregl.Map,
  lng: number,
  lat: number,
  px: number
): number {
  const p = map.project([lng, lat]);
  const a = map.unproject([p.x, p.y]);
  const b = map.unproject([p.x + px, p.y]);
  return Math.max(
    0.25,
    turf.distance(
      turf.point([a.lng, a.lat]),
      turf.point([b.lng, b.lat]),
      { units: "feet" }
    )
  );
}

type HitKind = "shape" | "line";

/**
 * Hit-test one instance.
 * Shapes get a small near-miss; lines stay tight so corridors don't
 * steal clicks from neighbors.
 */
function instanceHitKind(
  doc: SitePlanDocument,
  inst: SitePlanDocument["instances"][number],
  map: maplibregl.Map,
  lng: number,
  lat: number
): HitKind | null {
  const pt = turf.point([lng, lat]);
  try {
    if (inst.geometry.type === "Polygon") {
      const poly = turf.feature(inst.geometry as Polygon);
      if (turf.booleanPointInPolygon(pt, poly)) return "shape";
      // ~5px edge grace — easier to grab items beside fat lines
      const grace = screenToleranceFt(map, lng, lat, 5);
      try {
        const padded = turf.buffer(poly, grace, { units: "feet", steps: 4 });
        if (
          padded &&
          (padded.geometry.type === "Polygon" ||
            padded.geometry.type === "MultiPolygon") &&
          turf.booleanPointInPolygon(pt, padded as Feature<Polygon>)
        ) {
          return "shape";
        }
      } catch {
        /* skip pad */
      }
      return null;
    }
    if (inst.geometry.type === "Point") {
      const d = turf.distance(pt, turf.point(inst.geometry.coordinates), {
        units: "feet",
      });
      return d <= screenToleranceFt(map, lng, lat, 6) ? "shape" : null;
    }
    if (inst.geometry.type === "LineString") {
      const type = inst.typeId
        ? doc.objectTypes.find((t) => t.id === inst.typeId)
        : undefined;
      const widthFt = resolveLineWidthFt(inst, type);
      const nearest = turf.nearestPointOnLine(
        turf.feature(inst.geometry) as Feature<LineString>,
        pt,
        { units: "feet" }
      );
      const dist = nearest.properties.dist ?? 99;
      // Hairline pick: ~3.5px (was 8)
      const centerTol = screenToleranceFt(map, lng, lat, 3.5);
      if (widthFt == null || widthFt < 0.5) {
        return dist <= centerTol ? "line" : null;
      }
      // Corridor: only the inner band counts — outer ~6px of each side
      // stays click-through so neighboring items can be selected.
      const half = widthFt / 2;
      const edgeSlack = screenToleranceFt(map, lng, lat, 6);
      const pickHalf = Math.max(centerTol, half - edgeSlack);
      if (dist > pickHalf) return null;
      const corridor = bufferLineWidthFt(inst.geometry, widthFt);
      if (
        corridor &&
        turf.booleanPointInPolygon(pt, corridor as Feature<Polygon>)
      ) {
        return "line";
      }
      return null;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Overlapping instances at a point, front (top) → back.
 * Includes both shapes and lines (for Alt-cycle).
 */
function findInstanceHitsTopFirst(
  doc: SitePlanDocument,
  map: maplibregl.Map,
  lng: number,
  lat: number
): string[] {
  const hits: string[] = [];
  for (let i = doc.instances.length - 1; i >= 0; i--) {
    const inst = doc.instances[i]!;
    if (instanceHitKind(doc, inst, map, lng, lat)) hits.push(inst.id);
  }
  return hits;
}

/**
 * Prefer area shapes over lines/polylines so corridors don't block
 * selecting objects drawn on/under/beside them.
 */
function preferShapeHits(
  doc: SitePlanDocument,
  stack: string[]
): string[] {
  const shapes: string[] = [];
  const lines: string[] = [];
  for (const id of stack) {
    const inst = doc.instances.find((i) => i.id === id);
    if (!inst) continue;
    if (inst.geometry.type === "LineString") lines.push(id);
    else shapes.push(id);
  }
  return shapes.length ? shapes : lines;
}

function findHit(
  doc: SitePlanDocument,
  map: maplibregl.Map | null,
  lng: number,
  lat: number
): MapSelection {
  const label = findLabelHit(doc, lng, lat);
  if (label) return label;
  if (!map) return null;
  const stack = findInstanceHitsTopFirst(doc, map, lng, lat);
  const preferred = preferShapeHits(doc, stack);
  if (preferred[0]) return { kind: "instance", id: preferred[0] };
  return null;
}
