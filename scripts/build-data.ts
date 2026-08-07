/**
 * Static data pipeline for Power Poker.
 * Run: npm run data
 *
 * Sources:
 * - HIFLD Open Electric Substations / Transmission Lines (CONUS)
 * - ERCOTQueue, SPP CSV, MISO JSON, PJM XLSX, CAISO XLSX, NYISO XLSX, ISO-NE HTML
 * - Census county boundaries (CONUS)
 * - Fiber routes: OpenStreetMap communication/fibre ways + HIFLD USACE IENC cables
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import * as turf from "@turf/turf";
import type {
  Feature,
  FeatureCollection,
  LineString,
  MultiLineString,
  Point,
  Polygon,
  MultiPolygon,
} from "geojson";
import {
  computeOpportunityScore,
  voltageClassFromKv,
} from "../src/lib/scoring";
import type {
  NearbyProjectSummary,
  QueueProjectProperties,
  SubstationProperties,
  TransmissionLineProperties,
  FiberRouteProperties,
  DataMeta,
} from "../src/lib/types";
import {
  buildCaisoProjects,
  buildIsoneProjects,
  buildNyisoProjects,
  buildPjmProjects,
} from "./iso-queues";

const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, "public", "data");
const RAW_DIR = path.join(ROOT, "data", "raw");

/** Contiguous US envelope (W, S, E, N). */
const REGION_BBOX: [number, number, number, number] = [
  -125.0, 24.3, -66.5, 49.5,
];
/** States in SPP GI CSV. */
const SPP_STATES = new Set([
  "AR",
  "AZ",
  "CO",
  "IA",
  "KS",
  "LA",
  "MN",
  "MO",
  "MT",
  "ND",
  "NE",
  "NM",
  "OK",
  "SD",
  "TX",
  "WY",
]);
/** States in MISO GI API (exclude empty / AK noise). */
const MISO_STATES = new Set([
  "AR",
  "IA",
  "IL",
  "IN",
  "KY",
  "LA",
  "MI",
  "MN",
  "MO",
  "MS",
  "MT",
  "ND",
  "SD",
  "TX",
  "WI",
]);
/** Lower 48 + DC for HIFLD / counties. */
const REGION_STATES = new Set([
  "AL",
  "AR",
  "AZ",
  "CA",
  "CO",
  "CT",
  "DC",
  "DE",
  "FL",
  "GA",
  "IA",
  "ID",
  "IL",
  "IN",
  "KS",
  "KY",
  "LA",
  "MA",
  "MD",
  "ME",
  "MI",
  "MN",
  "MO",
  "MS",
  "MT",
  "NC",
  "ND",
  "NE",
  "NH",
  "NJ",
  "NM",
  "NV",
  "NY",
  "OH",
  "OK",
  "OR",
  "PA",
  "RI",
  "SC",
  "SD",
  "TN",
  "TX",
  "UT",
  "VA",
  "VT",
  "WA",
  "WI",
  "WV",
  "WY",
]);
const STATE_FIPS: Record<string, string> = {
  "01": "AL",
  "04": "AZ",
  "05": "AR",
  "06": "CA",
  "08": "CO",
  "09": "CT",
  "10": "DE",
  "11": "DC",
  "12": "FL",
  "13": "GA",
  "16": "ID",
  "17": "IL",
  "18": "IN",
  "19": "IA",
  "20": "KS",
  "21": "KY",
  "22": "LA",
  "23": "ME",
  "24": "MD",
  "25": "MA",
  "26": "MI",
  "27": "MN",
  "28": "MS",
  "29": "MO",
  "30": "MT",
  "31": "NE",
  "32": "NV",
  "33": "NH",
  "34": "NJ",
  "35": "NM",
  "36": "NY",
  "37": "NC",
  "38": "ND",
  "39": "OH",
  "40": "OK",
  "41": "OR",
  "42": "PA",
  "44": "RI",
  "45": "SC",
  "46": "SD",
  "47": "TN",
  "48": "TX",
  "49": "UT",
  "50": "VT",
  "51": "VA",
  "53": "WA",
  "54": "WV",
  "55": "WI",
  "56": "WY",
};
const FIVE_MILES_KM = 5 * 1.60934;
const ONE_MILE_KM = 1.60934;

const SUBSTATION_URLS = [
  "https://services5.arcgis.com/HDRa0B57OVrv2E1q/arcgis/rest/services/Electric_Substations/FeatureServer/0/query",
  "https://gis.elpasotexas.gov/dev/rest/services/source_HIFLD_Open/MapServer/5/query",
];

const LINE_URLS = [
  "https://services1.arcgis.com/Hp6G80Pky0om7QvQ/arcgis/rest/services/Electric_Power_Transmission_Lines/FeatureServer/0/query",
  "https://services2.arcgis.com/FiaPA4ga0iQKduv3/arcgis/rest/services/US_Electric_Power_Transmission_Lines/FeatureServer/0/query",
  "https://gis.elpasotexas.gov/dev/rest/services/source_HIFLD_Open/MapServer/7/query",
];

const PROJECTS_URL = "https://www.ercotqueue.com/data/projects.json";
const SPP_SUMMARY_CSV = "https://opsportal.spp.org/Studies/GenerateSummaryCSV";
const SPP_ACTIVE_CSV = "https://opsportal.spp.org/Studies/GenerateActiveCSV";
const MISO_PROJECTS_URL = "https://www.misoenergy.org/api/giqueue/getprojects";
/** US county GeoJSON (Census-derived 20m); filter to CONUS. */
const COUNTIES_URL =
  "https://eric.clst.org/assets/wiki/uploads/Stuff/gz_2010_us_050_00_20m.json";

interface MisoQueueProject {
  id?: number;
  projectNumber?: string;
  queueDate?: string;
  inService?: string;
  transmissionOwner?: string;
  county?: string;
  state?: string;
  poiName?: string;
  summerNetMW?: number;
  winterNetMW?: number;
  fuelType?: string;
  facilityType?: string;
  applicationStatus?: string;
  studyPhase?: string;
  postGIAStatus?: string;
}

function sppStateCandidates(rawState: string): string[] {
  const s = rawState.trim().toUpperCase();
  if (s === "TX/OK" || s === "OK/TX") return ["OK", "TX"];
  if (SPP_STATES.has(s)) return [s];
  return [];
}

interface ErcotQueueProject {
  inr: string;
  name: string;
  developer: string;
  poi_location: string;
  county: string;
  zone: string;
  fuel: string;
  fuel_display: string;
  capacity_mw: number;
  projected_cod: string | null;
  status_raw: string;
  funnel_stage: string;
  has_ia: boolean;
  fis_complete: boolean;
  is_commissioned: boolean;
  completion_probability_calibrated?: number;
  completion_probability?: number;
  county_lat: number;
  county_lng: number;
}

