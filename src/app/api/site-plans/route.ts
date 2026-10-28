import { NextResponse } from "next/server";

import {
  getSitePlanByLrid,
  saveSitePlan,
  sitePlanBackend,
} from "@/lib/siteplan/repo";
import type { SitePlanDocument } from "@/lib/siteplan/types";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const lrid = (url.searchParams.get("lrid") ?? "").trim();
    if (!lrid) {
      return NextResponse.json({ error: "lrid is required" }, { status: 400 });
    }
    const plan = await getSitePlanByLrid(lrid);
    return NextResponse.json({
      plan,
      backend: sitePlanBackend(),
    });
  } catch (e) {
    console.error("site-plans GET", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load site plan" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { document?: SitePlanDocument };
    const document = body?.document;
    if (!document?.lrid || document.version !== 2) {
      return NextResponse.json(
        { error: "document with version 2 and lrid is required" },
        { status: 400 }
      );
    }
    if (sitePlanBackend() === "none") {
      return NextResponse.json(
        {
          error:
            "No persistence backend configured (set DATABASE_URL or BLOB_READ_WRITE_TOKEN)",
          plan: null,
          backend: "none",
        },
        { status: 503 }
      );
    }
    const plan = await saveSitePlan(document);
    return NextResponse.json({ plan, backend: sitePlanBackend() });
  } catch (e) {
    console.error("site-plans POST", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to save site plan" },
      { status: 500 }
    );
  }
}
