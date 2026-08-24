/**
 * Focused unit checks for KnockScout-ported parcel helpers.
 * Run: npx tsx scripts/test-parcel-knockscout-port.ts
 */
import assert from "node:assert/strict";
import {
  featureMatchesLrid,
  parcelIdsMatch,
  pickParcelFeature,
  propertiesMatchRequestedLrid,
} from "../src/lib/landrecords/parcelLookup";
import {
  mapProperties,
  mergeParcelProperties,
  resolveParcelDisplayAddress,
} from "../src/lib/landrecords/parcelPropertyMap";
import {
  emptyParcelTileStatus,
  PARCEL_FILL_LAYERS,
  PARCEL_LAYER_MIN_ZOOM,
  PARCEL_SOURCE_LAYERS,
  PARCEL_SOURCE_MIN_ZOOM,
  PARCEL_TILE_MAXZOOM,
  parcelFillLayerId,
  parcelLineLayerId,
  parcelPromoteId,
  parcelPromoteIdMatches,
  parcelTileUrl,
} from "../src/lib/landrecords/parcelTiles";

function testParcelTilesConfig() {
  assert.deepEqual([...PARCEL_SOURCE_LAYERS], ["parcel_us", "parcels"]);
  assert.equal(parcelFillLayerId("parcel_us"), "parcels-fill");
  assert.equal(parcelFillLayerId("parcels"), "parcels-fill-parcels");
  assert.equal(parcelLineLayerId("parcel_us"), "parcels-line");
  assert.equal(parcelLineLayerId("parcels"), "parcels-line-parcels");
  assert.ok(PARCEL_FILL_LAYERS.includes("parcels-fill-parcels"));
  assert.ok(!PARCEL_FILL_LAYERS.some((id) => id.includes("z16")));
  const spec = parcelPromoteId();
  assert.deepEqual(spec, { parcel_us: "lrid", parcels: "lrid" });
  assert.equal(parcelPromoteIdMatches(spec), true);
  assert.equal(parcelPromoteIdMatches({ parcel_us: "lrid" }), false);
  assert.equal(PARCEL_SOURCE_MIN_ZOOM, 14);
  assert.equal(PARCEL_LAYER_MIN_ZOOM, 15);
  assert.equal(PARCEL_TILE_MAXZOOM, 17);
  assert.ok(PARCEL_SOURCE_MIN_ZOOM < PARCEL_LAYER_MIN_ZOOM);
  assert.equal(
    parcelTileUrl("http://localhost:3000"),
    "http://localhost:3000/api/tiles?z={z}&x={x}&y={y}&v=4"
  );
}

function testEmptyTileStatus() {
  assert.equal(emptyParcelTileStatus(14), 204);
  assert.equal(emptyParcelTileStatus(NaN), 204);
  assert.equal(emptyParcelTileStatus(15), 410);
  assert.equal(emptyParcelTileStatus(16), 410);
  assert.equal(emptyParcelTileStatus(17), 410);
}

function testParcelLookup() {
  assert.equal(parcelIdsMatch("ABC", "abc"), true);
  assert.equal(parcelIdsMatch(" a ", "a"), true);
  assert.equal(parcelIdsMatch("", "a"), false);
  assert.equal(
    featureMatchesLrid({ properties: { lrid: "uuid-1" } }, "UUID-1"),
    true
  );
  assert.equal(
    featureMatchesLrid({ properties: { LRID: "uuid-1" } }, "uuid-1"),
    true
  );

  const small = {
    properties: { lrid: "small" },
    geometry: {
      type: "Polygon" as const,
      coordinates: [
        [
          [0, 0],
          [0.01, 0],
          [0.01, 0.01],
          [0, 0],
        ],
      ],
    },
  };
  const large = {
    properties: { lrid: "large" },
    geometry: {
      type: "Polygon" as const,
      coordinates: [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 0],
        ],
      ],
    },
  };
  assert.equal(pickParcelFeature([large, small], "small")?.properties?.lrid, "small");
  assert.equal(pickParcelFeature([large, small], "missing"), null);
  assert.equal(pickParcelFeature([large, small], null)?.properties?.lrid, "small");
  assert.equal(propertiesMatchRequestedLrid({ lrid: "x" }, "X"), true);
  assert.equal(propertiesMatchRequestedLrid({ lrid: "x" }, "y"), false);
  assert.equal(propertiesMatchRequestedLrid({ lrid: "x" }, null), true);
}

function testPropertyMap() {
  const mapped = mapProperties({
    lrid: "6febee98-daf4-2654-febc-86aba726eeba",
    ownername: "JETER HINDA MARCELLA",
    parcelstate: "TX",
    totalvalue: 305880,
    usecode: "1",
    elevavg: 248.88,
    placefp: "13492",
    surfpointx: -96.95,
    accesstype: "OPEN",
  });
  assert.equal(mapped.PROP_ID, "6febee98-daf4-2654-febc-86aba726eeba");
  assert.equal(mapped.OWNER_NAME, "JETER HINDA MARCELLA");
  assert.equal(mapped.SITUS_STATE, "TX");
  assert.equal(mapped.MKT_VAL, 305880);
  assert.equal(mapped.ELEVAVG, undefined);
  assert.equal(mapped.PLACEFP, undefined);
  assert.equal(mapped.SURFPOINTX, undefined);
  assert.equal(mapped.ACCESSTYPE, undefined);

  const merged = mergeParcelProperties(
    { PROP_ID: "aaa", SITUS_ADDR: "123 MAIN", OWNER_NAME: "" },
    { PROP_ID: "aaa", SITUS_ADDR: "WRONG ST", OWNER_NAME: "JANE DOE", MKT_VAL: 100 }
  );
  assert.equal(merged.SITUS_ADDR, "123 MAIN");
  assert.equal(merged.OWNER_NAME, "JANE DOE");
  assert.equal(merged.MKT_VAL, 100);

  const withStreet = resolveParcelDisplayAddress({
    SITUS_ADDR: "511 FALLING LEAVES DR",
    SITUS_CITY: "DUNCANVILLE",
    SITUS_STATE: "TX",
    SITUS_ZIP: "75116",
  });
  assert.equal(withStreet.title, "511 FALLING LEAVES DR");
  assert.equal(withStreet.hasStreetAddress, true);

  const sparse = resolveParcelDisplayAddress({
    SITUS_STATE: "TX",
    COUNTY_FIPS: "48113",
    USE_CODE: "1",
  });
  assert.equal(sparse.hasStreetAddress, false);
  assert.equal(sparse.title, "No street address");
  assert.notEqual(sparse.subtitle, "TX");
  assert.notEqual(sparse.title, "TX");
}

testParcelTilesConfig();
testEmptyTileStatus();
testParcelLookup();
testPropertyMap();
console.log("All KnockScout parcel port checks passed.");
