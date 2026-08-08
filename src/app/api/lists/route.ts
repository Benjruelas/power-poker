import {
  mergeLocalIntoShared,
  normalizeSharedLists,
  type SharedListsDocument,
} from "@/lib/lists/sharedLists";
import { readSharedLists, writeSharedLists } from "@/lib/lists/blobStore";
import { enforceIpRateLimit } from "@/lib/landrecords/rateLimit";
import type { ParcelList, Shortlist } from "@/lib/types";

export const runtime = "nodejs";

function validateListsBody(body: unknown): {
  shortlists: Shortlist[];
  parcelLists: ParcelList[];
  expectedVersion?: number;
  migrateLocal?: { shortlists?: Shortlist[]; parcelLists?: ParcelList[] };
} | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (!Array.isArray(b.shortlists) || !Array.isArray(b.parcelLists)) return null;
  return {
    shortlists: b.shortlists as Shortlist[],
    parcelLists: b.parcelLists as ParcelList[],
    expectedVersion:
      typeof b.expectedVersion === "number" ? b.expectedVersion : undefined,
    migrateLocal:
      b.migrateLocal && typeof b.migrateLocal === "object"
        ? (b.migrateLocal as {
            shortlists?: Shortlist[];
            parcelLists?: ParcelList[];
          })
        : undefined,
  };
}

export async function GET(request: Request) {
  const limited = enforceIpRateLimit(request, "lists-get", 120, 60);
  if (limited) return limited;

  try {
    const doc = await readSharedLists();
    return Response.json(doc, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    console.error("lists GET", e);
    return Response.json(
      { error: e instanceof Error ? e.message : "Failed to load lists" },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  const limited = enforceIpRateLimit(request, "lists-put", 60, 60);
  if (limited) return limited;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = validateListsBody(body);
  if (!parsed) {
    return Response.json(
      { error: "shortlists and parcelLists arrays required" },
      { status: 400 }
    );
  }

  try {
    const current = await readSharedLists();

    // One-time browser → global migrate when server is empty
    if (parsed.migrateLocal) {
      const merged = mergeLocalIntoShared(current, parsed.migrateLocal);
      if (
        merged.shortlists !== current.shortlists ||
        merged.parcelLists !== current.parcelLists
      ) {
        const saved = await writeSharedLists(merged);
        return Response.json(saved, { headers: { "Cache-Control": "no-store" } });
      }
    }

    if (
      parsed.expectedVersion != null &&
      parsed.expectedVersion !== current.version
    ) {
      return Response.json(
        {
          error: "version_conflict",
          current,
        },
        { status: 409, headers: { "Cache-Control": "no-store" } }
      );
    }

    const next = normalizeSharedLists({
      version: current.version + 1,
      updatedAt: new Date().toISOString(),
      shortlists: parsed.shortlists,
      parcelLists: parsed.parcelLists,
    });
    const saved = await writeSharedLists(next);
    return Response.json(saved, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("lists PUT", e);
    return Response.json(
      { error: e instanceof Error ? e.message : "Failed to save lists" },
      { status: 500 }
    );
  }
}
