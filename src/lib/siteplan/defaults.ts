import type { Feature, Polygon } from "geojson";

import type { ObjectType, SitePlanDocument, SitePlanView } from "./types";

export function defaultSitePlanView(
  partial?: Partial<SitePlanView>
): SitePlanView {
  return {
    squareSide: null,
    bearingDeg: 0,
    exportZoom: null,
    exportCenter: null,
    ...partial,
  };
}

export function newSitePlanId(prefix = "sp"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

/** Starter library matching the 24 MW compute concept plan. */
export function seedObjectTypes(): ObjectType[] {
  return [
    {
      id: newSitePlanId("ot"),
      name: "Compute Module 40x70",
      shape: "rectangle",
      fill: "#4ade80",
      stroke: "#166534",
      strokeWidth: 2,
      widthFt: 40,
      heightFt: 70,
      showLabel: true,
      legend: true,
    },
    {
      id: newSitePlanId("ot"),
      name: "Transformer 2.5 MVA pad",
      shape: "rectangle",
      fill: "#fb923c",
      stroke: "#c2410c",
      strokeWidth: 1.5,
      widthFt: 12,
      heightFt: 12,
      showLabel: false,
      legend: true,
    },
    {
      id: newSitePlanId("ot"),
      name: "Tank / vessel",
      shape: "circle",
      fill: "#67e8f9",
      stroke: "#0e7490",
      strokeWidth: 2,
      widthFt: 30,
      heightFt: 30,
      showLabel: true,
      legend: true,
    },
    {
      id: newSitePlanId("ot"),
      name: "Main switchgear + meter",
      shape: "rectangle",
      fill: "#a855f7",
      stroke: "#6b21a8",
      strokeWidth: 2,
      widthFt: 20,
      heightFt: 30,
      showLabel: true,
      legend: true,
    },
    {
      id: newSitePlanId("ot"),
      name: "Fire lane 18 ft",
      shape: "polyline",
      fill: "#64748b",
      stroke: "#1e293b",
      strokeWidth: 2,
      dashed: false,
      borderColor: "#0f172a",
      borderWidth: 2,
      widthFt: 18,
      heightFt: null,
      showLabel: false,
      legend: true,
    },
    {
      id: newSitePlanId("ot"),
      name: "Fence",
      shape: "polyline",
      fill: "transparent",
      stroke: "#38bdf8",
      strokeWidth: 2,
      dashed: false,
      dashColor: "#38bdf8",
      borderColor: "#0ea5e9",
      borderWidth: 1,
      widthFt: 1,
      heightFt: null,
      showLabel: false,
      legend: true,
    },
    {
      id: newSitePlanId("ot"),
      name: "Open pad 180x180",
      shape: "rectangle",
      fill: "rgba(255,255,255,0.15)",
      stroke: "#f8fafc",
      strokeWidth: 2,
      dashed: true,
      widthFt: 180,
      heightFt: 180,
      showLabel: true,
      legend: true,
    },
    {
      id: newSitePlanId("ot"),
      name: "Feeder (OH 12.47 kV)",
      shape: "polyline",
      fill: "rgba(124,58,237,0.2)",
      stroke: "#7c3aed",
      strokeWidth: 2,
      dashed: true,
      dashColor: "#a78bfa",
      borderColor: "#5b21b6",
      borderWidth: 1.5,
      widthFt: 2,
      heightFt: null,
      showLabel: false,
      legend: true,
    },
  ];
}

export function emptySitePlanDocument(opts: {
  lrid: string;
  parcelId: string;
  address: string;
  title?: string;
  subtitle?: string;
  parcelPolygon?: Feature<Polygon> | null;
}): SitePlanDocument {
  return {
    version: 2,
    lrid: opts.lrid,
    parcelId: opts.parcelId,
    address: opts.address,
    title: opts.title ?? "Site plan",
    subtitle: opts.subtitle ?? "",
    notes: "",
    parcelPolygon: opts.parcelPolygon ?? null,
    objectTypes: seedObjectTypes(),
    instances: [],
    freeLabels: [],
    scaleBars: [],
    view: defaultSitePlanView(),
    updatedAt: new Date().toISOString(),
  };
}

function normalizeFreeLabel(
  raw: SitePlanDocument["freeLabels"][number] | Record<string, unknown>
): SitePlanDocument["freeLabels"][number] {
  const r = raw as Record<string, unknown>;
  return {
    id: String(r.id || ""),
    text: String(r.text || "Label"),
    position: (r.position as [number, number]) || [0, 0],
    fontSize: typeof r.fontSize === "number" ? r.fontSize : 12,
    color: typeof r.color === "string" ? r.color : "#0f172a",
    backgroundColor:
      typeof r.backgroundColor === "string" ? r.backgroundColor : "#ffffff",
  };
}

/**
 * Normalize any saved/draft JSON into a v2 document.
 * Legacy v1 solar docs become an empty canvas keeping parcel + address.
 */
export function normalizeSitePlanDocument(
  raw: unknown,
  fallback: {
    lrid: string;
    parcelId: string;
    address: string;
    parcelPolygon?: Feature<Polygon> | null;
  }
): SitePlanDocument {
  const base = emptySitePlanDocument({
    lrid: fallback.lrid,
    parcelId: fallback.parcelId,
    address: fallback.address,
    parcelPolygon: fallback.parcelPolygon ?? null,
  });

  if (!raw || typeof raw !== "object") return base;
  const d = raw as Record<string, unknown>;

  if (d.version === 2 && Array.isArray(d.objectTypes)) {
    const rawView = d.view as Partial<SitePlanView> | undefined;
    return {
      version: 2,
      lrid: String(d.lrid || fallback.lrid),
      parcelId: String(d.parcelId || fallback.parcelId),
      address: String(d.address || fallback.address),
      title: String(d.title || "Site plan"),
      subtitle: String(d.subtitle || ""),
      notes: String(d.notes || ""),
      parcelPolygon:
        (d.parcelPolygon as Feature<Polygon> | null) ??
        fallback.parcelPolygon ??
        null,
      objectTypes: d.objectTypes as SitePlanDocument["objectTypes"],
      instances: Array.isArray(d.instances)
        ? (d.instances as SitePlanDocument["instances"])
        : [],
      freeLabels: Array.isArray(d.freeLabels)
        ? (d.freeLabels as unknown[]).map((lb) =>
            normalizeFreeLabel(
              lb as SitePlanDocument["freeLabels"][number]
            )
          )
        : [],
      scaleBars: Array.isArray(d.scaleBars)
        ? (d.scaleBars as SitePlanDocument["scaleBars"])
        : [],
      view: defaultSitePlanView(rawView),
      updatedAt: String(d.updatedAt || new Date().toISOString()),
    };
  }

  // v1 solar → empty canvas, keep parcel if present
  const form = d.form as { projectName?: string } | undefined;
  const parcel =
    (d.parcelPolygon as Feature<Polygon> | null) ??
    fallback.parcelPolygon ??
    null;
  return {
    ...base,
    title: form?.projectName || base.title,
    address: String(d.address || fallback.address),
    parcelPolygon: parcel,
    updatedAt: new Date().toISOString(),
  };
}
