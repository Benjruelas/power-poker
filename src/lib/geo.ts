import type { Feature, FeatureCollection, Point } from "geojson";
import type {
  AppFilters,
  QueueProjectProperties,
  SubstationProperties,
} from "./types";

const MILES_TO_DEG_LAT = 1 / 69.0;

/** County filter labels are `Name (ST)` after multi-state coverage. */
export function countyMatchesFilter(
  county: string,
  state: string | undefined,
  selected: string[]
): boolean {
  if (selected.length === 0) return true;
  const bare = county.toLowerCase();
  const labeled = state
    ? `${county} (${state})`.toLowerCase()
    : bare;
  return selected.some((c) => {
    const s = c.toLowerCase();
    return s === labeled || s === bare || s.startsWith(`${bare} (`);
  });
}

/** Approximate circle polygon in lon/lat for map rings. */
export function circlePolygon(
  lon: number,
  lat: number,
  miles: number,
  steps = 64
): GeoJSON.Feature<GeoJSON.Polygon> {
  const coords: [number, number][] = [];
  const latRad = (lat * Math.PI) / 180;
  const dLat = miles * MILES_TO_DEG_LAT;
  const dLon = miles / (Math.cos(latRad) * 69.0);

  for (let i = 0; i <= steps; i++) {
    const angle = (i / steps) * Math.PI * 2;
    coords.push([lon + dLon * Math.cos(angle), lat + dLat * Math.sin(angle)]);
  }

  return {
    type: "Feature",
    properties: { miles },
    geometry: { type: "Polygon", coordinates: [coords] },
  };
}

export function filterSubstations(
  data: FeatureCollection<Point, SubstationProperties> | null,
  filters: AppFilters
): FeatureCollection<Point, SubstationProperties> {
  if (!data) return { type: "FeatureCollection", features: [] };

  const minScore = Math.min(filters.minScore, filters.maxScore);
  const maxScore = Math.max(filters.minScore, filters.maxScore);
  const maxQueued =
    Number.isFinite(filters.maxQueuedMw) && filters.maxQueuedMw > 0
      ? filters.maxQueuedMw
      : 10000;

  const features = data.features.filter((f) => {
    const p = f.properties;
    if (p.maxVolt > 0 && p.maxVolt < filters.minVoltage) return false;
    if (p.opportunityScore < minScore || p.opportunityScore > maxScore) return false;
    if (p.queuedMw5mi > maxQueued) return false;
    if (!countyMatchesFilter(p.county, p.state, filters.counties)) {
      return false;
    }
    return true;
  });

  return { type: "FeatureCollection", features };
}

export function filterProjects(
  data: FeatureCollection<Point, QueueProjectProperties> | null,
  filters: AppFilters
): FeatureCollection<Point, QueueProjectProperties> {
  if (!data) return { type: "FeatureCollection", features: [] };

  const features = data.features.filter((f) => {
    const p = f.properties;
    if (!filters.fuels.includes(p.fuel)) return false;
    if (!filters.stages.includes(p.funnelStage)) return false;
    if (p.capacityMw < filters.minProjectMw || p.capacityMw > filters.maxProjectMw)
      return false;
    if (!countyMatchesFilter(p.county, p.state, filters.counties)) {
      return false;
    }
    return true;
  });

  return { type: "FeatureCollection", features };
}

export function substationFromFeature(
  f: Feature<Point, SubstationProperties>
): SubstationProperties {
  return f.properties;
}

export function scoreColorExpression(): unknown[] {
  return [
    "interpolate",
    ["linear"],
    ["get", "opportunityScore"],
    0,
    "#ef4444",
    40,
    "#f59e0b",
    60,
    "#84cc16",
    80,
    "#22c55e",
    100,
    "#14b8a6",
  ];
}

export function formatMw(mw: number): string {
  if (!Number.isFinite(mw)) return "—";
  if (mw >= 1000) return `${(mw / 1000).toFixed(1)} GW`;
  return `${Math.round(mw)} MW`;
}

export function formatUsd(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

const MARKET_FYI_PREFIX: Record<string, string> = {
  ERCOT: "ercot",
  SPP: "spp",
  MISO: "miso",
  PJM: "pjm",
  CAISO: "caiso",
  NYISO: "nyiso",
  ISONE: "isone",
};

/** Public project page on Interconnection.fyi. */
export function interconnectionFyiUrl(
  inr: string,
  market: keyof typeof MARKET_FYI_PREFIX | string = "ERCOT"
): string {
  const raw = String(inr || "")
    .trim()
    .toLowerCase()
    .replace(/^(ercot|spp|miso|pjm|caiso|nyiso|isone)-/, "");
  const prefix = MARKET_FYI_PREFIX[market] ?? "ercot";
  return `https://www.interconnection.fyi/project/${prefix}-${raw}`;
}

export function exportShortlistCsv(
  rows: {
    name: string;
    county: string;
    score: number;
    maxVolt: number;
    queuedMw5mi: number;
    latitude: number;
    longitude: number;
    note: string;
  }[]
): string {
  const header = [
    "name",
    "county",
    "score",
    "max_volt_kv",
    "queued_mw_5mi",
    "latitude",
    "longitude",
    "note",
    "google_maps",
  ];
  const lines = [header.join(",")];
  for (const r of rows) {
    const maps = `https://www.google.com/maps/@${r.latitude},${r.longitude},17z`;
    lines.push(
      [
        csvEscape(r.name),
        csvEscape(r.county),
        r.score,
        r.maxVolt,
        r.queuedMw5mi,
        r.latitude,
        r.longitude,
        csvEscape(r.note),
        csvEscape(maps),
      ].join(",")
    );
  }
  return lines.join("\n");
}

export function exportParcelListCsv(
  rows: {
    address: string;
    ownerName: string;
    county: string;
    acres: number | null;
    marketValue: number | null;
    latitude: number;
    longitude: number;
    note: string;
    parcelId: string;
  }[]
): string {
  const header = [
    "parcel_id",
    "address",
    "owner",
    "county",
    "acres",
    "market_value",
    "latitude",
    "longitude",
    "note",
    "google_maps",
  ];
  const lines = [header.join(",")];
  for (const r of rows) {
    const maps = `https://www.google.com/maps/@${r.latitude},${r.longitude},18z`;
    lines.push(
      [
        csvEscape(r.parcelId),
        csvEscape(r.address),
        csvEscape(r.ownerName),
        csvEscape(r.county),
        r.acres ?? "",
        r.marketValue ?? "",
        r.latitude,
        r.longitude,
        csvEscape(r.note),
        csvEscape(maps),
      ].join(",")
    );
  }
  return lines.join("\n");
}

function csvEscape(v: string): string {
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}
