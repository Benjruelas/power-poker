/**
 * PJM / CAISO / NYISO / ISO-NE queue adapters for the data pipeline.
 */
import { execFile } from "node:child_process";
import { readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import * as XLSX from "xlsx";
import type { Feature, FeatureCollection, Point } from "geojson";
import type { QueueProjectProperties, SubstationProperties } from "../src/lib/types";

const execFileAsync = promisify(execFile);

type CountyCentroidIndex = Map<
  string,
  { lon: number; lat: number; name: string; state: string }
>;

type NameIndex = Map<string, Feature<Point, SubstationProperties>[]>;

export type GeoHelpers = {
  num: (v: unknown, fallback?: number) => number;
  str: (v: unknown, fallback?: string) => string;
  titleCase: (s: string) => string;
  countyKey: (county: string, state: string) => string;
  buildNameIndex: (
    substations: FeatureCollection<Point, SubstationProperties>
  ) => NameIndex;
  matchSubstationByPoi: (
    poiLocation: string,
    county: string,
    state: string,
    byNorm: NameIndex,
    allSubs: Feature<Point, SubstationProperties>[]
  ) => {
    sub: Feature<Point, SubstationProperties> | null;
    precision: "substation" | "county";
  };
};

const PJM_URL = "https://services.pjm.com/PJMPlanningApi/api/Queue/ExportToXls";
const PJM_KEY = "E29477D0-70E0-4825-89B0-43F460BF9AB4";
const CAISO_URL =
  "http://www.caiso.com/PublishedDocuments/PublicQueueReport.xlsx";
const NYISO_URL =
  "https://www.nyiso.com/documents/20142/1407078/NYISO-Interconnection-Queue.xlsx";
const ISONE_PAGE = "https://irtt.iso-ne.com/reports/external";

function mapGenericFuel(blobRaw: string): { fuel: string; fuelDisplay: string } {
  const blob = blobRaw.toLowerCase();
  if (/batter|storage|bess|\bbat\b|es\b/.test(blob))
    return { fuel: "BAT", fuelDisplay: "Battery" };
  if (/solar|photovoltaic|\bsun\b|\bs\b/.test(blob) && blob.length <= 2)
    return { fuel: "SOL", fuelDisplay: "Solar" };
  if (/solar|photovoltaic|\bsun\b/.test(blob))
    return { fuel: "SOL", fuelDisplay: "Solar" };
  if (/wind|\bwnd\b|\bw\b/.test(blob) && (blob.includes("wind") || blob.includes("wnd") || blob === "w"))
    return { fuel: "WIN", fuelDisplay: "Wind" };
  if (/wind|\bwnd\b/.test(blob)) return { fuel: "WIN", fuelDisplay: "Wind" };
  if (/gas|ng\b|methane|oil|diesel|dfo|coal|bit/.test(blob))
    return { fuel: "GAS", fuelDisplay: blobRaw || "Gas" };
  if (/nuclear|\bnuc\b/.test(blob)) return { fuel: "NUC", fuelDisplay: "Nuclear" };
  if (blob === "s") return { fuel: "SOL", fuelDisplay: "Solar" };
  if (blob === "w") return { fuel: "WIN", fuelDisplay: "Wind" };
  if (blob === "es") return { fuel: "BAT", fuelDisplay: "Battery" };
  return { fuel: "OTH", fuelDisplay: blobRaw || "Other" };
}

function excelDateToIso(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString();
  if (typeof v === "number" && Number.isFinite(v)) {
    const parsed = XLSX.SSF.parse_date_code(v);
    if (!parsed) return null;
    return new Date(
      Date.UTC(parsed.y, parsed.m - 1, parsed.d)
    ).toISOString();
  }
  const s = String(v).trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toISOString();
}

async function fetchBuffer(
  url: string,
  init: RequestInit = {}
): Promise<ArrayBuffer> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "User-Agent": "BESS-Site-Finder/1.0 (research; public data)",
      ...(init.headers as Record<string, string>),
    },
  });
  if (!res.ok) throw new Error(`Fetch failed ${res.status}: ${url}`);
  return res.arrayBuffer();
}