interface ErcotQueuePayload {
  generated_at?: string;
  source_file?: string;
  projects: ErcotQueueProject[];
}

type CountyCentroidIndex = Map<string, { lon: number; lat: number; name: string; state: string }>;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Power-Poker/1.0 (research; public data)" },
  });
  if (!res.ok) throw new Error(`Fetch failed ${res.status}: ${url}`);
  return res.json() as Promise<T>;
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Power-Poker/1.0 (research; public data)" },
  });
  if (!res.ok) throw new Error(`Fetch failed ${res.status}: ${url}`);
  return res.text();
}

async function fetchArcGisGeoJson(
  baseUrl: string,
  where: string,
  outFields: string,
  extraParams: Record<string, string> = {}
): Promise<FeatureCollection> {
  const pageSize = 2000;
  let offset = 0;
  const features: Feature[] = [];

  for (;;) {
    const params = new URLSearchParams({
      where,
      outFields,
      returnGeometry: "true",
      outSR: "4326",
      f: "geojson",
      resultOffset: String(offset),
      resultRecordCount: String(pageSize),
      ...extraParams,
    });
    const url = `${baseUrl}?${params.toString()}`;
    console.log(`  fetching offset=${offset}…`);
    const page = await fetchJson<
      FeatureCollection & {
        exceededTransferLimit?: boolean;
        properties?: { exceededTransferLimit?: boolean };
      }
    >(url);
    const batch = page.features ?? [];
    features.push(...batch);
    const exceeded =
      page.exceededTransferLimit ||
      page.properties?.exceededTransferLimit ||
      batch.length === pageSize;
    if (!exceeded || batch.length === 0) break;
    offset += batch.length;
    await sleep(150);
  }

  return { type: "FeatureCollection", features };
}

async function fetchFirstWorking(
  urls: string[],
  where: string,
  outFields: string,
  extraParams: Record<string, string> = {}
): Promise<FeatureCollection> {
  let lastError: unknown;
  for (const url of urls) {
    try {
      console.log(`Trying ${url}`);
      return await fetchArcGisGeoJson(url, where, outFields, extraParams);
    } catch (err) {
      console.warn(`  failed: ${err}`);
      lastError = err;
    }
  }
  throw lastError;
}

function num(v: unknown, fallback = 0): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function str(v: unknown, fallback = ""): string {
  if (v == null) return fallback;
  return String(v).trim();
}

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(/[\s_]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(substation|sub|ss|switching|station|tap)\b/g, " ")
    .replace(/\b\d+(\.\d+)?\s*kv\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function countyKey(county: string, state: string): string {
  return `${titleCase(county).toLowerCase()}|${state.toUpperCase()}`;
}

function parsePoiName(poi: string): { name: string; voltageKv: number | null } {
  const voltageMatch = poi.match(/(\d+(?:\.\d+)?)\s*kV/i);
  const voltageKv = voltageMatch ? Number(voltageMatch[1]) : null;
  let cleaned = poi
    .replace(/^\s*\d+\s*/, "")
    .replace(/\b\d+(?:\.\d+)?\s*kV\b/gi, "")
    .replace(/\btap\b/gi, " ")
    .trim();
  cleaned = cleaned.split(/\s[-–]\s/)[0] ?? cleaned;
  return { name: cleaned.trim(), voltageKv };
}

function haversineMiles(
  lon1: number,
  lat1: number,
  lon2: number,
  lat2: number
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 3958.7613;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function simplifyLine(
  feature: Feature<LineString | MultiLineString>
): Feature<LineString | MultiLineString> {
  try {
    return turf.simplify(feature, {
      tolerance: 0.002,
      highQuality: false,
      mutate: false,
    }) as Feature<LineString | MultiLineString>;
  } catch {
    return feature;
  }
}

function inRegionBbox(lon: number, lat: number): boolean {
  return (
    lon >= REGION_BBOX[0] &&
    lon <= REGION_BBOX[2] &&
    lat >= REGION_BBOX[1] &&
    lat <= REGION_BBOX[3]
  );
}

async function buildSubstations(): Promise<
  FeatureCollection<Point, SubstationProperties>
> {
  const stateList = [...REGION_STATES].sort().map((s) => `'${s}'`).join(",");
  const raw = await fetchFirstWorking(
    SUBSTATION_URLS,
    `STATE IN (${stateList})`,
    "OBJECTID,ID,NAME,CITY,STATE,COUNTY,TYPE,STATUS,MAX_VOLT,MIN_VOLT,LINES,LATITUDE,LONGITUDE"
  );

  const features: Feature<Point, SubstationProperties>[] = [];

  for (const f of raw.features) {
    const p = f.properties ?? {};
    const lon =
      f.geometry?.type === "Point"
        ? f.geometry.coordinates[0]
        : num(p.LONGITUDE, NaN);
    const lat =
      f.geometry?.type === "Point"
        ? f.geometry.coordinates[1]
        : num(p.LATITUDE, NaN);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    if (!inRegionBbox(lon, lat)) continue;

    const state = str(p.STATE).toUpperCase();
    if (!REGION_STATES.has(state)) continue;

    let maxVolt = num(p.MAX_VOLT, 0);
    let minVolt = num(p.MIN_VOLT, 0);
    if (maxVolt < 0 || maxVolt >= 999999) maxVolt = 0;
    if (minVolt < 0 || minVolt >= 999999) minVolt = 0;
    if (maxVolt > 0 && maxVolt < 69) continue;

    const id = str(p.ID) || str(p.OBJECTID) || `${lon},${lat}`;
    const name = str(p.NAME, "Unknown");
    if (/^UNKNOWN/i.test(name) && maxVolt <= 0) continue;

    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [lon, lat] },
      properties: {
        id,
        name,
        city: str(p.CITY),
        county: titleCase(str(p.COUNTY)),
        state,
        type: str(p.TYPE, "SUBSTATION"),
        status: str(p.STATUS, "UNKNOWN"),
        maxVolt,
        minVolt,
        lines: Math.max(0, num(p.LINES, 0)),
        latitude: lat,
        longitude: lon,
        voltageClass: voltageClassFromKv(maxVolt),
        queuedMw5mi: 0,
        queuedMwByFuel: {},
        activeProjectCount5mi: 0,
        batteryProjectCount5mi: 0,
        commissionedBatteryMw5mi: 0,
        nearbyProjects: [],
        opportunityScore: 0,
        scoreBreakdown: {
          voltage: 0,
          crowding: 0,
          bessSignal: 0,
          connectivity: 0,
        },
      },
    });
  }

  console.log(`Substations retained: ${features.length}`);
  return { type: "FeatureCollection", features };
}

async function buildLines(): Promise<
  FeatureCollection<LineString | MultiLineString, TransmissionLineProperties>
