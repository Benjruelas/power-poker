"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Columns3,
  Download,
  LayoutList,
  Plus,
  Search,
} from "lucide-react";

import { CrmShell } from "@/components/crm/CrmShell";
import { AddParcelDialog } from "@/components/crm/AddParcelDialog";
import {
  headerBtnOutlineClass,
  headerBtnPrimaryClass,
  headerLabelClass,
} from "@/components/shared/appHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type {
  CrmLeadDetail,
  CrmSettings,
  CrmStatus,
} from "@/lib/crm/types";

type ViewMode = "board" | "table";

function isOverdue(followUpOn: string | null): boolean {
  if (!followUpOn) return false;
  const d = followUpOn.slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  return d < today;
}

function formatAcres(n: number | null) {
  if (n == null) return "—";
  return `${n.toLocaleString(undefined, { maximumFractionDigits: 2 })} ac`;
}

export function CrmPipelinePage() {
  const [leads, setLeads] = useState<CrmLeadDetail[]>([]);
  const [settings, setSettings] = useState<CrmSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [view, setView] = useState<ViewMode>("board");
  const [addOpen, setAddOpen] = useState(false);
  const [dragLeadId, setDragLeadId] = useState<string | null>(null);

  const load = useCallback(async (query?: string) => {
    setLoading(true);
    setError("");
    try {
      // Seed Yes-list parcels on first visit when CRM is empty
      await fetch("/api/crm/seed", { method: "POST" }).catch(() => null);
      const params = new URLSearchParams();
      if (query?.trim()) params.set("q", query.trim());
      const res = await fetch(`/api/crm/leads?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load");
      setLeads(data.leads ?? []);
      setSettings(data.settings ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load CRM");
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

  // Prefer board on desktop, table on narrow screens
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const apply = () => setView(mq.matches ? "table" : "board");
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const openStatuses = useMemo(
    () =>
      (settings?.statuses ?? [])
        .filter((s) => !s.isClosed)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [settings]
  );
  const closedStatuses = useMemo(
    () =>
      (settings?.statuses ?? [])
        .filter((s) => s.isClosed)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [settings]
  );
  const columns = useMemo(
    () => [...openStatuses, ...closedStatuses],
    [openStatuses, closedStatuses]
  );

  const moveLead = async (leadId: string, statusId: string) => {
    const prev = leads;
    setLeads((list) =>
      list.map((l) =>
        l.id === leadId
          ? {
              ...l,
              statusId,
              status: settings?.statuses.find((s) => s.id === statusId) ?? l.status,
            }
          : l
      )
    );
    try {
      const res = await fetch(`/api/crm/leads/${leadId}`, {
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

  const onExport = () => {
    const header = [
      "address",
      "owner",
      "county",
      "acres",
      "marketValue",
      "status",
      "followUpOn",
      "parcelId",
      "latitude",
      "longitude",
    ];
    const rows = leads.map((l) =>
      [
        l.address,
        l.ownerName,
        l.county,
        l.acres ?? "",
        l.marketValue ?? "",
        l.status?.name ?? "",
        l.followUpOn ?? "",
        l.parcelId,
        l.latitude,
        l.longitude,
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(",")
    );
    const csv = [header.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "crm_leads.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <CrmShell
      actions={
        <>
          <Button
            className={headerBtnOutlineClass}
            variant="outline"
            onClick={onExport}
            disabled={!leads.length}
            aria-label="Export CSV"
          >
            <Download className="size-4" />
            <span className={headerLabelClass}>CSV</span>
          </Button>
          <Button
            className={headerBtnPrimaryClass}
            onClick={() => setAddOpen(true)}
            aria-label="Add parcel"
          >
            <Plus className="size-4" />
            <span className={headerLabelClass}>Add parcel</span>
          </Button>
        </>
      }
    >
      <div className="flex h-full flex-col">
        <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2.5">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-8 pl-8"
              placeholder="Search address, owner, notes, contacts…"
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
        ) : leads.length === 0 && !q ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
            <p className="text-sm font-medium">No leads yet</p>
            <p className="max-w-md text-xs text-muted-foreground">
              Mark Yes on the map to add a parcel to the CRM, or add a parcel
              here.
            </p>
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="size-3.5" />
              Add parcel
            </Button>
          </div>
        ) : view === "board" ? (
          <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto p-4">
            {columns.map((status) => (
              <BoardColumn
                key={status.id}
                status={status}
                leads={leads.filter((l) => l.statusId === status.id)}
                dragLeadId={dragLeadId}
                onDragStart={setDragLeadId}
                onDrop={(leadId) => {
                  setDragLeadId(null);
                  if (leadId) void moveLead(leadId, status.id);
                }}
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
                  <th className="px-4 py-2 font-medium">Follow-up</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((l) => (
                  <tr
                    key={l.id}
                    className="border-b hover:bg-muted/40"
                  >
                    <td className="px-4 py-2">
                      <Link
                        href={`/crm/${l.id}`}
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
                      <StatusSelect
                        statuses={settings?.statuses ?? []}
                        value={l.statusId}
                        onChange={(statusId) => void moveLead(l.id, statusId)}
                      />
                    </td>
                    <td
                      className={cn(
                        "px-4 py-2",
                        isOverdue(l.followUpOn)
                          ? "font-medium text-red-600"
                          : "text-muted-foreground"
                      )}
                    >
                      {l.followUpOn?.slice(0, 10) || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AddParcelDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onCreated={() => void load(q)}
      />
    </CrmShell>
  );
}

function BoardColumn({
  status,
  leads,
  dragLeadId,
  onDragStart,
  onDrop,
}: {
  status: CrmStatus;
  leads: CrmLeadDetail[];
  dragLeadId: string | null;
  onDragStart: (id: string | null) => void;
  onDrop: (leadId: string | null) => void;
}) {
  return (
    <div
      className="flex w-72 shrink-0 flex-col rounded-xl border bg-muted/30"
      onDragOver={(e) => {
        e.preventDefault();
      }}
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
        {leads.map((l) => (
          <Link
            key={l.id}
            href={`/crm/${l.id}`}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData("text/lead-id", l.id);
              onDragStart(l.id);
            }}
            onDragEnd={() => onDragStart(null)}
            className="block rounded-lg border bg-background p-3 shadow-sm hover:border-emerald-300"
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
            {l.followUpOn && (
              <div
                className={cn(
                  "mt-1.5 text-[10px] font-medium",
                  isOverdue(l.followUpOn) ? "text-red-600" : "text-muted-foreground"
                )}
              >
                Follow-up {l.followUpOn.slice(0, 10)}
              </div>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}

function StatusSelect({
  statuses,
  value,
  onChange,
}: {
  statuses: CrmStatus[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <select
      className="h-7 rounded-md border bg-background px-2 text-xs"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onClick={(e) => e.stopPropagation()}
    >
      {statuses.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </select>
  );
}
