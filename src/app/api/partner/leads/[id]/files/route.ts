import { NextResponse } from "next/server";

import { requirePartnerOrFull } from "@/lib/auth/requestRole";
import {
  downloadPartnerFileBytes,
  partnerBackend,
  removePartnerFile,
  uploadPartnerFile,
} from "@/lib/partner/repo";

export const runtime = "nodejs";
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const auth = await requirePartnerOrFull();
  if (auth instanceof Response) return auth;
  try {
    const { id } = await ctx.params;
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file required" }, { status: 400 });
    }
    const saved = await uploadPartnerFile(id, file);
    return NextResponse.json({ file: saved, backend: partnerBackend() });
  } catch (e) {
    console.error("partner file POST", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to upload file" },
      { status: 500 }
    );
  }
}

export async function GET(req: Request, ctx: Ctx) {
  const auth = await requirePartnerOrFull();
  if (auth instanceof Response) return auth;
  try {
    const { id } = await ctx.params;
    const url = new URL(req.url);
    const fileId = url.searchParams.get("fileId");
    if (!fileId) {
      return NextResponse.json({ error: "fileId required" }, { status: 400 });
    }
    const result = await downloadPartnerFileBytes(id, fileId);
    if (!result) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }
    return new NextResponse(Buffer.from(result.body), {
      headers: {
        "Content-Type": result.file.contentType,
        "Content-Disposition": `attachment; filename="${result.file.name.replace(/"/g, "")}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    console.error("partner file GET", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to download file" },
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
    const fileId = url.searchParams.get("fileId");
    if (!fileId) {
      return NextResponse.json({ error: "fileId required" }, { status: 400 });
    }
    const ok = await removePartnerFile(id, fileId);
    if (!ok) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, backend: partnerBackend() });
  } catch (e) {
    console.error("partner file DELETE", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to delete file" },
      { status: 500 }
    );
  }
}
