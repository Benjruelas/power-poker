"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import type { FeatureCollection, Point } from "geojson";
import { Droplets, Satellite } from "lucide-react";
import "maplibre-gl/dist/maplibre-gl.css";

import { useAppStore } from "@/lib/store";
import {
  circlePolygon,
  countyMatchesFilter,
  formatMw,
  interconnectionFyiUrl,
} from "@/lib/geo";
import type { Market } from "@/lib/types";
import { MapAddressSearch } from "@/components/map/MapAddressSearch";
import { ParcelPopup } from "@/components/parcel/ParcelPopup";
import { fetchLandRecordsParcel } from "@/lib/landrecords/fetchParcel";
import { computeOwnerOccupied } from "@/lib/landrecords/ownerOccupied";
import {
  mapProperties,
  resolveParcelDisplayAddress,
  type ParcelPopupView,
  type SelectedParcel,
} from "@/lib/landrecords/parcelPropertyMap";
import type {
  QueueProjectProperties,
  SubstationProperties,
  TransmissionLineProperties,
} from "@/lib/types";
import { FUEL_COLORS } from "@/lib/types";
import {
  NO_PARCEL_LIST_ID,
  reviewFeatureIds,
  YES_PARCEL_LIST_ID,
} from "@/lib/lists/parcelReview";

function buildParcelViews(
  properties: ReturnType<typeof mapProperties>,
  lat: number,
  lng: number,
  lrid?: string,
  loading = false
): { popup: ParcelPopupView; focus: SelectedParcel } {
  const display = resolveParcelDisplayAddress(properties);
  const yearBuilt = properties.YEAR_BUILT
    ? parseInt(String(properties.YEAR_BUILT), 10)
    : NaN;
  const age = Number.isFinite(yearBuilt)
    ? new Date().getFullYear() - yearBuilt
    : null;
  const parcelId =
    String(properties.PROP_ID || lrid || `${lat.toFixed(5)},${lng.toFixed(5)}`);
  const focus: SelectedParcel = {
    id: parcelId,
    lat,
    lng,
    address: display.fullAddress || display.title,
    properties,
    lrid,
  };
  const popup: ParcelPopupView = {
    parcelId,
    lat,
    lng,
    address: loading ? "Loading…" : display.title,
    addressSubtitle: display.subtitle,
    ownerName: String(properties.OWNER_NAME || ""),
    age,
    ownerOccupied: computeOwnerOccupied(properties),
    assessorDataLimited: !loading && !display.hasStreetAddress,
    loading,
  };
  return { popup, focus };
}

const PARCEL_MIN_ZOOM = 15;
const PARCEL_TILE_MAXZOOM = 16;
const ADDRESS_SELECT_ZOOM = 17;
const PARCEL_SOURCE = "parcels";
const PARCEL_SOURCE_LAYER = "parcel_us";
const PARCEL_FILL = "parcels-fill";
const PARCEL_LINE = "parcels-line";
const PARCEL_LINE_HALO = "parcels-line-halo";

const FS_CLICKED = [
  "boolean",
  ["feature-state", "clicked"],
  false,
] as unknown as maplibregl.ExpressionSpecification;

const FS_REVIEW_YES = [
  "==",
  ["feature-state", "review"],
  "yes",
] as unknown as maplibregl.ExpressionSpecification;

const FS_REVIEW_NO = [
  "==",
  ["feature-state", "review"],
  "no",
] as unknown as maplibregl.ExpressionSpecification;

/** Street vs satellite parcel paint — reviewed Yes/No stand out clearly. */
function applyParcelBasemapPaint(map: maplibregl.Map, satellite: boolean) {
  if (!map.getLayer(PARCEL_FILL) || !map.getLayer(PARCEL_LINE)) return;

  const fillColor: maplibregl.ExpressionSpecification = [
    "case",
    FS_REVIEW_YES,
    "#16a34a",
    FS_REVIEW_NO,
    "#dc2626",
    satellite ? "#38bdf8" : "#2563eb",
  ];
  const lineColor: maplibregl.ExpressionSpecification = [
    "case",
    FS_REVIEW_YES,
    "#15803d",
    FS_REVIEW_NO,
    "#b91c1c",
    satellite ? "#f8fafc" : "#2563eb",
  ];
  const fillOpacity: maplibregl.ExpressionSpecification = [
    "case",
    FS_REVIEW_YES,
    0.5,
    FS_REVIEW_NO,
    0.45,
    FS_CLICKED,
    satellite ? 0.4 : 0.45,
    satellite ? 0 : 0.04,
  ];
  const lineWidth: maplibregl.ExpressionSpecification = [
    "case",
    FS_REVIEW_YES,
    3.25,
    FS_REVIEW_NO,
    3.25,
    FS_CLICKED,
    satellite ? 3.5 : 3,
    satellite ? 2 : 1.5,
  ];
  const lineOpacity: maplibregl.ExpressionSpecification = [
    "case",
    FS_REVIEW_YES,
    1,
    FS_REVIEW_NO,
    1,
    FS_CLICKED,
    1,
    satellite ? 1 : 0.85,
  ];

  map.setPaintProperty(PARCEL_FILL, "fill-color", fillColor);
  map.setPaintProperty(PARCEL_FILL, "fill-opacity", fillOpacity);
  map.setPaintProperty(PARCEL_LINE, "line-color", lineColor);
  map.setPaintProperty(PARCEL_LINE, "line-width", lineWidth);
  map.setPaintProperty(PARCEL_LINE, "line-opacity", lineOpacity);
}

function setParcelReviewState(
  map: maplibregl.Map,
  featureId: string,
  review: "yes" | "no" | null
) {
  try {
    map.setFeatureState(
      {
        source: PARCEL_SOURCE,
        sourceLayer: PARCEL_SOURCE_LAYER,
        id: featureId,
      },
      { review }
    );
  } catch {
    /* feature not in loaded tiles yet */
  }
}

function setParcelLayerVisibility(
  map: maplibregl.Map,
  show: boolean,
  satellite: boolean
) {
  setVis(map, PARCEL_FILL, show);
  setVis(map, PARCEL_LINE, show);
  // Halo only helps on imagery; keep it off for the light basemap
  setVis(map, PARCEL_LINE_HALO, show && satellite);
}

function setParcelClickedState(
  map: maplibregl.Map,
  featureId: string,
  clicked: boolean
) {
  try {
    map.setFeatureState(
      {
        source: PARCEL_SOURCE,
        sourceLayer: PARCEL_SOURCE_LAYER,
        id: featureId,
      },
      { clicked }
    );
  } catch {
    /* feature not in loaded tiles yet */
  }
}

/** Wipe all parcel feature-state — per-id clear fails when the old tile unloaded. */
function clearAllParcelHighlights(map: maplibregl.Map) {
  try {
    map.removeFeatureState({
      source: PARCEL_SOURCE,
      sourceLayer: PARCEL_SOURCE_LAYER,
    });
  } catch {
    /* source not ready */
  }
}

function applyParcelHighlight(
  map: maplibregl.Map,
  clickedFeatureIdRef: { current: string | null },
  featureId: string | null
) {
  clearAllParcelHighlights(map);
  clickedFeatureIdRef.current = featureId;
  if (featureId) setParcelClickedState(map, featureId, true);
}

