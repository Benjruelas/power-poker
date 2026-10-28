import { del, get, put } from "@vercel/blob";
import { and, desc, eq, isNull } from "drizzle-orm";

import { getDb, hasDatabaseUrl } from "@/lib/crm/db";
import {
  partnerFiles,
  partnerLeads,
  partnerNotes,
  partnerReminders,
  partnerStatuses,
  partnerTasks,
} from "@/lib/crm/schema";

import {
  defaultPartnerStatusId,
  getPartnerSettingsFromDoc,
  readPartnerDocument,
  writePartnerDocument,
  type PartnerDocument,
} from "./blobStore";
import {
  DEFAULT_PARTNER_STATUSES,
  isBlockedUploadFilename,
  newId,
  PARTNER_FILE_MAX_BYTES,
} from "./defaults";
import type {
  ListPartnerLeadsOptions,
  PartnerFile,
  PartnerLead,
  PartnerLeadDetail,
  PartnerLeadInput,
  PartnerLeadPatch,
  PartnerNote,
  PartnerReminder,
  PartnerSettings,
  PartnerSharedFieldPatch,
  PartnerStatus,
  PartnerTask,
} from "./types";

function nowIso() {
  return new Date().toISOString();
}

function useNeon(): boolean {
  return hasDatabaseUrl();
}

function mapDetail(
  lead: PartnerLead,
  status: PartnerStatus | null,
  notes: PartnerNote[],
  tasks: PartnerTask[],
  reminders: PartnerReminder[],
  files: PartnerFile[]
): PartnerLeadDetail {
  return {
    ...lead,
    status,
    notes,
    tasks,
    reminders,
    files,
  };
}

function leadMatchesQuery(
  lead: PartnerLead,
  q: string,
  doc: PartnerDocument
): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const hay = [
    lead.address,
    lead.ownerName,
    lead.county,
    lead.parcelId,
    lead.lrid ?? "",
  ]
    .join(" ")
    .toLowerCase();
  if (hay.includes(needle)) return true;
  if (
    doc.notes.some(
      (n) => n.leadId === lead.id && n.body.toLowerCase().includes(needle)
    )
  ) {
    return true;
  }
  if (
    doc.tasks.some(
      (t) => t.leadId === lead.id && t.title.toLowerCase().includes(needle)
    )
  ) {
    return true;
  }
  return false;
}

async function ensureNeonSeeded() {
  const db = getDb();
  const existing = await db.select().from(partnerStatuses).limit(1);
  if (existing.length > 0) return;
  const statuses = DEFAULT_PARTNER_STATUSES.map((s) => ({
    ...s,
    id: newId("pstatus"),
  }));
  await db.insert(partnerStatuses).values(statuses);
}

/* ---------------- Blob backend ---------------- */

async function blobGetSettings(): Promise<PartnerSettings> {
  const doc = await readPartnerDocument();
  return getPartnerSettingsFromDoc(doc);
}

async function blobPutSettings(
  settings: PartnerSettings
): Promise<PartnerSettings> {
  const doc = await readPartnerDocument();
  let statuses = settings.statuses.map((s, i) => ({
    ...s,
    sortOrder: s.sortOrder ?? i,
  }));
  if (!statuses.some((s) => s.isDefault) && statuses[0]) {
    statuses = statuses.map((s, i) => ({ ...s, isDefault: i === 0 }));
  }
  const statusIds = new Set(statuses.map((s) => s.id));
  const def =
    statuses.find((s) => s.isDefault)?.id ?? statuses[0]?.id ?? "";
  const leads = doc.leads.map((l) =>
    statusIds.has(l.statusId)
      ? l
      : { ...l, statusId: def, updatedAt: nowIso() }
  );
  const next = await writePartnerDocument({
    ...doc,
    statuses,
    leads,
  });
  return getPartnerSettingsFromDoc(next);
}

