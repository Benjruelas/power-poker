import { NextResponse } from "next/server";

import { requireFullRole } from "@/lib/auth/requestRole";
import { getCrmLead } from "@/lib/crm/repo";
import {
  createPartnerLeadFromCrm,
  findPartnerLeadBySource,
  partnerBackend,
} from "@/lib/partner/repo";

export const runtime = "nodejs";
export const maxDuration = 30;

/** Full-access only: copy a CRM lead into the Partner CRM (once per lead). */
export async function POST(req: Request) {
  const auth = await requireFullRole();
  if (auth instanceof Response) return auth;
  try {
    const body = (await req.json()) as { crmLeadId?: string };
    if (!body?.crmLeadId) {
      return NextResponse.json(
        { error: "crmLeadId required" },
        { status: 400 }
      );
    }
    const existing = await findPartnerLeadBySource(body.crmLeadId);
    if (existing) {
      return NextResponse.json({
        lead: existing,
        alreadySent: true,
        backend: partnerBackend(),
      });
    }
    const crmLead = await getCrmLead(body.crmLeadId);
    if (!crmLead) {
      return NextResponse.json({ error: "CRM lead not found" }, { status: 404 });
    }
    const lead = await createPartnerLeadFromCrm({
      sourceCrmLeadId: crmLead.id,
      parcelId: crmLead.parcelId,
      lrid: crmLead.lrid,
      address: crmLead.address,
      ownerName: crmLead.ownerName,
      county: crmLead.county,
      acres: crmLead.acres,
      marketValue: crmLead.marketValue,
      latitude: crmLead.latitude,
      longitude: crmLead.longitude,
    });
    return NextResponse.json({
      lead,
      alreadySent: false,
      backend: partnerBackend(),
    });
  } catch (e) {
    console.error("partner send POST", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to send lead" },
      { status: 500 }
    );
  }
}

/** Look up whether an internal CRM lead was already sent. */
export async function GET(req: Request) {
  const auth = await requireFullRole();
  if (auth instanceof Response) return auth;
  try {
    const url = new URL(req.url);
    const crmLeadId = url.searchParams.get("crmLeadId");
    if (!crmLeadId) {
      return NextResponse.json(
        { error: "crmLeadId required" },
        { status: 400 }
      );
    }
    const lead = await findPartnerLeadBySource(crmLeadId);
    return NextResponse.json({
      lead,
      alreadySent: Boolean(lead),
      backend: partnerBackend(),
    });
  } catch (e) {
    console.error("partner send GET", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to look up" },
      { status: 500 }
    );
  }
}
