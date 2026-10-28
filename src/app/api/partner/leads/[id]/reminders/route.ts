import { NextResponse } from "next/server";

import { requirePartnerOrFull } from "@/lib/auth/requestRole";
import {
  addPartnerReminder,
  deletePartnerReminder,
  partnerBackend,
} from "@/lib/partner/repo";

export const runtime = "nodejs";
export const maxDuration = 30;

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const auth = await requirePartnerOrFull();
  if (auth instanceof Response) return auth;
  try {
    const { id } = await ctx.params;
    const body = (await req.json()) as { dueOn?: string; note?: string };
    if (!body?.dueOn?.trim()) {
      return NextResponse.json({ error: "dueOn required" }, { status: 400 });
    }
    const reminder = await addPartnerReminder(
      id,
      body.dueOn,
      body.note ?? ""
    );
    if (!reminder) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }
    return NextResponse.json({ reminder, backend: partnerBackend() });
  } catch (e) {
    console.error("partner reminder POST", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to add reminder" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  const auth = await requirePartnerOrFull();
  if (auth instanceof Response) return auth;
  try {
    const { id } = await ctx.params;
    const url = new URL(req.url);
    const reminderId = url.searchParams.get("reminderId");
    if (!reminderId) {
      return NextResponse.json(
        { error: "reminderId required" },
        { status: 400 }
      );
    }
    const ok = await deletePartnerReminder(id, reminderId);
    if (!ok) {
      return NextResponse.json(
        { error: "Reminder not found" },
        { status: 404 }
      );
    }
    return NextResponse.json({ ok: true, backend: partnerBackend() });
  } catch (e) {
    console.error("partner reminder DELETE", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to delete reminder" },
      { status: 500 }
    );
  }
}
