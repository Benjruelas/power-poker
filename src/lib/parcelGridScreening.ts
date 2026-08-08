import type { FeatureCollection, Point } from "geojson";
import type { SubstationProperties } from "./types";

export type VoltageTierId =
  | "distribution"
  | "subtransmission"
  | "transmission138"
  | "transmission230"
  | "transmission345"
  | "unknown";

export type VoltageTier = {
  id: VoltageTierId;
  label: string;
  connection: string;
  /** Typical deliverable MW band from voltage-class screening. */
  typicalMwLow: number;
  typicalMwHigh: number;
  /** Default conductor ampacity for thermal ceiling. */
  defaultAmpacityA: number;
  /** Effective impedance Ω/mile for voltage-drop estimate. */
  defaultROhmPerMile: number;
  /** Line build cost $/mile (low–high). */
  lineCostPerMileLow: number;
  lineCostPerMileHigh: number;
};

/** Voltage class is the best single predictor of deliverable MW. */
export const VOLTAGE_TIERS: Record<VoltageTierId, VoltageTier> = {
  distribution: {
    id: "distribution",
    label: "Distribution",
    connection: "Single distribution feeder (12.5–25 kV)",
    typicalMwLow: 5,
    typicalMwHigh: 15,
    defaultAmpacityA: 600,
    defaultROhmPerMile: 0.5,
    lineCostPerMileLow: 500_000,
    lineCostPerMileHigh: 1_500_000,
  },
  subtransmission: {
    id: "subtransmission",
    label: "69 kV",
    connection: "Dedicated substation off 69 kV",
    typicalMwLow: 20,
    typicalMwHigh: 50,
    defaultAmpacityA: 800,
    defaultROhmPerMile: 0.35,
    lineCostPerMileLow: 1_000_000,
    lineCostPerMileHigh: 2_500_000,
  },
  transmission138: {
    id: "transmission138",
    label: "138 kV",
    connection: "138 kV transmission tap",
    typicalMwLow: 50,
    typicalMwHigh: 200,
    defaultAmpacityA: 1200,
    defaultROhmPerMile: 0.25,
    lineCostPerMileLow: 1_500_000,
    lineCostPerMileHigh: 3_000_000,
  },
  transmission230: {
    id: "transmission230",
    label: "230 kV",
    connection: "230 kV transmission tap",
    typicalMwLow: 100,
    typicalMwHigh: 250,
    defaultAmpacityA: 1400,
    defaultROhmPerMile: 0.2,
    lineCostPerMileLow: 2_000_000,
    lineCostPerMileHigh: 4_000_000,
  },
  transmission345: {
    id: "transmission345",
    label: "345 kV+",
    connection: "345 kV interconnection",
    typicalMwLow: 300,
    typicalMwHigh: 500,
    defaultAmpacityA: 2000,
    defaultROhmPerMile: 0.15,
    lineCostPerMileLow: 3_000_000,
    lineCostPerMileHigh: 6_000_000,
  },
  unknown: {
    id: "unknown",
    label: "Unknown",
    connection: "Voltage unknown",
    typicalMwLow: 0,
    typicalMwHigh: 0,
    defaultAmpacityA: 600,
    defaultROhmPerMile: 0.5,
    lineCostPerMileLow: 1_500_000,
    lineCostPerMileHigh: 3_000_000,
  },
};

/** New substation ballpark when a tap alone is not enough. */
export const NEW_SUBSTATION_COST_LOW = 10_000_000;
export const NEW_SUBSTATION_COST_HIGH = 30_000_000;

export type NearestSubstation = {
  properties: SubstationProperties;
  distanceMiles: number;
};

export type GridScreeningAssumptions = {
  ampacityA: number;
  rOhmPerMile: number;
  /** Voltage-drop allowance as a fraction (default 5%). */
  voltageDropFraction: number;
};