> {
  const bbox = REGION_BBOX.join(",");
  const raw = await fetchFirstWorking(
    LINE_URLS,
    "1=1",
    "OBJECTID,ID,TYPE,STATUS,VOLTAGE,VOLT_CLASS,SUB_1,SUB_2",
    {
      geometry: bbox,
      geometryType: "esriGeometryEnvelope",
      inSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
    }
  );

  const features: Feature<
    LineString | MultiLineString,
    TransmissionLineProperties
  >[] = [];

  for (const f of raw.features) {
    if (
      !f.geometry ||
      (f.geometry.type !== "LineString" && f.geometry.type !== "MultiLineString")
    ) {
      continue;
    }
    const p = f.properties ?? {};
    const voltage = num(p.VOLTAGE, 0);
    const voltClass = str(p.VOLT_CLASS, "Unknown");
    if (voltage > 0 && voltage < 69) continue;
    if (
      /under|unknown/i.test(voltClass) &&
      (voltage <= 0 || voltage >= 999999)
    ) {
      continue;
    }

    const simplified = simplifyLine(
      f as Feature<LineString | MultiLineString>
    );

    features.push({
      type: "Feature",
      geometry: simplified.geometry,
      properties: {
        id: str(p.ID) || str(p.OBJECTID),
        type: str(p.TYPE, "OVERHEAD"),
        status: str(p.STATUS, "UNKNOWN"),
        voltage: voltage >= 999999 ? 0 : voltage,
        voltClass,
        sub1: str(p.SUB_1),
        sub2: str(p.SUB_2),
      },
    });
  }

  console.log(`Transmission lines retained: ${features.length}`);
  return { type: "FeatureCollection", features };
}

function buildNameIndex(
  substations: FeatureCollection<Point, SubstationProperties>
) {
  const byNorm = new Map<string, Feature<Point, SubstationProperties>[]>();
  for (const f of substations.features) {
    const key = normalizeName(f.properties.name);
    if (!key || key.startsWith("unknown")) continue;
    const list = byNorm.get(key) ?? [];
    list.push(f);
    byNorm.set(key, list);
  }
  return byNorm;
}

function matchSubstationByPoi(
  poiLocation: string,
  county: string,
  state: string,
  byNorm: Map<string, Feature<Point, SubstationProperties>[]>,
  allSubs: Feature<Point, SubstationProperties>[]
): {
  sub: Feature<Point, SubstationProperties> | null;
  precision: "substation" | "county";
} {
  const { name: poiName } = parsePoiName(poiLocation || "");
  const norm = normalizeName(poiName);
  const countyTitle = titleCase(county || "");
  const stateU = state.toUpperCase();

  const sameStateCounty = (c: Feature<Point, SubstationProperties>) =>
    c.properties.state === stateU &&
    (!countyTitle ||
      c.properties.county.toLowerCase() === countyTitle.toLowerCase());

  if (norm) {
    const candidates = (byNorm.get(norm) ?? []).filter(
      (c) => c.properties.state === stateU
    );
    if (candidates.length === 1)
      return { sub: candidates[0]!, precision: "substation" };
    if (candidates.length > 1) {
      const sameCounty = candidates.filter(sameStateCounty);
      if (sameCounty.length >= 1)
        return { sub: sameCounty[0]!, precision: "substation" };
      return { sub: candidates[0]!, precision: "substation" };
    }

    const partial: Feature<Point, SubstationProperties>[] = [];
    for (const [key, list] of byNorm) {
      if (key.includes(norm) || norm.includes(key)) {
        for (const c of list) {
          if (sameStateCounty(c)) partial.push(c);
        }
      }
    }
    if (partial.length === 1)
      return { sub: partial[0]!, precision: "substation" };
    if (partial.length > 1) {
      partial.sort((a, b) => b.properties.maxVolt - a.properties.maxVolt);
      return { sub: partial[0]!, precision: "substation" };
    }
  }

  void allSubs;
  return { sub: null, precision: "county" };
}

/** Minimal CSV parser that handles quoted fields. */
function parseCsv(text: string): Record<string, string>[] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  // SPP summary CSV often has a title row before headers
  let headerIdx = 0;
  for (let i = 0; i < Math.min(lines.length, 5); i++) {
    if (/Generation Interconnection Number/i.test(lines[i] ?? "")) {
      headerIdx = i;
      break;
    }
  }
  const headerLine = lines[headerIdx];
  if (!headerLine) return [];

  const headers = splitCsvLine(headerLine).map((h) => h.trim());
  const rows: Record<string, string>[] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line || !line.trim()) continue;
    const cells = splitCsvLine(line);
    if (cells.every((c) => !c.trim())) continue;
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = (cells[idx] ?? "").trim();
    });
    rows.push(row);
  }
  return rows;
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