function geocode(
  helpers: GeoHelpers,
  poi: string,
  county: string,
  state: string,
  byNorm: NameIndex,
  substations: FeatureCollection<Point, SubstationProperties>,
  countyCentroids: CountyCentroidIndex
): {
  lon: number;
  lat: number;
  matchedId: string | null;
  matchedName: string | null;
  geomPrecision: "substation" | "county";
  matched: boolean;
} {
  const { sub } = helpers.matchSubstationByPoi(
    poi,
    county,
    state,
    byNorm,
    substations.features
  );
  if (sub) {
    return {
      lon: sub.properties.longitude,
      lat: sub.properties.latitude,
      matchedId: sub.properties.id,
      matchedName: sub.properties.name,
      geomPrecision: "substation",
      matched: true,
    };
  }
  const c = countyCentroids.get(helpers.countyKey(county, state));
  if (c) {
    return {
      lon: c.lon,
      lat: c.lat,
      matchedId: null,
      matchedName: null,
      geomPrecision: "county",
      matched: false,
    };
  }
  return {
    lon: NaN,
    lat: NaN,
    matchedId: null,
    matchedName: null,
    geomPrecision: "county",
    matched: false,
  };
}

function pushFeature(
  features: Feature<Point, QueueProjectProperties>[],
  props: QueueProjectProperties
) {
  features.push({
    type: "Feature",
    geometry: { type: "Point", coordinates: [props.longitude, props.latitude] },
    properties: props,
  });
}

function sheetToObjects(
  wb: XLSX.WorkBook,
  sheetName: string,
  headerRowIndex: number
): Record<string, unknown>[] {
  const sheet = wb.Sheets[sheetName];
  if (!sheet) return [];
  const raw = XLSX.utils.sheet_to_json<(string | number | Date)[]>(sheet, {
    header: 1,
    defval: "",
    raw: false,
  });
  const headers = (raw[headerRowIndex] ?? []).map((h) =>
    String(h).replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim()
  );
  const out: Record<string, unknown>[] = [];
  for (let i = headerRowIndex + 1; i < raw.length; i++) {
    const row = raw[i] ?? [];
    if (!row.some((c) => String(c ?? "").trim())) continue;
    const obj: Record<string, unknown> = {};
    headers.forEach((h, idx) => {
      if (h) obj[h] = row[idx];
    });
    out.push(obj);
  }
  return out;
}

export async function buildPjmProjects(
  substations: FeatureCollection<Point, SubstationProperties>,
  countyCentroids: CountyCentroidIndex,
  rawDir: string,
  helpers: GeoHelpers
): Promise<Feature<Point, QueueProjectProperties>[]> {
  console.log("Downloading PJM GI queue…");
  const buf = await fetchBuffer(PJM_URL, {
    method: "POST",
    headers: {
      "api-subscription-key": PJM_KEY,
      Origin: "https://www.pjm.com",
      Referer: "https://www.pjm.com/",
    },
  });
  await writeFile(path.join(rawDir, "pjm-gi.xlsx"), Buffer.from(buf));
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
    wb.Sheets.Data ?? wb.Sheets[wb.SheetNames[0]!],
    { defval: "" }
  );
  const byNorm = helpers.buildNameIndex(substations);
  const features: Feature<Point, QueueProjectProperties>[] = [];
  let matched = 0;
  let skipped = 0;
  const byState: Record<string, number> = {};

  for (const row of rows) {
    const inr = helpers.str(row["Project ID"]);
    if (!inr) continue;
    const statusRaw = helpers.str(row.Status);
    const s = statusRaw.toUpperCase();
    if (
      /WITHDRAWN|RETRACTED|ANNULLED|CANCELED|DEACTIVATED|PENDING TERMINATION/.test(
        s
      )
    ) {
      skipped++;
      continue;
    }
    const state = helpers.str(row.State).toUpperCase();
    if (!state || state === "N/A") continue;
    const county = helpers.titleCase(
      helpers.str(row.County).replace(/\s+County$/i, "")
    );
    const poi = helpers.str(row.Name) || helpers.str(row["Commercial Name"]);
    const capacity = Math.max(
      helpers.num(row.MFO, 0),
      helpers.num(row["MW Capacity"], 0),
      helpers.num(row["MW Energy"], 0),
      helpers.num(row["MW In Service"], 0)
    );
    const { fuel, fuelDisplay } = mapGenericFuel(helpers.str(row.Fuel));
    const geo = geocode(
      helpers,
      poi,
      county,
      state,
      byNorm,
      substations,
      countyCentroids
    );
    if (!Number.isFinite(geo.lon)) continue;
    if (geo.matched) matched++;

    let funnelStage = "1_no_ia";
    let hasIa = false;
    let fisComplete = false;
    let isCommissioned = false;
    if (/IN SERVICE/.test(s)) {
      funnelStage = "5_commissioned";
      hasIa = true;
      fisComplete = true;
      isCommissioned = true;
    } else if (/UNDER CONSTRUCTION|ENGINEERING AND PROCUREMENT/.test(s)) {
      funnelStage = "4_construction";
      hasIa = true;
      fisComplete = true;
    } else if (/CONFIRMED|ACTIVE|SUSPENDED|PARTIALLY/.test(s)) {
      funnelStage = "2_ia_fis_pending";
      hasIa = true;
    }

    pushFeature(features, {
      inr,
      name: poi || inr,
      developer: helpers.str(row["Transmission Owner"]),
      poiLocation: poi,
      county,
      state,
      zone: `PJM-${state}`,
      market: "PJM",
      fuel,
      fuelDisplay,
      capacityMw: Math.max(0, capacity),
      projectedCod: excelDateToIso(row["Projected In Service Date"]),
      statusRaw,
      funnelStage,
      hasIa,
      fisComplete,
      isCommissioned,
      completionProbability: 0,
      latitude: geo.lat,
      longitude: geo.lon,
      geometryPrecision: geo.geomPrecision,
      matchedSubstationId: geo.matchedId,
      matchedSubstationName: geo.matchedName,
    });
    byState[state] = (byState[state] ?? 0) + 1;
  }

  console.log(
    `PJM projects: ${features.length} (POI-matched: ${matched}, withdrawn skipped: ${skipped})`,
    byState
  );
  return features;
}

