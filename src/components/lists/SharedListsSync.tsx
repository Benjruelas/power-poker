"use client";

import { useEffect, useRef, useState } from "react";

import { useAppStore } from "@/lib/store";
import { ensureReviewParcelLists } from "@/lib/lists/parcelReview";
import {
  ensureReviewShortlists,
  shortlistsHaveItems,
} from "@/lib/lists/substationReview";
import type { SharedListsDocument } from "@/lib/lists/sharedLists";
import type { ParcelList, Shortlist } from "@/lib/types";

const POLL_MS = 12_000;
const SAVE_DEBOUNCE_MS = 500;
const MIGRATE_FLAG = "power-poker-lists-migrated-v1";

function readLegacyLocalLists(): {
  shortlists: Shortlist[];
  parcelLists: ParcelList[];
} {
  try {
    const raw = localStorage.getItem("power-poker-v1");
    if (!raw) return { shortlists: [], parcelLists: [] };
    const parsed = JSON.parse(raw) as {
      state?: { shortlists?: Shortlist[]; parcelLists?: ParcelList[] };
    };
    return {
      shortlists: parsed.state?.shortlists ?? [],
      parcelLists: parsed.state?.parcelLists ?? [],
    };
  } catch {
    return { shortlists: [], parcelLists: [] };
  }
}

async function fetchLists(): Promise<SharedListsDocument> {
  const res = await fetch("/api/lists", { cache: "no-store" });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || `Failed to load lists (${res.status})`);
  }
  return (await res.json()) as SharedListsDocument;
}

async function putLists(body: {
  shortlists: Shortlist[];
  parcelLists: ParcelList[];
  expectedVersion: number;
  migrateLocal?: { shortlists: Shortlist[]; parcelLists: ParcelList[] };
}): Promise<{ ok: true; doc: SharedListsDocument } | { ok: false; conflict?: SharedListsDocument; error: string }> {
  const res = await fetch("/api/lists", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as SharedListsDocument & {
    error?: string;
    current?: SharedListsDocument;
  };
  if (res.status === 409 && data.current) {
    return { ok: false, conflict: data.current, error: "version_conflict" };
  }
  if (!res.ok) {
    return { ok: false, error: data.error || `Save failed (${res.status})` };
  }
  return { ok: true, doc: data };
}

/**
 * Keeps site + parcel lists in Vercel Blob so every collaborator shares one
 * global workspace. LocalStorage only keeps filters / active list selection.
 */
export function SharedListsSync() {
  const applyingRemote = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const versionRef = useRef(0);
  const [status, setStatus] = useState<"loading" | "live" | "error">("loading");
  const [error, setError] = useState("");

  const applyRemote = (doc: SharedListsDocument) => {
    applyingRemote.current = true;
    versionRef.current = doc.version;
    useAppStore.setState({
      shortlists: ensureReviewShortlists(doc.shortlists),
      parcelLists: ensureReviewParcelLists(doc.parcelLists),
      listsVersion: doc.version,
      listsUpdatedAt: doc.updatedAt,
      listsHydrated: true,
    });
    // Allow subscribe to settle before re-enabling saves
    queueMicrotask(() => {
      applyingRemote.current = false;
    });
  };

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        let doc = await fetchLists();
        if (cancelled) return;

        const migrated = localStorage.getItem(MIGRATE_FLAG) === "1";
        const serverEmpty =
          !shortlistsHaveItems(doc.shortlists) &&
          !(doc.parcelLists ?? []).some((l) => l.items.length > 0);
        if (!migrated && serverEmpty) {
          const legacy = readLegacyLocalLists();
          if (
            shortlistsHaveItems(legacy.shortlists) ||
            legacy.parcelLists.some((l) => l.items.length > 0)
          ) {
            const result = await putLists({
              shortlists: legacy.shortlists,
              parcelLists: legacy.parcelLists,
              expectedVersion: doc.version,
              migrateLocal: legacy,
            });
            if (result.ok) {
              doc = result.doc;
              localStorage.setItem(MIGRATE_FLAG, "1");
            } else if (result.conflict) {
              doc = result.conflict;
              localStorage.setItem(MIGRATE_FLAG, "1");
            }
          } else {
            localStorage.setItem(MIGRATE_FLAG, "1");
          }
        }

        if (cancelled) return;
        applyRemote(doc);
        setStatus("live");
        setError("");
      } catch (e) {
        if (cancelled) return;
        setStatus("error");
        setError(e instanceof Error ? e.message : "Failed to load shared lists");
        useAppStore.setState({ listsHydrated: true });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Debounced save on local list mutations
  useEffect(() => {
    const unsub = useAppStore.subscribe((state, prev) => {
      if (!state.listsHydrated || applyingRemote.current) return;
      if (
        state.shortlists === prev.shortlists &&
        state.parcelLists === prev.parcelLists
      ) {
        return;
      }

      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        void (async () => {
          const { shortlists, parcelLists } = useAppStore.getState();
          const expectedVersion = versionRef.current;
          useAppStore.setState({ listsSyncing: true });
          const result = await putLists({
            shortlists,
            parcelLists,
            expectedVersion,
          });
          if (result.ok) {
            versionRef.current = result.doc.version;
            applyingRemote.current = true;
            useAppStore.setState({
              listsVersion: result.doc.version,
              listsUpdatedAt: result.doc.updatedAt,
              listsSyncing: false,
            });
            queueMicrotask(() => {
              applyingRemote.current = false;
            });
            setStatus("live");
            setError("");
            return;
          }
          if (result.conflict) {
            applyRemote(result.conflict);
            setStatus("live");
            setError("Lists refreshed from a collaborator’s update");
            useAppStore.setState({ listsSyncing: false });
            return;
          }
          setStatus("error");
          setError(result.error);
          useAppStore.setState({ listsSyncing: false });
        })();
      }, SAVE_DEBOUNCE_MS);
    });

    return () => {
      unsub();
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  // Poll for collaborator changes
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === "hidden") return;
      if (useAppStore.getState().listsSyncing) return;
      void (async () => {
        try {
          const doc = await fetchLists();
          if (doc.version !== versionRef.current) {
            applyRemote(doc);
            setStatus("live");
            setError("");
          }
        } catch {
          /* keep last good state */
        }
      })();
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, []);

  // Tiny status chip for the Lists tab header via custom event / store flag
  useEffect(() => {
    useAppStore.setState({
      listsStatus: status,
      listsError: error,
    });
  }, [status, error]);

  return null;
}
