import { NextResponse } from "next/server";

import {
  crmBackend,
  deleteCrmLead,
  getCrmLead,
  patchCrmLead,
} from "@/lib/crm/repo";
import type { CrmLeadPatch } from "@/lib/crm/types";

export const runtime = "nodejs";
export const maxDuration = 30;

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const lead = await getCrmLead(id);
    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }
    return NextResponse.json({ lead, backend: crmBackend() });
  } catch (e) {
    console.error("crm lead GET", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load lead" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const body = (await req.json()) as CrmLeadPatch;
    const lead = await patchCrmLead(id, body);
    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }
    return NextResponse.json({ lead, backend: crmBackend() });
  } catch (e) {
    console.error("crm lead PATCH", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to update lead" },
      { status: 500 }
    );
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const ok = await deleteCrmLead(id);
    if (!ok) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, backend: crmBackend() });
  } catch (e) {
    console.error("crm lead DELETE", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to delete lead" },
      { status: 500 }
    );
  }
}