export async function buildCaisoProjects(
  substations: FeatureCollection<Point, SubstationProperties>,
  countyCentroids: CountyCentroidIndex,
  rawDir: string,
  helpers: GeoHelpers
): Promise<Feature<Point, QueueProjectProperties>[]> {
  console.log("Downloading CAISO GI queue…");
  const buf = await fetchBuffer(CAISO_URL);
  await writeFile(path.join(rawDir, "caiso-gi.xlsx"), Buffer.from(buf));
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const active = sheetToObjects(wb, "Grid GenerationQueue", 3).map(
    (r): Record<string, unknown> => ({
      ...r,
      _sheetStatus: "ACTIVE",
    })
  );
  const completed = sheetToObjects(wb, "Completed Generation Projects", 3).map(
    (r): Record<string, unknown> => ({
      ...r,
      _sheetStatus: "COMPLETED",
    })
  );
  const rows: Record<string, unknown>[] = [...active, ...completed];
  const byNorm = helpers.buildNameIndex(substations);
  const features: Feature<Point, QueueProjectProperties>[] = [];
  let matched = 0;
  const byState: Record<string, number> = {};

  for (const row of rows) {
    const inr = helpers.str(row["Queue Position"]);
    if (!inr) continue;
    const state = helpers.str(row.State).toUpperCase();
    if (!state || state === "MX") continue;
    const app = helpers.str(row["Application Status"]).toUpperCase();
    if (/WITHDRAW/.test(app)) continue;

    const county = helpers.titleCase(
      helpers.str(row.County).replace(/\s+County$/i, "")
    );
    const poi = helpers.str(row["Station or Transmission Line"]);
    const name = helpers.str(row["Project Name"]) || poi || inr;
    const capacity = helpers.num(row["Net MWs to Grid"], 0);
    const fuelBlob = [
      helpers.str(row["Fuel-1"]),
      helpers.str(row["Fuel-2"]),
      helpers.str(row["Type-1"]),
      helpers.str(row["Type-2"]),
    ].join(" ");
    const { fuel, fuelDisplay } = mapGenericFuel(fuelBlob);
    const geo = geocode(
      helpers,
      poi,
      county,
      state,
      byNorm,
      substations,
      countyCentroids
    );
    if (!Number.isFinite(geo.lon)) continue;
    if (geo.matched) matched++;

    const ia = helpers.str(row["Interconnection Agreement Status"]).toUpperCase();
    const sheetDone = row._sheetStatus === "COMPLETED";
    let funnelStage = "1_no_ia";
    let hasIa = false;
    let fisComplete = false;
    let isCommissioned = false;
    if (sheetDone || /COMPLETED|COMPLETE/.test(app)) {
      funnelStage = "5_commissioned";
      hasIa = true;
      fisComplete = true;
      isCommissioned = true;
    } else if (/EXECUTED/.test(ia)) {
      funnelStage = "3_ia_fis_complete";
      hasIa = true;
      fisComplete = true;
    } else if (/ACTIVE/.test(app)) {
      funnelStage = "1_no_ia";
    }

    pushFeature(features, {
      inr,
      name,
      developer: helpers.str(row.Utility),
      poiLocation: poi,
      county,
      state,
      zone: `CAISO-${state}`,
      market: "CAISO",
      fuel,
      fuelDisplay,
      capacityMw: Math.max(0, capacity),
      projectedCod: excelDateToIso(row["Current On-line Date"]),
      statusRaw: helpers.str(row["Application Status"]) || String(row._sheetStatus),
      funnelStage,
      hasIa,
      fisComplete,
      isCommissioned,
      completionProbability: 0,
      latitude: geo.lat,
      longitude: geo.lon,
      geometryPrecision: geo.geomPrecision,
      matchedSubstationId: geo.matchedId,
      matchedSubstationName: geo.matchedName,
    });
    byState[state] = (byState[state] ?? 0) + 1;
  }

  console.log(
    `CAISO projects: ${features.length} (POI-matched: ${matched})`,
    byState
  );
  return features;
}

