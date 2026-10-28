"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Columns3, LayoutList, Search } from "lucide-react";

import { PartnerShell } from "@/components/partner/PartnerShell";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type {
  PartnerLeadDetail,
  PartnerSettings,
  PartnerStatus,
} from "@/lib/partner/types";

type ViewMode = "board" | "table";

function isOverdue(dueOn: string | null | undefined): boolean {
  if (!dueOn) return false;
  return dueOn.slice(0, 10) < new Date().toISOString().slice(0, 10);
}

function earliestReminder(lead: PartnerLeadDetail): string | null {
  if (!lead.reminders.length) return null;
  return [...lead.reminders]
    .map((r) => r.dueOn.slice(0, 10))
    .sort()[0]!;
}

function formatAcres(n: number | null) {
  if (n == null) return "—";
  return `${n.toLocaleString(undefined, { maximumFractionDigits: 2 })} ac`;
}

export function PartnerPipelinePage() {
  const [leads, setLeads] = useState<PartnerLeadDetail[]>([]);
  const [settings, setSettings] = useState<PartnerSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [view, setView] = useState<ViewMode>("board");
  const [dragLeadId, setDragLeadId] = useState<string | null>(null);

  const load = useCallback(async (query?: string) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (query?.trim()) params.set("q", query.trim());
      const res = await fetch(`/api/partner/leads?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load");
      setLeads(data.leads ?? []);
      setSettings(data.settings ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load Partner CRM");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load("");
  }, [load]);

  useEffect(() => {
    const t = setTimeout(() => {
      void load(q);
    }, 250);
    return () => clearTimeout(t);
  }, [q, load]);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const apply = () => setView(mq.matches ? "table" : "board");
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const columns = useMemo(
    () =>
      [...(settings?.statuses ?? [])].sort(
        (a, b) => a.sortOrder - b.sortOrder
      ),
    [settings]
  );

  const moveLead = async (leadId: string, statusId: string) => {
    const prev = leads;
    setLeads((list) =>
      list.map((l) =>
        l.id === leadId
          ? {
              ...l,
              statusId,
              status:
                settings?.statuses.find((s) => s.id === statusId) ?? l.status,
            }
          : l
      )
    );
    try {
      const res = await fetch(`/api/partner/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statusId }),
      });
      if (!res.ok) {
        setLeads(prev);
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to update status");
      }
    } catch {
      setLeads(prev);
      setError("Failed to update status");
    }
  };

  const stepLead = (lead: PartnerLeadDetail, dir: -1 | 1) => {
    const idx = columns.findIndex((s) => s.id === lead.statusId);
    const next = columns[idx + dir];
    if (!next) return;
    void moveLead(lead.id, next.id);
  };

  return (
    <PartnerShell>
      <div className="flex h-full flex-col">
        <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2.5">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-8 pl-8"
              placeholder="Search address, owner, notes, tasks…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <div className="flex rounded-lg bg-muted/60 p-0.5">
            <button
              type="button"
              className={cn(
                "inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium",
                view === "board"
                  ? "bg-background shadow-sm"
                  : "text-muted-foreground"
              )}
              onClick={() => setView("board")}
            >
              <Columns3 className="size-3.5" />
              Board
            </button>
            <button
              type="button"
              className={cn(
                "inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium",
                view === "table"
                  ? "bg-background shadow-sm"
                  : "text-muted-foreground"
              )}
              onClick={() => setView("table")}
            >
              <LayoutList className="size-3.5" />
              Table
            </button>
          </div>
          <span className="text-xs text-muted-foreground">
            {leads.length} lead{leads.length === 1 ? "" : "s"}
          </span>
        </div>

        {error && (
          <div className="border-b bg-amber-50 px-4 py-2 text-xs text-amber-900">
            {error}
          </div>
        )}

        {loading && !settings ? (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            Loading pipeline…
          </div>
        ) : error && !settings ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
            <p className="text-sm font-medium">Could not load Partner CRM</p>
            <p className="max-w-md text-xs text-muted-foreground">{error}</p>
          </div>
        ) : leads.length === 0 && !q ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
            <p className="text-sm font-medium">No partner leads yet</p>
            <p className="max-w-md text-xs text-muted-foreground">
              Leads appear here when someone on the full team sends them from
              the main CRM.
            </p>
          </div>
        ) : view === "board" ? (
          <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto p-4">
            {columns.map((status) => (
              <BoardColumn
                key={status.id}
                status={status}
                leads={leads.filter((l) => l.statusId === status.id)}
                columns={columns}
                dragLeadId={dragLeadId}
                onDragStart={setDragLeadId}
                onDrop={(leadId) => {
                  setDragLeadId(null);
                  if (leadId) void moveLead(leadId, status.id);
                }}
                onStep={stepLead}
              />
            ))}
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="sticky top-0 border-b bg-background text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">Address</th>
                  <th className="px-4 py-2 font-medium">Owner</th>
                  <th className="px-4 py-2 font-medium">County</th>
                  <th className="px-4 py-2 font-medium">Acres</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Reminder</th>
                  <th className="px-4 py-2 font-medium">Move</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((l) => {
                  const rem = earliestReminder(l);
                  return (
                    <tr key={l.id} className="border-b hover:bg-muted/40">
                      <td className="px-4 py-2">
                        <Link
                          href={`/partner/${l.id}`}
                          className="font-medium hover:underline"
                        >
                          {l.address || l.parcelId}
                        </Link>
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">
                        {l.ownerName || "—"}
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">
                        {l.county || "—"}
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">
                        {formatAcres(l.acres)}
                      </td>
                      <td className="px-4 py-2">
                        <select
                          className="h-7 rounded-md border bg-background px-2 text-xs"
                          value={l.statusId}
                          onChange={(e) => void moveLead(l.id, e.target.value)}
                        >
                          {columns.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td
                        className={cn(
                          "px-4 py-2",
                          isOverdue(rem)
                            ? "font-medium text-red-600"
                            : "text-muted-foreground"
                        )}
                      >
                        {rem || "—"}
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex gap-1">
                          <button
                            type="button"
                            className="rounded border px-1.5 py-0.5 text-xs disabled:opacity-40"
                            disabled={
                              columns.findIndex((s) => s.id === l.statusId) <= 0
                            }
                            onClick={() => stepLead(l, -1)}
                            aria-label="Move backward"
                          >
                            <ChevronLeft className="size-3.5" />
                          </button>
                          <button
                            type="button"
                            className="rounded border px-1.5 py-0.5 text-xs disabled:opacity-40"
                            disabled={
                              columns.findIndex((s) => s.id === l.statusId) >=
                              columns.length - 1
                            }
                            onClick={() => stepLead(l, 1)}
                            aria-label="Move forward"
                          >
                            <ChevronRight className="size-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </PartnerShell>
  );
}

function BoardColumn({
  status,
  leads,
  columns,
  dragLeadId,
  onDragStart,
  onDrop,
  onStep,
}: {
  status: PartnerStatus;
  leads: PartnerLeadDetail[];
  columns: PartnerStatus[];
  dragLeadId: string | null;
  onDragStart: (id: string | null) => void;
  onDrop: (leadId: string | null) => void;
  onStep: (lead: PartnerLeadDetail, dir: -1 | 1) => void;
}) {
  return (
    <div
      className="flex w-72 shrink-0 flex-col rounded-xl border bg-muted/30"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const id = e.dataTransfer.getData("text/lead-id") || dragLeadId;
        onDrop(id || null);
      }}
    >
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <span
          className="size-2.5 rounded-full"
          style={{ backgroundColor: status.color }}
        />
        <span className="text-xs font-semibold">{status.name}</span>
        <span className="ml-auto text-[11px] text-muted-foreground">
          {leads.length}
        </span>
      </div>
      <div className="flex min-h-[120px] flex-1 flex-col gap-2 overflow-y-auto p-2">
        {leads.map((l) => {
          const colIdx = columns.findIndex((s) => s.id === l.statusId);
          const rem = earliestReminder(l);
          return (
            <div
              key={l.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("text/lead-id", l.id);
                onDragStart(l.id);
              }}
              onDragEnd={() => onDragStart(null)}
              className="rounded-lg border bg-background p-3 shadow-sm"
            >
              <Link
                href={`/partner/${l.id}`}
                className="block hover:border-emerald-300"
              >
                <div className="truncate text-sm font-semibold">
                  {l.address || l.parcelId}
                </div>
                <div className="mt-0.5 truncate text-xs text-muted-foreground">
                  {[
                    l.ownerName || null,
                    l.county ? `${l.county} Co.` : null,
                    formatAcres(l.acres),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
                {rem && (
                  <div
                    className={cn(
                      "mt-1.5 text-[10px] font-medium",
                      isOverdue(rem) ? "text-red-600" : "text-muted-foreground"
                    )}
                  >
                    Reminder {rem}
                  </div>
                )}
                {l.tasks.some((t) => !t.done) && (
                  <div className="mt-1 text-[10px] text-muted-foreground">
                    {l.tasks.filter((t) => !t.done).length} open task
                    {l.tasks.filter((t) => !t.done).length === 1 ? "" : "s"}
                  </div>
                )}
              </Link>
              <div className="mt-2 flex gap-1">
                <button
                  type="button"
                  className="inline-flex flex-1 items-center justify-center rounded-md border px-2 py-1 text-xs disabled:opacity-40"
                  disabled={colIdx <= 0}
                  onClick={() => onStep(l, -1)}
                  aria-label="Move backward"
                >
                  <ChevronLeft className="size-3.5" />
                </button>
                <button
                  type="button"
                  className="inline-flex flex-1 items-center justify-center rounded-md border px-2 py-1 text-xs disabled:opacity-40"
                  disabled={colIdx >= columns.length - 1}
                  onClick={() => onStep(l, 1)}
                  aria-label="Move forward"
                >
                  <ChevronRight className="size-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
