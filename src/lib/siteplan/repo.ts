import { eq } from "drizzle-orm";

import { getDb, hasDatabaseUrl } from "@/lib/crm/db";
import { sitePlans } from "@/lib/crm/schema";

import {
  emptySitePlansDocument,
  readSitePlansDocument,
  writeSitePlansDocument,
} from "./blobStore";
import { newSitePlanId } from "./defaults";
import type { SitePlanDocument, SitePlanRecord } from "./types";

function nowIso() {
  return new Date().toISOString();
}

function toRecord(row: {
  id: string;
  lrid: string;
  parcelId: string;
  address: string;
  document: unknown;
  createdAt: string;
  updatedAt: string;
}): SitePlanRecord {
  return {
    id: row.id,
    lrid: row.lrid,
    parcelId: row.parcelId,
    address: row.address,
    document: row.document as SitePlanDocument,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function getByLridNeon(lrid: string): Promise<SitePlanRecord | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(sitePlans)
    .where(eq(sitePlans.lrid, lrid))
    .limit(1);
  const row = rows[0];
  return row ? toRecord(row) : null;
}

async function upsertNeon(
  document: SitePlanDocument
): Promise<SitePlanRecord> {
  const db = getDb();
  const existing = await getByLridNeon(document.lrid);
  const now = nowIso();
  const id = existing?.id ?? newSitePlanId("plan");
  const row = {
    id,
    lrid: document.lrid,
    parcelId: document.parcelId,
    address: document.address,
    document: document as unknown as Record<string, unknown>,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  if (existing) {
    await db
      .update(sitePlans)
      .set({
        parcelId: row.parcelId,
        address: row.address,
        document: row.document,
        updatedAt: now,
      })
      .where(eq(sitePlans.id, id));
  } else {
    await db.insert(sitePlans).values(row);
  }
  return toRecord(row);
}

async function getByLridBlob(lrid: string): Promise<SitePlanRecord | null> {
  const doc = await readSitePlansDocument();
  return doc.plans.find((p) => p.lrid === lrid) ?? null;
}

async function upsertBlob(
  document: SitePlanDocument
): Promise<SitePlanRecord> {
  const store = await readSitePlansDocument();
  const now = nowIso();
  const existing = store.plans.find((p) => p.lrid === document.lrid);
  const record: SitePlanRecord = {
    id: existing?.id ?? newSitePlanId("plan"),
    lrid: document.lrid,
    parcelId: document.parcelId,
    address: document.address,
    document: { ...document, updatedAt: now },
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  const plans = existing
    ? store.plans.map((p) => (p.lrid === document.lrid ? record : p))
    : [...store.plans, record];
  await writeSitePlansDocument({ ...store, plans });
  return record;
}

export function sitePlanBackend(): "neon" | "blob" | "none" {
  if (hasDatabaseUrl()) return "neon";
  if (process.env.BLOB_READ_WRITE_TOKEN) return "blob";
  return "none";
}

export async function getSitePlanByLrid(
  lrid: string
): Promise<SitePlanRecord | null> {
  const key = lrid.trim();
  if (!key) return null;
  if (hasDatabaseUrl()) {
    try {
      return await getByLridNeon(key);
    } catch (e) {
      console.error("site plan neon get failed, trying blob", e);
    }
  }
  try {
    return await getByLridBlob(key);
  } catch (e) {
    console.error("site plan blob get failed", e);
    return null;
  }
}

export async function saveSitePlan(
  document: SitePlanDocument
): Promise<SitePlanRecord> {
  const next: SitePlanDocument = {
    ...document,
    updatedAt: nowIso(),
  };
  if (hasDatabaseUrl()) {
    try {
      return await upsertNeon(next);
    } catch (e) {
      console.error("site plan neon save failed, trying blob", e);
    }
  }
  return upsertBlob(next);
}
