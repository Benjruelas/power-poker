import { NextResponse } from "next/server";

import { requirePartnerOrFull } from "@/lib/auth/requestRole";
import {
  addPartnerTask,
  deletePartnerTask,
  partnerBackend,
  patchPartnerTask,
} from "@/lib/partner/repo";

export const runtime = "nodejs";
export const maxDuration = 30;

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const auth = await requirePartnerOrFull();
  if (auth instanceof Response) return auth;
  try {
    const { id } = await ctx.params;
    const body = (await req.json()) as { title?: string };
    if (!body?.title?.trim()) {
      return NextResponse.json({ error: "title required" }, { status: 400 });
    }
    const task = await addPartnerTask(id, body.title);
    if (!task) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }
    return NextResponse.json({ task, backend: partnerBackend() });
  } catch (e) {
    console.error("partner task POST", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to add task" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request, ctx: Ctx) {
  const auth = await requirePartnerOrFull();
  if (auth instanceof Response) return auth;
  try {
    const { id } = await ctx.params;
    const body = (await req.json()) as {
      taskId?: string;
      title?: string;
      done?: boolean;
    };
    if (!body?.taskId) {
      return NextResponse.json({ error: "taskId required" }, { status: 400 });
    }
    const patch: { title?: string; done?: boolean } = {};
    if (typeof body.title === "string") patch.title = body.title;
    if (typeof body.done === "boolean") patch.done = body.done;
    const task = await patchPartnerTask(id, body.taskId, patch);
    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }
    return NextResponse.json({ task, backend: partnerBackend() });
  } catch (e) {
    console.error("partner task PATCH", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to update task" },
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
    const taskId = url.searchParams.get("taskId");
    if (!taskId) {
      return NextResponse.json({ error: "taskId required" }, { status: 400 });
    }
    const ok = await deletePartnerTask(id, taskId);
    if (!ok) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, backend: partnerBackend() });
  } catch (e) {
    console.error("partner task DELETE", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to delete task" },
      { status: 500 }
    );
  }
}
