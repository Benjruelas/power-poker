import fs from "node:fs";
import { createRequire } from "node:module";
import { fillSparseParcelTile } from "../src/lib/landrecords/composeParcelTile";

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Pbf = require("pbf");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const vectorTile = require("@mapbox/vector-tile");
const VectorTile = vectorTile.VectorTile;

const dir = "/tmp/parcel-fixtures";

function load(z: number, x: number, y: number): Buffer | null {
  const path = `${dir}/${z}_${x}_${y}.pbf`;
  if (!fs.existsSync(path)) return null;
  const buf = fs.readFileSync(path);
  return buf.length ? buf : null;
}

async function fetchTile(z: number, x: number, y: number) {
  return load(z, x, y);
}

function lngLatToTile(lng: number, lat: number, z: number) {
  const latRad = (lat * Math.PI) / 180;
  const n = 2 ** z;
  const x = Math.floor(((lng + 180) / 360) * n);
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n
  );
  return { z, x, y };
}

async function main() {
  {
    const { z, x, y } = lngLatToTile(-96.956, 32.588, 15);
    console.log("Cedar Hill z15", { z, x, y }, "exact", load(z, x, y)?.length ?? 0);
    const filled = await fillSparseParcelTile(z, x, y, fetchTile);
    console.log("Cedar Hill z15 filled", filled?.length ?? null);
    if (!filled) throw new Error("Cedar Hill gap-fill failed");
    const layers = new VectorTile(new Pbf(filled)).layers;
    const layer = layers.parcel_us || layers.parcels;
    if (!layer?.length) {
      throw new Error("Cedar Hill composed tile has no features in either layer");
    }
    console.log(
      "Cedar Hill features",
      layer.length,
      "layers",
      Object.keys(layers).filter((k) => layers[k]?.length),
      "sample lrid",
      layer.feature(0).properties.lrid
    );
  }

  {
    const { z, x, y } = lngLatToTile(-96.857, 32.6, 15);
    const parent = { z: z - 1, x: Math.floor(x / 2), y: Math.floor(y / 2) };
    console.log(
      "DeSoto z15",
      { z, x, y },
      "parent",
      parent,
      "parentBytes",
      load(parent.z, parent.x, parent.y)?.length ?? 0
    );
    const filled = await fillSparseParcelTile(z, x, y, fetchTile);
    console.log("DeSoto z15 filled", filled?.length ?? null);
  }

  {
    const { z, x, y } = lngLatToTile(-95.369, 29.76, 15);
    console.log("Houston z15", { z, x, y });
    const filled = await fillSparseParcelTile(z, x, y, fetchTile);
    console.log("Houston z15 filled", filled?.length ?? null);
    if (!filled) throw new Error("Houston gap-fill failed");
  }

  {
    // DeSoto z16 is empty; should clip from synthesized z15←z14
    const { z, x, y } = lngLatToTile(-96.857, 32.6, 16);
    console.log("DeSoto z16", { z, x, y }, "exact", load(z, x, y)?.length ?? 0);
    const filled = await fillSparseParcelTile(z, x, y, fetchTile);
    console.log("DeSoto z16 filled", filled?.length ?? null);
    if (!filled) throw new Error("DeSoto z16 gap-fill failed");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