function rowGet(row: Record<string, string>, ...keys: string[]): string {
  for (const k of keys) {
    if (row[k] != null && String(row[k]).trim() !== "") return String(row[k]).trim();
  }
  // Case-insensitive fallback
  const lower = Object.fromEntries(
    Object.entries(row).map(([k, v]) => [k.toLowerCase().trim(), v])
  );
  for (const k of keys) {
    const v = lower[k.toLowerCase()];
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

function mapSppFuel(generationType: string, fuelType: string): {
  fuel: string;
  fuelDisplay: string;
} {
  const blob = `${generationType} ${fuelType}`.toLowerCase();
  if (/batter|storage|bess|ess/.test(blob))
    return { fuel: "BAT", fuelDisplay: "Battery" };
  if (/solar|photovoltaic|pv/.test(blob))
    return { fuel: "SOL", fuelDisplay: "Solar" };
  if (/wind/.test(blob)) return { fuel: "WIN", fuelDisplay: "Wind" };
  if (/gas|natural gas|combustion/.test(blob))
    return { fuel: "GAS", fuelDisplay: "Gas" };
  if (/nuclear/.test(blob)) return { fuel: "NUC", fuelDisplay: "Nuclear" };
  const display = fuelType || generationType || "Other";
  return { fuel: "OTH", fuelDisplay: display };
}

function mapSppStatus(statusRaw: string): {
  funnelStage: string;
  hasIa: boolean;
  fisComplete: boolean;
  isCommissioned: boolean;
  keep: boolean;
} {
  const s = statusRaw.toUpperCase();
  if (/WITHDRAWN/.test(s)) {
    return {
      funnelStage: "1_no_ia",
      hasIa: false,
      fisComplete: false,
      isCommissioned: false,
      keep: false,
    };
  }
  if (/COMMERCIAL OPERATION/.test(s)) {
    return {
      funnelStage: "5_commissioned",
      hasIa: true,
      fisComplete: true,
      isCommissioned: true,
      keep: true,
    };
  }
  if (/IA FULLY EXECUTED/.test(s)) {
    return {
      funnelStage: "4_construction",
      hasIa: true,
      fisComplete: true,
      isCommissioned: false,
      keep: true,
    };
  }
  if (/IA PENDING/.test(s)) {
    return {
      funnelStage: "2_ia_fis_pending",
      hasIa: true,
      fisComplete: false,
      isCommissioned: false,
      keep: true,
    };
  }
  if (/DISIS/.test(s)) {
    return {
      funnelStage: "1_no_ia",
      hasIa: false,
      fisComplete: false,
      isCommissioned: false,
      keep: true,
    };
  }
  // Default active
  return {
    funnelStage: "1_no_ia",
    hasIa: false,
    fisComplete: false,
    isCommissioned: false,
    keep: true,
  };
}

async function buildErcotProjects(
  substations: FeatureCollection<Point, SubstationProperties>
): Promise<{
  features: Feature<Point, QueueProjectProperties>[];
  sourceFile?: string;
  generatedAt?: string;
}> {
  console.log("Downloading ERCOTQueue projects…");
  const payload = await fetchJson<ErcotQueuePayload>(PROJECTS_URL);
  const byNorm = buildNameIndex(substations);
  const features: Feature<Point, QueueProjectProperties>[] = [];
  let matched = 0;

  for (const p of payload.projects ?? []) {
    const { sub, precision } = matchSubstationByPoi(
      p.poi_location || "",
      p.county || "",
      "TX",
      byNorm,
      substations.features
    );
    let lon = p.county_lng;
    let lat = p.county_lat;
    let matchedId: string | null = null;
    let matchedName: string | null = null;

    if (sub) {
      lon = sub.properties.longitude;
      lat = sub.properties.latitude;
      matchedId = sub.properties.id;
      matchedName = sub.properties.name;
      matched++;
    }

    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;

    const fuelDisplay = p.fuel_display || p.fuel;
    const looksBattery =
      p.fuel === "BAT" ||
      /\bbattery\b|\bbess\b|\bstorage\b/i.test(`${fuelDisplay} ${p.name}`);

    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [lon, lat] },
      properties: {
        inr: p.inr,
        name: p.name,
        developer: p.developer,
        poiLocation: p.poi_location,
        county: titleCase(p.county || ""),
        state: "TX",
        zone: p.zone,
        market: "ERCOT",
        fuel: looksBattery ? "BAT" : p.fuel,
        fuelDisplay: looksBattery ? "Battery" : fuelDisplay,
        capacityMw: Math.max(0, num(p.capacity_mw)),
        projectedCod: p.projected_cod,
        statusRaw: p.status_raw,
        funnelStage: p.funnel_stage,
        hasIa: Boolean(p.has_ia),
        fisComplete: Boolean(p.fis_complete),
        isCommissioned: Boolean(p.is_commissioned),
        completionProbability: num(
          p.completion_probability_calibrated ?? p.completion_probability,
          0
        ),
        latitude: lat,
        longitude: lon,
        geometryPrecision: precision,
        matchedSubstationId: matchedId,
        matchedSubstationName: matchedName,
      },
    });
  }

  console.log(
    `ERCOT projects: ${features.length} (POI-matched: ${matched})`
  );
  return {
    features,
    sourceFile: payload.source_file,
    generatedAt: payload.generated_at,
  };
}

async function buildSppProjects(
  substations: FeatureCollection<Point, SubstationProperties>,
  countyCentroids: CountyCentroidIndex
): Promise<Feature<Point, QueueProjectProperties>[]> {
  console.log("Downloading SPP GI queue CSV…");
  let text = "";
  try {
    text = await fetchText(SPP_SUMMARY_CSV);
  } catch (err) {
    console.warn(`SPP summary CSV failed (${err}); trying active CSV…`);
    text = await fetchText(SPP_ACTIVE_CSV);
  }
  await writeFile(path.join(RAW_DIR, "spp-gi.csv"), text);

  const rows = parseCsv(text);
  const byNorm = buildNameIndex(substations);
  const features: Feature<Point, QueueProjectProperties>[] = [];
  let matched = 0;
  let skippedWithdrawn = 0;
  const byState: Record<string, number> = {};

  for (const row of rows) {
    const stateCandidates = sppStateCandidates(rowGet(row, "State"));
    if (stateCandidates.length === 0) continue;

    const inr = rowGet(row, "Generation Interconnection Number");
    if (!inr) continue;

    const statusRaw = rowGet(row, "Status");
    const status = mapSppStatus(statusRaw);
    if (!status.keep) {
      skippedWithdrawn++;
      continue;
    }

    const countyRaw = rowGet(
      row,
      " Nearest Town or County",
      "Nearest Town or County",
      "County"
    );
    // Often "Town, County" or just county name
    let county = countyRaw;
    if (county.includes(",")) {
      const parts = county.split(",").map((p) => p.trim());
      county = parts[parts.length - 1] || county;
    }
    county = titleCase(county.replace(/\s+County$/i, ""));

    const poi = rowGet(row, "Substation or Line");
    const capacity = num(
      rowGet(
        row,
        "Capacity (MW)",
        "Capacity",
        "Nameplate Capacity",
        "MAX Summer MW"
      ),
      0
    );
    const genType = rowGet(row, "Generation Type");
    const fuelType = rowGet(row, "Fuel Type");
    const { fuel, fuelDisplay } = mapSppFuel(genType, fuelType);
    const developer = rowGet(row, "TO at POI") || "";
    const cod =
      rowGet(row, "Commercial Operation Date", "In-Service Date (proposed)") ||
      null;

    let lon = NaN;
    let lat = NaN;
    let matchedId: string | null = null;
    let matchedName: string | null = null;
    let geomPrecision: "substation" | "county" = "county";
    let state = stateCandidates[0];

    for (const candidate of stateCandidates) {
      const { sub, precision } = matchSubstationByPoi(
        poi,
        county,
        candidate,
        byNorm,
        substations.features
      );
      if (sub) {
        lon = sub.properties.longitude;
        lat = sub.properties.latitude;
        matchedId = sub.properties.id;
        matchedName = sub.properties.name;
        geomPrecision = "substation";
        state = candidate;
        matched++;
        break;
      }
      const c = countyCentroids.get(countyKey(county, candidate));
      if (c && !Number.isFinite(lon)) {
        lon = c.lon;
        lat = c.lat;
        geomPrecision = precision === "substation" ? "substation" : "county";
        state = candidate;
      }
    }

    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;

    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [lon, lat] },
      properties: {
        inr,
        name: poi || inr,
        developer,
        poiLocation: poi,
        county,
        state,
        zone: `SPP-${state}`,
        market: "SPP",
        fuel,
        fuelDisplay,
        capacityMw: Math.max(0, capacity),
        projectedCod: cod,
        statusRaw,
        funnelStage: status.funnelStage,
        hasIa: status.hasIa,
        fisComplete: status.fisComplete,
        isCommissioned: status.isCommissioned,
        completionProbability: 0,
        latitude: lat,
        longitude: lon,
        geometryPrecision: geomPrecision,
        matchedSubstationId: matchedId,
        matchedSubstationName: matchedName,
      },
    });
    byState[state] = (byState[state] ?? 0) + 1;
  }

  console.log(
    `SPP projects: ${features.length} (POI-matched: ${matched}, withdrawn skipped: ${skippedWithdrawn})`,
    byState
  );
  return features;
}

