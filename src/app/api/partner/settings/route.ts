import { NextResponse } from "next/server";

import { requirePartnerOrFull } from "@/lib/auth/requestRole";
import { newId } from "@/lib/partner/defaults";
import {
  getPartnerSettings,
  partnerBackend,
  putPartnerSettings,
} from "@/lib/partner/repo";
import type { PartnerSettings } from "@/lib/partner/types";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET() {
  const auth = await requirePartnerOrFull();
  if (auth instanceof Response) return auth;
  try {
    const settings = await getPartnerSettings();
    return NextResponse.json({ settings, backend: partnerBackend() });
  } catch (e) {
    console.error("partner settings GET", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load settings" },
      { status: 500 }
    );
  }
}

export async function PUT(req: Request) {
  const auth = await requirePartnerOrFull();
  if (auth instanceof Response) return auth;
  try {
    const body = (await req.json()) as { settings?: PartnerSettings };
    if (!body?.settings?.statuses || !Array.isArray(body.settings.statuses)) {
      return NextResponse.json(
        { error: "settings.statuses required" },
        { status: 400 }
      );
    }
    if (body.settings.statuses.length === 0) {
      return NextResponse.json(
        { error: "At least one status is required" },
        { status: 400 }
      );
    }
    const settings: PartnerSettings = {
      statuses: body.settings.statuses.map((s, i) => ({
        id: s.id || newId("pstatus"),
        name: s.name?.trim() || `Status ${i + 1}`,
        color: s.color || "#64748b",
        sortOrder: typeof s.sortOrder === "number" ? s.sortOrder : i,
        isDefault: Boolean(s.isDefault),
        isClosed: Boolean(s.isClosed),
      })),
    };
    if (!settings.statuses.some((s) => s.isDefault)) {
      settings.statuses[0]!.isDefault = true;
    } else {
      let seen = false;
      settings.statuses = settings.statuses.map((s) => {
        if (s.isDefault && !seen) {
          seen = true;
          return s;
        }
        return { ...s, isDefault: false };
      });
    }
    const saved = await putPartnerSettings(settings);
    return NextResponse.json({ settings: saved, backend: partnerBackend() });
  } catch (e) {
    console.error("partner settings PUT", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to save settings" },
      { status: 500 }
    );
  }
}