/** Prefer smallest screen bbox when parcels overlap (same as click). */
function pickSmallestParcelFeature(
  map: maplibregl.Map,
  feats: maplibregl.MapGeoJSONFeature[]
): maplibregl.MapGeoJSONFeature | null {
  if (!feats.length) return null;
  let feat = feats[0]!;
  let bestArea = Infinity;
  for (const f of feats) {
    const geom = f.geometry;
    if (geom.type !== "Polygon" && geom.type !== "MultiPolygon") continue;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    const walk = (node: unknown): void => {
      if (!Array.isArray(node)) return;
      if (typeof node[0] === "number" && typeof node[1] === "number") {
        const pt = map.project([node[0], node[1]]);
        minX = Math.min(minX, pt.x);
        minY = Math.min(minY, pt.y);
        maxX = Math.max(maxX, pt.x);
        maxY = Math.max(maxY, pt.y);
        return;
      }
      for (const child of node) walk(child);
    };
    walk(geom.coordinates);
    const area = Math.max(0, maxX - minX) * Math.max(0, maxY - minY);
    if (area > 0 && area < bestArea) {
      bestArea = area;
      feat = f;
    }
  }
  return feat;
}

function queryParcelAtLngLat(
  map: maplibregl.Map,
  lng: number,
  lat: number
): maplibregl.MapGeoJSONFeature | null {
  if (!map.getLayer(PARCEL_FILL) || map.getZoom() < PARCEL_MIN_ZOOM) {
    return null;
  }
  const point = map.project([lng, lat]);
  const feats = map.queryRenderedFeatures(point, { layers: [PARCEL_FILL] });
  return pickSmallestParcelFeature(map, feats);
}

type SubsFC = FeatureCollection<Point, SubstationProperties>;
type ProjFC = FeatureCollection<Point, QueueProjectProperties>;
type LinesFC = FeatureCollection<
  GeoJSON.LineString | GeoJSON.MultiLineString,
  TransmissionLineProperties
>;

type DrawnSub = {
  id: string;
  lng: number;
  lat: number;
  score: number;
  name: string;
  voltageClass: string;
  queuedMw5mi: number;
};

type DrawnProj = {
  inr: string;
  market: Market;
  lng: number;
  lat: number;
  fuel: string;
  name: string;
  fuelDisplay: string;
  capacityMw: number;
  funnelStage: string;
  geometryPrecision: "substation" | "county";
};

/** Individual substations begin to appear; fully opaque when "over" a site. */
const DOT_REVEAL_START = 6;
const DOT_OPAQUE_ZOOM = 11;
/** County-centroid projects only drawn at/above this zoom. */
const PROJECT_COUNTY_ZOOM = 8;

const HEAT_SOURCE = "substation-heat";
const HEAT_LAYER = "substation-heat";