async function blobListLeads(
  opts: ListPartnerLeadsOptions = {}
): Promise<{ leads: PartnerLeadDetail[]; settings: PartnerSettings }> {
  const doc = await readPartnerDocument();
  const settings = getPartnerSettingsFromDoc(doc);
  const statusMap = new Map(settings.statuses.map((s) => [s.id, s]));
  let leads = doc.leads.filter((l) =>
    opts.includeArchived ? true : !l.archivedAt
  );
  if (opts.statusId) {
    leads = leads.filter((l) => l.statusId === opts.statusId);
  }
  if (opts.q?.trim()) {
    leads = leads.filter((l) => leadMatchesQuery(l, opts.q!, doc));
  }
  leads = [...leads].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return {
    settings,
    leads: leads.map((l) =>
      mapDetail(
        l,
        statusMap.get(l.statusId) ?? null,
        doc.notes
          .filter((n) => n.leadId === l.id)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
        doc.tasks
          .filter((t) => t.leadId === l.id)
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
        doc.reminders
          .filter((r) => r.leadId === l.id)
          .sort((a, b) => a.dueOn.localeCompare(b.dueOn)),
        doc.files
          .filter((f) => f.leadId === l.id)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      )
    ),
  };
}

async function blobGetLead(id: string): Promise<PartnerLeadDetail | null> {
  const { leads } = await blobListLeads({ includeArchived: true });
  return leads.find((l) => l.id === id) ?? null;
}

async function blobFindBySource(
  sourceCrmLeadId: string
): Promise<PartnerLeadDetail | null> {
  const { leads } = await blobListLeads({ includeArchived: true });
  return leads.find((l) => l.sourceCrmLeadId === sourceCrmLeadId) ?? null;
}

