import { NextResponse } from "next/server";

import {
  crmBackend,
  getCrmLeadCount,
  listCrmLeads,
  upsertCrmLead,
} from "@/lib/crm/repo";
import type { CrmLeadInput } from "@/lib/crm/types";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const statusId = url.searchParams.get("statusId") || undefined;
    const q = url.searchParams.get("q") || undefined;
    const includeArchived = url.searchParams.get("includeArchived") === "1";
    const countOnly = url.searchParams.get("count") === "1";

    if (countOnly) {
      const count = await getCrmLeadCount();
      return NextResponse.json({ count, backend: crmBackend() });
    }

    const result = await listCrmLeads({ statusId, q, includeArchived });
    return NextResponse.json({
      ...result,
      backend: crmBackend(),
    });
  } catch (e) {
    console.error("crm leads GET", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to list leads" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as CrmLeadInput;
    if (!body?.parcelId || !Number.isFinite(body.latitude) || !Number.isFinite(body.longitude)) {
      return NextResponse.json(
        { error: "parcelId, latitude, and longitude are required" },
        { status: 400 }
      );
    }
    const lead = await upsertCrmLead(body);
    return NextResponse.json({ lead, backend: crmBackend() });
  } catch (e) {
    console.error("crm leads POST", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to create lead" },
      { status: 500 }
    );
  }
}
