import { NextResponse } from "next/server";

import { requirePartnerOrFull } from "@/lib/auth/requestRole";
import { addPartnerNote, partnerBackend } from "@/lib/partner/repo";

export const runtime = "nodejs";
export const maxDuration = 30;

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const auth = await requirePartnerOrFull();
  if (auth instanceof Response) return auth;
  try {
    const { id } = await ctx.params;
    const body = (await req.json()) as { body?: string };
    if (!body?.body?.trim()) {
      return NextResponse.json({ error: "body required" }, { status: 400 });
    }
    const note = await addPartnerNote(id, body.body);
    if (!note) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }
    return NextResponse.json({ note, backend: partnerBackend() });
  } catch (e) {
    console.error("partner note POST", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to add note" },
      { status: 500 }
    );
  }
}
