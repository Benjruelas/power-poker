export type FuelType = "BAT" | "SOL" | "WIN" | "GAS" | "NUC" | "OTH" | string;

export type FunnelStage =
  | "1_no_ia"
  | "2_ia_fis_pending"
  | "3_ia_fis_complete"
  | "4_construction"
  | "5_commissioned"
  | string;

export type Market =
  | "ERCOT"
  | "SPP"
  | "MISO"
  | "PJM"
  | "CAISO"
  | "NYISO"
  | "ISONE";

export interface NearbyProjectSummary {
  inr: string;
  name: string;
  fuel: string;
  fuelDisplay: string;
  capacityMw: number;
  statusRaw: string;
  funnelStage: string;
  projectedCod: string | null;
  distanceMiles: number;
  matchedBy: "poi" | "proximity" | "county";
  market: Market;
}

export interface SubstationProperties {
  id: string;
  name: string;
  city: string;
  county: string;
  state: string;
  type: string;
  status: string;
  maxVolt: number;
  minVolt: number;
  lines: number;
  latitude: number;
  longitude: number;
  voltageClass: string;
  queuedMw5mi: number;
  queuedMwByFuel: Record<string, number>;
  activeProjectCount5mi: number;
  batteryProjectCount5mi: number;
  commissionedBatteryMw5mi: number;
  nearbyProjects: NearbyProjectSummary[];
  opportunityScore: number;
  scoreBreakdown: {
    voltage: number;
    crowding: number;
    bessSignal: number;
    connectivity: number;
  };
}

export interface QueueProjectProperties {
  inr: string;
  name: string;
  developer: string;
  poiLocation: string;
  county: string;
  state: string;
  zone: string;
  market: Market;
  fuel: string;
  fuelDisplay: string;
  capacityMw: number;
  projectedCod: string | null;
  statusRaw: string;
  funnelStage: string;
  hasIa: boolean;
  fisComplete: boolean;
  isCommissioned: boolean;
  completionProbability: number;
  latitude: number;
  longitude: number;
  geometryPrecision: "substation" | "county";
  matchedSubstationId: string | null;
  matchedSubstationName: string | null;
}

export interface TransmissionLineProperties {
  id: string;
  type: string;
  status: string;
  voltage: number;
  voltClass: string;
  sub1: string;
  sub2: string;
}

export interface DataMeta {
  generatedAt: string;
  sourceReport: string;
  substationCount: number;
  projectCount: number;
  lineCount: number;
  countyCount: number;
  notes: string[];
}

export interface AppFilters {
  minVoltage: number;
  counties: string[];
  minScore: number;
  maxScore: number;
  maxQueuedMw: number;
  fuels: string[];
  stages: string[];
  minProjectMw: number;
  maxProjectMw: number;
  showSubstations: boolean;
  showLines: boolean;
  showProjects: boolean;
  showCounties: boolean;
  showParcels: boolean;
  satellite: boolean;
}

export interface ShortlistItem {
  substationId: string;
  name: string;
  county: string;
  score: number;
  maxVolt: number;
  queuedMw5mi: number;
  latitude: number;
  longitude: number;
  note: string;
  addedAt: string;
}

export interface Shortlist {
  id: string;
  name: string;
  createdAt: string;
  items: ShortlistItem[];
}

export interface ParcelListItem {
  parcelId: string;
  address: string;
  ownerName: string;
  county: string;
  acres: number | null;
  marketValue: number | null;
  latitude: number;
  longitude: number;
  note: string;
  addedAt: string;
}

export interface ParcelList {
  id: string;
  name: string;
  createdAt: string;
  items: ParcelListItem[];
}

export const DEFAULT_FILTERS: AppFilters = {
  minVoltage: 69,
  counties: [],
  minScore: 0,
  maxScore: 100,
  maxQueuedMw: 10000,
  fuels: ["BAT", "SOL", "WIN", "GAS", "OTH"],
  stages: [
    "1_no_ia",
    "2_ia_fis_pending",
    "3_ia_fis_complete",
    "4_construction",
    "5_commissioned",
  ],
  minProjectMw: 0,
  maxProjectMw: 2000,
  showSubstations: true,
  showLines: false,
  showProjects: true,
  showCounties: true,
  showParcels: true,
  satellite: false,
};

export const FUEL_COLORS: Record<string, string> = {
  BAT: "#22c55e",
  SOL: "#f59e0b",
  WIN: "#38bdf8",
  GAS: "#f97316",
  NUC: "#a855f7",
  OTH: "#94a3b8",
};

export const STAGE_LABELS: Record<string, string> = {
  "1_no_ia": "No IA",
  "2_ia_fis_pending": "IA / FIS pending",
  "3_ia_fis_complete": "IA + FIS complete",
  "4_construction": "Construction",
  "5_commissioned": "Commissioned",
};
