import { NextResponse } from "next/server";

import { addCrmNote, crmBackend } from "@/lib/crm/repo";

export const runtime = "nodejs";
export const maxDuration = 30;

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const body = (await req.json()) as { body?: string };
    if (!body?.body?.trim()) {
      return NextResponse.json({ error: "body is required" }, { status: 400 });
    }
    const note = await addCrmNote(id, body.body, "user");
    if (!note) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }
    return NextResponse.json({ note, backend: crmBackend() });
  } catch (e) {
    console.error("crm notes POST", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to add note" },
      { status: 500 }
    );
  }
}