function mapMisoFuel(fuelType: string, facilityType: string): {
  fuel: string;
  fuelDisplay: string;
} {
  const blob = `${fuelType} ${facilityType}`.toLowerCase();
  if (/batter|storage|bess|ess|compressed air/.test(blob))
    return { fuel: "BAT", fuelDisplay: "Battery" };
  if (/solar|photovoltaic|pv/.test(blob))
    return { fuel: "SOL", fuelDisplay: "Solar" };
  if (/wind/.test(blob)) return { fuel: "WIN", fuelDisplay: "Wind" };
  if (/gas|combined cycle|combustion|diesel|coal/.test(blob))
    return { fuel: "GAS", fuelDisplay: fuelType || "Gas" };
  if (/nuclear/.test(blob)) return { fuel: "NUC", fuelDisplay: "Nuclear" };
  const display = fuelType || facilityType || "Other";
  return { fuel: "OTH", fuelDisplay: display };
}

function mapMisoStatus(
  applicationStatus: string,
  postGIAStatus: string,
  studyPhase: string
): {
  funnelStage: string;
  hasIa: boolean;
  fisComplete: boolean;
  isCommissioned: boolean;
  keep: boolean;
} {
  const app = applicationStatus.toUpperCase();
  const gia = postGIAStatus.toUpperCase();
  const phase = studyPhase.toUpperCase();

  if (/WITHDRAWN/.test(app) || /WITHDRAWN/.test(gia)) {
    return {
      funnelStage: "1_no_ia",
      hasIa: false,
      fisComplete: false,
      isCommissioned: false,
      keep: false,
    };
  }

  if (/DONE|LEGACY:\s*DONE/.test(app)) {
    if (/IN SERVICE/.test(gia)) {
      return {
        funnelStage: "5_commissioned",
        hasIa: true,
        fisComplete: true,
        isCommissioned: true,
        keep: true,
      };
    }
    if (/UNDER CONSTRUCTION/.test(gia)) {
      return {
        funnelStage: "4_construction",
        hasIa: true,
        fisComplete: true,
        isCommissioned: false,
        keep: true,
      };
    }
    return {
      funnelStage: "3_ia_fis_complete",
      hasIa: true,
      fisComplete: true,
      isCommissioned: false,
      keep: true,
    };
  }

  if (/ACTIVE|PENDING/.test(app)) {
    if (/GIA|AGREEMENT/.test(phase) || /GIA/.test(gia)) {
      return {
        funnelStage: "2_ia_fis_pending",
        hasIa: true,
        fisComplete: false,
        isCommissioned: false,
        keep: true,
      };
    }
    return {
      funnelStage: "1_no_ia",
      hasIa: false,
      fisComplete: false,
      isCommissioned: false,
      keep: true,
    };
  }

  return {
    funnelStage: "1_no_ia",
    hasIa: false,
    fisComplete: false,
    isCommissioned: false,
    keep: true,
  };
}

async function buildMisoProjects(
  substations: FeatureCollection<Point, SubstationProperties>,
  countyCentroids: CountyCentroidIndex
): Promise<Feature<Point, QueueProjectProperties>[]> {
  console.log("Downloading MISO GI queue…");
  const payload = await fetchJson<MisoQueueProject[]>(MISO_PROJECTS_URL);
  await writeFile(
    path.join(RAW_DIR, "miso-gi.json"),
    JSON.stringify(payload)
  );

  const byNorm = buildNameIndex(substations);
  const features: Feature<Point, QueueProjectProperties>[] = [];
  let matched = 0;
  let skippedWithdrawn = 0;
  let skippedNoState = 0;
  const byState: Record<string, number> = {};

  for (const row of payload) {
    const state = str(row.state).toUpperCase();
    if (!state || state === "AK" || !MISO_STATES.has(state)) {
      if (!state || state === "AK") skippedNoState++;
      continue;
    }

    const inr = str(row.projectNumber);
    if (!inr) continue;

    const statusRaw = [str(row.applicationStatus), str(row.postGIAStatus)]
      .filter(Boolean)
      .join(" / ");
    const status = mapMisoStatus(
      str(row.applicationStatus),
      str(row.postGIAStatus),
      str(row.studyPhase)
    );
    if (!status.keep) {
      skippedWithdrawn++;
      continue;
    }

    const county = titleCase(str(row.county).replace(/\s+County$/i, ""));
    const poi = str(row.poiName);
    const capacity = Math.max(
      num(row.summerNetMW, 0),
      num(row.winterNetMW, 0)
    );
    const { fuel, fuelDisplay } = mapMisoFuel(
      str(row.fuelType),
      str(row.facilityType)
    );
    const developer = str(row.transmissionOwner);
    const cod = str(row.inService) || null;

    const { sub, precision } = matchSubstationByPoi(
      poi,
      county,
      state,
      byNorm,
      substations.features
    );

    let lon = NaN;
    let lat = NaN;
    let matchedId: string | null = null;
    let matchedName: string | null = null;
    let geomPrecision: "substation" | "county" = precision;

    if (sub) {
      lon = sub.properties.longitude;
      lat = sub.properties.latitude;
      matchedId = sub.properties.id;
      matchedName = sub.properties.name;
      geomPrecision = "substation";
      matched++;
    } else {
      const c = countyCentroids.get(countyKey(county, state));
      if (c) {
        lon = c.lon;
        lat = c.lat;
        geomPrecision = "county";
      }
    }

    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;

    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [lon, lat] },
      properties: {
        inr,
        name: poi || inr,
        developer,
        poiLocation: poi,
        county,
        state,
        zone: `MISO-${state}`,
        market: "MISO",
        fuel,
        fuelDisplay,
        capacityMw: Math.max(0, capacity),
        projectedCod: cod,
        statusRaw,
        funnelStage: status.funnelStage,
        hasIa: status.hasIa,
        fisComplete: status.fisComplete,
        isCommissioned: status.isCommissioned,
        completionProbability: 0,
        latitude: lat,
        longitude: lon,
        geometryPrecision: geomPrecision,
        matchedSubstationId: matchedId,
        matchedSubstationName: matchedName,
      },
    });
    byState[state] = (byState[state] ?? 0) + 1;
  }

  console.log(
    `MISO projects: ${features.length} (POI-matched: ${matched}, withdrawn skipped: ${skippedWithdrawn}, no-state skipped: ${skippedNoState})`,
    byState
  );
  return features;
}

