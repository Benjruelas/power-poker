/**
 * Dormant solar auto-layout types. Not used by the abstract drawer UI.
 * Kept so layout.ts continues to typecheck for a future “Solar draft” action.
 */
import type { Feature, LineString, Polygon } from "geojson";

export type SitePlanForm = {
  projectName: string;
  utility: string;
  moduleWidthFt: number;
  moduleLengthFt: number;
  moduleWatts: number;
  tiltDeg: number;
  azimuthDeg: number;
  rowPitchFt: number;
  setbackFt: number;
  fireLaneWidthFt: number;
  corridorWidthFt: number;
  rowsPerFireLaneGroup: number;
  targetDcKw: number;
  inverterKw: number;
  inverterCount: number;
  poiDescription: string;
};

export type SitePlanRow = {
  id: string;
  polygon: Feature<Polygon>;
  moduleCount: number;
  dcKw: number;
};

export type SitePlanCorridor = {
  id: string;
  kind: "firelane" | "power";
  widthFt: number;
  polygon: Feature<Polygon>;
  label?: string;
};

export type SitePlanPoi = {
  lng: number;
  lat: number;
  description: string;
  snappedVoltageKv: number | null;
  distanceFt: number | null;
  corridor: SitePlanCorridor | null;
};

export type TransmissionSnap = {
  lng: number;
  lat: number;
  voltageKv: number | null;
  distanceFt: number;
};

export type LayoutResult = {
  rows: SitePlanRow[];
  corridors: SitePlanCorridor[];
  totals: { moduleCount: number; dcKw: number; acKw: number };
  buildable: Feature<Polygon> | null;
  warnings: string[];
};

export type SitePlanLineHint = Feature<LineString, { voltage?: number }>;
