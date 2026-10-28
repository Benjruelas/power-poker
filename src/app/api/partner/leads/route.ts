import { NextResponse } from "next/server";

import { requirePartnerOrFull } from "@/lib/auth/requestRole";
import { listPartnerLeads, partnerBackend } from "@/lib/partner/repo";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(req: Request) {
  const auth = await requirePartnerOrFull();
  if (auth instanceof Response) return auth;
  try {
    const url = new URL(req.url);
    const statusId = url.searchParams.get("statusId") || undefined;
    const q = url.searchParams.get("q") || undefined;
    const includeArchived = url.searchParams.get("includeArchived") === "1";
    const result = await listPartnerLeads({ statusId, q, includeArchived });
    return NextResponse.json({
      ...result,
      backend: partnerBackend(),
    });
  } catch (e) {
    console.error("partner leads GET", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to list leads" },
      { status: 500 }
    );
  }
}