export async function buildNyisoProjects(
  substations: FeatureCollection<Point, SubstationProperties>,
  countyCentroids: CountyCentroidIndex,
  rawDir: string,
  helpers: GeoHelpers
): Promise<Feature<Point, QueueProjectProperties>[]> {
  console.log("Downloading NYISO GI queue…");
  const buf = await fetchBuffer(NYISO_URL);
  await writeFile(path.join(rawDir, "nyiso-gi.xlsx"), Buffer.from(buf));
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
    wb.Sheets["Interconnection Queue"]!,
    { defval: "" }
  );
  const byNorm = helpers.buildNameIndex(substations);
  const features: Feature<Point, QueueProjectProperties>[] = [];
  let matched = 0;
  const byState: Record<string, number> = {};

  for (const row of rows) {
    const inr = helpers.str(row["Queue Pos."]);
    if (!inr) continue;
    const state = helpers.str(row.State).toUpperCase() || "NY";
    const county = helpers.titleCase(
      helpers.str(row.County).replace(/\s+County$/i, "")
    );
    const poi = helpers.str(row["Points of Interconnection"]);
    const name = helpers.str(row["Project Name"]) || poi || inr;
    const capacity = Math.max(
      helpers.num(row["SP (MW)"], 0),
      helpers.num(row["WP (MW)"], 0)
    );
    const fuelCode = helpers.str(row["Type/ Fuel"]);
    const storage = helpers.str(row["Energy Storage Capability"]);
    const { fuel, fuelDisplay } = mapGenericFuel(
      storage ? `${fuelCode} ES` : fuelCode
    );
    const geo = geocode(
      helpers,
      poi,
      county,
      state,
      byNorm,
      substations,
      countyCentroids
    );
    if (!Number.isFinite(geo.lon)) continue;
    if (geo.matched) matched++;

    const ia = helpers.str(row["IA Tender Date"]);
    pushFeature(features, {
      inr,
      name,
      developer: helpers.str(row["Developer/Interconnection Customer"]),
      poiLocation: poi,
      county,
      state,
      zone: `NYISO-${helpers.str(row["NYISO Zone"]) || state}`,
      market: "NYISO",
      fuel,
      fuelDisplay,
      capacityMw: Math.max(0, capacity),
      projectedCod: excelDateToIso(row["Proposed COD"]),
      statusRaw: `Active / status ${helpers.str(row["Project Status #"])}`,
      funnelStage: ia ? "2_ia_fis_pending" : "1_no_ia",
      hasIa: Boolean(ia),
      fisComplete: false,
      isCommissioned: false,
      completionProbability: 0,
      latitude: geo.lat,
      longitude: geo.lon,
      geometryPrecision: geo.geomPrecision,
      matchedSubstationId: geo.matchedId,
      matchedSubstationName: geo.matchedName,
    });
    byState[state] = (byState[state] ?? 0) + 1;
  }

  console.log(
    `NYISO projects: ${features.length} (POI-matched: ${matched})`,
    byState
  );
  return features;
}

function parseHtmlTable(html: string, tableId: string): {
  headers: string[];
  rows: string[][];
} {
  const re = new RegExp(
    `<table[^>]*id=["']${tableId}["'][\\s\\S]*?<\\/table>`,
    "i"
  );
  const m = html.match(re);
  if (!m) throw new Error(`Table #${tableId} not found`);
  const table = m[0];
  const headers = [...table.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)].map((x) =>
    x[1]!.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim()
  );
  const trs = [...table.matchAll(/<tr[\s\S]*?<\/tr>/gi)];
  const rows: string[][] = [];
  for (let i = 1; i < trs.length; i++) {
    const cells = [...trs[i]![0].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(
      (x) => x[1]!.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim()
    );
    if (cells.length >= 5) rows.push(cells);
  }
  return { headers, rows };
}

