import { get, put } from "@vercel/blob";

import {
  emptySharedLists,
  isSharedListsDocument,
  normalizeSharedLists,
  SHARED_LISTS_BLOB_PATH,
  type SharedListsDocument,
} from "./sharedLists";

function blobConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

async function streamToJson(stream: ReadableStream<Uint8Array>): Promise<unknown> {
  const res = new Response(stream);
  return res.json();
}

export async function readSharedLists(): Promise<SharedListsDocument> {
  if (!blobConfigured()) {
    throw new Error("BLOB_READ_WRITE_TOKEN is not configured");
  }

  const result = await get(SHARED_LISTS_BLOB_PATH, {
    access: "private",
    useCache: false,
  });
  if (!result?.stream) return emptySharedLists();

  try {
    const data = await streamToJson(result.stream);
    if (isSharedListsDocument(data)) {
      return normalizeSharedLists({
        version: data.version,
        updatedAt: data.updatedAt || new Date().toISOString(),
        shortlists: data.shortlists,
        parcelLists: data.parcelLists,
      });
    }
  } catch (e) {
    console.error("shared lists parse error", e);
  }
  return emptySharedLists();
}

export async function writeSharedLists(
  doc: SharedListsDocument
): Promise<SharedListsDocument> {
  if (!blobConfigured()) {
    throw new Error("BLOB_READ_WRITE_TOKEN is not configured");
  }

  const next = normalizeSharedLists({
    version: doc.version,
    updatedAt: doc.updatedAt,
    shortlists: doc.shortlists,
    parcelLists: doc.parcelLists,
  });

  await put(SHARED_LISTS_BLOB_PATH, JSON.stringify(next), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });

  return next;
}
