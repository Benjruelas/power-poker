import { NextResponse } from "next/server";

import { crmBackend, listCrmLeads, seedCrmFromYesList } from "@/lib/crm/repo";
import type { SeedParcelItem } from "@/lib/crm/types";
import { readSharedLists } from "@/lib/lists/blobStore";
import { YES_PARCEL_LIST_ID } from "@/lib/lists/parcelReview";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const url = new URL(req.url);
    let force = url.searchParams.get("force") === "1";
    let items: SeedParcelItem[] = [];

    try {
      const body = (await req.json()) as {
        items?: SeedParcelItem[];
        force?: boolean;
      };
      if (Array.isArray(body?.items)) items = body.items;
      if (body?.force) force = true;
    } catch {
      // empty body ok — seed from shared Yes list
    }

    if (items.length === 0) {
      try {
        const lists = await readSharedLists();
        const yes = lists.parcelLists.find((l) => l.id === YES_PARCEL_LIST_ID);
        items = (yes?.items ?? []).map((i) => ({
          parcelId: i.parcelId,
          lrid: i.lrid,
          address: i.address,
          ownerName: i.ownerName,
          county: i.county,
          acres: i.acres,
          marketValue: i.marketValue,
          latitude: i.latitude,
          longitude: i.longitude,
          note: i.note,
        }));
      } catch (e) {
        console.error("crm seed read lists", e);
      }
    }

    const { leads } = await listCrmLeads({ includeArchived: true });
    // Only auto-seed when CRM is empty (first visit), unless force
    if (leads.length > 0 && !force) {
      return NextResponse.json({
        created: 0,
        skipped: items.length,
        message:
          "CRM already has leads; pass force=1 to import missing parcels",
        backend: crmBackend(),
      });
    }

    const result = await seedCrmFromYesList(items);
    return NextResponse.json({ ...result, backend: crmBackend() });
  } catch (e) {
    console.error("crm seed POST", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to seed CRM" },
      { status: 500 }
    );
  }
}