export async function buildIsoneProjects(
  substations: FeatureCollection<Point, SubstationProperties>,
  countyCentroids: CountyCentroidIndex,
  rawDir: string,
  helpers: GeoHelpers
): Promise<Feature<Point, QueueProjectProperties>[]> {
  console.log("Downloading ISO-NE GI queue…");
  // IRTT cookie handshake: Node fetch hits a redirect loop; curl handles it.
  const cookieJar = path.join(rawDir, "isone-cookies.txt");
  const htmlPath = path.join(rawDir, "isone-gi.html");
  try {
    await unlink(cookieJar);
  } catch {
    /* fresh jar */
  }
  await execFileAsync(
    "curl",
    [
      "-sS",
      "-L",
      "--max-redirs",
      "10",
      "-c",
      cookieJar,
      "-b",
      cookieJar,
      "-A",
      "Mozilla/5.0",
      "-o",
      htmlPath,
      ISONE_PAGE,
    ],
    { maxBuffer: 20 * 1024 * 1024 }
  );
  const html = await readFile(htmlPath, "utf8");
  if (!html.includes('id="publicqueue"')) {
    throw new Error("ISO-NE public queue table missing from HTML response");
  }

  const { headers, rows } = parseHtmlTable(html, "publicqueue");
  const statusIdx = headers.lastIndexOf("Status");
  const qpIdx = headers.indexOf("QP");
  const fuelIdx = headers.indexOf("Fuel Type");
  const countyIdx = headers.indexOf("County");
  const stIdx = headers.indexOf("ST");
  const poiIdx = headers.indexOf("POI");
  const nameIdx = headers.indexOf("Alternative Name");
  const netIdx = headers.indexOf("Net MW");
  const sumIdx = headers.indexOf("Summer MW");
  const winIdx = headers.indexOf("Winter MW");
  const opIdx = headers.indexOf("Op Date");
  const unitIdx = headers.indexOf("Unit");

  const byNorm = helpers.buildNameIndex(substations);
  const features: Feature<Point, QueueProjectProperties>[] = [];
  let matched = 0;
  let skipped = 0;
  const byState: Record<string, number> = {};

  for (const cells of rows) {
    const statusCode = (cells[statusIdx] ?? "").toUpperCase();
    if (statusCode === "W") {
      skipped++;
      continue;
    }
    if (statusCode !== "A" && statusCode !== "C") continue;

    const inr = cells[qpIdx] ?? "";
    if (!inr) continue;
    const state = (cells[stIdx] ?? "").toUpperCase();
    if (!state || state === "NA" || state === "NB") continue;
    const county = helpers.titleCase(
      (cells[countyIdx] ?? "").replace(/\s+County$/i, "")
    );
    if (/^na$/i.test(county)) continue;
    const poi = cells[poiIdx] ?? "";
    const name = cells[nameIdx] || poi || inr;
    const capacity = Math.max(
      helpers.num(cells[netIdx], 0),
      helpers.num(cells[sumIdx], 0),
      helpers.num(cells[winIdx], 0)
    );
    const { fuel, fuelDisplay } = mapGenericFuel(
      `${cells[fuelIdx] ?? ""} ${cells[unitIdx] ?? ""}`
    );
    const geo = geocode(
      helpers,
      poi,
      county,
      state,
      byNorm,
      substations,
      countyCentroids
    );
    if (!Number.isFinite(geo.lon)) continue;
    if (geo.matched) matched++;

    const commercial = statusCode === "C";
    pushFeature(features, {
      inr,
      name,
      developer: "",
      poiLocation: poi,
      county,
      state,
      zone: `ISONE-${state}`,
      market: "ISONE",
      fuel,
      fuelDisplay,
      capacityMw: Math.max(0, capacity),
      projectedCod: cells[opIdx] || null,
      statusRaw: commercial ? "Commercial" : "Active",
      funnelStage: commercial ? "5_commissioned" : "1_no_ia",
      hasIa: commercial,
      fisComplete: commercial,
      isCommissioned: commercial,
      completionProbability: 0,
      latitude: geo.lat,
      longitude: geo.lon,
      geometryPrecision: geo.geomPrecision,
      matchedSubstationId: geo.matchedId,
      matchedSubstationName: geo.matchedName,
    });
    byState[state] = (byState[state] ?? 0) + 1;
  }

  console.log(
    `ISO-NE projects: ${features.length} (POI-matched: ${matched}, withdrawn skipped: ${skipped})`,
    byState
  );
  return features;
}
