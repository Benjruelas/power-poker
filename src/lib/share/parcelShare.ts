import type { SelectedParcel } from "@/lib/landrecords/parcelPropertyMap";
import { toParcelListItem } from "@/lib/landrecords/parcelListItem";

export type ParcelSharePreview = {
  address: string;
  parcelId: string;
  acres: number | null;
  lat: number;
  lng: number;
  ownerName?: string;
  county?: string;
  /** Unix seconds expiry */
  exp: number;
};

const TOKEN_TTL_SEC = 60 * 60 * 24 * 30; // 30 days
const MAX_ADDR = 160;

function shareSecret(): string {
  return (
    process.env.SHARE_LINK_SECRET ||
    process.env.LANDRECORDS_API_KEY ||
    process.env.MAPBOX_ACCESS_TOKEN ||
    "dev-insecure-share-secret"
  );
}

function b64urlBytes(bytes: ArrayBuffer | Uint8Array): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = "";
  for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]!);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function b64urlText(text: string): string {
  return b64urlBytes(new TextEncoder().encode(text));
}

function fromB64url(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmacKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(shareSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

async function sign(payloadB64: string): Promise<string> {
  const key = await hmacKey();
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payloadB64)
  );
  return b64urlBytes(sig);
}

function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i)! ^ b.charCodeAt(i)!;
  return diff === 0;
}

export function formatAcres(acres: number | null | undefined): string {
  if (acres == null || !Number.isFinite(acres)) return "";
  if (acres >= 100) return `${Math.round(acres)} acres`;
  if (acres >= 10) return `${acres.toFixed(1)} acres`;
  return `${acres.toFixed(2)} acres`;
}

/** Street / city-state lines for OG card (drops zip & country). */
export function formatAddressLines(value: string): string[] {
  let s = String(value || "").trim();
  if (!s) return [];
  s = s.replace(/,\s*(United States|USA|U\.S\.A\.)\s*$/i, "").trim();
  s = s.replace(/\s+\d{5}(?:-\d{4})?\s*$/, "").trim();
  const parts = s
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length >= 3) {
    const street = parts[0]!;
    const city = parts[1]!;
    const state = parts[2]!.replace(/\s+\d{5}(?:-\d{4})?.*$/, "").trim();
    return [street, [city, state].filter(Boolean).join(", ")].filter(Boolean);
  }
  if (parts.length === 2) {
    const street = parts[0]!;
    const cityState = parts[1]!.replace(/\s+\d{5}(?:-\d{4})?.*$/, "").trim();
    return [street, cityState].filter(Boolean);
  }
  return [s];
}

export function previewTitle(preview: ParcelSharePreview): string {
  const addr = preview.address?.trim();
  if (addr) return addr;
  if (preview.parcelId) return `Parcel ${preview.parcelId}`;
  return "Shared parcel · Power Poker";
}

export function previewDescription(preview: ParcelSharePreview): string {
  const parts: string[] = [];
  if (preview.parcelId) parts.push(`Parcel ${preview.parcelId}`);
  const acres = formatAcres(preview.acres);
  if (acres) parts.push(acres);
  if (preview.county) parts.push(`${preview.county} County`);
  if (preview.ownerName) parts.push(preview.ownerName);
  return parts.join(" · ") || "Shared on Power Poker";
}

export function buildParcelSharePreview(
  parcel: SelectedParcel
): ParcelSharePreview {
  const item = toParcelListItem(parcel);
  const address = (item.address || "").trim().slice(0, MAX_ADDR);
  return {
    address: address || `Parcel ${item.parcelId}`,
    parcelId: item.parcelId,
    acres: item.acres,
    lat: item.latitude,
    lng: item.longitude,
    ownerName: item.ownerName || undefined,
    county: item.county || undefined,
    exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SEC,
  };
}

export async function encodeParcelShareToken(
  preview: ParcelSharePreview
): Promise<string> {
  const body = {
    v: 1 as const,
    a: preview.address,
    i: preview.parcelId,
    ac: preview.acres,
    lat: preview.lat,
    lng: preview.lng,
    o: preview.ownerName || undefined,
    c: preview.county || undefined,
    exp: preview.exp,
  };
  const payloadB64 = b64urlText(JSON.stringify(body));
  const sig = await sign(payloadB64);
  return `${payloadB64}.${sig}`;
}

export async function decodeParcelShareToken(
  token: string
): Promise<ParcelSharePreview | null> {
  const raw = String(token || "").trim();
  const dot = raw.lastIndexOf(".");
  if (dot < 8) return null;
  const payloadB64 = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  if (!payloadB64 || !sig) return null;

  const expected = await sign(payloadB64);
  if (!timingSafeEqualStr(sig, expected)) return null;

  try {
    const json = new TextDecoder().decode(fromB64url(payloadB64));
    const body = JSON.parse(json) as {
      v?: number;
      a?: string;
      i?: string;
      ac?: number | null;
      lat?: number;
      lng?: number;
      o?: string;
      c?: string;
      exp?: number;
    };
    if (body.v !== 1) return null;
    const exp = Number(body.exp);
    if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    const lat = Number(body.lat);
    const lng = Number(body.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    const acresRaw = body.ac;
    const acres =
      acresRaw == null || acresRaw === ("" as unknown)
        ? null
        : Number(acresRaw);
    return {
      address: String(body.a || "").trim(),
      parcelId: String(body.i || "").trim(),
      acres: Number.isFinite(acres as number) ? (acres as number) : null,
      lat,
      lng,
      ownerName: body.o ? String(body.o) : undefined,
      county: body.c ? String(body.c) : undefined,
      exp,
    };
  } catch {
    return null;
  }
}

export function mapboxSatelliteUrl(
  lat: number,
  lng: number,
  width = 1200,
  height = 630,
  zoom = 17
): string | null {
  const token =
    process.env.MAPBOX_ACCESS_TOKEN ||
    process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN ||
    "";
  if (!token || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return (
    `https://api.mapbox.com/styles/v1/mapbox/satellite-v9/static/` +
    `${lng},${lat},${zoom},0/${width}x${height}@2x?access_token=${encodeURIComponent(token)}`
  );
}

export function parcelSharePath(token: string): string {
  return `/p/${encodeURIComponent(token)}`;
}
