import { get, put } from "@vercel/blob";

import type { ParcelSharePreview } from "./parcelShare";

export const SHARE_BLOB_PREFIX = "power-poker/shares/";

function blobConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

/** Short opaque ids for textable URLs (no `.` — distinguishes from legacy JWTs). */
export function isShortShareId(id: string): boolean {
  return /^[A-Za-z0-9_-]{8,20}$/.test(id);
}

export function newShareId(): string {
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function shareBlobPath(id: string): string {
  return `${SHARE_BLOB_PREFIX}${id}.json`;
}

async function streamToJson(
  stream: ReadableStream<Uint8Array>
): Promise<unknown> {
  return new Response(stream).json();
}

function isPreview(data: unknown): data is ParcelSharePreview {
  if (!data || typeof data !== "object") return false;
  const p = data as ParcelSharePreview;
  return (
    typeof p.parcelId === "string" &&
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lng) &&
    Number.isFinite(p.exp)
  );
}

export async function putSharePreview(
  id: string,
  preview: ParcelSharePreview
): Promise<void> {
  if (!blobConfigured()) {
    throw new Error("BLOB_READ_WRITE_TOKEN is not configured");
  }
  if (!isShortShareId(id)) {
    throw new Error("Invalid share id");
  }
  await put(shareBlobPath(id), JSON.stringify(preview), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: false,
    contentType: "application/json",
  });
}

export async function getSharePreview(
  id: string
): Promise<ParcelSharePreview | null> {
  if (!blobConfigured() || !isShortShareId(id)) return null;
  try {
    const result = await get(shareBlobPath(id), {
      access: "private",
      useCache: true,
    });
    if (!result?.stream) return null;
    const data = await streamToJson(result.stream);
    if (!isPreview(data)) return null;
    if (data.exp < Math.floor(Date.now() / 1000)) return null;
    return data;
  } catch (e) {
    console.error("share preview read error", e);
    return null;
  }
}

export function shareStorageAvailable(): boolean {
  return blobConfigured();
}