async function blobCreateFromCrm(
  input: PartnerLeadInput
): Promise<PartnerLeadDetail> {
  const existing = await blobFindBySource(input.sourceCrmLeadId);
  if (existing) return existing;

  const doc = await readPartnerDocument();
  const statusId = defaultPartnerStatusId(doc);
  const lead: PartnerLead = {
    id: newId("plead"),
    sourceCrmLeadId: input.sourceCrmLeadId,
    parcelId: input.parcelId,
    lrid: input.lrid ?? null,
    address: input.address ?? "",
    ownerName: input.ownerName ?? "",
    county: input.county ?? "",
    acres: input.acres ?? null,
    marketValue: input.marketValue ?? null,
    latitude: input.latitude,
    longitude: input.longitude,
    statusId,
    archivedAt: null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  const note: PartnerNote = {
    id: newId("pnote"),
    leadId: lead.id,
    body: "Added from Power Poker CRM",
    kind: "system",
    createdAt: nowIso(),
  };
  const next = await writePartnerDocument({
    ...doc,
    leads: [...doc.leads, lead],
    notes: [...doc.notes, note],
  });
  const status = next.statuses.find((s) => s.id === lead.statusId) ?? null;
  return mapDetail(lead, status, [note], [], [], []);
}

async function blobPatchLead(
  id: string,
  patch: PartnerLeadPatch
): Promise<PartnerLeadDetail | null> {
  const doc = await readPartnerDocument();
  const prev = doc.leads.find((l) => l.id === id);
  if (!prev) return null;
  let notes = [...doc.notes];
  if (patch.statusId && patch.statusId !== prev.statusId) {
    const from =
      doc.statuses.find((s) => s.id === prev.statusId)?.name ?? "Unknown";
    const to =
      doc.statuses.find((s) => s.id === patch.statusId)?.name ?? "Unknown";
    notes.push({
      id: newId("pnote"),
      leadId: id,
      body: `Moved from ${from} → ${to}`,
      kind: "system",
      createdAt: nowIso(),
    });
  }
  const lead: PartnerLead = {
    ...prev,
    ...patch,
    updatedAt: nowIso(),
  };
  await writePartnerDocument({
    ...doc,
    leads: doc.leads.map((l) => (l.id === id ? lead : l)),
    notes,
  });
  return (await blobGetLead(id)) ?? null;
}

async function blobDeleteLead(id: string): Promise<boolean> {
  const doc = await readPartnerDocument();
  if (!doc.leads.some((l) => l.id === id)) return false;
  const files = doc.files.filter((f) => f.leadId === id);
  await writePartnerDocument({
    ...doc,
    leads: doc.leads.filter((l) => l.id !== id),
    notes: doc.notes.filter((n) => n.leadId !== id),
    tasks: doc.tasks.filter((t) => t.leadId !== id),
    reminders: doc.reminders.filter((r) => r.leadId !== id),
    files: doc.files.filter((f) => f.leadId !== id),
  });
  for (const file of files) {
    try {
      await del(file.blobPath);
    } catch (e) {
      console.error("partner file blob delete", e);
    }
  }
  return true;
}

async function blobAddNote(
  leadId: string,
  body: string,
  kind: "user" | "system" = "user"
): Promise<PartnerNote | null> {
  const doc = await readPartnerDocument();
  if (!doc.leads.some((l) => l.id === leadId)) return null;
  const note: PartnerNote = {
    id: newId("pnote"),
    leadId,
    body: body.trim(),
    kind,
    createdAt: nowIso(),
  };
  await writePartnerDocument({
    ...doc,
    notes: [...doc.notes, note],
    leads: doc.leads.map((l) =>
      l.id === leadId ? { ...l, updatedAt: nowIso() } : l
    ),
  });
  return note;
}

async function blobAddTask(
  leadId: string,
  title: string
): Promise<PartnerTask | null> {
  const doc = await readPartnerDocument();
  if (!doc.leads.some((l) => l.id === leadId)) return null;
  const task: PartnerTask = {
    id: newId("ptask"),
    leadId,
    title: title.trim(),
    done: false,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  await writePartnerDocument({
    ...doc,
    tasks: [...doc.tasks, task],
    leads: doc.leads.map((l) =>
      l.id === leadId ? { ...l, updatedAt: nowIso() } : l
    ),
  });
  return task;
}

async function blobPatchTask(
  leadId: string,
  taskId: string,
  patch: Partial<{ title: string; done: boolean }>
): Promise<PartnerTask | null> {
  const doc = await readPartnerDocument();
  const prev = doc.tasks.find((t) => t.id === taskId && t.leadId === leadId);
  if (!prev) return null;
  const task: PartnerTask = {
    ...prev,
    ...patch,
    updatedAt: nowIso(),
  };
  await writePartnerDocument({
    ...doc,
    tasks: doc.tasks.map((t) => (t.id === taskId ? task : t)),
    leads: doc.leads.map((l) =>
      l.id === leadId ? { ...l, updatedAt: nowIso() } : l
    ),
  });
  return task;
}

async function blobDeleteTask(
  leadId: string,
  taskId: string
): Promise<boolean> {
  const doc = await readPartnerDocument();
  if (!doc.tasks.some((t) => t.id === taskId && t.leadId === leadId)) {
    return false;
  }
  await writePartnerDocument({
    ...doc,
    tasks: doc.tasks.filter((t) => t.id !== taskId),
    leads: doc.leads.map((l) =>
      l.id === leadId ? { ...l, updatedAt: nowIso() } : l
    ),
  });
  return true;
}

async function blobAddReminder(
  leadId: string,
  dueOn: string,
  note: string
): Promise<PartnerReminder | null> {
  const doc = await readPartnerDocument();
  if (!doc.leads.some((l) => l.id === leadId)) return null;
  const reminder: PartnerReminder = {
    id: newId("preminder"),
    leadId,
    dueOn: dueOn.slice(0, 10),
    note: note.trim(),
    createdAt: nowIso(),
  };
  await writePartnerDocument({
    ...doc,
    reminders: [...doc.reminders, reminder],
    leads: doc.leads.map((l) =>
      l.id === leadId ? { ...l, updatedAt: nowIso() } : l
    ),
  });
  return reminder;
}

async function blobDeleteReminder(
  leadId: string,
  reminderId: string
): Promise<boolean> {
  const doc = await readPartnerDocument();
  if (
    !doc.reminders.some((r) => r.id === reminderId && r.leadId === leadId)
  ) {
    return false;
  }
  await writePartnerDocument({
    ...doc,
    reminders: doc.reminders.filter((r) => r.id !== reminderId),
    leads: doc.leads.map((l) =>
      l.id === leadId ? { ...l, updatedAt: nowIso() } : l
    ),
  });
  return true;
}

async function blobGetFile(
  leadId: string,
  fileId: string
): Promise<PartnerFile | null> {
  const doc = await readPartnerDocument();
  return doc.files.find((f) => f.id === fileId && f.leadId === leadId) ?? null;
}

async function blobDeleteFile(
  leadId: string,
  fileId: string
): Promise<PartnerFile | null> {
  const doc = await readPartnerDocument();
  const file = doc.files.find((f) => f.id === fileId && f.leadId === leadId);
  if (!file) return null;
  await writePartnerDocument({
    ...doc,
    files: doc.files.filter((f) => f.id !== fileId),
    leads: doc.leads.map((l) =>
      l.id === leadId ? { ...l, updatedAt: nowIso() } : l
    ),
  });
  return file;
}

/* ---------------- Neon backend ---------------- */

function mapNeonLead(
  row: typeof partnerLeads.$inferSelect,
  status: PartnerStatus | null,
  notes: PartnerNote[],
  tasks: PartnerTask[],
  reminders: PartnerReminder[],
  files: PartnerFile[]
): PartnerLeadDetail {
  return mapDetail(
    {
      id: row.id,
      sourceCrmLeadId: row.sourceCrmLeadId,
      parcelId: row.parcelId,
      lrid: row.lrid,
      address: row.address,
      ownerName: row.ownerName,
      county: row.county,
      acres: row.acres,
      marketValue: row.marketValue,
      latitude: row.latitude,
      longitude: row.longitude,
      statusId: row.statusId,
      archivedAt: row.archivedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    },
    status,
    notes,
    tasks,
    reminders,
    files
  );
}

async function neonGetSettings(): Promise<PartnerSettings> {
  await ensureNeonSeeded();
  const db = getDb();
  const statuses = await db
    .select()
    .from(partnerStatuses)
    .orderBy(partnerStatuses.sortOrder);
  return { statuses: statuses as PartnerStatus[] };
}

async function neonPutSettings(
  settings: PartnerSettings
): Promise<PartnerSettings> {
  await ensureNeonSeeded();
  const db = getDb();
  const existing = await db.select().from(partnerStatuses);
  const nextIds = new Set(settings.statuses.map((s) => s.id));
  const defId =
    settings.statuses.find((s) => s.isDefault)?.id ??
    settings.statuses[0]?.id ??
    "";

  for (const old of existing) {
    if (!nextIds.has(old.id) && defId) {
      await db
        .update(partnerLeads)
        .set({ statusId: defId, updatedAt: nowIso() })
        .where(eq(partnerLeads.statusId, old.id));
    }
  }

  for (const [i, s] of settings.statuses.entries()) {
    const row = {
      id: s.id,
      name: s.name,
      color: s.color,
      sortOrder: s.sortOrder ?? i,
      isDefault: s.isDefault,
      isClosed: s.isClosed,
    };
    if (existing.some((e) => e.id === s.id)) {
      await db
        .update(partnerStatuses)
        .set(row)
        .where(eq(partnerStatuses.id, s.id));
    } else {
      await db.insert(partnerStatuses).values(row);
    }
  }
  for (const old of existing) {
    if (!nextIds.has(old.id)) {
      await db.delete(partnerStatuses).where(eq(partnerStatuses.id, old.id));
    }
  }
  return neonGetSettings();
}

async function neonListLeads(
  opts: ListPartnerLeadsOptions = {}
): Promise<{ leads: PartnerLeadDetail[]; settings: PartnerSettings }> {
  await ensureNeonSeeded();
  const db = getDb();
  const settings = await neonGetSettings();
  const statusMap = new Map(settings.statuses.map((s) => [s.id, s]));

  const conditions = [];
  if (!opts.includeArchived) conditions.push(isNull(partnerLeads.archivedAt));
  if (opts.statusId) conditions.push(eq(partnerLeads.statusId, opts.statusId));

  const rows = await db
    .select()
    .from(partnerLeads)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(partnerLeads.updatedAt));

  const [allNotes, allTasks, allReminders, allFiles] = await Promise.all([
    db.select().from(partnerNotes).orderBy(desc(partnerNotes.createdAt)),
    db.select().from(partnerTasks),
    db.select().from(partnerReminders),
    db.select().from(partnerFiles).orderBy(desc(partnerFiles.createdAt)),
  ]);

  let leads = rows.map((row) =>
    mapNeonLead(
      row,
      statusMap.get(row.statusId) ?? null,
      allNotes
        .filter((n) => n.leadId === row.id)
        .map((n) => ({
          ...n,
          kind: n.kind as PartnerNote["kind"],
        })),
      allTasks
        .filter((t) => t.leadId === row.id)
        .map((t) => ({ ...t })),
      allReminders
        .filter((r) => r.leadId === row.id)
        .map((r) => ({ ...r })),
      allFiles
        .filter((f) => f.leadId === row.id)
        .map((f) => ({ ...f }))
    )
  );

  if (opts.q?.trim()) {
    const needle = opts.q.trim().toLowerCase();
    leads = leads.filter((l) => {
      const hay = [
        l.address,
        l.ownerName,
        l.county,
        l.parcelId,
        l.lrid ?? "",
        ...l.notes.map((n) => n.body),
        ...l.tasks.map((t) => t.title),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    });
  }

  return { leads, settings };
}

async function neonGetLead(id: string): Promise<PartnerLeadDetail | null> {
  const { leads } = await neonListLeads({ includeArchived: true });
  return leads.find((l) => l.id === id) ?? null;
}

async function neonFindBySource(
  sourceCrmLeadId: string
): Promise<PartnerLeadDetail | null> {
  await ensureNeonSeeded();
  const db = getDb();
  const rows = await db
    .select()
    .from(partnerLeads)
    .where(eq(partnerLeads.sourceCrmLeadId, sourceCrmLeadId))
    .limit(1);
  if (!rows[0]) return null;
  return neonGetLead(rows[0].id);
}

async function neonCreateFromCrm(
  input: PartnerLeadInput
): Promise<PartnerLeadDetail> {
  const existing = await neonFindBySource(input.sourceCrmLeadId);
  if (existing) return existing;

  await ensureNeonSeeded();
  const db = getDb();
  const settings = await neonGetSettings();
  const statusId =
    settings.statuses.find((s) => s.isDefault)?.id ??
    settings.statuses[0]?.id ??
    "";
  const id = newId("plead");
  const now = nowIso();
  await db.insert(partnerLeads).values({
    id,
    sourceCrmLeadId: input.sourceCrmLeadId,
    parcelId: input.parcelId,
    lrid: input.lrid ?? null,
    address: input.address ?? "",
    ownerName: input.ownerName ?? "",
    county: input.county ?? "",
    acres: input.acres ?? null,
    marketValue: input.marketValue ?? null,
    latitude: input.latitude,
    longitude: input.longitude,
    statusId,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(partnerNotes).values({
    id: newId("pnote"),
    leadId: id,
    body: "Added from Power Poker CRM",
    kind: "system",
    createdAt: now,
  });
  const lead = await neonGetLead(id);
  if (!lead) throw new Error("Failed to create partner lead");
  return lead;
}

async function neonPatchLead(
  id: string,
  patch: PartnerLeadPatch
): Promise<PartnerLeadDetail | null> {
  await ensureNeonSeeded();
  const db = getDb();
  const rows = await db
    .select()
    .from(partnerLeads)
    .where(eq(partnerLeads.id, id))
    .limit(1);
  const prev = rows[0];
  if (!prev) return null;

  if (patch.statusId && patch.statusId !== prev.statusId) {
    const settings = await neonGetSettings();
    const from =
      settings.statuses.find((s) => s.id === prev.statusId)?.name ?? "Unknown";
    const to =
      settings.statuses.find((s) => s.id === patch.statusId)?.name ?? "Unknown";
    await db.insert(partnerNotes).values({
      id: newId("pnote"),
      leadId: id,
      body: `Moved from ${from} → ${to}`,
      kind: "system",
      createdAt: nowIso(),
    });
  }

  await db
    .update(partnerLeads)
    .set({ ...patch, updatedAt: nowIso() })
    .where(eq(partnerLeads.id, id));
  return neonGetLead(id);
}

async function neonDeleteLead(id: string): Promise<boolean> {
  await ensureNeonSeeded();
  const db = getDb();
  const rows = await db
    .select()
    .from(partnerLeads)
    .where(eq(partnerLeads.id, id))
    .limit(1);
  if (!rows[0]) return false;
  const files = await db
    .select()
    .from(partnerFiles)
    .where(eq(partnerFiles.leadId, id));
  await db.delete(partnerLeads).where(eq(partnerLeads.id, id));
  for (const file of files) {
    try {
      await del(file.blobPath);
    } catch (e) {
      console.error("partner file blob delete", e);
    }
  }
  return true;
}

async function neonAddNote(
  leadId: string,
  body: string,
  kind: "user" | "system" = "user"
): Promise<PartnerNote | null> {
  const lead = await neonGetLead(leadId);
  if (!lead) return null;
  const db = getDb();
  const note = {
    id: newId("pnote"),
    leadId,
    body: body.trim(),
    kind,
    createdAt: nowIso(),
  };
  await db.insert(partnerNotes).values(note);
  await db
    .update(partnerLeads)
    .set({ updatedAt: nowIso() })
    .where(eq(partnerLeads.id, leadId));
  return note as PartnerNote;
}

async function neonAddTask(
  leadId: string,
  title: string
): Promise<PartnerTask | null> {
  const lead = await neonGetLead(leadId);
  if (!lead) return null;
  const db = getDb();
  const now = nowIso();
  const task = {
    id: newId("ptask"),
    leadId,
    title: title.trim(),
    done: false,
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(partnerTasks).values(task);
  await db
    .update(partnerLeads)
    .set({ updatedAt: now })
    .where(eq(partnerLeads.id, leadId));
  return task;
}

async function neonPatchTask(
  leadId: string,
  taskId: string,
  patch: Partial<{ title: string; done: boolean }>
): Promise<PartnerTask | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(partnerTasks)
    .where(and(eq(partnerTasks.id, taskId), eq(partnerTasks.leadId, leadId)))
    .limit(1);
  if (!rows[0]) return null;
  const updatedAt = nowIso();
  await db
    .update(partnerTasks)
    .set({ ...patch, updatedAt })
    .where(eq(partnerTasks.id, taskId));
  await db
    .update(partnerLeads)
    .set({ updatedAt })
    .where(eq(partnerLeads.id, leadId));
  return { ...rows[0], ...patch, updatedAt };
}

async function neonDeleteTask(
  leadId: string,
  taskId: string
): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .select()
    .from(partnerTasks)
    .where(and(eq(partnerTasks.id, taskId), eq(partnerTasks.leadId, leadId)))
    .limit(1);
  if (!rows[0]) return false;
  await db.delete(partnerTasks).where(eq(partnerTasks.id, taskId));
  await db
    .update(partnerLeads)
    .set({ updatedAt: nowIso() })
    .where(eq(partnerLeads.id, leadId));
  return true;
}

async function neonAddReminder(
  leadId: string,
  dueOn: string,
  note: string
): Promise<PartnerReminder | null> {
  const lead = await neonGetLead(leadId);
  if (!lead) return null;
  const db = getDb();
  const reminder = {
    id: newId("preminder"),
    leadId,
    dueOn: dueOn.slice(0, 10),
    note: note.trim(),
    createdAt: nowIso(),
  };
  await db.insert(partnerReminders).values(reminder);
  await db
    .update(partnerLeads)
    .set({ updatedAt: nowIso() })
    .where(eq(partnerLeads.id, leadId));
  return reminder;
}

async function neonDeleteReminder(
  leadId: string,
  reminderId: string
): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .select()
    .from(partnerReminders)
    .where(
      and(
        eq(partnerReminders.id, reminderId),
        eq(partnerReminders.leadId, leadId)
      )
    )
    .limit(1);
  if (!rows[0]) return false;
  await db.delete(partnerReminders).where(eq(partnerReminders.id, reminderId));
  await db
    .update(partnerLeads)
    .set({ updatedAt: nowIso() })
    .where(eq(partnerLeads.id, leadId));
  return true;
}

async function neonGetFile(
  leadId: string,
  fileId: string
): Promise<PartnerFile | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(partnerFiles)
    .where(and(eq(partnerFiles.id, fileId), eq(partnerFiles.leadId, leadId)))
    .limit(1);
  return rows[0] ?? null;
}

async function neonDeleteFile(
  leadId: string,
  fileId: string
): Promise<PartnerFile | null> {
  const file = await neonGetFile(leadId, fileId);
  if (!file) return null;
  const db = getDb();
  await db.delete(partnerFiles).where(eq(partnerFiles.id, fileId));
  await db
    .update(partnerLeads)
    .set({ updatedAt: nowIso() })
    .where(eq(partnerLeads.id, leadId));
  return file;
}

/* ---------------- File blob helpers ---------------- */

function partnerFileBlobPath(leadId: string, fileId: string, name: string) {
  const safe = name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80);
  return `power-poker/partner-files/${leadId}/${fileId}-${safe}`;
}

