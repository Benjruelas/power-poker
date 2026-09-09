import { get, put } from "@vercel/blob";

import { normalizeCrmContact } from "./contacts";
import { DEFAULT_CRM_STATUSES, newId } from "./defaults";
import type {
  CrmContact,
  CrmCustomField,
  CrmLead,
  CrmNote,
  CrmSettings,
  CrmStatus,
} from "./types";

export const CRM_BLOB_PATH = "power-poker/crm.json";

export type CrmDocument = {
  version: number;
  updatedAt: string;
  statuses: CrmStatus[];
  customFields: CrmCustomField[];
  leads: CrmLead[];
  contacts: CrmContact[];
  notes: CrmNote[];
};

function blobConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

async function streamToJson(stream: ReadableStream<Uint8Array>): Promise<unknown> {
  return new Response(stream).json();
}

export function emptyCrmDocument(): CrmDocument {
  const statuses: CrmStatus[] = DEFAULT_CRM_STATUSES.map((s) => ({
    ...s,
    id: newId("status"),
  }));
  return {
    version: 0,
    updatedAt: new Date(0).toISOString(),
    statuses,
    customFields: [],
    leads: [],
    contacts: [],
    notes: [],
  };
}

export function normalizeCrmDocument(doc: CrmDocument): CrmDocument {
  let statuses = Array.isArray(doc.statuses) ? [...doc.statuses] : [];
  if (statuses.length === 0) {
    statuses = emptyCrmDocument().statuses;
  }
  // Ensure exactly one default
  if (!statuses.some((s) => s.isDefault)) {
    statuses = statuses.map((s, i) => ({ ...s, isDefault: i === 0 }));
  }
  return {
    version: typeof doc.version === "number" ? doc.version : 0,
    updatedAt: doc.updatedAt || new Date().toISOString(),
    statuses: statuses.sort((a, b) => a.sortOrder - b.sortOrder),
    customFields: (doc.customFields ?? []).sort(
      (a, b) => a.sortOrder - b.sortOrder
    ),
    leads: doc.leads ?? [],
    contacts: (doc.contacts ?? []).map((c) => normalizeCrmContact(c)),
    notes: doc.notes ?? [],
  };
}

export function isCrmDocument(v: unknown): v is CrmDocument {
  if (!v || typeof v !== "object") return false;
  const d = v as CrmDocument;
  return Array.isArray(d.leads) && Array.isArray(d.statuses);
}

export async function readCrmDocument(): Promise<CrmDocument> {
  if (!blobConfigured()) {
    throw new Error("BLOB_READ_WRITE_TOKEN is not configured");
  }
  const result = await get(CRM_BLOB_PATH, {
    access: "private",
    useCache: false,
  });
  if (!result?.stream) return emptyCrmDocument();
  try {
    const data = await streamToJson(result.stream);
    if (isCrmDocument(data)) return normalizeCrmDocument(data);
  } catch (e) {
    console.error("crm document parse error", e);
  }
  return emptyCrmDocument();
}

export async function writeCrmDocument(doc: CrmDocument): Promise<CrmDocument> {
  if (!blobConfigured()) {
    throw new Error("BLOB_READ_WRITE_TOKEN is not configured");
  }
  const next = normalizeCrmDocument({
    ...doc,
    version: doc.version,
    updatedAt: new Date().toISOString(),
  });
  await put(CRM_BLOB_PATH, JSON.stringify(next), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
  return next;
}

export function getSettingsFromDoc(doc: CrmDocument): CrmSettings {
  return {
    statuses: doc.statuses,
    customFields: doc.customFields,
  };
}

export function defaultStatusId(doc: CrmDocument): string {
  return (
    doc.statuses.find((s) => s.isDefault)?.id ??
    doc.statuses[0]?.id ??
    ""
  );
}
