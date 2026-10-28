"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bell,
  CheckSquare,
  Download,
  Paperclip,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";

import { PartnerShell } from "@/components/partner/PartnerShell";
import {
  headerBtnDestructiveClass,
  headerLabelClass,
} from "@/components/shared/appHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type {
  PartnerLeadDetail,
  PartnerSettings,
} from "@/lib/partner/types";

function isOverdue(dueOn: string): boolean {
  return dueOn.slice(0, 10) < new Date().toISOString().slice(0, 10);
}

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function PartnerLeadDetailPage({ leadId }: { leadId: string }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [lead, setLead] = useState<PartnerLeadDetail | null>(null);
  const [settings, setSettings] = useState<PartnerSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [reminderDue, setReminderDue] = useState("");
  const [reminderNote, setReminderNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [leadRes, settingsRes] = await Promise.all([
        fetch(`/api/partner/leads/${leadId}`),
        fetch("/api/partner/settings"),
      ]);
      const leadData = await leadRes.json();
      const settingsData = await settingsRes.json();
      if (!leadRes.ok) throw new Error(leadData.error || "Lead not found");
      setLead(leadData.lead);
      setSettings(settingsData.settings ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => {
    void load();
  }, [load]);

  const statuses = useMemo(
    () =>
      [...(settings?.statuses ?? [])].sort(
        (a, b) => a.sortOrder - b.sortOrder
      ),
    [settings]
  );

  const stage = useMemo(() => {
    if (!lead) return null;
    return (
      statuses.find((s) => s.id === lead.statusId) ?? lead.status ?? null
    );
  }, [lead, statuses]);

  const patch = async (body: Record<string, unknown>) => {
    if (!lead) return;
    const prev = lead;
    setLead({ ...lead, ...body } as PartnerLeadDetail);
    try {
      const res = await fetch(`/api/partner/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setLead(prev);
        setError(data.error || "Save failed");
        return;
      }
      setLead(data.lead);
    } catch {
      setLead(prev);
      setError("Save failed");
    }
  };

  const removeLead = async () => {
    if (!confirm("Remove this lead from Partner CRM?")) return;
    const res = await fetch(`/api/partner/leads/${leadId}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Failed to delete lead");
      return;
    }
    router.push("/partner");
  };

  const addNote = async () => {
    if (!noteBody.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/partner/leads/${leadId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: noteBody }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to add note");
        return;
      }
      setNoteBody("");
      await load();
    } finally {
      setSaving(false);
    }
  };

  const addTask = async () => {
    if (!taskTitle.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/partner/leads/${leadId}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: taskTitle }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to add task");
        return;
      }
      setTaskTitle("");
      await load();
    } finally {
      setSaving(false);
    }
  };

  const toggleTask = async (taskId: string, done: boolean) => {
    const res = await fetch(`/api/partner/leads/${leadId}/tasks`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId, done }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Failed to update task");
      return;
    }
    await load();
  };

  const removeTask = async (taskId: string) => {
    const res = await fetch(
      `/api/partner/leads/${leadId}/tasks?taskId=${encodeURIComponent(taskId)}`,
      { method: "DELETE" }
    );
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Failed to delete task");
      return;
    }
    await load();
  };

  const addReminder = async () => {
    if (!reminderDue) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/partner/leads/${leadId}/reminders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dueOn: reminderDue, note: reminderNote }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to add reminder");
        return;
      }
      setReminderDue("");
      setReminderNote("");
      await load();
    } finally {
      setSaving(false);
    }
  };

  const removeReminder = async (reminderId: string) => {
    const res = await fetch(
      `/api/partner/leads/${leadId}/reminders?reminderId=${encodeURIComponent(reminderId)}`,
      { method: "DELETE" }
    );
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Failed to delete reminder");
      return;
    }
    await load();
  };

  const onUpload = async (fileList: FileList | null) => {
    const file = fileList?.[0];
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/partner/leads/${leadId}/files`, {
        method: "POST",
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Upload failed");
        return;
      }
      await load();
    } finally {
      setUploading(false);
    }
  };

  const removeFile = async (fileId: string) => {
    if (!confirm("Delete this file?")) return;
    const res = await fetch(
      `/api/partner/leads/${leadId}/files?fileId=${encodeURIComponent(fileId)}`,
      { method: "DELETE" }
    );
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Failed to delete file");
      return;
    }
    await load();
  };

  if (loading) {
    return (
      <PartnerShell>
        <div className="flex h-full items-center justify-center pt-6 text-sm text-muted-foreground md:pt-8">
          Loading lead…
        </div>
      </PartnerShell>
    );
  }

  if (!lead) {
    return (
      <PartnerShell>
        <div className="flex h-full flex-col items-center justify-center gap-2">
          <p className="text-sm">{error || "Lead not found"}</p>
          <Link href="/partner" className="text-xs text-emerald-700 underline">
            Back to pipeline
          </Link>
        </div>
      </PartnerShell>
    );
  }

  return (
    <PartnerShell
      title={lead.address || lead.parcelId}
      actions={
        <Button
          className={headerBtnDestructiveClass}
          variant="destructive"
          onClick={() => void removeLead()}
          aria-label="Remove lead"
        >
          <Trash2 className="size-4" />
          <span className={headerLabelClass}>Remove</span>
        </Button>
      }
    >
      <div className="h-full overflow-y-auto pt-6 md:pt-8">
        {error && (
          <div className="border-b bg-amber-50 px-4 py-2 text-xs text-amber-900">
            {error}
          </div>
        )}
        <div className="mx-auto grid max-w-5xl gap-6 px-4 pb-8 md:grid-cols-[1fr_320px]">
          <div className="space-y-6">
            <section className="space-y-3 rounded-xl border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">Parcel</h2>
                {stage && (
                  <div
                    className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold"
                    style={{
                      borderColor: stage.color,
                      backgroundColor: `${stage.color}18`,
                      color: stage.color,
                    }}
                    title="Partner CRM stage"
                  >
                    <span
                      className="size-2 rounded-full"
                      style={{ backgroundColor: stage.color }}
                    />
                    Stage · {stage.name}
                  </div>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <EditableField
                  label="Address"
                  value={lead.address}
                  onSave={(v) => void patch({ address: v })}
                />
                <EditableField
                  label="Owner"
                  value={lead.ownerName}
                  onSave={(v) => void patch({ ownerName: v })}
                />
                <EditableField
                  label="County"
                  value={lead.county}
                  onSave={(v) => void patch({ county: v })}
                />
                <EditableField
                  label="Acres"
                  value={lead.acres != null ? String(lead.acres) : ""}
                  onSave={(v) => {
                    const n = v.trim() === "" ? null : parseFloat(v);
                    void patch({
                      acres: n != null && Number.isFinite(n) ? n : null,
                    });
                  }}
                />
                <EditableField
                  label="Market value"
                  value={
                    lead.marketValue != null ? String(lead.marketValue) : ""
                  }
                  onSave={(v) => {
                    const n = v.trim() === "" ? null : parseFloat(v);
                    void patch({
                      marketValue: n != null && Number.isFinite(n) ? n : null,
                    });
                  }}
                />
                <EditableField
                  label="Parcel ID"
                  value={lead.parcelId}
                  onSave={(v) => void patch({ parcelId: v })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Stage</Label>
                <select
                  className="h-9 w-full rounded-lg border bg-background px-3 text-sm"
                  value={lead.statusId}
                  onChange={(e) => void patch({ statusId: e.target.value })}
                >
                  {statuses.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            </section>

            <section className="space-y-3 rounded-xl border p-4">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <CheckSquare className="size-4" />
                Tasks
              </h2>
              <ul className="space-y-2">
                {lead.tasks.length === 0 && (
                  <li className="text-xs text-muted-foreground">No tasks yet.</li>
                )}
                {lead.tasks.map((t) => (
                  <li
                    key={t.id}
                    className="flex items-center gap-2 rounded-lg border px-3 py-2"
                  >
                    <input
                      type="checkbox"
                      className="size-4"
                      checked={t.done}
                      onChange={(e) => void toggleTask(t.id, e.target.checked)}
                    />
                    <span
                      className={cn(
                        "flex-1 text-sm",
                        t.done && "text-muted-foreground line-through"
                      )}
                    >
                      {t.title}
                    </span>
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-red-600"
                      onClick={() => void removeTask(t.id)}
                      aria-label="Delete task"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
              <div className="flex gap-2">
                <Input
                  placeholder="New task…"
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void addTask();
                  }}
                />
                <Button
                  size="sm"
                  onClick={() => void addTask()}
                  disabled={saving || !taskTitle.trim()}
                >
                  <Plus className="size-3.5" />
                  Add
                </Button>
              </div>
            </section>

            <section className="space-y-3 rounded-xl border p-4">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <Bell className="size-4" />
                Reminders
              </h2>
              <ul className="space-y-2">
                {lead.reminders.length === 0 && (
                  <li className="text-xs text-muted-foreground">
                    No reminders yet.
                  </li>
                )}
                {lead.reminders.map((r) => (
                  <li
                    key={r.id}
                    className="flex items-start gap-2 rounded-lg border px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div
                        className={cn(
                          "text-sm font-medium",
                          isOverdue(r.dueOn) && "text-red-600"
                        )}
                      >
                        {r.dueOn.slice(0, 10)}
                        {isOverdue(r.dueOn) ? " · overdue" : ""}
                      </div>
                      {r.note && (
                        <div className="text-xs text-muted-foreground">
                          {r.note}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-red-600"
                      onClick={() => void removeReminder(r.id)}
                      aria-label="Delete reminder"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
              <div className="grid gap-2 sm:grid-cols-[140px_1fr_auto]">
                <Input
                  type="date"
                  value={reminderDue}
                  onChange={(e) => setReminderDue(e.target.value)}
                />
                <Input
                  placeholder="Reminder note…"
                  value={reminderNote}
                  onChange={(e) => setReminderNote(e.target.value)}
                />
                <Button
                  size="sm"
                  onClick={() => void addReminder()}
                  disabled={saving || !reminderDue}
                >
                  <Plus className="size-3.5" />
                  Add
                </Button>
              </div>
            </section>

            <section className="space-y-3 rounded-xl border p-4">
              <h2 className="text-sm font-semibold">Notes</h2>
              <ul className="space-y-2">
                {lead.notes.map((n) => (
                  <li
                    key={n.id}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-sm",
                      n.kind === "system" && "bg-muted/40 text-muted-foreground"
                    )}
                  >
                    <div className="whitespace-pre-wrap">{n.body}</div>
                    <div className="mt-1 text-[10px] text-muted-foreground">
                      {new Date(n.createdAt).toLocaleString()}
                    </div>
                  </li>
                ))}
              </ul>
              <textarea
                className="min-h-[80px] w-full rounded-lg border bg-background px-3 py-2 text-sm"
                placeholder="Add a note…"
                value={noteBody}
                onChange={(e) => setNoteBody(e.target.value)}
              />
              <Button
                size="sm"
                onClick={() => void addNote()}
                disabled={saving || !noteBody.trim()}
              >
                Add note
              </Button>
            </section>
          </div>

          <div className="space-y-6">
            <section className="space-y-3 rounded-xl border p-4">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <Paperclip className="size-4" />
                Files
              </h2>
              <ul className="space-y-2">
                {lead.files.length === 0 && (
                  <li className="text-xs text-muted-foreground">
                    No files uploaded.
                  </li>
                )}
                {lead.files.map((f) => (
                  <li
                    key={f.id}
                    className="flex items-center gap-2 rounded-lg border px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">
                        {f.name}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {formatBytes(f.size)}
                      </div>
                    </div>
                    <a
                      className="inline-flex size-8 items-center justify-center rounded-md border hover:bg-muted"
                      href={`/api/partner/leads/${leadId}/files?fileId=${encodeURIComponent(f.id)}`}
                      download={f.name}
                      aria-label={`Download ${f.name}`}
                    >
                      <Download className="size-3.5" />
                    </a>
                    <button
                      type="button"
                      className="inline-flex size-8 items-center justify-center rounded-md border text-muted-foreground hover:text-red-600"
                      onClick={() => void removeFile(f.id)}
                      aria-label={`Delete ${f.name}`}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
              <input
                ref={fileInputRef}
                type="file"
                className="sr-only"
                disabled={uploading}
                onChange={(e) => {
                  void onUpload(e.target.files);
                  e.target.value = "";
                }}
              />
              <Button
                type="button"
                variant="outline"
                className="h-10 w-full border-2 border-neutral-800 bg-neutral-950 text-sm font-semibold text-white hover:bg-neutral-800 hover:text-white"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="size-4" />
                {uploading ? "Uploading…" : "Choose file to upload"}
              </Button>
              <p className="text-[11px] text-muted-foreground">
                Max 20 MB. Executable file types are blocked.
              </p>
            </section>
          </div>
        </div>
      </div>
    </PartnerShell>
  );
}

function EditableField({
  label,
  value,
  onSave,
}: {
  label: string;
  value: string;
  onSave: (v: string) => void;
}) {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => {
          if (local !== value) onSave(local);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
    </div>
  );
}
