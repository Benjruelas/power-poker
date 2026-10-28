"use client";

import { useCallback, useEffect, useState } from "react";
import { GripVertical, Plus, Save, Trash2 } from "lucide-react";

import { PartnerShell } from "@/components/partner/PartnerShell";
import {
  headerBtnPrimaryClass,
  headerLabelClass,
} from "@/components/shared/appHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { newId } from "@/lib/partner/defaults";
import type { PartnerSettings, PartnerStatus } from "@/lib/partner/types";

const COLORS = [
  "#059669",
  "#0d9488",
  "#2563eb",
  "#7c3aed",
  "#d97706",
  "#ea580c",
  "#16a34a",
  "#64748b",
  "#dc2626",
  "#0891b2",
];

export function PartnerSettingsPage() {
  const [settings, setSettings] = useState<PartnerSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/partner/settings");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load");
      setSettings(data.settings);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const res = await fetch("/api/partner/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");
      setSettings(data.settings);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const updateStatus = (id: string, patch: Partial<PartnerStatus>) => {
    setSettings((s) => {
      if (!s) return s;
      let statuses = s.statuses.map((st) =>
        st.id === id ? { ...st, ...patch } : st
      );
      if (patch.isDefault) {
        statuses = statuses.map((st) => ({
          ...st,
          isDefault: st.id === id,
        }));
      }
      return { ...s, statuses };
    });
  };

  const moveStatus = (id: string, dir: -1 | 1) => {
    setSettings((s) => {
      if (!s) return s;
      const statuses = [...s.statuses].sort(
        (a, b) => a.sortOrder - b.sortOrder
      );
      const idx = statuses.findIndex((st) => st.id === id);
      const j = idx + dir;
      if (idx < 0 || j < 0 || j >= statuses.length) return s;
      const tmp = statuses[idx]!;
      statuses[idx] = statuses[j]!;
      statuses[j] = tmp;
      return {
        ...s,
        statuses: statuses.map((st, i) => ({ ...st, sortOrder: i })),
      };
    });
  };

  const addStatus = () => {
    setSettings((s) => {
      if (!s) return s;
      const st: PartnerStatus = {
        id: newId("pstatus"),
        name: "New status",
        color: COLORS[s.statuses.length % COLORS.length]!,
        sortOrder: s.statuses.length,
        isDefault: false,
        isClosed: false,
      };
      return { ...s, statuses: [...s.statuses, st] };
    });
  };

  const removeStatus = (id: string) => {
    setSettings((s) => {
      if (!s || s.statuses.length <= 1) return s;
      let statuses = s.statuses.filter((st) => st.id !== id);
      if (!statuses.some((st) => st.isDefault) && statuses[0]) {
        statuses = statuses.map((st, i) => ({
          ...st,
          isDefault: i === 0,
        }));
      }
      return {
        ...s,
        statuses: statuses.map((st, i) => ({ ...st, sortOrder: i })),
      };
    });
  };

  return (
    <PartnerShell
      actions={
        <Button
          className={headerBtnPrimaryClass}
          onClick={() => void save()}
          disabled={saving || !settings}
          aria-label={saving ? "Saving settings" : "Save settings"}
        >
          <Save className="size-4" strokeWidth={2.5} />
          <span className={headerLabelClass}>
            {saving ? "Saving…" : "Save settings"}
          </span>
        </Button>
      }
    >
      <div className="h-full overflow-y-auto">
        {error && (
          <div className="border-b bg-amber-50 px-4 py-2 text-xs text-amber-900">
            {error}
          </div>
        )}
        {saved && (
          <div className="border-b bg-emerald-50 px-4 py-2 text-xs text-emerald-800">
            Settings saved
          </div>
        )}
        {loading || !settings ? (
          <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
            Loading settings…
          </div>
        ) : (
          <div className="mx-auto grid max-w-3xl gap-8 p-4 md:p-6">
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold">Pipeline columns</h2>
                  <p className="text-xs text-muted-foreground">
                    Reorder, rename, and color stages used on the partner board.
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={addStatus}>
                  <Plus className="size-3.5" />
                  Add column
                </Button>
              </div>
              <ul className="space-y-2">
                {[...settings.statuses]
                  .sort((a, b) => a.sortOrder - b.sortOrder)
                  .map((st, i) => (
                    <li
                      key={st.id}
                      className="flex flex-wrap items-center gap-2 rounded-xl border p-3"
                    >
                      <GripVertical className="size-4 text-muted-foreground" />
                      <input
                        type="color"
                        className="size-8 cursor-pointer rounded border bg-transparent p-0.5"
                        value={st.color}
                        onChange={(e) =>
                          updateStatus(st.id, { color: e.target.value })
                        }
                      />
                      <Input
                        className="min-w-[140px] flex-1"
                        value={st.name}
                        onChange={(e) =>
                          updateStatus(st.id, { name: e.target.value })
                        }
                      />
                      <label className="flex items-center gap-1.5 text-xs">
                        <input
                          type="checkbox"
                          checked={st.isDefault}
                          onChange={() =>
                            updateStatus(st.id, { isDefault: true })
                          }
                        />
                        Default
                      </label>
                      <label className="flex items-center gap-1.5 text-xs">
                        <input
                          type="checkbox"
                          checked={st.isClosed}
                          onChange={(e) =>
                            updateStatus(st.id, {
                              isClosed: e.target.checked,
                            })
                          }
                        />
                        Closed
                      </label>
                      <div className="flex gap-1">
                        <Button
                          size="icon-xs"
                          variant="ghost"
                          disabled={i === 0}
                          onClick={() => moveStatus(st.id, -1)}
                        >
                          ↑
                        </Button>
                        <Button
                          size="icon-xs"
                          variant="ghost"
                          disabled={i === settings.statuses.length - 1}
                          onClick={() => moveStatus(st.id, 1)}
                        >
                          ↓
                        </Button>
                        <Button
                          size="icon-xs"
                          variant="ghost"
                          disabled={settings.statuses.length <= 1}
                          onClick={() => removeStatus(st.id)}
                        >
                          <Trash2 className="size-3" />
                        </Button>
                      </div>
                    </li>
                  ))}
              </ul>
            </section>
          </div>
        )}
      </div>
    </PartnerShell>
  );
}
