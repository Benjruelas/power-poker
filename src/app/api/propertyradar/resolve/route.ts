import { NextResponse } from "next/server";

import { enforceIpRateLimit } from "@/lib/landrecords/rateLimit";
import {
  resolvePropertyRadarId,
  type PropertyRadarInput,
} from "@/lib/propertyRadar";

export const runtime = "nodejs";
export const maxDuration = 30;

function parseBody(raw: unknown): PropertyRadarInput {
  const body = (raw ?? {}) as Record<string, unknown>;
  const num = (v: unknown): number | null => {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() !== "") {
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    }
    return null;
  };
  const str = (v: unknown): string | null => {
    if (v == null) return null;
    const s = String(v).trim();
    return s || null;
  };
  return {
    address: str(body.address),
    apn: str(body.apn),
    county: str(body.county),
    countyFips: str(body.countyFips),
    state: str(body.state),
    lat: num(body.lat),
    lng: num(body.lng),
  };
}

export async function POST(request: Request) {
  const limited = enforceIpRateLimit(request, "propertyradar-resolve", 30, 60);
  if (limited) return limited;

  if (!process.env.PROPERTYRADAR_API_KEY?.trim()) {
    return NextResponse.json(
      { error: "PropertyRadar is not configured" },
      { status: 503 }
    );
  }

  let input: PropertyRadarInput;
  try {
    input = parseBody(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const hasQuery =
    Boolean(input.address) ||
    Boolean(input.apn) ||
    (input.lat != null && input.lng != null);
  if (!hasQuery) {
    return NextResponse.json(
      { error: "Provide address, apn, or lat/lng" },
      { status: 400 }
    );
  }

  try {
    const resolved = await resolvePropertyRadarId(input);
    if (!resolved) {
      return NextResponse.json(
        { error: "No matching PropertyRadar property found" },
        { status: 404 }
      );
    }
    return NextResponse.json(resolved);
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "PropertyRadar lookup failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