async function buildProjects(
  substations: FeatureCollection<Point, SubstationProperties>,
  countyCentroids: CountyCentroidIndex
): Promise<FeatureCollection<Point, QueueProjectProperties>> {
  const helpers = {
    num,
    str,
    titleCase,
    countyKey,
    buildNameIndex,
    matchSubstationByPoi,
  };
  const ercot = await buildErcotProjects(substations);
  const spp = await buildSppProjects(substations, countyCentroids);
  const miso = await buildMisoProjects(substations, countyCentroids);
  const pjm = await buildPjmProjects(
    substations,
    countyCentroids,
    RAW_DIR,
    helpers
  );
  const caiso = await buildCaisoProjects(
    substations,
    countyCentroids,
    RAW_DIR,
    helpers
  );
  const nyiso = await buildNyisoProjects(
    substations,
    countyCentroids,
    RAW_DIR,
    helpers
  );
  const isone = await buildIsoneProjects(
    substations,
    countyCentroids,
    RAW_DIR,
    helpers
  );
  const features = [
    ...ercot.features,
    ...spp,
    ...miso,
    ...pjm,
    ...caiso,
    ...nyiso,
    ...isone,
  ];
  console.log(`Projects total: ${features.length}`);
  return {
    type: "FeatureCollection",
    features,
    // @ts-expect-error attach meta for pipeline
    _meta: {
      sourceFile: [
        ercot.sourceFile ?? "ERCOTQueue",
        "SPP",
        "MISO",
        "PJM",
        "CAISO",
        "NYISO",
        "ISO-NE",
      ].join(" + "),
      generatedAt: ercot.generatedAt,
    },
  };
}

function isBatteryProject(pp: QueueProjectProperties): boolean {
  if (pp.fuel === "BAT") return true;
  const blob = `${pp.fuelDisplay} ${pp.name}`.toLowerCase();
  return /\bbattery\b|\bbess\b|\bstorage\b|\bess\b/.test(blob);
}

function normalizeFuelKey(pp: QueueProjectProperties): string {
  if (isBatteryProject(pp)) return "BAT";
  if (["SOL", "WIN", "GAS", "NUC"].includes(pp.fuel)) return pp.fuel;
  return "OTH";
}

