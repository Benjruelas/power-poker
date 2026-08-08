import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

// pbf@3 + @mapbox/vector-tile (CJS). Keep require() so Next/TS don't pull pbf@4 types.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Pbf = require("pbf") as new (buf?: Uint8Array | Buffer) => unknown;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { VectorTile } = require("@mapbox/vector-tile") as {
  VectorTile: new (pbf: unknown) => {
    layers: Record<
      string,
      | {
          length: number;
          feature: (i: number) => { properties: Record<string, unknown> };
        }
      | undefined
    >;
  };
};

const DEFAULT_TILE_URL =
  "https://api.landrecords.us/pro/gwc/service/tms/1.0.0/pro:parcel_us@EPSG:3857x2@pbf";

const LAYER = "parcel_us";

function lngLatToTile(lng: number, lat: number, z: number) {
  const latRad = (lat * Math.PI) / 180;
  const n = 2 ** z;
  const x = Math.floor(((lng + 180) / 360) * n);
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n
  );
  return { z, x, y };
}

async function fetchTilePbf(
  z: number,
  x: number,
  y: number,
  apiKey: string
): Promise<Buffer | null> {
  const tileBase = process.env.LANDRECORDS_TILE_URL || DEFAULT_TILE_URL;
  const tmsY = (1 << z) - 1 - y;
  const url = `${tileBase}/${z}/${x}/${tmsY}.pbf`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (res.status === 404 || res.status === 204 || !res.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  return buf.length ? buf : null;
}

function propsFromTile(
  buf: Buffer,
  lat: number,
  lng: number,
  lrid?: string
): Record<string, unknown> | null {
  const tile = new VectorTile(new Pbf(buf));
  const layer = tile.layers[LAYER];
  if (!layer || layer.length === 0) return null;

  type Cand = { props: Record<string, unknown>; dist: number };
  const cands: Cand[] = [];

  for (let i = 0; i < layer.length; i++) {
    const props = layer.feature(i).properties;
    if (lrid && String(props.lrid ?? "") === lrid) {
      return props;
    }
    const cx = Number(props.centroidx ?? props.surfpointx);
    const cy = Number(props.centroidy ?? props.surfpointy);
    const dist =
      Number.isFinite(cx) && Number.isFinite(cy)
        ? (cx - lng) ** 2 + (cy - lat) ** 2
        : Number.POSITIVE_INFINITY;
    cands.push({ props, dist });
  }

  if (lrid) {
    // lrid was requested but not in this tile
    return null;
  }

  cands.sort((a, b) => a.dist - b.dist);
  return cands[0]?.props ?? null;
}

/**
 * Attribute fallback when WFS/WMS miss (e.g. some states absent from WFS
 * while still present in the vector tile cache).
 */
export async function fetchParcelPropertiesFromTile(
  lat: number,
  lng: number,
  apiKey: string,
  lrid?: string
): Promise<Record<string, unknown> | null> {
  for (const z of [16, 15, 14]) {
    const { x, y } = lngLatToTile(lng, lat, z);
    const buf = await fetchTilePbf(z, x, y, apiKey);
    if (!buf) continue;
    const props = propsFromTile(buf, lat, lng, lrid);
    if (props) return props;
    // If lrid miss at this zoom, try neighbors (parcel near tile edge)
    if (lrid) {
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const nBuf = await fetchTilePbf(z, x + dx, y + dy, apiKey);
        if (!nBuf) continue;
        const nProps = propsFromTile(nBuf, lat, lng, lrid);
        if (nProps) return nProps;
      }
    }
  }
  return null;
}