function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function rgba(hex: string, a: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

/** Discrete substations: ghostly until zoomed in over them. */
function subStyleForZoom(z: number): {
  radius: number;
  alpha: number;
  strokeAlpha: number;
  interactive: boolean;
} {
  const t = clamp01((z - DOT_REVEAL_START) / (DOT_OPAQUE_ZOOM - DOT_REVEAL_START));
  // Stay see-through for most of the ramp; snap toward solid near opaque zoom
  const alpha =
    t <= 0
      ? 0
      : t < 0.75
        ? lerp(0.12, 0.45, t / 0.75)
        : lerp(0.45, 1, (t - 0.75) / 0.25);
  return {
    radius: lerp(2.2, 5.5, t),
    alpha,
    strokeAlpha: t < 0.75 ? 0 : lerp(0, 0.9, (t - 0.75) / 0.25),
    interactive: alpha >= 0.2,
  };
}

function projStyleForZoom(z: number): {
  mode: "hidden" | "individual";
  radius: number;
  alpha: number;
  strokeAlpha: number;
  allowCounty: boolean;
  interactive: boolean;
} {
  if (z < DOT_REVEAL_START) {
    return {
      mode: "hidden",
      radius: 3.5,
      alpha: 0,
      strokeAlpha: 0,
      allowCounty: false,
      interactive: false,
    };
  }
  const t = clamp01((z - 7) / (DOT_OPAQUE_ZOOM - 7));
  const alpha =
    t < 0.7 ? lerp(0.1, 0.4, t / 0.7) : lerp(0.4, 1, (t - 0.7) / 0.3);
  return {
    mode: "individual",
    radius: lerp(2, 3.5, t),
    alpha,
    strokeAlpha: t < 0.7 ? 0 : lerp(0, 0.85, (t - 0.7) / 0.3),
    allowCounty: z >= PROJECT_COUNTY_ZOOM,
    interactive: alpha >= 0.2,
  };
}

function heatFeaturesFromSubs(
  subs: DrawnSub[]
): GeoJSON.FeatureCollection<GeoJSON.Point> {
  const features: GeoJSON.Feature<GeoJSON.Point>[] = [];
  for (let i = 0; i < subs.length; i++) {
    const s = subs[i];
    features.push({
      type: "Feature",
      properties: { score: s.score },
      geometry: { type: "Point", coordinates: [s.lng, s.lat] },
    });
  }
  return { type: "FeatureCollection", features };
}

/** Hit-test only when dots are revealed enough to interact (not the haze). */
function hitTestOverlay(
  map: maplibregl.Map,
  x: number,
  y: number,
  subs: DrawnSub[],
  projs: DrawnProj[]
): {
  sub: DrawnSub | null;
  subDist: number;
  proj: DrawnProj | null;
  projDist: number;
} {
  const z = map.getZoom();
  const subStyle = subStyleForZoom(z);
  const projStyle = projStyleForZoom(z);

  let bestSub: DrawnSub | null = null;
  let bestSubDist = Infinity;
  if (subStyle.interactive) {
    const hitR = Math.max(subStyle.radius + 4.5, 10);
    for (let i = 0; i < subs.length; i++) {
      const s = subs[i];
      const pt = map.project([s.lng, s.lat]);
      const d = Math.hypot(pt.x - x, pt.y - y);
      if (d <= hitR && d < bestSubDist) {
        bestSubDist = d;
        bestSub = s;
      }
    }
  }

  let bestProj: DrawnProj | null = null;
  let bestProjDist = Infinity;
  if (projStyle.mode !== "hidden" && projStyle.interactive) {
    const hitR = Math.max(projStyle.radius + 4.5, 8);
    for (let i = 0; i < projs.length; i++) {
      const p = projs[i];
      if (!projStyle.allowCounty && p.geometryPrecision !== "substation") {
        continue;
      }
      const pt = map.project([p.lng, p.lat]);
      const d = Math.hypot(pt.x - x, pt.y - y);
      if (d <= hitR && d < bestProjDist) {
        bestProjDist = d;
        bestProj = p;
      }
    }
  }

  return {
    sub: bestSub,
    subDist: bestSubDist,
    proj: bestProj,
    projDist: bestProjDist,
  };
}

/** Basemap without labels — labels render in a top overlay above substations. */
const OSM_TILES = [
  "https://a.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}@2x.png",
  "https://b.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}@2x.png",
  "https://c.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}@2x.png",
];
const SAT_TILES = [
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
];
const STREET_LABEL_TILES = [
  "https://a.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}@2x.png",
  "https://b.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}@2x.png",
  "https://c.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}@2x.png",
];
/** Place labels designed for Esri World Imagery (cream text + markers). */
const SAT_LABEL_TILES = [
  "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
];
const OSM_ATTR =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; CARTO';
const SAT_ATTR = "Esri, Maxar, Earthstar Geographics";

const LABELS_SOURCE = "place-labels";
const LABELS_LAYER = "place-labels";

/** City / place names — always the top MapLibre layer (above parcels & heat). */
function ensurePlaceLabels(map: maplibregl.Map, satellite: boolean) {
  const tiles = satellite ? SAT_LABEL_TILES : STREET_LABEL_TILES;
  const attribution = satellite
    ? "Esri Boundaries & Places"
    : "CARTO / OSM labels";

  if (!map.getSource(LABELS_SOURCE)) {
    map.addSource(LABELS_SOURCE, {
      type: "raster",
      tiles,
      tileSize: 256,
      attribution,
    });
  } else {
    const src = map.getSource(LABELS_SOURCE) as maplibregl.RasterTileSource;
    if (typeof src.setTiles === "function") {
      src.setTiles(tiles);
      if (typeof src.load === "function") src.load();
    }
  }

  if (!map.getLayer(LABELS_LAYER)) {
    map.addLayer({
      id: LABELS_LAYER,
      type: "raster",
      source: LABELS_SOURCE,
      paint: {
        "raster-opacity": 1,
        "raster-fade-duration": 0,
      },
    });
  } else {
    map.setPaintProperty(LABELS_LAYER, "raster-opacity", 1);
  }

  // Keep above every other map layer so names aren't buried under heat/parcels
  if (map.getLayer(LABELS_LAYER)) {
    map.moveLayer(LABELS_LAYER);
  }
}

function applyLabelTiles(map: maplibregl.Map, satellite: boolean) {
  ensurePlaceLabels(map, satellite);
}

const FLOOD_SOURCE = "flood-zones";
const FLOOD_LAYER = "flood-zones";
/** Proxied FEMA NFHL WMS (layer 12) — browser can't hit hazards.fema.gov (CORS). */
const FLOOD_ATTR = "FEMA National Flood Hazard Layer";

const FIBER_COV_SOURCE = "fiber-coverage";
const FIBER_COV_FILL = "fiber-coverage-fill";
const FIBER_COV_LINE = "fiber-coverage-line";
const FIBER_COV_ATTR = "FCC Broadband Data Collection via Esri Living Atlas";

function floodTileUrls(): string[] {
  const origin =
    typeof window !== "undefined" ? window.location.origin : "";
  return [`${origin}/api/flood-tiles?z={z}&x={x}&y={y}`];
}

/** Single style so satellite toggle never wipes parcel / overlay layers. */
function buildMapStyle(satellite: boolean): maplibregl.StyleSpecification {
  return {
    version: 8,
    sources: {
      basemap: {
        type: "raster",
        tiles: satellite ? SAT_TILES : OSM_TILES,
        tileSize: 256,
        attribution: satellite ? SAT_ATTR : OSM_ATTR,
      },
    },
    layers: [
      {
        id: "background",
        type: "background",
        paint: {
          "background-color": satellite ? "#d4d4d8" : "#e8eef4",
        },
      },
      { id: "basemap", type: "raster", source: "basemap" },
    ],
  };
}

/** Swap raster tiles in place — keeps parcels and other custom layers. */
function applyBasemap(map: maplibregl.Map, satellite: boolean) {
  const src = map.getSource("basemap") as maplibregl.RasterTileSource | undefined;
  if (src && typeof src.setTiles === "function") {
    src.setTiles(satellite ? SAT_TILES : OSM_TILES);
  }
  if (map.getLayer("background")) {
    map.setPaintProperty(
      "background",
      "background-color",
      satellite ? "#d4d4d8" : "#e8eef4"
    );
  }
}

function emptyFC(): GeoJSON.FeatureCollection {
  return { type: "FeatureCollection", features: [] };
}

function scoreColor(score: number): string {
  if (score >= 85) return "#0d9488";
  if (score >= 70) return "#22c55e";
  if (score >= 55) return "#84cc16";
  if (score >= 40) return "#f59e0b";
  return "#ef4444";
}

function ensureBaseLayers(map: maplibregl.Map, satellite: boolean) {
  // FEMA flood zones — above basemap, below counties/lines/parcels
  if (!map.getSource(FLOOD_SOURCE)) {
    map.addSource(FLOOD_SOURCE, {
      type: "raster",
      tiles: floodTileUrls(),
      tileSize: 256,
      attribution: FLOOD_ATTR,
    });
    map.addLayer({
      id: FLOOD_LAYER,
      type: "raster",
      source: FLOOD_SOURCE,
      layout: { visibility: "none" },
      paint: { "raster-opacity": 0.55 },
    });
  }

  // FCC BDC fiber availability polygons (bbox-fetched via /api/fiber-coverage)
  const fiberCovFillOpacity: maplibregl.ExpressionSpecification = [
    "interpolate",
    ["linear"],
    ["coalesce", ["get", "uniqueProvidersFiber"], 1],
    1,
    0.28,
    5,
    0.4,
    15,
    0.55,
  ];
  if (!map.getSource(FIBER_COV_SOURCE)) {
    map.addSource(FIBER_COV_SOURCE, {
      type: "geojson",
      data: emptyFC(),
      attribution: FIBER_COV_ATTR,
    });
  }
  if (!map.getLayer(FIBER_COV_FILL)) {
    map.addLayer({
      id: FIBER_COV_FILL,
      type: "fill",
      source: FIBER_COV_SOURCE,
      layout: { visibility: "none" },
      paint: {
        "fill-color": "#0d9488",
        "fill-opacity": fiberCovFillOpacity,
      },
    });
  } else {
    map.setPaintProperty(FIBER_COV_FILL, "fill-opacity", fiberCovFillOpacity);
  }
  if (!map.getLayer(FIBER_COV_LINE)) {
    map.addLayer({
      id: FIBER_COV_LINE,
      type: "line",
      source: FIBER_COV_SOURCE,
      layout: { visibility: "none" },
      paint: {
        "line-color": "#0f766e",
        "line-width": 1,
        "line-opacity": 0.65,
      },
    });
  } else {
    map.setPaintProperty(FIBER_COV_LINE, "line-width", 1);
    map.setPaintProperty(FIBER_COV_LINE, "line-opacity", 0.65);
  }

  // Opportunity density — below counties so state/county lines stay readable
  if (!map.getSource(HEAT_SOURCE)) {
    map.addSource(HEAT_SOURCE, { type: "geojson", data: emptyFC() });
  }
  if (!map.getLayer(HEAT_LAYER)) {
    map.addLayer({
      id: HEAT_LAYER,
      type: "heatmap",
      source: HEAT_SOURCE,
      maxzoom: 10,
      paint: {
        "heatmap-weight": [
          "interpolate",
          ["linear"],
          ["get", "score"],
          0,
          0.12,
          40,
          0.3,
          70,
          0.65,
          100,
          1,
        ],
        "heatmap-intensity": [
          "interpolate",
          ["linear"],
          ["zoom"],
          2,
          0.3,
          5,
          0.45,
          8,
          0.2,
        ],
        "heatmap-radius": [
          "interpolate",
          ["linear"],
          ["zoom"],
          2,
          12,
          5,
          18,
          8,
          26,
        ],
        // Very transparent at national zoom; gone by ~z9 as dots take over
        "heatmap-opacity": [
          "interpolate",
          ["linear"],
          ["zoom"],
          2,
          0.18,
          4,
          0.16,
          6,
          0.1,
          8,
          0.04,
          9,
          0,
        ],
        "heatmap-color": [
          "interpolate",
          ["linear"],
          ["heatmap-density"],
          0,
          "rgba(0,0,0,0)",
          0.2,
          "rgba(239,68,68,0.25)",
          0.4,
          "rgba(245,158,11,0.3)",
          0.6,
          "rgba(132,204,22,0.35)",
          0.8,
          "rgba(34,197,94,0.4)",
          1,
          "rgba(13,148,136,0.45)",
        ],
      },
    });
  }

  if (!map.getSource("counties")) {
    map.addSource("counties", { type: "geojson", data: emptyFC() });
    map.addLayer({
      id: "counties-fill",
      type: "fill",
      source: "counties",
      layout: { visibility: "none" },
      paint: { "fill-color": "#64748b", "fill-opacity": 0.05 },
    });
    map.addLayer({
      id: "counties-line",
      type: "line",
      source: "counties",
      layout: { visibility: "none" },
      paint: {
        "line-color": "#475569",
        "line-width": 0.8,
        "line-opacity": 0.55,
      },
    });
  }

  // State boundaries — white, above county grey so they read clearly
  if (!map.getSource("states")) {
    map.addSource("states", { type: "geojson", data: emptyFC() });
  }
  if (!map.getLayer("states-line")) {
    map.addLayer({
      id: "states-line",
      type: "line",
      source: "states",
      layout: { visibility: "none" },
      paint: {
        "line-color": "#ffffff",
        "line-width": 1.75,
        "line-opacity": 0.95,
      },
    });
  } else {
    map.setPaintProperty("states-line", "line-color", "#ffffff");
    map.setPaintProperty("states-line", "line-width", 1.75);
    map.setPaintProperty("states-line", "line-opacity", 0.95);
  }

  // Heat stays under county boundaries; white state lines sit above county grey
  if (map.getLayer(HEAT_LAYER) && map.getLayer("counties-fill")) {
    map.moveLayer(HEAT_LAYER, "counties-fill");
  }
  if (map.getLayer("states-line") && map.getLayer("lines-layer")) {
    map.moveLayer("states-line", "lines-layer");
  }

  if (!map.getSource("lines")) {
    map.addSource("lines", { type: "geojson", data: emptyFC() });
  }
  if (!map.getLayer("lines-layer")) {
    map.addLayer({
      id: "lines-layer",
      type: "line",
      source: "lines",
      layout: { visibility: "none" },
      paint: {
        "line-color": "#facc15",
        "line-width": 1.75,
        "line-opacity": 1,
      },
    });
  } else {
    // Always re-apply — layer often survives HMR with old paint
    map.setPaintProperty("lines-layer", "line-color", "#facc15");
    map.setPaintProperty("lines-layer", "line-width", 1.75);
    map.setPaintProperty("lines-layer", "line-opacity", 1);
  }

  // LandRecords parcels (above counties/lines, below fiber routes / rings)
  if (!map.getSource(PARCEL_SOURCE)) {
    const origin =
      typeof window !== "undefined" ? window.location.origin : "";
    map.addSource(PARCEL_SOURCE, {
      type: "vector",
      tiles: [`${origin}/api/tiles?z={z}&x={x}&y={y}`],
      minzoom: PARCEL_MIN_ZOOM,
      maxzoom: PARCEL_TILE_MAXZOOM,
      promoteId: { [PARCEL_SOURCE_LAYER]: "lrid" },
    });
    map.addLayer({
      id: PARCEL_FILL,
      type: "fill",
      source: PARCEL_SOURCE,
      "source-layer": PARCEL_SOURCE_LAYER,
      minzoom: PARCEL_MIN_ZOOM,
      paint: {
        "fill-color": "#2563eb",
        "fill-opacity": ["case", FS_CLICKED, 0.45, 0.04],
      },
    });
    // Dark halo under the outline so boundaries stay readable on satellite
    map.addLayer({
      id: PARCEL_LINE_HALO,
      type: "line",
      source: PARCEL_SOURCE,
      "source-layer": PARCEL_SOURCE_LAYER,
      minzoom: PARCEL_MIN_ZOOM,
      layout: { visibility: "none" },
      paint: {
        "line-color": "#0f172a",
        "line-width": ["case", FS_CLICKED, 5, 3.5],
        "line-opacity": 0.85,
      },
    });
    map.addLayer({
      id: PARCEL_LINE,
      type: "line",
      source: PARCEL_SOURCE,
      "source-layer": PARCEL_SOURCE_LAYER,
      minzoom: PARCEL_MIN_ZOOM,
      paint: {
        "line-color": "#2563eb",
        "line-width": ["case", FS_CLICKED, 3, 1.5],
        "line-opacity": ["case", FS_CLICKED, 1, 0.85],
      },
    });
  }

  if (!map.getSource("rings")) {
    map.addSource("rings", { type: "geojson", data: emptyFC() });
    map.addLayer({
      id: "rings-fill",
      type: "fill",
      source: "rings",
      paint: { "fill-color": "#0891b2", "fill-opacity": 0.08 },
    });
    map.addLayer({
      id: "rings-line",
      type: "line",
      source: "rings",
      paint: {
        "line-color": "#0891b2",
        "line-width": 2,
        "line-dasharray": [2, 1],
      },
    });
  } else {
    // Keep rings above parcels after style reloads
    if (map.getLayer("rings-fill")) map.moveLayer("rings-fill");
    if (map.getLayer("rings-line")) map.moveLayer("rings-line");
  }

  // City names last so they sit above heat, counties, parcels, and rings
  ensurePlaceLabels(map, satellite);
}

function setVis(map: maplibregl.Map, id: string, on: boolean) {
  if (!map.getLayer(id)) return;
  map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
}

interface BessMapProps {
  substations: SubsFC | null;
  projects: ProjFC | null;
  lines: LinesFC | null;
  counties: FeatureCollection | null;
  states: FeatureCollection | null;
}

export function BessMap({
  substations,
  projects,
  lines,
  counties,
  states,
}: BessMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const drawnSubsRef = useRef<DrawnSub[]>([]);
  const drawnProjsRef = useRef<DrawnProj[]>([]);
  const substationsRef = useRef(substations);
  const countiesRef = useRef(counties);
  const statesRef = useRef(states);
  const paintRef = useRef<() => void>(() => {});
  const parcelAbortRef = useRef<AbortController | null>(null);
  const clickedFeatureIdRef = useRef<string | null>(null);
  const showParcelsRef = useRef(true);
  const filtersRef = useRef(useAppStore.getState().filters);
  /** Tracks the basemap actually applied on the map (not just filter state). */
  const satRef = useRef(useAppStore.getState().filters.satellite);
  const selectParcelAtRef = useRef<
    (
      lng: number,
      lat: number,
      feat?: maplibregl.MapGeoJSONFeature | null,
      knownLrid?: string
    ) => void
  >(() => {});
  const flyToAddressRef = useRef<
    (
      lng: number,
      lat: number,
      meta?: { lrid?: string; kind?: string; substationId?: string }
    ) => void
  >(() => {});

  const filters = useAppStore((s) => s.filters);
  const setFilters = useAppStore((s) => s.setFilters);
  const selected = useAppStore((s) => s.selectedSubstation);
  const setSelectedSubstation = useAppStore((s) => s.setSelectedSubstation);
  const setPanelTab = useAppStore((s) => s.setPanelTab);
  const parcelPopup = useAppStore((s) => s.parcelPopup);
  const setParcelPopup = useAppStore((s) => s.setParcelPopup);
  const closeParcelPopup = useAppStore((s) => s.closeParcelPopup);
  const openParcelDetails = useAppStore((s) => s.openParcelDetails);
  const parcelLists = useAppStore((s) => s.parcelLists);
  const reviewIdsRef = useRef<{
    yes: Set<string>;
    no: Set<string>;
    all: Set<string>;
  }>({ yes: new Set(), no: new Set(), all: new Set() });

  const [mapReady, setMapReady] = useState(false);
  const [status, setStatus] = useState("Initializing map…");
  const [drawnCount, setDrawnCount] = useState(0);
  const [fiberCoveragePartial, setFiberCoveragePartial] = useState(false);
  const [searchProximity, setSearchProximity] = useState<
    [number, number] | null
  >(null);

  substationsRef.current = substations;
  countiesRef.current = counties;
  statesRef.current = states;
  showParcelsRef.current = filters.showParcels;
  filtersRef.current = filters;

  const visibleSubs = useMemo(() => {
    if (!substations) return [] as DrawnSub[];
    const minScore = Math.min(filters.minScore, filters.maxScore);
    const maxScore = Math.max(filters.minScore, filters.maxScore);
    const maxQueued =
      Number.isFinite(filters.maxQueuedMw) && filters.maxQueuedMw > 0
        ? filters.maxQueuedMw
        : 10000;
    const out: DrawnSub[] = [];
    for (const f of substations.features) {
      const p = f.properties;
      if (p.maxVolt > 0 && p.maxVolt < filters.minVoltage) continue;
      if (p.opportunityScore < minScore || p.opportunityScore > maxScore)
        continue;
      if (p.queuedMw5mi > maxQueued) continue;
      if (!countyMatchesFilter(p.county, p.state, filters.counties)) {
        continue;
      }
      const coords = f.geometry.coordinates;
      out.push({
        id: p.id,
        lng: coords[0],
        lat: coords[1],
        score: p.opportunityScore,
        name: p.name,
        voltageClass: p.voltageClass,
        queuedMw5mi: p.queuedMw5mi,
      });
    }
    return out;
  }, [substations, filters]);

  const visibleProjs = useMemo(() => {
    if (!projects || !filters.showProjects) return [] as DrawnProj[];
    const out: DrawnProj[] = [];
    for (const f of projects.features) {
      const p = f.properties;
      if (p.capacityMw < filters.minProjectMw) continue;
      if (p.capacityMw > filters.maxProjectMw) continue;
      if (filters.fuels.length && !filters.fuels.includes(p.fuel)) continue;
      if (filters.stages.length && !filters.stages.includes(p.funnelStage))
        continue;
      if (!countyMatchesFilter(p.county, p.state, filters.counties)) {
        continue;
      }
      const coords = f.geometry.coordinates;
      out.push({
        inr: p.inr,
        market: p.market ?? "ERCOT",
        lng: coords[0],
        lat: coords[1],
        fuel: p.fuel,
        name: p.name,
        fuelDisplay: p.fuelDisplay,
        capacityMw: p.capacityMw,
        funnelStage: p.funnelStage,
        geometryPrecision: p.geometryPrecision,
      });
    }
    return out;
  }, [projects, filters]);

  drawnSubsRef.current = filters.showSubstations ? visibleSubs : [];
  drawnProjsRef.current = visibleProjs;

  // Single primitive key so this effect's dep array never changes size (HMR-safe)
  // and never includes FeatureCollections / Drawn* arrays (React joins deps for errors).
  const paintEpoch = useMemo(
    () =>
      [
        filters.showSubstations ? 1 : 0,
        filters.minVoltage,
        filters.minScore,
        filters.maxScore,
        filters.maxQueuedMw,
        filters.counties.join("|"),
        filters.showProjects ? 1 : 0,
        filters.minProjectMw,
        filters.maxProjectMw,
        filters.fuels.join(","),
        filters.stages.join(","),
        substations?.features.length ?? 0,
        projects?.features.length ?? 0,
        visibleSubs.length,
        visibleProjs.length,
      ].join("\0"),
    [
      filters.showSubstations,
      filters.minVoltage,
      filters.minScore,
      filters.maxScore,
      filters.maxQueuedMw,
      filters.counties,
      filters.showProjects,
      filters.minProjectMw,
      filters.maxProjectMw,
      filters.fuels,
      filters.stages,
      substations?.features.length,
      projects?.features.length,
      visibleSubs.length,
      visibleProjs.length,
    ]
  );

  paintRef.current = () => {
    const map = mapRef.current;
    const canvas = overlayRef.current;
    if (!map || !canvas) return;

    const rect = canvas.parentElement?.getBoundingClientRect();
    if (!rect || rect.width < 2 || rect.height < 2) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(rect.width);
    const h = Math.round(rect.height);
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const z = map.getZoom();
    const subStyle = subStyleForZoom(z);
    const projStyle = projStyleForZoom(z);

    const bounds = map.getBounds();
    const west = bounds.getWest();
    const east = bounds.getEast();
    const south = bounds.getSouth();
    const north = bounds.getNorth();
    const padLng = (east - west) * 0.02;
    const padLat = (north - south) * 0.02;

    const inBounds = (lng: number, lat: number) =>
      lng >= west - padLng &&
      lng <= east + padLng &&
      lat >= south - padLat &&
      lat <= north + padLat;

    // Projects (deferred / precision-gated); translucent until close
    if (projStyle.mode !== "hidden" && projStyle.alpha > 0.01) {
      const projs = drawnProjsRef.current;
      for (let i = 0; i < projs.length; i++) {
        const p = projs[i];
        if (!projStyle.allowCounty && p.geometryPrecision !== "substation") {
          continue;
        }
        if (!inBounds(p.lng, p.lat)) continue;
        const pt = map.project([p.lng, p.lat]);
        const fill = FUEL_COLORS[p.fuel] ?? FUEL_COLORS.OTH;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, projStyle.radius, 0, Math.PI * 2);
        ctx.fillStyle = rgba(fill, projStyle.alpha);
        ctx.fill();
        if (projStyle.strokeAlpha > 0.01) {
          ctx.lineWidth = 1;
          ctx.strokeStyle = rgba("#ffffff", projStyle.strokeAlpha);
          ctx.stroke();
        }
      }
    }

    // Substations emerge from the MapLibre haze; map stays visible through dots until close
    if (subStyle.alpha > 0.01) {
      const subs = drawnSubsRef.current;
      for (let i = 0; i < subs.length; i++) {
        const s = subs[i];
        if (!inBounds(s.lng, s.lat)) continue;
        const pt = map.project([s.lng, s.lat]);
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, subStyle.radius, 0, Math.PI * 2);
        ctx.fillStyle = rgba(scoreColor(s.score), subStyle.alpha);
        ctx.fill();
        if (subStyle.strokeAlpha > 0.01) {
          ctx.lineWidth = 1.5;
          ctx.strokeStyle = rgba("#111827", subStyle.strokeAlpha);
          ctx.stroke();
        }
      }
    }
  };

  // Create map
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let cancelled = false;
    setMapReady(false);
    setStatus("Initializing map…");

    const initialSatellite = useAppStore.getState().filters.satellite;
    satRef.current = initialSatellite;

    const map = new maplibregl.Map({
      container: el,
      style: buildMapStyle(initialSatellite),
      center: [-96.0, 39.0],
      zoom: 3.5,
      attributionControl: { compact: true },
    });
    mapRef.current = map;

    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      "top-right"
    );

    popupRef.current = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 12,
      className: "bess-popup",
    });

    const onLoad = () => {
      if (cancelled) return;
      try {
        ensureBaseLayers(map, initialSatellite);
        const f = filtersRef.current;
        applyParcelBasemapPaint(map, f.satellite);
        setParcelLayerVisibility(map, f.showParcels, f.satellite);
        // Re-assert labels on top after other layers settle
        ensurePlaceLabels(map, f.satellite);
        setMapReady(true);
        setStatus("");
        map.resize();
        paintRef.current();
      } catch (err) {
        console.error(err);
        setStatus("Failed to initialize map layers");
      }
    };

    map.on("load", onLoad);
    map.on("error", (e) => {
      console.warn("MapLibre error", e.error);
      if (e.error?.message) setStatus(String(e.error.message).slice(0, 100));
    });

    const redraw = () => {
      if (!cancelled) paintRef.current();
    };
    map.on("move", redraw);
    map.on("zoom", redraw);
    map.on("resize", redraw);
    const syncProximity = () => {
      const c = map.getCenter();
      setSearchProximity([c.lng, c.lat]);
    };
    map.on("moveend", syncProximity);
    map.once("load", syncProximity);

    map.on("mousemove", (e) => {
      const { x, y } = e.point;
      const hit = hitTestOverlay(
        map,
        x,
        y,
        drawnSubsRef.current,
        drawnProjsRef.current
      );
      const bestSub = hit.sub;
      const bestProj = hit.proj;
      const bestSubDist = hit.subDist;
      const bestProjDist = hit.projDist;

      if (bestSub || bestProj) {
        map.getCanvas().style.cursor = "pointer";
        if (!popupRef.current) return;
        if (bestSub && (!bestProj || bestSubDist <= bestProjDist)) {
          popupRef.current
            .setLngLat([bestSub.lng, bestSub.lat])
            .setHTML(
              `<div style="font:600 12px/1.3 system-ui,sans-serif;color:#0f172a">${bestSub.name}</div>
               <div style="font:12px/1.3 system-ui,sans-serif;color:#475569">Score ${bestSub.score} · ${bestSub.voltageClass} · ${formatMw(bestSub.queuedMw5mi)} queued</div>`
            )
            .addTo(map);
        } else if (bestProj) {
          popupRef.current
            .setLngLat([bestProj.lng, bestProj.lat])
            .setHTML(
              `<div style="font:600 12px/1.3 system-ui,sans-serif;color:#0f172a">${bestProj.name}</div>
               <div style="font:12px/1.3 system-ui,sans-serif;color:#475569">${bestProj.fuelDisplay} · ${formatMw(bestProj.capacityMw)} · ${bestProj.funnelStage}</div>`
            )
            .addTo(map);
        }
        return;
      }

      // Parcel hover cursor when layer is on and zoomed in (click shows popup)
      if (
        showParcelsRef.current &&
        map.getZoom() >= PARCEL_MIN_ZOOM &&
        map.getLayer(PARCEL_FILL)
      ) {
        const feats = map.queryRenderedFeatures(e.point, {
          layers: [PARCEL_FILL],
        });
        if (feats.length > 0) {
          map.getCanvas().style.cursor = "pointer";
          return;
        }
      }

      map.getCanvas().style.cursor = "";
    });

    map.on("click", (e) => {
      const { x, y } = e.point;
      const hit = hitTestOverlay(
        map,
        x,
        y,
        drawnSubsRef.current,
        drawnProjsRef.current
      );
      const best = hit.sub;
      const bestDist = hit.subDist;
      const bestProj = hit.proj;
      const bestProjDist = hit.projDist;

      // Prefer substation when both are under the cursor
      if (best && (!bestProj || bestDist <= bestProjDist)) {
        const full = substationsRef.current?.features.find(
          (f) => f.properties.id === best!.id
        );
        if (!full) return;
        setSelectedSubstation(full.properties);
        setPanelTab("details");
        map.flyTo({
          center: [full.properties.longitude, full.properties.latitude],
          zoom: Math.max(map.getZoom(), 9),
          essential: true,
        });
        return;
      }

      if (bestProj?.inr) {
        window.open(
          interconnectionFyiUrl(bestProj.inr, bestProj.market),
          "_blank",
          "noopener,noreferrer"
        );
        return;
      }

      // Parcel identify (substation / project hits take priority)
      if (
        !showParcelsRef.current ||
        map.getZoom() < PARCEL_MIN_ZOOM ||
        !map.getLayer(PARCEL_FILL)
      ) {
        return;
      }

      const feats = map.queryRenderedFeatures(e.point, {
        layers: [PARCEL_FILL],
      });
      const feat = pickSmallestParcelFeature(map, feats);
      if (!feat) return;
      selectParcelAtRef.current(e.lngLat.lng, e.lngLat.lat, feat);
      popupRef.current?.remove();
    });

    map.on("movestart", () => {
      popupRef.current?.remove();
    });

    const ro = new ResizeObserver(() => {
      if (!cancelled) {
        map.resize();
        paintRef.current();
      }
    });
    ro.observe(el);

    return () => {
      cancelled = true;
      parcelAbortRef.current?.abort();
      ro.disconnect();
      popupRef.current?.remove();
      map.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, [setSelectedSubstation, setPanelTab, setParcelPopup]);

  // Shared parcel select (map click + address / parcel ID search)
  selectParcelAtRef.current = (lng, lat, feat, knownLrid) => {
    const map = mapRef.current;
    if (!map) return;

    const hit = feat ?? queryParcelAtLngLat(map, lng, lat);
    const raw = (hit?.properties ?? {}) as Record<string, unknown>;
    const lrid =
      knownLrid ||
      (raw.lrid != null
        ? String(raw.lrid)
        : hit?.id != null
          ? String(hit.id)
          : undefined);
    const mapped = mapProperties(raw);

    if (lrid) applyParcelHighlight(map, clickedFeatureIdRef, lrid);

    setSelectedSubstation(null);
    const hasTileProps = Object.keys(raw).length > 0;
    const initial = buildParcelViews(mapped, lat, lng, lrid, true);
    setParcelPopup(initial.popup, initial.focus);

    parcelAbortRef.current?.abort();
    const ac = new AbortController();
    parcelAbortRef.current = ac;
    const finishWithTileFallback = () => {
      if (!hasTileProps) {
        setParcelPopup(null, null);
        return;
      }
      const fallback = buildParcelViews(mapped, lat, lng, lrid, false);
      setParcelPopup(fallback.popup, fallback.focus);
    };

    fetchLandRecordsParcel({
      lat,
      lng,
      lrid,
      signal: ac.signal,
    })
      .then((result) => {
        if (ac.signal.aborted) return;
        // WFS misses some states (e.g. TX); tile attributes are still usable
        if (!result) {
          finishWithTileFallback();
          return;
        }
        const featureId = result.parcelId || lrid;
        const highlightId = result.lrid || lrid || featureId;
        if (highlightId && mapRef.current) {
          applyParcelHighlight(mapRef.current, clickedFeatureIdRef, highlightId);
          // Re-apply after tiles finish loading (feature-state needs the feature)
          mapRef.current.once("idle", () => {
            if (
              mapRef.current &&
              clickedFeatureIdRef.current === highlightId
            ) {
              setParcelClickedState(mapRef.current, highlightId, true);
            }
          });
        }
        const enriched = buildParcelViews(
          result.properties,
          lat,
          lng,
          featureId,
          false
        );
        if (highlightId) {
          enriched.focus.lrid = highlightId;
        }
        setParcelPopup(enriched.popup, enriched.focus);
      })
      .catch((err) => {
        if (err instanceof Error && err.name === "AbortError") return;
        finishWithTileFallback();
      });
  };

  // Clear parcel highlight when popup closes
  useEffect(() => {
    if (parcelPopup) return;
    const map = mapRef.current;
    if (!map || !clickedFeatureIdRef.current) return;
    applyParcelHighlight(map, clickedFeatureIdRef, null);
  }, [parcelPopup]);

  // Basemap toggle — swap raster tiles only (do not setStyle / wipe parcels)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (satRef.current === filters.satellite) return;
    satRef.current = filters.satellite;
    applyBasemap(map, filters.satellite);
    applyLabelTiles(map, filters.satellite);
    applyParcelBasemapPaint(map, filters.satellite);
    setParcelLayerVisibility(
      map,
      filtersRef.current.showParcels,
      filters.satellite
    );
    paintRef.current();
  }, [filters.satellite, mapReady]);

  // Layer visibility + boundary GeoJSON (avoid huge arrays in effect deps)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    setVis(map, FLOOD_LAYER, filters.showFloodZones);
    setVis(map, FIBER_COV_FILL, filters.showFiberCoverage);
    setVis(map, FIBER_COV_LINE, filters.showFiberCoverage);
    setVis(map, "counties-fill", filters.showCounties);
    setVis(map, "counties-line", filters.showCounties);
    setVis(map, "states-line", filters.showCounties);
    setVis(map, "lines-layer", filters.showLines);
    applyParcelBasemapPaint(map, filters.satellite);
    setParcelLayerVisibility(map, filters.showParcels, filters.satellite);
    // Labels must stay above toggled layers
    ensurePlaceLabels(map, filters.satellite);

    const co = countiesRef.current;
    if (co && map.getSource("counties")) {
      (map.getSource("counties") as maplibregl.GeoJSONSource).setData(co);
    }
    const st = statesRef.current;
    if (st && map.getSource("states")) {
      (map.getSource("states") as maplibregl.GeoJSONSource).setData(st);
    }

    paintRef.current();
  }, [
    mapReady,
    filters.showFloodZones,
    filters.showFiberCoverage,
    filters.showCounties,
    filters.showLines,
    filters.showParcels,
    filters.satellite,
    // Identity of loaded snapshots (not the FeatureCollection contents)
    counties ? counties.features.length : 0,
    states ? states.features.length : 0,
  ]);

  // Selection rings
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !map.getSource("rings")) return;
    if (selected) {
      (map.getSource("rings") as maplibregl.GeoJSONSource).setData({
        type: "FeatureCollection",
        features: [
          circlePolygon(selected.longitude, selected.latitude, 1),
          circlePolygon(selected.longitude, selected.latitude, 5),
        ],
      });
    } else {
      (map.getSource("rings") as maplibregl.GeoJSONSource).setData(emptyFC());
    }
    ensurePlaceLabels(map, filtersRef.current.satellite);
  }, [mapReady, selected?.id, selected?.longitude, selected?.latitude]);

  // Heat + canvas dots + status — read drawn* refs; fixed 2-dep array (HMR-safe)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const subs = drawnSubsRef.current;
    const count = subs.length;
    setDrawnCount(count);
    if (count === 0 && substationsRef.current) {
      setStatus("No substations match filters — click Reset");
    } else if (!filtersRef.current.showSubstations) {
      setStatus("Substations layer is off — enable it in Filters");
    } else {
      setStatus("");
    }

    const heatSrc = map.getSource(HEAT_SOURCE) as
      | maplibregl.GeoJSONSource
      | undefined;
    if (heatSrc) {
      heatSrc.setData(heatFeaturesFromSubs(subs));
    }

    paintRef.current();
  }, [mapReady, paintEpoch]);

  // Lazy-load heavy transmission lines only when toggled on
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !filters.showLines || !lines) return;
    const src = map.getSource("lines") as maplibregl.GeoJSONSource | undefined;
    if (!src || !map.getLayer("lines-layer")) return;
    src.setData({
      type: "FeatureCollection",
      features: lines.features.map((f) => ({
        type: "Feature" as const,
        geometry: f.geometry,
        properties: {
          voltClass: f.properties.voltClass,
          voltage: f.properties.voltage,
        },
      })),
    });
    map.setPaintProperty("lines-layer", "line-color", "#facc15");
    map.setPaintProperty("lines-layer", "line-width", 1.75);
    map.setPaintProperty("lines-layer", "line-opacity", 1);
    setVis(map, "lines-layer", true);
  }, [mapReady, filters.showLines, lines?.features.length ?? 0]);

  // FCC fiber coverage — refetch on pan/zoom when layer is on
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    let abort: AbortController | null = null;
    let seq = 0;

    const clearCoverage = () => {
      const src = map.getSource(FIBER_COV_SOURCE) as
        | maplibregl.GeoJSONSource
        | undefined;
      if (src) src.setData(emptyFC());
      setFiberCoveragePartial(false);
    };

    const fetchCoverage = () => {
      if (!filtersRef.current.showFiberCoverage) {
        clearCoverage();
        return;
      }
      const b = map.getBounds();
      const z = Math.round(map.getZoom());
      const bbox = [
        b.getWest(),
        b.getSouth(),
        b.getEast(),
        b.getNorth(),
      ]
        .map((n) => n.toFixed(5))
        .join(",");
      const mySeq = ++seq;
      abort?.abort();
      abort = new AbortController();
      const url = `/api/fiber-coverage?bbox=${encodeURIComponent(bbox)}&z=${z}`;
      fetch(url, { signal: abort.signal })
        .then((r) => (r.ok ? r.json() : emptyFC()))
        .then(
          (
            fc: FeatureCollection & {
              truncated?: boolean;
            }
          ) => {
            if (mySeq !== seq) return;
            if (!filtersRef.current.showFiberCoverage) {
              clearCoverage();
              return;
            }
            const src = map.getSource(FIBER_COV_SOURCE) as
              | maplibregl.GeoJSONSource
              | undefined;
            if (src) src.setData(fc ?? emptyFC());
            setFiberCoveragePartial(Boolean(fc?.truncated));
          }
        )
        .catch((err) => {
          if (err?.name === "AbortError") return;
          console.warn("fiber coverage fetch failed", err);
        });
    };

    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(fetchCoverage, 280);
    };

    if (filters.showFiberCoverage) {
      setVis(map, FIBER_COV_FILL, true);
      setVis(map, FIBER_COV_LINE, true);
      fetchCoverage();
      map.on("moveend", schedule);
    } else {
      setVis(map, FIBER_COV_FILL, false);
      setVis(map, FIBER_COV_LINE, false);
      clearCoverage();
    }

    return () => {
      if (timer) clearTimeout(timer);
      abort?.abort();
      map.off("moveend", schedule);
    };
  }, [mapReady, filters.showFiberCoverage]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selected) return;
    map.flyTo({
      center: [selected.longitude, selected.latitude],
      zoom: Math.max(map.getZoom(), 9),
      essential: true,
    });
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handler = (e: Event) => {
      const map = mapRef.current;
      const detail = (e as CustomEvent<{ lng: number; lat: number; zoom?: number }>)
        .detail;
      if (!map || !detail) return;
      map.flyTo({
        center: [detail.lng, detail.lat],
        zoom: detail.zoom ?? Math.max(map.getZoom(), 15),
        essential: true,
      });
    };
    window.addEventListener("bess:fly-to", handler);
    return () => window.removeEventListener("bess:fly-to", handler);
  }, []);

  // Deep link from /p/{token} → /?lat=&lng=&lrid=
  useEffect(() => {
    if (!mapReady) return;
    const sp = new URLSearchParams(window.location.search);
    const lat = parseFloat(sp.get("lat") || "");
    const lng = parseFloat(sp.get("lng") || "");
    const lrid = (sp.get("lrid") || "").trim();
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    flyToAddressRef.current?.(lng, lat, lrid ? { lrid } : undefined);
    const url = new URL(window.location.href);
    url.searchParams.delete("lat");
    url.searchParams.delete("lng");
    url.searchParams.delete("lrid");
    window.history.replaceState({}, "", url.pathname + url.search + url.hash);
  }, [mapReady]);

  // Color Yes (green) / No (red) reviewed parcels via feature-state
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const yes = new Set<string>();
    const no = new Set<string>();
    for (const list of parcelLists) {
      for (const item of list.items) {
        for (const id of reviewFeatureIds(item)) {
          if (list.id === YES_PARCEL_LIST_ID) yes.add(id);
          if (list.id === NO_PARCEL_LIST_ID) no.add(id);
        }
      }
    }

    for (const id of reviewIdsRef.current.all) {
      if (!yes.has(id) && !no.has(id)) setParcelReviewState(map, id, null);
    }
    for (const id of yes) setParcelReviewState(map, id, "yes");
    for (const id of no) setParcelReviewState(map, id, "no");
    reviewIdsRef.current = { yes, no, all: new Set([...yes, ...no]) };
  }, [parcelLists, mapReady]);

  // Re-apply review colors as tiles stream in
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const reapply = () => {
      for (const id of reviewIdsRef.current.yes) {
        setParcelReviewState(map, id, "yes");
      }
      for (const id of reviewIdsRef.current.no) {
        setParcelReviewState(map, id, "no");
      }
    };
    map.on("idle", reapply);
    return () => {
      map.off("idle", reapply);
    };
  }, [mapReady]);

  const flyToAddress = (
    lng: number,
    lat: number,
    meta?: { lrid?: string; kind?: string; substationId?: string }
  ) => {
    const map = mapRef.current;
    if (!map) return;

    // Substation / scored site — select details panel (fly handled by selected effect)
    if (meta?.kind === "substation" && meta.substationId) {
      const full = substationsRef.current?.features.find(
        (f) => f.properties.id === meta.substationId
      );
      if (full) {
        if (!filters.showSubstations) setFilters({ showSubstations: true });
        setSelectedSubstation(full.properties);
        setPanelTab("details");
        return;
      }
    }

    if (!filters.showParcels) setFilters({ showParcels: true });

    const knownLrid = meta?.lrid?.trim() || undefined;

    // Popup + API immediately; prefer WFS-by-lrid when search found a parcel
    selectParcelAtRef.current(
      lng,
      lat,
      queryParcelAtLngLat(map, lng, lat),
      knownLrid
    );

    map.flyTo({
      center: [lng, lat],
      zoom: Math.max(map.getZoom(), ADDRESS_SELECT_ZOOM),
      essential: true,
      duration: 800,
    });

    const syncHighlight = () => {
      const m = mapRef.current;
      if (!m) return;
      if (knownLrid) {
        applyParcelHighlight(m, clickedFeatureIdRef, knownLrid);
        return;
      }
      const hit = queryParcelAtLngLat(m, lng, lat);
      if (!hit) return;
      const raw = (hit.properties ?? {}) as Record<string, unknown>;
      const featureId =
        raw.lrid != null
          ? String(raw.lrid)
          : hit.id != null
            ? String(hit.id)
            : null;
      if (featureId) applyParcelHighlight(m, clickedFeatureIdRef, featureId);
    };

    map.once("moveend", () => {
      syncHighlight();
      map.once("idle", syncHighlight);
    });
  };
  flyToAddressRef.current = flyToAddress;

  return (
    <div className="relative h-full min-h-[320px] w-full bg-[#e8eef4]">
      <div ref={containerRef} className="absolute inset-0 h-full w-full" />
      {/* 2D overlay — WebGL circle layers were invisible on some setups.
          Canvas is transparent except dots, so place-labels on the map show through. */}
      <canvas
        ref={overlayRef}
        className="pointer-events-none absolute inset-0 z-10 h-full w-full"
        aria-hidden
      />
      <div className="pointer-events-none absolute left-3 top-3 z-50 flex w-[min(100%-1.5rem,24rem)] flex-col gap-2">
        <div className="w-fit rounded-md border border-slate-200 bg-white/95 px-2.5 py-1.5 text-[11px] font-medium text-slate-700 shadow">
          {drawnCount.toLocaleString()} scored sites
        </div>
        <MapAddressSearch
          proximity={searchProximity}
          substations={substations}
          onSelect={(lng, lat, _label, meta) => flyToAddress(lng, lat, meta)}
        />
        {filters.showFiberCoverage && fiberCoveragePartial && (
          <div className="w-fit max-w-sm rounded-md border border-amber-200 bg-amber-50/95 px-2.5 py-1.5 text-[11px] leading-snug text-amber-950 shadow">
            Fiber overlay is incomplete at this zoom — zoom in for full coverage
            at a property.
          </div>
        )}
      </div>
      {/* Under MapLibre NavigationControl (top-right, ~two 29px zoom buttons) */}
      <div className="pointer-events-auto absolute right-2.5 top-[80px] z-50 flex flex-col gap-0.5">
        <button
          type="button"
          aria-label="Satellite basemap"
          aria-pressed={filters.satellite}
          title={
            filters.satellite ? "Switch to map basemap" : "Switch to satellite"
          }
          onClick={() => setFilters({ satellite: !filters.satellite })}
          className={[
            "flex h-[29px] w-[29px] items-center justify-center rounded border shadow-sm",
            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sky-500",
            filters.satellite
              ? "border-sky-800 bg-sky-700 text-white hover:bg-sky-800"
              : "border-slate-300 bg-white text-slate-900 hover:bg-slate-100",
          ].join(" ")}
        >
          <Satellite className="size-3.5" strokeWidth={2.25} aria-hidden />
        </button>
        <button
          type="button"
          aria-label="Flood zones"
          aria-pressed={filters.showFloodZones}
          title={
            filters.showFloodZones ? "Hide flood zones" : "Show flood zones"
          }
          onClick={() =>
            setFilters({ showFloodZones: !filters.showFloodZones })
          }
          className={[
            "flex h-[29px] w-[29px] items-center justify-center rounded border shadow-sm",
            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sky-500",
            filters.showFloodZones
              ? "border-sky-800 bg-sky-700 text-white hover:bg-sky-800"
              : "border-slate-300 bg-white text-slate-900 hover:bg-slate-100",
          ].join(" ")}
        >
          <Droplets className="size-3.5" strokeWidth={2.25} aria-hidden />
        </button>
      </div>
      {status && (
        <div className="pointer-events-none absolute left-1/2 top-3 z-50 -translate-x-1/2 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 shadow">
          {status}
        </div>
      )}
      <ParcelPopup
        popupData={parcelPopup}
        mapRef={mapRef}
        onClose={closeParcelPopup}
        onOpenDetails={openParcelDetails}
      />
    </div>
  );
}
