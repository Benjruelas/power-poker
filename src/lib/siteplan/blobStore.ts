import { get, put } from "@vercel/blob";

import type { SitePlanRecord } from "./types";

export const SITE_PLANS_BLOB_PATH = "power-poker/site-plans.json";

export type SitePlansDocument = {
  version: number;
  updatedAt: string;
  plans: SitePlanRecord[];
};

function blobConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

async function streamToJson(stream: ReadableStream<Uint8Array>): Promise<unknown> {
  return new Response(stream).json();
}

export function emptySitePlansDocument(): SitePlansDocument {
  return {
    version: 0,
    updatedAt: new Date().toISOString(),
    plans: [],
  };
}

export async function readSitePlansDocument(): Promise<SitePlansDocument> {
  if (!blobConfigured()) return emptySitePlansDocument();
  try {
    const result = await get(SITE_PLANS_BLOB_PATH, {
      access: "private",
      useCache: false,
    });
    if (!result?.stream) return emptySitePlansDocument();
    const data = (await streamToJson(result.stream)) as SitePlansDocument;
    if (!data || !Array.isArray(data.plans)) return emptySitePlansDocument();
    return data;
  } catch {
    return emptySitePlansDocument();
  }
}

export async function writeSitePlansDocument(
  doc: SitePlansDocument
): Promise<void> {
  if (!blobConfigured()) {
    throw new Error("BLOB_READ_WRITE_TOKEN is not configured");
  }
  const next: SitePlansDocument = {
    ...doc,
    version: (doc.version ?? 0) + 1,
    updatedAt: new Date().toISOString(),
  };
  await put(SITE_PLANS_BLOB_PATH, JSON.stringify(next), {
    access: "private",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}