export async function uploadPartnerFile(
  leadId: string,
  file: File
): Promise<PartnerFile> {
  if (file.size > PARTNER_FILE_MAX_BYTES) {
    throw new Error("File exceeds 20 MB limit");
  }
  if (isBlockedUploadFilename(file.name)) {
    throw new Error("This file type is not allowed");
  }
  const lead = await getPartnerLead(leadId);
  if (!lead) throw new Error("Lead not found");
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error("BLOB_READ_WRITE_TOKEN is not configured");
  }

  const fileId = newId("pfile");
  const blobPath = partnerFileBlobPath(leadId, fileId, file.name);
  const bytes = Buffer.from(await file.arrayBuffer());
  await put(blobPath, bytes, {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: file.type || "application/octet-stream",
  });

  const meta = {
    name: file.name,
    contentType: file.type || "application/octet-stream",
    size: file.size,
    blobPath,
  };

  // Insert with predetermined id by writing through store then patching id —
  // easier: insert then update blobPath was set with fileId; store with that id.
  if (useNeon()) {
    const db = getDb();
    const row = {
      id: fileId,
      leadId,
      ...meta,
      createdAt: nowIso(),
    };
    await db.insert(partnerFiles).values(row);
    await db
      .update(partnerLeads)
      .set({ updatedAt: nowIso() })
      .where(eq(partnerLeads.id, leadId));
    return row;
  }

  const doc = await readPartnerDocument();
  const row: PartnerFile = {
    id: fileId,
    leadId,
    ...meta,
    createdAt: nowIso(),
  };
  await writePartnerDocument({
    ...doc,
    files: [...doc.files, row],
    leads: doc.leads.map((l) =>
      l.id === leadId ? { ...l, updatedAt: nowIso() } : l
    ),
  });
  return row;
}

