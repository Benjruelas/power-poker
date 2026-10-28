import { get, put } from "@vercel/blob";

import { DEFAULT_PARTNER_STATUSES, newId } from "./defaults";
import type {
  PartnerFile,
  PartnerLead,
  PartnerNote,
  PartnerReminder,
  PartnerSettings,
  PartnerStatus,
  PartnerTask,
} from "./types";

export const PARTNER_CRM_BLOB_PATH = "power-poker/partner-crm.json";

export type PartnerDocument = {
  version: number;
  updatedAt: string;
  statuses: PartnerStatus[];
  leads: PartnerLead[];
  notes: PartnerNote[];
  tasks: PartnerTask[];
  reminders: PartnerReminder[];
  files: PartnerFile[];
};

function blobConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

async function streamToJson(
  stream: ReadableStream<Uint8Array>
): Promise<unknown> {
  return new Response(stream).json();
}

export function emptyPartnerDocument(): PartnerDocument {
  const statuses: PartnerStatus[] = DEFAULT_PARTNER_STATUSES.map((s) => ({
    ...s,
    id: newId("pstatus"),
  }));
  return {
    version: 0,
    updatedAt: new Date(0).toISOString(),
    statuses,
    leads: [],
    notes: [],
    tasks: [],
    reminders: [],
    files: [],
  };
}

export function normalizePartnerDocument(
  doc: PartnerDocument
): PartnerDocument {
  let statuses = Array.isArray(doc.statuses) ? [...doc.statuses] : [];
  if (statuses.length === 0) {
    statuses = emptyPartnerDocument().statuses;
  }
  if (!statuses.some((s) => s.isDefault)) {
    statuses = statuses.map((s, i) => ({ ...s, isDefault: i === 0 }));
  }
  return {
    version: typeof doc.version === "number" ? doc.version : 0,
    updatedAt: doc.updatedAt || new Date().toISOString(),
    statuses: statuses.sort((a, b) => a.sortOrder - b.sortOrder),
    leads: doc.leads ?? [],
    notes: doc.notes ?? [],
    tasks: doc.tasks ?? [],
    reminders: doc.reminders ?? [],
    files: doc.files ?? [],
  };
}

export function isPartnerDocument(v: unknown): v is PartnerDocument {
  if (!v || typeof v !== "object") return false;
  const d = v as PartnerDocument;
  return Array.isArray(d.leads) && Array.isArray(d.statuses);
}

export async function readPartnerDocument(): Promise<PartnerDocument> {
  if (!blobConfigured()) {
    throw new Error("BLOB_READ_WRITE_TOKEN is not configured");
  }
  const result = await get(PARTNER_CRM_BLOB_PATH, {
    access: "private",
    useCache: false,
  });
  if (!result?.stream) return emptyPartnerDocument();
  try {
    const data = await streamToJson(result.stream);
    if (isPartnerDocument(data)) return normalizePartnerDocument(data);
  } catch (e) {
    console.error("partner crm document parse error", e);
  }
  return emptyPartnerDocument();
}

export async function writePartnerDocument(
  doc: PartnerDocument
): Promise<PartnerDocument> {
  if (!blobConfigured()) {
    throw new Error("BLOB_READ_WRITE_TOKEN is not configured");
  }
  const next = normalizePartnerDocument({
    ...doc,
    version: doc.version,
    updatedAt: new Date().toISOString(),
  });
  await put(PARTNER_CRM_BLOB_PATH, JSON.stringify(next), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
  return next;
}

export function getPartnerSettingsFromDoc(
  doc: PartnerDocument
): PartnerSettings {
  return { statuses: doc.statuses };
}

export function defaultPartnerStatusId(doc: PartnerDocument): string {
  return (
    doc.statuses.find((s) => s.isDefault)?.id ?? doc.statuses[0]?.id ?? ""
  );
}