function enrichSubstations(
  substations: FeatureCollection<Point, SubstationProperties>,
  projects: FeatureCollection<Point, QueueProjectProperties>
) {
  // County-centroid projects never affect score/nearby list — skip them here.
  const byPoiId = new Map<string, Feature<Point, QueueProjectProperties>[]>();
  const proximityProjects: Feature<Point, QueueProjectProperties>[] = [];
  // ~0.1° cells (~7 mi) for proximity candidates
  const cellSize = 0.1;
  const byCell = new Map<string, Feature<Point, QueueProjectProperties>[]>();

  for (const proj of projects.features) {
    const pp = proj.properties;
    if (pp.matchedSubstationId) {
      const list = byPoiId.get(pp.matchedSubstationId) ?? [];
      list.push(proj);
      byPoiId.set(pp.matchedSubstationId, list);
    }
    if (pp.geometryPrecision !== "substation") continue;
    proximityProjects.push(proj);
    const cx = Math.floor(pp.longitude / cellSize);
    const cy = Math.floor(pp.latitude / cellSize);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const key = `${cx + dx}:${cy + dy}`;
        const list = byCell.get(key) ?? [];
        list.push(proj);
        byCell.set(key, list);
      }
    }
  }

  console.log(
    `Enriching ${substations.features.length} substations against ${proximityProjects.length} proximity-matched projects…`
  );

  for (const sub of substations.features) {
    const [lon, lat] = sub.geometry.coordinates;
    const nearby: NearbyProjectSummary[] = [];
    const queuedMwByFuel: Record<string, number> = {};
    let queuedMw5mi = 0;
    let activeProjectCount5mi = 0;
    let batteryProjectCount5mi = 0;
    let commissionedBatteryMw5mi = 0;
    const seen = new Set<string>();

    const candidates = [
      ...(byPoiId.get(sub.properties.id) ?? []),
      ...(byCell.get(
        `${Math.floor(lon / cellSize)}:${Math.floor(lat / cellSize)}`
      ) ?? []),
    ];

    for (const proj of candidates) {
      const pp = proj.properties;
      const dedupe = `${pp.market}:${pp.inr}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);

      let distanceMiles: number;
      let matchedBy: NearbyProjectSummary["matchedBy"];

      if (pp.matchedSubstationId === sub.properties.id) {
        distanceMiles = 0;
        matchedBy = "poi";
      } else {
        distanceMiles = haversineMiles(lon, lat, pp.longitude, pp.latitude);
        if (distanceMiles > 5) continue;
        matchedBy = "proximity";
      }

      const fuelKey = normalizeFuelKey(pp);

      nearby.push({
        inr: pp.inr,
        name: pp.name,
        fuel: fuelKey,
        fuelDisplay: isBatteryProject(pp) ? "Battery" : pp.fuelDisplay,
        capacityMw: Math.max(0, pp.capacityMw),
        statusRaw: pp.statusRaw,
        funnelStage: pp.funnelStage,
        projectedCod: pp.projectedCod,
        distanceMiles: Math.round(distanceMiles * 10) / 10,
        matchedBy,
        market: pp.market,
      });

      if (isBatteryProject(pp)) {
        if (pp.isCommissioned) {
          commissionedBatteryMw5mi += Math.max(0, pp.capacityMw);
        } else {
          batteryProjectCount5mi += 1;
        }
      }

      if (!pp.isCommissioned) {
        activeProjectCount5mi += 1;
        const mw = Math.max(0, pp.capacityMw);
        queuedMw5mi += mw;
        queuedMwByFuel[fuelKey] = (queuedMwByFuel[fuelKey] ?? 0) + mw;
      }
    }

    nearby.sort((a, b) => {
      const rank = (m: NearbyProjectSummary["matchedBy"]) =>
        m === "poi" ? 0 : m === "proximity" ? 1 : 2;
      return (
        rank(a.matchedBy) - rank(b.matchedBy) ||
        a.distanceMiles - b.distanceMiles
      );
    });
    const nearbyTrimmed = nearby
      .filter((n) => n.matchedBy !== "county")
      .slice(0, 25);

    const { opportunityScore, scoreBreakdown } = computeOpportunityScore({
      maxVolt: sub.properties.maxVolt,
      queuedMw5mi,
      batteryProjectCount5mi,
      lines: sub.properties.lines,
    });

    sub.properties = {
      ...sub.properties,
      queuedMw5mi: Math.round(queuedMw5mi * 10) / 10,
      queuedMwByFuel,
      activeProjectCount5mi,
      batteryProjectCount5mi,
      commissionedBatteryMw5mi: Math.round(commissionedBatteryMw5mi * 10) / 10,
      nearbyProjects: nearbyTrimmed,
      opportunityScore,
      scoreBreakdown,
    };
  }
}

async function buildCounties(): Promise<{
  counties: FeatureCollection<Polygon | MultiPolygon>;
  centroids: CountyCentroidIndex;
}> {
  console.log("Downloading Census counties (CONUS)…");
  const raw = await fetchJson<FeatureCollection>(COUNTIES_URL);
  const centroids: CountyCentroidIndex = new Map();
  const features: Feature<Polygon | MultiPolygon>[] = [];

  for (const f of raw.features ?? []) {
    const p = (f.properties ?? {}) as Record<string, unknown>;
    const stateFp = str(p.STATE ?? p.STATEFP ?? p.statefp);
    const state = STATE_FIPS[stateFp];
    if (!state) continue;
    if (
      !f.geometry ||
      (f.geometry.type !== "Polygon" && f.geometry.type !== "MultiPolygon")
    ) {
      continue;
    }

    const name = titleCase(str(p.NAME ?? p.name));
    const countyFp = str(p.COUNTY ?? p.COUNTYFP ?? "");
    const geoIdRaw = str(p.GEO_ID ?? p.GEOID ?? p.geoid);
    const geoid =
      geoIdRaw.replace(/^0500000US/, "") ||
      (countyFp ? `${stateFp}${countyFp.padStart(3, "0")}` : "");

    features.push({
      type: "Feature",
      geometry: f.geometry,
      properties: { name, geoid, state },
    });

    try {
      const c = turf.centroid(f as Feature<Polygon | MultiPolygon>);
      const [lon, lat] = c.geometry.coordinates;
      centroids.set(countyKey(name, state), { lon, lat, name, state });
    } catch {
      /* skip centroid */
    }
  }

  console.log(
    `Counties retained: ${features.length} (centroids: ${centroids.size})`
  );
  return {
    counties: { type: "FeatureCollection", features },
    centroids,
  };
}

const HIFLD_SUBMARINE_CABLE_URLS = [
  "https://services5.arcgis.com/HDRa0B57OVrv2E1q/arcgis/rest/services/Submarine_Cable_Lines_USACE_IENC/FeatureServer/0/query",
];
const HIFLD_OVERHEAD_CABLE_URLS = [
  "https://services5.arcgis.com/HDRa0B57OVrv2E1q/arcgis/rest/services/Overhead_Cables_USACE_IENC/FeatureServer/0/query",
];

/** Rough CONUS tiles for Overpass (S,W,N,E) — keeps queries under timeout. */
const OSM_FIBER_BBOXES: [number, number, number, number][] = [
  [24.5, -125.0, 36.0, -110.0], // West South
  [36.0, -125.0, 49.5, -110.0], // West North
  [24.5, -110.0, 36.0, -95.0], // Central South
  [36.0, -110.0, 49.5, -95.0], // Central North
  [24.5, -95.0, 36.0, -80.0], // East-Central South
  [36.0, -95.0, 49.5, -80.0], // East-Central North
  [24.5, -80.0, 36.0, -66.5], // East South
  [36.0, -80.0, 49.5, -66.5], // East North
];

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.osm.ch/api/interpreter",
];

type OsmElement = {
  type: string;
  id: number;
  tags?: Record<string, string>;
  geometry?: { lat: number; lon: number }[];
};

function pointInRegionBbox(lon: number, lat: number): boolean {
  const [w, s, e, n] = REGION_BBOX;
  return lon >= w && lon <= e && lat >= s && lat <= n;
}

function lineIntersectsRegion(
  coords: [number, number][] | [number, number][][]
): boolean {
  const flat =
    Array.isArray(coords[0]?.[0]) && typeof coords[0][0] !== "number"
      ? (coords as [number, number][][]).flat()
      : (coords as [number, number][]);
  return flat.some(([lon, lat]) => pointInRegionBbox(lon, lat));
}

async function fetchOverpassFiberWays(
  south: number,
  west: number,
  north: number,
  east: number
): Promise<OsmElement[]> {
  const query = `[out:json][timeout:90];
(
  way["communication"="line"](${south},${west},${north},${east});
  way["telecom"="line"](${south},${west},${north},${east});
  way["telecom"="cable"](${south},${west},${north},${east});
  way["telecom"="path"](${south},${west},${north},${east});
  way["telecom:medium"~"fibre|fiber",i](${south},${west},${north},${east});
  way["cables"~"fibre|fiber",i](${south},${west},${north},${east});
  way["utility"="telecom"](${south},${west},${north},${east});
  way["seamark:cable_submarine:category"~"fibre|fiber|telephone",i](${south},${west},${north},${east});
);
out geom;`;
  let lastErr: unknown;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "Power-Poker/1.0 (research; public data)",
        },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(100_000),
      });
      if (!res.ok) {
        lastErr = new Error(`Overpass ${res.status}`);
        continue;
      }
      const data = (await res.json()) as { elements?: OsmElement[] };
      return data.elements ?? [];
    } catch (err) {
      lastErr = err;
    }
  }
  console.warn(
    `  Overpass failed for [${south},${west},${north},${east}]:`,
    lastErr instanceof Error ? lastErr.message : lastErr
  );
  return [];
}

async function buildOsmFiberRoutes(): Promise<
  Feature<LineString, FiberRouteProperties>[]
> {
  const byId = new Map<number, Feature<LineString, FiberRouteProperties>>();
  for (const [south, west, north, east] of OSM_FIBER_BBOXES) {
    console.log(
      `  OSM fiber bbox S=${south} W=${west} N=${north} E=${east}…`
    );
    const elements = await fetchOverpassFiberWays(south, west, north, east);
    let added = 0;
    for (const el of elements) {
      if (el.type !== "way" || !el.geometry || el.geometry.length < 2) continue;
      if (byId.has(el.id)) continue;
      const coords: [number, number][] = el.geometry.map((g) => [g.lon, g.lat]);
      if (!lineIntersectsRegion(coords)) continue;
      const tags = el.tags ?? {};
      const category =
        tags["telecom:medium"] ||
        tags.telecom ||
        tags.communication ||
        tags.cables ||
        tags.utility ||
        "osm";
      byId.set(el.id, {
        type: "Feature",
        geometry: { type: "LineString", coordinates: coords },
        properties: {
          id: `osm-${el.id}`,
          name: tags.name || tags.operator || `OSM ${el.id}`,
          source: "osm",
          category,
        },
      });
      added += 1;
    }
    console.log(`    +${added} ways (unique total ${byId.size})`);
    await sleep(1500);
  }
  return [...byId.values()];
}

async function buildHifldCableRoutes(
  urls: string[],
  source: FiberRouteProperties["source"],
  where: string
): Promise<Feature<LineString | MultiLineString, FiberRouteProperties>[]> {
  try {
    const raw = await fetchFirstWorking(urls, where, "*", {
      geometry: REGION_BBOX.join(","),
      geometryType: "esriGeometryEnvelope",
      inSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
    });
    const out: Feature<
      LineString | MultiLineString,
      FiberRouteProperties
    >[] = [];
    for (const f of raw.features ?? []) {
      if (
        !f.geometry ||
        (f.geometry.type !== "LineString" &&
          f.geometry.type !== "MultiLineString")
      ) {
        continue;
      }
      const p = (f.properties ?? {}) as Record<string, unknown>;
      const oid = str(p.OBJECTID ?? p.OBJECTID_1 ?? p.FID, String(out.length));
      const category = str(p.Category_o ?? p.category ?? p.CATEGORY, "unknown");
      const catLower = category.trim().toLowerCase();
      if (
        catLower === "powerline" ||
        catLower === "transmission line" ||
        catLower === "power"
      ) {
        continue;
      }
      const name = str(p.Object_Nam ?? p.NAME ?? p.name, `${source}-${oid}`);
      out.push({
        type: "Feature",
        geometry: f.geometry,
        properties: {
          id: `${source}-${oid}`,
          name: name.trim() || `${source}-${oid}`,
          source,
          category,
        },
      });
    }
    return out;
  } catch (err) {
    console.warn(
      `  HIFLD ${source} failed:`,
      err instanceof Error ? err.message : err
    );
    return [];
  }
}

/**
 * Fiber / telecom cable routes for map overlay.
 * Delegates to scripts/build-fiber-routes.ts (carrier snapshots + HIFLD [+ OSM]).
 */
async function buildFiberRoutes(): Promise<
  FeatureCollection<
    LineString | MultiLineString,
    FiberRouteProperties
  >
> {
  console.log("Building fiber cable routes (scripts/build-fiber-routes.ts)…");
  const { spawn } = await import("node:child_process");
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      "npx",
      ["tsx", "scripts/build-fiber-routes.ts", "--skip-osm"],
      {
        cwd: path.resolve(__dirname, ".."),
        stdio: "inherit",
        shell: process.platform === "win32",
      }
    );
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`fiber-routes build exited ${code}`));
    });
  });
  const raw = await readFile(path.join(OUT_DIR, "fiber-routes.geojson"), "utf8");
  const fc = JSON.parse(raw) as FeatureCollection<
    LineString | MultiLineString,
    FiberRouteProperties
  >;
  console.log(`Fiber routes total: ${fc.features.length}`);
  return fc;
}

async function main() {
  console.log("=== Power Poker data build (all major ISOs, CONUS) ===");
  await mkdir(OUT_DIR, { recursive: true });
  await mkdir(RAW_DIR, { recursive: true });

  const substations = await buildSubstations();
  const lines = await buildLines();
  const fiberRoutes = await buildFiberRoutes();
  const { counties, centroids } = await buildCounties();
  const projects = await buildProjects(substations, centroids);
  enrichSubstations(substations, projects);

  const projectMeta = (
    projects as FeatureCollection<Point, QueueProjectProperties> & {
      _meta?: { sourceFile?: string; generatedAt?: string };
    }
  )._meta;

  const meta: DataMeta = {
    generatedAt: new Date().toISOString(),
    sourceReport:
      projectMeta?.sourceFile ?? "ERCOT + SPP + MISO + PJM + CAISO + NYISO + ISO-NE",
    substationCount: substations.features.length,
    projectCount: projects.features.length,
    lineCount: lines.features.length,
    countyCount: counties.features.length,
    fiberRouteCount: fiberRoutes.features.length,
    notes: [
      "Substations & lines: HIFLD Open (public domain), contiguous US.",
      "Queues: ERCOTQueue, SPP GI CSV, MISO getprojects, PJM ExportToXls, CAISO PublicQueueReport, NYISO Interconnection Queue, ISO-NE IRTT public queue.",
      "Withdrawn projects excluded where the source marks them.",
      "Border states may show queue rows from more than one ISO.",
      "Counties: U.S. Census Bureau cartographic boundaries (CONUS).",
      "Project coordinates: POI-name matched to HIFLD substations when possible; otherwise county centroid.",
      "Opportunity score = voltage (0–35) + crowding (0–35) + BESS signal (0–20) + connectivity (0–10).",
      `Five-mile radius used for proximity metrics (~${FIVE_MILES_KM.toFixed(2)} km). One-mile parcel ring shown in UI (~${ONE_MILE_KM.toFixed(2)} km).`,
      "Fiber coverage overlay: FCC BDC via Esri Living Atlas (live API).",
      "Fiber routes: public carrier snapshots (Crown Castle / Fiberlight / Zayo / …) + HIFLD USACE IENC cables (partial; run `npm run data:fiber` without --skip-osm to also pull OSM).",
    ],
  };

  const projectsOut: FeatureCollection<Point, QueueProjectProperties> = {
    type: "FeatureCollection",
    features: projects.features,
  };

  await writeFile(
    path.join(OUT_DIR, "substations.geojson"),
    JSON.stringify(substations)
  );
  await writeFile(path.join(OUT_DIR, "lines.geojson"), JSON.stringify(lines));
  await writeFile(
    path.join(OUT_DIR, "fiber-routes.geojson"),
    JSON.stringify(fiberRoutes)
  );
  await writeFile(
    path.join(OUT_DIR, "projects.geojson"),
    JSON.stringify(projectsOut)
  );
  await writeFile(
    path.join(OUT_DIR, "counties.geojson"),
    JSON.stringify(counties)
  );
  await writeFile(path.join(OUT_DIR, "meta.json"), JSON.stringify(meta, null, 2));

  const countySet = new Set<string>();
  for (const s of substations.features) {
    if (s.properties.county) {
      countySet.add(`${s.properties.county} (${s.properties.state})`);
    }
  }
  await writeFile(
    path.join(OUT_DIR, "counties-list.json"),
    JSON.stringify([...countySet].sort(), null, 2)
  );

  console.log("Wrote:");
  console.log(`  substations: ${meta.substationCount}`);
  console.log(`  lines:       ${meta.lineCount}`);
  console.log(`  fiber routes:${meta.fiberRouteCount}`);
  console.log(`  projects:    ${meta.projectCount}`);
  console.log(`  counties:    ${meta.countyCount}`);
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