export type GridScreeningResult = {
  nearest: NearestSubstation;
  tier: VoltageTier;
  /** kV used in formulas (sub maxVolt, or tier midpoint if missing). */
  voltageKv: number;
  /** Thermal hard ceiling S_max = √3 · V · I (MVA ≈ MW). */
  thermalMva: number;
  /** Practical thermal after ~50% derating (distribution-heavy). */
  thermalPracticalMw: number;
  /** Distance-dependent voltage-drop limit. */
  voltageDropMw: number;
  /** Surge impedance loading reference (transmission). */
  silMw: number | null;
  /** Voltage-class typical band. */
  typicalMwLow: number;
  typicalMwHigh: number;
  /**
   * Screening ceiling excluding unknown headroom:
   * min(tier high, thermal practical, voltage-drop).
   */
  screeningCeilingMw: number;
  /** Binding constraint label for the ceiling. */
  bindingConstraint: "voltage class" | "thermal" | "voltage drop";
  lineCostLow: number;
  lineCostHigh: number;
  newSubCostLow: number;
  newSubCostHigh: number;
  /** True when distance makes a new sub / long lateral more likely. */
  likelyNeedsNewSub: boolean;
  assumptions: GridScreeningAssumptions;
  notes: string[];
};

function haversineMiles(
  lng1: number,
  lat1: number,
  lng2: number,
  lat2: number
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 3958.8;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function voltageTierFromKv(maxVolt: number): VoltageTier {
  if (!Number.isFinite(maxVolt) || maxVolt <= 0 || maxVolt >= 999999) {
    return VOLTAGE_TIERS.unknown;
  }
  if (maxVolt >= 345) return VOLTAGE_TIERS.transmission345;
  if (maxVolt >= 230) return VOLTAGE_TIERS.transmission230;
  if (maxVolt >= 138) return VOLTAGE_TIERS.transmission138;
  if (maxVolt >= 69) return VOLTAGE_TIERS.subtransmission;
  return VOLTAGE_TIERS.distribution;
}

/** Nominal kV for formulas when substation voltage is missing. */
function nominalKvForTier(tier: VoltageTier, maxVolt: number): number {
  if (Number.isFinite(maxVolt) && maxVolt > 0 && maxVolt < 999999) {
    return maxVolt;
  }
  switch (tier.id) {
    case "distribution":
      return 25;
    case "subtransmission":
      return 69;
    case "transmission138":
      return 138;
    case "transmission230":
      return 230;
    case "transmission345":
      return 345;
    default:
      return 25;
  }
}

/**
 * Thermal limit (hard ceiling of any line/feeder):
 * S_max = √3 × V_LL × I_rated  (VA → MVA)
 */
export function thermalLimitMva(voltageKv: number, ampacityA: number): number {
  if (!(voltageKv > 0) || !(ampacityA > 0)) return 0;
  return (Math.sqrt(3) * voltageKv * 1000 * ampacityA) / 1e6;
}

/**
 * Distance-dependent voltage-drop limit (mainly matters at distribution):
 * P_max(MW) ≈ (drop × V_kV²) / (r × L_miles)
 */
export function voltageDropLimitMw(
  voltageKv: number,
  distanceMiles: number,
  rOhmPerMile: number,
  dropFraction = 0.05
): number {
  if (!(voltageKv > 0) || !(rOhmPerMile > 0)) return Infinity;
  const L = Math.max(distanceMiles, 0.05);
  return (dropFraction * voltageKv * voltageKv) / (rOhmPerMile * L);
}

/** SIL ≈ V²/400 for overhead transmission (MW). */
export function surgeImpedanceLoadingMw(voltageKv: number): number | null {
  if (!(voltageKv >= 69)) return null;
  return (voltageKv * voltageKv) / 400;
}

export function findNearestSubstations(
  lat: number,
  lng: number,
  substations: FeatureCollection<Point, SubstationProperties> | null,
  limit = 3
): NearestSubstation[] {
  if (!substations || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return [];
  }

  const ranked: NearestSubstation[] = [];
  for (const f of substations.features) {
    const p = f.properties;
    if (!Number.isFinite(p.latitude) || !Number.isFinite(p.longitude)) continue;
    ranked.push({
      properties: p,
      distanceMiles: haversineMiles(lng, lat, p.longitude, p.latitude),
    });
  }

  ranked.sort((a, b) => a.distanceMiles - b.distanceMiles);
  return ranked.slice(0, limit);
}

export function screenParcelGrid(
  nearest: NearestSubstation,
  overrides?: Partial<GridScreeningAssumptions>
): GridScreeningResult {
  const tier = voltageTierFromKv(nearest.properties.maxVolt);
  const voltageKv = nominalKvForTier(tier, nearest.properties.maxVolt);
  const assumptions: GridScreeningAssumptions = {
    ampacityA: overrides?.ampacityA ?? tier.defaultAmpacityA,
    rOhmPerMile: overrides?.rOhmPerMile ?? tier.defaultROhmPerMile,
    voltageDropFraction: overrides?.voltageDropFraction ?? 0.05,
  };

  const thermalMva = thermalLimitMva(voltageKv, assumptions.ampacityA);
  // Distribution: ~50% of nameplate after derating; transmission closer to thermal.
  const derate = tier.id === "distribution" ? 0.55 : 0.85;
  const thermalPracticalMw = thermalMva * derate;

  const voltageDropMw = voltageDropLimitMw(
    voltageKv,
    nearest.distanceMiles,
    assumptions.rOhmPerMile,
    assumptions.voltageDropFraction
  );

  const silMw = surgeImpedanceLoadingMw(voltageKv);
  const typicalMwLow = tier.typicalMwLow;
  const typicalMwHigh = tier.typicalMwHigh;

  const candidates: {
    label: GridScreeningResult["bindingConstraint"];
    value: number;
  }[] = [
    { label: "voltage class", value: typicalMwHigh || Infinity },
    { label: "thermal", value: thermalPracticalMw },
    { label: "voltage drop", value: voltageDropMw },
  ];

  let bindingConstraint: GridScreeningResult["bindingConstraint"] =
    "voltage class";
  let screeningCeilingMw = Infinity;
  for (const c of candidates) {
    if (c.value < screeningCeilingMw) {
      screeningCeilingMw = c.value;
      bindingConstraint = c.label;
    }
  }
  if (!Number.isFinite(screeningCeilingMw)) screeningCeilingMw = 0;

  const miles = nearest.distanceMiles;
  const lineCostLow = miles * tier.lineCostPerMileLow;
  const lineCostHigh = miles * tier.lineCostPerMileHigh;

  // Heuristic: long laterals or distribution-only nearby → new sub more likely.
  const likelyNeedsNewSub =
    miles > 2 ||
    (tier.id === "distribution" && miles > 0.5) ||
    (tier.id === "subtransmission" && miles > 1.5);

  const notes: string[] = [
    "Substation headroom (N-1 rating − peak − queue) usually dominates and is not on the map — confirm with a utility load inquiry.",
    "Distance is mostly a cost variable; voltage class drives the MW ceiling.",
  ];
  if (tier.id === "distribution") {
    notes.push(
      "At distribution voltage, voltage drop and feeder thermal limits often bind before a few miles."
    );
  } else if (voltageKv >= 138) {
    notes.push(
      "At 138 kV+, voltage drop over a few miles is usually negligible vs thermal / SIL and upstream constraints."
    );
  }
  if (nearest.properties.queuedMw5mi > 300) {
    notes.push(
      `${Math.round(nearest.properties.queuedMw5mi)} MW queued within 5 mi of this sub — crowding is a headroom risk proxy.`
    );
  }

  return {
    nearest,
    tier,
    voltageKv,
    thermalMva,
    thermalPracticalMw,
    voltageDropMw: Number.isFinite(voltageDropMw) ? voltageDropMw : 0,
    silMw,
    typicalMwLow,
    typicalMwHigh,
    screeningCeilingMw,
    bindingConstraint,
    lineCostLow,
    lineCostHigh,
    newSubCostLow: NEW_SUBSTATION_COST_LOW,
    newSubCostHigh: NEW_SUBSTATION_COST_HIGH,
    likelyNeedsNewSub,
    assumptions,
    notes,
  };
}

export function formatDistanceMiles(miles: number): string {
  if (!Number.isFinite(miles)) return "—";
  if (miles < 0.1) return `${(miles * 5280).toFixed(0)} ft`;
  if (miles < 10) return `${miles.toFixed(2)} mi`;
  return `${miles.toFixed(1)} mi`;
}