export async function downloadPartnerFileBytes(
  leadId: string,
  fileId: string
): Promise<{ file: PartnerFile; body: Uint8Array } | null> {
  const file = useNeon()
    ? await neonGetFile(leadId, fileId)
    : await blobGetFile(leadId, fileId);
  if (!file) return null;
  const result = await get(file.blobPath, {
    access: "private",
    useCache: false,
  });
  if (!result?.stream) return null;
  const buf = new Uint8Array(await new Response(result.stream).arrayBuffer());
  return { file, body: buf };
}

export async function removePartnerFile(
  leadId: string,
  fileId: string
): Promise<boolean> {
  const file = useNeon()
    ? await neonDeleteFile(leadId, fileId)
    : await blobDeleteFile(leadId, fileId);
  if (!file) return false;
  try {
    await del(file.blobPath);
  } catch (e) {
    console.error("partner file blob delete", e);
  }
  return true;
}

/* ---------------- Public API ---------------- */

export function partnerBackend(): "neon" | "blob" {
  return useNeon() ? "neon" : "blob";
}

export async function getPartnerSettings(): Promise<PartnerSettings> {
  return useNeon() ? neonGetSettings() : blobGetSettings();
}

export async function putPartnerSettings(
  settings: PartnerSettings
): Promise<PartnerSettings> {
  return useNeon() ? neonPutSettings(settings) : blobPutSettings(settings);
}

