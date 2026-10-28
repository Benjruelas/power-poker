import { NextResponse } from "next/server";

import { requirePartnerOrFull } from "@/lib/auth/requestRole";
import {
  deletePartnerLead,
  getPartnerLead,
  partnerBackend,
  patchPartnerLead,
} from "@/lib/partner/repo";
import type { PartnerLeadPatch } from "@/lib/partner/types";

export const runtime = "nodejs";
export const maxDuration = 30;

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const auth = await requirePartnerOrFull();
  if (auth instanceof Response) return auth;
  try {
    const { id } = await ctx.params;
    const lead = await getPartnerLead(id);
    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }
    return NextResponse.json({ lead, backend: partnerBackend() });
  } catch (e) {
    console.error("partner lead GET", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load lead" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request, ctx: Ctx) {
  const auth = await requirePartnerOrFull();
  if (auth instanceof Response) return auth;
  try {
    const { id } = await ctx.params;
    const body = (await req.json()) as PartnerLeadPatch;
    const lead = await patchPartnerLead(id, body);
    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }
    return NextResponse.json({ lead, backend: partnerBackend() });
  } catch (e) {
    console.error("partner lead PATCH", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to update lead" },
      { status: 500 }
    );
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const auth = await requirePartnerOrFull();
  if (auth instanceof Response) return auth;
  try {
    const { id } = await ctx.params;
    const ok = await deletePartnerLead(id);
    if (!ok) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, backend: partnerBackend() });
  } catch (e) {
    console.error("partner lead DELETE", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to delete lead" },
      { status: 500 }
    );
  }
}
