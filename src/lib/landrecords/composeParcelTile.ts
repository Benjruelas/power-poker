import { createRequire } from "node:module";
import type {
  Feature,
  FeatureCollection,
  Geometry,
  GeoJsonProperties,
} from "geojson";
import { PARCEL_SOURCE_LAYERS } from "./parcelTiles";

const require = createRequire(import.meta.url);

// CJS packages — keep require() consistent with fetchParcelFromTile.ts
const Pbf = require("pbf") as new (buf?: Uint8Array | Buffer) => unknown;
const vectorTileMod = require("@mapbox/vector-tile") as {
  VectorTile: new (pbf: unknown) => {
    layers: Record<
      string,
      | {
          length: number;
          feature: (i: number) => {
            properties: Record<string, unknown>;
            toGeoJSON: (
              x: number,
              y: number,
              z: number
            ) => Feature<Geometry, GeoJsonProperties>;
          };
        }
      | undefined
    >;
  };
};
const VectorTile = vectorTileMod.VectorTile;

type GeojsonVtTile = {
  features: unknown[];
  numPoints: number;
  numSimplified: number;
  numFeatures: number;
  source: unknown;
  x: number;
  y: number;
  z: number;
  transformed: boolean;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

type GeojsonVtFactory = (
  data: FeatureCollection,
  options?: Record<string, unknown>
) => { getTile: (z: number, x: number, y: number) => GeojsonVtTile | null };
const geojsonvtMod = require("geojson-vt") as
  | GeojsonVtFactory
  | { default: GeojsonVtFactory };
const geojsonvt: GeojsonVtFactory =
  typeof geojsonvtMod === "function"
    ? geojsonvtMod
    : geojsonvtMod.default;
const vtpbf = require("vt-pbf") as {
  fromGeojsonVt: (
    layers: Record<string, GeojsonVtTile>,
    options?: { version?: number; extent?: number }
  ) => Uint8Array;
};

type LayeredFeatures = Map<
  string,
  Feature<Geometry, GeoJsonProperties>[]
>;

function emptyLayers(): LayeredFeatures {
  return new Map(PARCEL_SOURCE_LAYERS.map((name) => [name, []]));
}

function mergeLayers(into: LayeredFeatures, from: LayeredFeatures) {
  for (const [name, feats] of from) {
    const list = into.get(name) ?? [];
    list.push(...feats);
    into.set(name, list);
  }
}

/** Decode MVT → GeoJSON features per LandRecords source-layer. */
function mvtToLayeredFeatures(
  buf: Buffer,
  z: number,
  x: number,
  y: number
): LayeredFeatures {
  const tile = new VectorTile(new Pbf(buf));
  const out = emptyLayers();
  for (const layerName of PARCEL_SOURCE_LAYERS) {
    const layer = tile.layers[layerName];
    if (!layer || layer.length === 0) continue;
    const feats: Feature<Geometry, GeoJsonProperties>[] = [];
    for (let i = 0; i < layer.length; i++) {
      try {
        feats.push(layer.feature(i).toGeoJSON(x, y, z));
      } catch {
        /* skip corrupt feature */
      }
    }
    out.set(layerName, feats);
  }
  return out;
}

function totalFeatureCount(byLayer: LayeredFeatures): number {
  let n = 0;
  for (const feats of byLayer.values()) n += feats.length;
  return n;
}

/** Build an MVT for z/x/y preserving both parcel_us and parcels layers. */
function encodeLayeredFeatures(
  byLayer: LayeredFeatures,
  z: number,
  x: number,
  y: number
): Buffer | null {
  if (totalFeatureCount(byLayer) === 0) return null;
  const layers: Record<string, GeojsonVtTile> = {};
  for (const [name, features] of byLayer) {
    if (!features.length) continue;
    const fc: FeatureCollection = { type: "FeatureCollection", features };
    const index = geojsonvt(fc, {
      maxZoom: z,
      indexMaxZoom: z,
      indexMaxPoints: 0,
      tolerance: 0,
      buffer: 64,
      extent: 4096,
    });
    const tile = index.getTile(z, x, y);
    if (!tile || tile.numFeatures === 0) continue;
    layers[name] = tile;
  }
  if (Object.keys(layers).length === 0) return null;
  return Buffer.from(
    vtpbf.fromGeojsonVt(layers, { version: 2, extent: 4096 })
  );
}

export type UpstreamTileFn = (
  z: number,
  x: number,
  y: number
) => Promise<Buffer | null>;

/**
 * LandRecords GWC seeds zooms unevenly (Cedar Hill: empty z15, seeded z16/z14;
 * DeSoto: z14 only; Houston: z16 only). When the exact tile is missing, synthesize
 * it from child tiles (preferred) or by clipping the parent tile.
 */
export async function fillSparseParcelTile(
  z: number,
  x: number,
  y: number,
  fetchTile: UpstreamTileFn,
  depth = 0
): Promise<Buffer | null> {
  if (z < 0 || z > 22 || depth > 2) return null;

  // Prefer higher-detail children (e.g. empty z15 ← four z16; empty z16 ← z17).
  // Children are exact-only — synthesizing a child from this parent would cycle.
  if (z < 17) {
    const childZ = z + 1;
    const coords = [
      [x * 2, y * 2],
      [x * 2 + 1, y * 2],
      [x * 2, y * 2 + 1],
      [x * 2 + 1, y * 2 + 1],
    ] as const;
    const children = await Promise.all(
      coords.map(([cx, cy]) => fetchTile(childZ, cx, cy))
    );
    const byLayer = emptyLayers();
    for (let i = 0; i < 4; i++) {
      const buf = children[i];
      if (!buf) continue;
      const [cx, cy] = coords[i];
      mergeLayers(byLayer, mvtToLayeredFeatures(buf, childZ, cx, cy));
    }
    const composed = encodeLayeredFeatures(byLayer, z, x, y);
    if (composed) return composed;
  }

  // Fall back to parent overzoom clip (e.g. DeSoto: z14 only).
  // Parent may itself be sparse — synthesize it (z16 ← filled z15 ← z14).
  if (z > 0) {
    const pz = z - 1;
    const px = Math.floor(x / 2);
    const py = Math.floor(y / 2);
    let parent = await fetchTile(pz, px, py);
    if (!parent) {
      parent = await fillSparseParcelTile(pz, px, py, fetchTile, depth + 1);
    }
    if (parent) {
      const byLayer = mvtToLayeredFeatures(parent, pz, px, py);
      const clipped = encodeLayeredFeatures(byLayer, z, x, y);
      if (clipped) return clipped;
    }
  }

  return null;
}