export async function listPartnerLeads(opts: ListPartnerLeadsOptions = {}) {
  return useNeon() ? neonListLeads(opts) : blobListLeads(opts);
}

export async function getPartnerLead(id: string) {
  return useNeon() ? neonGetLead(id) : blobGetLead(id);
}

export async function findPartnerLeadBySource(sourceCrmLeadId: string) {
  return useNeon()
    ? neonFindBySource(sourceCrmLeadId)
    : blobFindBySource(sourceCrmLeadId);
}

export async function createPartnerLeadFromCrm(input: PartnerLeadInput) {
  return useNeon() ? neonCreateFromCrm(input) : blobCreateFromCrm(input);
}

export async function patchPartnerLead(id: string, patch: PartnerLeadPatch) {
  return useNeon() ? neonPatchLead(id, patch) : blobPatchLead(id, patch);
}

export async function deletePartnerLead(id: string) {
  return useNeon() ? neonDeleteLead(id) : blobDeleteLead(id);
}

/**
 * When CL1 updates a main CRM lead that was sent to Partner CRM, push the
 * shared parcel fields onto the partner copy (status / notes stay separate).
 */
export async function syncPartnerLeadSharedFieldsFromCrm(
  sourceCrmLeadId: string,
  patch: PartnerSharedFieldPatch
): Promise<PartnerLeadDetail | null> {
  const shared: PartnerSharedFieldPatch = {};
  if (patch.parcelId !== undefined) shared.parcelId = patch.parcelId;
  if (patch.lrid !== undefined) shared.lrid = patch.lrid;
  if (patch.address !== undefined) shared.address = patch.address;
  if (patch.ownerName !== undefined) shared.ownerName = patch.ownerName;
  if (patch.county !== undefined) shared.county = patch.county;
  if (patch.acres !== undefined) shared.acres = patch.acres;
  if (patch.marketValue !== undefined) shared.marketValue = patch.marketValue;
  if (patch.latitude !== undefined) shared.latitude = patch.latitude;
  if (patch.longitude !== undefined) shared.longitude = patch.longitude;
  if (Object.keys(shared).length === 0) return null;

  const existing = await findPartnerLeadBySource(sourceCrmLeadId);
  if (!existing) return null;
  return patchPartnerLead(existing.id, shared);
}

