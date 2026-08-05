/** Transparent opportunity scoring for BESS site screening (0–100). */

export function voltageClassFromKv(maxVolt: number): string {
  if (!Number.isFinite(maxVolt) || maxVolt <= 0 || maxVolt >= 999999) return "Unknown";
  if (maxVolt >= 345) return "345+ kV";
  if (maxVolt >= 230) return "230–344 kV";
  if (maxVolt >= 138) return "138–229 kV";
  if (maxVolt >= 69) return "69–137 kV";
  return "<69 kV";
}

/** 0–35: higher interconnect voltage is better for utility-scale BESS. */
export function scoreVoltage(maxVolt: number): number {
  if (!Number.isFinite(maxVolt) || maxVolt <= 0 || maxVolt >= 999999) return 8;
  if (maxVolt >= 345) return 35;
  if (maxVolt >= 230) return 28;
  if (maxVolt >= 138) return 22;
  if (maxVolt >= 69) return 14;
  return 6;
}

/**
 * 0–35: less nearby queued MW is better (crowding / upgrade risk proxy).
 * Only non-commissioned capacity should be passed in.
 */
export function scoreCrowding(queuedMw5mi: number): number {
  if (queuedMw5mi <= 0) return 35;
  if (queuedMw5mi < 100) return 32;
  if (queuedMw5mi < 300) return 28;
  if (queuedMw5mi < 750) return 22;
  if (queuedMw5mi < 1500) return 14;
  if (queuedMw5mi < 3000) return 8;
  return 3;
}

/**
 * 0–20: a few nearby battery projects validate the area;
 * none is neutral; many implies competition.
 */
export function scoreBessSignal(batteryProjectCount5mi: number): number {
  if (batteryProjectCount5mi >= 1 && batteryProjectCount5mi <= 3) return 20;
  if (batteryProjectCount5mi === 0) return 10;
  if (batteryProjectCount5mi <= 8) return 12;
  return 5;
}

/** 0–10: more transmission lines into the substation = better connectivity. */
export function scoreConnectivity(lines: number): number {
  if (!Number.isFinite(lines) || lines <= 0) return 3;
  if (lines >= 6) return 10;
  if (lines >= 4) return 8;
  if (lines >= 2) return 6;
  return 4;
}

export function computeOpportunityScore(input: {
  maxVolt: number;
  queuedMw5mi: number;
  batteryProjectCount5mi: number;
  lines: number;
}) {
  const voltage = scoreVoltage(input.maxVolt);
  const crowding = scoreCrowding(input.queuedMw5mi);
  const bessSignal = scoreBessSignal(input.batteryProjectCount5mi);
  const connectivity = scoreConnectivity(input.lines);
  return {
    opportunityScore: Math.round(voltage + crowding + bessSignal + connectivity),
    scoreBreakdown: { voltage, crowding, bessSignal, connectivity },
  };
}

/** Rough acreage band for lithium-ion BESS (all-in site density). */
export function estimateAcres(mw: number, durationHours: number): { low: number; high: number } {
  // Base ~5–10 MW/acre for 2h; duration scales container count.
  const durationFactor = Math.max(1, durationHours / 2);
  const effectiveMwPerAcreLow = 5 / durationFactor;
  const effectiveMwPerAcreHigh = 10 / durationFactor;
  return {
    low: Math.round((mw / effectiveMwPerAcreHigh) * 10) / 10,
    high: Math.round((mw / effectiveMwPerAcreLow) * 10) / 10,
  };
}

export function estimateMwFromAcres(
  acres: number,
  durationHours: number
): { mwLow: number; mwHigh: number; mwhLow: number; mwhHigh: number } {
  const durationFactor = Math.max(1, durationHours / 2);
  const mwLow = Math.round(acres * (5 / durationFactor));
  const mwHigh = Math.round(acres * (10 / durationFactor));
  return {
    mwLow,
    mwHigh,
    mwhLow: Math.round(mwLow * durationHours),
    mwhHigh: Math.round(mwHigh * durationHours),
  };
}

/** Rough at-risk development capital sketch (not a quote). */
export function estimateDevCost(mw: number, acres: number) {
  const studyLow = 100_000;
  const studyHigh = Math.min(500_000, 100_000 + mw * 2_000);
  const optionPerAcreLow = 500;
  const optionPerAcreHigh = 2_000;
  const optionYears = 3;
  const diligence = 15_000; // Phase 1 + survey + title ballpark
  const optionLow = acres * optionPerAcreLow * optionYears;
  const optionHigh = acres * optionPerAcreHigh * optionYears;
  return {
    studyLow,
    studyHigh,
    optionLow: Math.round(optionLow),
    optionHigh: Math.round(optionHigh),
    diligence,
    totalLow: Math.round(studyLow + optionLow + diligence),
    totalHigh: Math.round(studyHigh + optionHigh + diligence),
    timelineMonthsLow: 18,
    timelineMonthsHigh: 36,
    exitPerMwLow: 30_000,
    exitPerMwHigh: 100_000,
  };
}
