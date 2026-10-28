import type { StyleSpecification } from "maplibre-gl";

const BASEMAP_MAXZOOM = 19;
const SAT_ATTR = "Esri, Maxar, Earthstar Geographics";

export function sitePlanSatTileUrls(origin = ""): string[] {
  const base =
    origin ||
    (typeof window !== "undefined" ? window.location.origin : "");
  return [`${base}/api/esri-tiles?layer=imagery&z={z}&x={x}&y={y}`];
}

export function sitePlanLabelTileUrls(origin = ""): string[] {
  const base =
    origin ||
    (typeof window !== "undefined" ? window.location.origin : "");
  return [`${base}/api/esri-tiles?layer=labels&z={z}&x={x}&y={y}`];
}

export function buildSitePlanMapStyle(): StyleSpecification {
  return {
    version: 8,
    glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
    sources: {
      basemap: {
        type: "raster",
        tiles: sitePlanSatTileUrls(),
        tileSize: 256,
        maxzoom: BASEMAP_MAXZOOM,
        attribution: SAT_ATTR,
      },
      labels: {
        type: "raster",
        tiles: sitePlanLabelTileUrls(),
        tileSize: 256,
        maxzoom: BASEMAP_MAXZOOM,
        attribution: "Esri Boundaries & Places",
      },
    },
    layers: [
      {
        id: "background",
        type: "background",
        paint: { "background-color": "#d4d4d8" },
      },
      {
        id: "basemap",
        type: "raster",
        source: "basemap",
        paint: { "raster-fade-duration": 0 },
      },
      {
        id: "labels",
        type: "raster",
        source: "labels",
        paint: { "raster-opacity": 0.85, "raster-fade-duration": 0 },
      },
    ],
  };
}
