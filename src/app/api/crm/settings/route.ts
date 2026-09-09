import { NextResponse } from "next/server";

import {
  crmBackend,
  getCrmSettings,
  putCrmSettings,
} from "@/lib/crm/repo";
import type { CrmSettings } from "@/lib/crm/types";
import { newId } from "@/lib/crm/defaults";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET() {
  try {
    const settings = await getCrmSettings();
    return NextResponse.json({ settings, backend: crmBackend() });
  } catch (e) {
    console.error("crm settings GET", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load settings" },
      { status: 500 }
    );
  }
}

export async function PUT(req: Request) {
  try {
    const body = (await req.json()) as { settings?: CrmSettings };
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
    const settings: CrmSettings = {
      statuses: body.settings.statuses.map((s, i) => ({
        id: s.id || newId("status"),
        name: s.name?.trim() || `Status ${i + 1}`,
        color: s.color || "#64748b",
        sortOrder: typeof s.sortOrder === "number" ? s.sortOrder : i,
        isDefault: Boolean(s.isDefault),
        isClosed: Boolean(s.isClosed),
      })),
      customFields: (body.settings.customFields ?? []).map((f, i) => ({
        id: f.id || newId("field"),
        name: f.name?.trim() || `Field ${i + 1}`,
        type: f.type || "text",
        options: Array.isArray(f.options) ? f.options : [],
        sortOrder: typeof f.sortOrder === "number" ? f.sortOrder : i,
      })),
    };
    // Exactly one default
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
    const saved = await putCrmSettings(settings);
    return NextResponse.json({ settings: saved, backend: crmBackend() });
  } catch (e) {
    console.error("crm settings PUT", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to save settings" },
      { status: 500 }
    );
  }
}