export async function addPartnerNote(
  leadId: string,
  body: string,
  kind: "user" | "system" = "user"
) {
  return useNeon()
    ? neonAddNote(leadId, body, kind)
    : blobAddNote(leadId, body, kind);
}

export async function addPartnerTask(leadId: string, title: string) {
  return useNeon() ? neonAddTask(leadId, title) : blobAddTask(leadId, title);
}

export async function patchPartnerTask(
  leadId: string,
  taskId: string,
  patch: Partial<{ title: string; done: boolean }>
) {
  return useNeon()
    ? neonPatchTask(leadId, taskId, patch)
    : blobPatchTask(leadId, taskId, patch);
}

export async function deletePartnerTask(leadId: string, taskId: string) {
  return useNeon()
    ? neonDeleteTask(leadId, taskId)
    : blobDeleteTask(leadId, taskId);
}

export async function addPartnerReminder(
  leadId: string,
  dueOn: string,
  note: string
) {
  return useNeon()
    ? neonAddReminder(leadId, dueOn, note)
    : blobAddReminder(leadId, dueOn, note);
}

export async function deletePartnerReminder(
  leadId: string,
  reminderId: string
) {
  return useNeon()
    ? neonDeleteReminder(leadId, reminderId)
    : blobDeleteReminder(leadId, reminderId);
}
