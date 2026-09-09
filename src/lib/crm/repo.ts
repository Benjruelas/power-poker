import { and, desc, eq, isNull } from "drizzle-orm";

import {
  contactSearchText,
  normalizeCrmContact,
  prepareContactInput,
} from "./contacts";
import { DEFAULT_CRM_STATUSES, newId } from "./defaults";
import { getDb, hasDatabaseUrl } from "./db";
import {
  defaultStatusId,
  getSettingsFromDoc,
  readCrmDocument,
  writeCrmDocument,
  type CrmDocument,
} from "./blobStore";
import {
  crmContacts,
  crmCustomFields,
  crmLeads,
  crmNotes,
  crmStatuses,
} from "./schema";
import type {
  CrmContact,
  CrmContactInput,
  CrmCustomField,
  CrmLead,
  CrmLeadDetail,
  CrmLeadInput,
  CrmLeadPatch,
  CrmNote,
  CrmSettings,
  CrmStatus,
  ListLeadsOptions,
  SeedParcelItem,
} from "./types";

function nowIso() {
  return new Date().toISOString();
}

function leadMatchesQuery(lead: CrmLead, q: string, doc: CrmDocument): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const hay = [
    lead.address,
    lead.ownerName,
    lead.county,
    lead.parcelId,
    lead.lrid ?? "",
    ...Object.values(lead.fieldValues ?? {}),
  ]
    .join(" ")
    .toLowerCase();
  if (hay.includes(needle)) return true;
  const contacts = doc.contacts.filter((c) => c.leadId === lead.id);
  if (contacts.some((c) => contactSearchText(normalizeCrmContact(c)).includes(needle))) {
    return true;
  }
  const notes = doc.notes.filter((n) => n.leadId === lead.id);
  return notes.some((n) => n.body.toLowerCase().includes(needle));
}

async function ensureNeonSeeded() {
  const db = getDb();
  const existing = await db.select().from(crmStatuses).limit(1);
  if (existing.length > 0) return;
  const statuses = DEFAULT_CRM_STATUSES.map((s) => ({
    ...s,
    id: newId("status"),
  }));
  await db.insert(crmStatuses).values(statuses);
}

/* ---------------- Blob backend ---------------- */

async function blobGetSettings(): Promise<CrmSettings> {
  const doc = await readCrmDocument();
  return getSettingsFromDoc(doc);
}

async function blobPutSettings(settings: CrmSettings): Promise<CrmSettings> {
  const doc = await readCrmDocument();
  let statuses = settings.statuses.map((s, i) => ({
    ...s,
    sortOrder: s.sortOrder ?? i,
  }));
  if (!statuses.some((s) => s.isDefault) && statuses[0]) {
    statuses = statuses.map((s, i) => ({ ...s, isDefault: i === 0 }));
  }
  // Remap leads whose status was deleted to default
  const statusIds = new Set(statuses.map((s) => s.id));
  const def =
    statuses.find((s) => s.isDefault)?.id ?? statuses[0]?.id ?? "";
  const leads = doc.leads.map((l) =>
    statusIds.has(l.statusId) ? l : { ...l, statusId: def, updatedAt: nowIso() }
  );
  const next = await writeCrmDocument({
    ...doc,
    version: doc.version + 1,
    statuses,
    customFields: settings.customFields.map((f, i) => ({
      ...f,
      sortOrder: f.sortOrder ?? i,
      options: f.options ?? [],
    })),
    leads,
  });
  return getSettingsFromDoc(next);
}

async function blobListLeads(
  opts: ListLeadsOptions = {}
): Promise<{ leads: CrmLeadDetail[]; settings: CrmSettings }> {
  const doc = await readCrmDocument();
  const settings = getSettingsFromDoc(doc);
  const statusMap = new Map(doc.statuses.map((s) => [s.id, s]));
  let leads = doc.leads.filter((l) =>
    opts.includeArchived ? true : !l.archivedAt
  );
  if (opts.statusId) {
    leads = leads.filter((l) => l.statusId === opts.statusId);
  }
  if (opts.q?.trim()) {
    leads = leads.filter((l) => leadMatchesQuery(l, opts.q!, doc));
  }
  leads = [...leads].sort(
    (a, b) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
  const details: CrmLeadDetail[] = leads.map((l) => ({
    ...l,
    status: statusMap.get(l.statusId) ?? null,
    contacts: doc.contacts
      .filter((c) => c.leadId === l.id)
      .map((c) => normalizeCrmContact(c))
      .sort((a, b) => a.name.localeCompare(b.name)),
    notes: doc.notes
      .filter((n) => n.leadId === l.id)
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ),
  }));
  return { leads: details, settings };
}

async function blobGetLead(id: string): Promise<CrmLeadDetail | null> {
  const { leads } = await blobListLeads({ includeArchived: true });
  return leads.find((l) => l.id === id) ?? null;
}

async function blobUpsertLead(input: CrmLeadInput): Promise<CrmLeadDetail> {
  const doc = await readCrmDocument();
  const statusId =
    input.statusId ||
    defaultStatusId(doc) ||
    doc.statuses[0]?.id ||
    "";
  const existing = doc.leads.find(
    (l) =>
      l.parcelId === input.parcelId ||
      (!!input.lrid && (l.lrid === input.lrid || l.parcelId === input.lrid)) ||
      (!!l.lrid && l.lrid === input.parcelId)
  );
  const ts = nowIso();
  let lead: CrmLead;
  let notes = [...doc.notes];
  if (existing) {
    lead = {
      ...existing,
      lrid: input.lrid ?? existing.lrid,
      address: input.address ?? existing.address,
      ownerName: input.ownerName ?? existing.ownerName,
      county: input.county ?? existing.county,
      acres: input.acres !== undefined ? input.acres : existing.acres,
      marketValue:
        input.marketValue !== undefined
          ? input.marketValue
          : existing.marketValue,
      latitude: input.latitude ?? existing.latitude,
      longitude: input.longitude ?? existing.longitude,
      fieldValues: {
        ...existing.fieldValues,
        ...(input.fieldValues ?? {}),
      },
      // Un-archive if re-added via Yes
      archivedAt: null,
      updatedAt: ts,
    };
    if (input.note?.trim()) {
      notes.push({
        id: newId("note"),
        leadId: lead.id,
        body: input.note.trim(),
        kind: "user",
        createdAt: ts,
      });
    }
  } else {
    lead = {
      id: newId("lead"),
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
      followUpOn: input.followUpOn ?? null,
      archivedAt: null,
      fieldValues: input.fieldValues ?? {},
      createdAt: ts,
      updatedAt: ts,
    };
    notes.push({
      id: newId("note"),
      leadId: lead.id,
      body: "Lead created",
      kind: "system",
      createdAt: ts,
    });
    if (input.note?.trim()) {
      notes.push({
        id: newId("note"),
        leadId: lead.id,
        body: input.note.trim(),
        kind: "user",
        createdAt: ts,
      });
    }
  }
  const leads = existing
    ? doc.leads.map((l) => (l.id === lead.id ? lead : l))
    : [...doc.leads, lead];
  const next = await writeCrmDocument({
    ...doc,
    version: doc.version + 1,
    leads,
    notes,
  });
  const status = next.statuses.find((s) => s.id === lead.statusId) ?? null;
  return {
    ...lead,
    status,
    contacts: next.contacts
      .filter((c) => c.leadId === lead.id)
      .map((c) => normalizeCrmContact(c)),
    notes: next.notes
      .filter((n) => n.leadId === lead.id)
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ),
  };
}

async function blobPatchLead(
  id: string,
  patch: CrmLeadPatch
): Promise<CrmLeadDetail | null> {
  const doc = await readCrmDocument();
  const idx = doc.leads.findIndex((l) => l.id === id);
  if (idx < 0) return null;
  const prev = doc.leads[idx]!;
  const ts = nowIso();
  let notes = [...doc.notes];
  if (patch.statusId && patch.statusId !== prev.statusId) {
    const from =
      doc.statuses.find((s) => s.id === prev.statusId)?.name ?? "Unknown";
    const to =
      doc.statuses.find((s) => s.id === patch.statusId)?.name ?? "Unknown";
    notes.push({
      id: newId("note"),
      leadId: id,
      body: `Status changed: ${from} → ${to}`,
      kind: "system",
      createdAt: ts,
    });
  }
  const lead: CrmLead = {
    ...prev,
    ...patch,
    fieldValues: patch.fieldValues
      ? { ...prev.fieldValues, ...patch.fieldValues }
      : prev.fieldValues,
    updatedAt: ts,
  };
  const leads = [...doc.leads];
  leads[idx] = lead;
  const next = await writeCrmDocument({
    ...doc,
    version: doc.version + 1,
    leads,
    notes,
  });
  return {
    ...lead,
    status: next.statuses.find((s) => s.id === lead.statusId) ?? null,
    contacts: next.contacts
      .filter((c) => c.leadId === id)
      .map((c) => normalizeCrmContact(c)),
    notes: next.notes
      .filter((n) => n.leadId === id)
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ),
  };
}

async function blobDeleteLead(id: string): Promise<boolean> {
  const doc = await readCrmDocument();
  if (!doc.leads.some((l) => l.id === id)) return false;
  await writeCrmDocument({
    ...doc,
    version: doc.version + 1,
    leads: doc.leads.filter((l) => l.id !== id),
    contacts: doc.contacts.filter((c) => c.leadId !== id),
    notes: doc.notes.filter((n) => n.leadId !== id),
  });
  return true;
}

async function blobAddNote(
  leadId: string,
  body: string,
  kind: "user" | "system" = "user"
): Promise<CrmNote | null> {
  const doc = await readCrmDocument();
  if (!doc.leads.some((l) => l.id === leadId)) return null;
  const note: CrmNote = {
    id: newId("note"),
    leadId,
    body: body.trim(),
    kind,
    createdAt: nowIso(),
  };
  const leads = doc.leads.map((l) =>
    l.id === leadId ? { ...l, updatedAt: nowIso() } : l
  );
  await writeCrmDocument({
    ...doc,
    version: doc.version + 1,
    leads,
    notes: [...doc.notes, note],
  });
  return note;
}

async function blobAddContact(
  leadId: string,
  input: CrmContactInput
): Promise<CrmContact | null> {
  const doc = await readCrmDocument();
  if (!doc.leads.some((l) => l.id === leadId)) return null;
  const ts = nowIso();
  const prepared = prepareContactInput(input);
  const contact: CrmContact = {
    id: newId("contact"),
    leadId,
    name: prepared.name,
    role: prepared.role ?? "",
    phones: prepared.phones ?? [],
    emails: prepared.emails ?? [],
    address: prepared.address ?? "",
    createdAt: ts,
    updatedAt: ts,
  };
  await writeCrmDocument({
    ...doc,
    version: doc.version + 1,
    contacts: [...doc.contacts, contact],
    leads: doc.leads.map((l) =>
      l.id === leadId ? { ...l, updatedAt: ts } : l
    ),
  });
  return contact;
}

async function blobPatchContact(
  leadId: string,
  contactId: string,
  input: Partial<CrmContactInput>
): Promise<CrmContact | null> {
  const doc = await readCrmDocument();
  const idx = doc.contacts.findIndex(
    (c) => c.id === contactId && c.leadId === leadId
  );
  if (idx < 0) return null;
  const ts = nowIso();
  const prev = normalizeCrmContact(doc.contacts[idx]!);
  const prepared = prepareContactInput({ ...prev, ...input, name: input.name ?? prev.name });
  const contact: CrmContact = {
    ...prev,
    ...prepared,
    updatedAt: ts,
  };
  const contacts = [...doc.contacts];
  contacts[idx] = contact;
  await writeCrmDocument({
    ...doc,
    version: doc.version + 1,
    contacts,
    leads: doc.leads.map((l) =>
      l.id === leadId ? { ...l, updatedAt: ts } : l
    ),
  });
  return contact;
}

async function blobDeleteContact(
  leadId: string,
  contactId: string
): Promise<boolean> {
  const doc = await readCrmDocument();
  const before = doc.contacts.length;
  const contacts = doc.contacts.filter(
    (c) => !(c.id === contactId && c.leadId === leadId)
  );
  if (contacts.length === before) return false;
  await writeCrmDocument({
    ...doc,
    version: doc.version + 1,
    contacts,
  });
  return true;
}

async function blobSeedFromYesList(
  items: SeedParcelItem[]
): Promise<{ created: number; skipped: number }> {
  let created = 0;
  let skipped = 0;
  for (const item of items) {
    const doc = await readCrmDocument();
    const exists = doc.leads.some(
      (l) =>
        l.parcelId === item.parcelId ||
        (!!item.lrid && (l.lrid === item.lrid || l.parcelId === item.lrid))
    );
    if (exists) {
      skipped += 1;
      continue;
    }
    await blobUpsertLead({
      parcelId: item.parcelId,
      lrid: item.lrid,
      address: item.address,
      ownerName: item.ownerName,
      county: item.county,
      acres: item.acres,
      marketValue: item.marketValue,
      latitude: item.latitude,
      longitude: item.longitude,
      note: item.note,
    });
    created += 1;
  }
  return { created, skipped };
}

async function blobLeadCount(): Promise<number> {
  const doc = await readCrmDocument();
  return doc.leads.filter((l) => !l.archivedAt).length;
}

/* ---------------- Neon backend ---------------- */

function mapLeadRow(
  row: typeof crmLeads.$inferSelect,
  status: CrmStatus | null,
  contacts: CrmContact[],
  notes: CrmNote[]
): CrmLeadDetail {
  return {
    id: row.id,
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
    followUpOn: row.followUpOn,
    archivedAt: row.archivedAt,
    fieldValues: row.fieldValues ?? {},
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    status,
    contacts,
    notes,
  };
}

async function neonGetSettings(): Promise<CrmSettings> {
  await ensureNeonSeeded();
  const db = getDb();
  const [statuses, fields] = await Promise.all([
    db.select().from(crmStatuses).orderBy(crmStatuses.sortOrder),
    db.select().from(crmCustomFields).orderBy(crmCustomFields.sortOrder),
  ]);
  return {
    statuses: statuses as CrmStatus[],
    customFields: fields.map((f) => ({
      ...f,
      type: f.type as CrmCustomField["type"],
      options: f.options ?? [],
    })),
  };
}

async function neonPutSettings(settings: CrmSettings): Promise<CrmSettings> {
  await ensureNeonSeeded();
  const db = getDb();
  const existingStatuses = await db.select().from(crmStatuses);
  const existingFields = await db.select().from(crmCustomFields);
  const nextStatusIds = new Set(settings.statuses.map((s) => s.id));
  const nextFieldIds = new Set(settings.customFields.map((f) => f.id));
  const defId =
    settings.statuses.find((s) => s.isDefault)?.id ??
    settings.statuses[0]?.id ??
    "";

  // Remap leads off statuses that will be removed
  for (const old of existingStatuses) {
    if (!nextStatusIds.has(old.id) && defId) {
      await db
        .update(crmLeads)
        .set({ statusId: defId, updatedAt: nowIso() })
        .where(eq(crmLeads.statusId, old.id));
    }
  }

  // Upsert statuses
  for (const [i, s] of settings.statuses.entries()) {
    const row = {
      id: s.id,
      name: s.name,
      color: s.color,
      sortOrder: s.sortOrder ?? i,
      isDefault: s.isDefault,
      isClosed: s.isClosed,
    };
    const exists = existingStatuses.some((e) => e.id === s.id);
    if (exists) {
      await db.update(crmStatuses).set(row).where(eq(crmStatuses.id, s.id));
    } else {
      await db.insert(crmStatuses).values(row);
    }
  }
  for (const old of existingStatuses) {
    if (!nextStatusIds.has(old.id)) {
      await db.delete(crmStatuses).where(eq(crmStatuses.id, old.id));
    }
  }

  // Upsert custom fields
  for (const [i, f] of settings.customFields.entries()) {
    const row = {
      id: f.id,
      name: f.name,
      type: f.type,
      options: f.options ?? [],
      sortOrder: f.sortOrder ?? i,
    };
    const exists = existingFields.some((e) => e.id === f.id);
    if (exists) {
      await db
        .update(crmCustomFields)
        .set(row)
        .where(eq(crmCustomFields.id, f.id));
    } else {
      await db.insert(crmCustomFields).values(row);
    }
  }
  for (const old of existingFields) {
    if (!nextFieldIds.has(old.id)) {
      await db.delete(crmCustomFields).where(eq(crmCustomFields.id, old.id));
    }
  }

  return neonGetSettings();
}

async function neonListLeads(
  opts: ListLeadsOptions = {}
): Promise<{ leads: CrmLeadDetail[]; settings: CrmSettings }> {
  await ensureNeonSeeded();
  const db = getDb();
  const settings = await neonGetSettings();
  const statusMap = new Map(settings.statuses.map((s) => [s.id, s]));

  const conditions = [];
  if (!opts.includeArchived) {
    conditions.push(isNull(crmLeads.archivedAt));
  }
  if (opts.statusId) {
    conditions.push(eq(crmLeads.statusId, opts.statusId));
  }

  let rows = await db
    .select()
    .from(crmLeads)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(crmLeads.updatedAt));

  const leadIds = rows.map((r) => r.id);
  const [allContacts, allNotes] = await Promise.all([
    leadIds.length
      ? db.select().from(crmContacts)
      : Promise.resolve([] as (typeof crmContacts.$inferSelect)[]),
    leadIds.length
      ? db.select().from(crmNotes).orderBy(desc(crmNotes.createdAt))
      : Promise.resolve([] as (typeof crmNotes.$inferSelect)[]),
  ]);

  let leads = rows.map((row) =>
    mapLeadRow(
      row,
      statusMap.get(row.statusId) ?? null,
      allContacts
        .filter((c) => c.leadId === row.id)
        .map((c) => normalizeCrmContact(c)),
      allNotes
        .filter((n) => n.leadId === row.id)
        .map((n) => ({ ...n, kind: n.kind as CrmNote["kind"] }))
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
        ...Object.values(l.fieldValues ?? {}),
        ...l.contacts.flatMap((c) => [
          c.name,
          c.role,
          ...c.phones,
          ...c.emails,
        ]),
        ...l.notes.map((n) => n.body),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    });
  }

  return { leads, settings };
}

async function neonGetLead(id: string): Promise<CrmLeadDetail | null> {
  const { leads } = await neonListLeads({ includeArchived: true });
  return leads.find((l) => l.id === id) ?? null;
}

async function neonUpsertLead(input: CrmLeadInput): Promise<CrmLeadDetail> {
  await ensureNeonSeeded();
  const db = getDb();
  const settings = await neonGetSettings();
  const statusId =
    input.statusId ||
    settings.statuses.find((s) => s.isDefault)?.id ||
    settings.statuses[0]?.id ||
    "";
  const ts = nowIso();

  const existingRows = await db.select().from(crmLeads);
  const existing = existingRows.find(
    (l) =>
      l.parcelId === input.parcelId ||
      (!!input.lrid && (l.lrid === input.lrid || l.parcelId === input.lrid)) ||
      (!!l.lrid && l.lrid === input.parcelId)
  );

  if (existing) {
    await db
      .update(crmLeads)
      .set({
        lrid: input.lrid ?? existing.lrid,
        address: input.address ?? existing.address,
        ownerName: input.ownerName ?? existing.ownerName,
        county: input.county ?? existing.county,
        acres: input.acres !== undefined ? input.acres : existing.acres,
        marketValue:
          input.marketValue !== undefined
            ? input.marketValue
            : existing.marketValue,
        latitude: input.latitude ?? existing.latitude,
        longitude: input.longitude ?? existing.longitude,
        fieldValues: {
          ...(existing.fieldValues ?? {}),
          ...(input.fieldValues ?? {}),
        },
        archivedAt: null,
        updatedAt: ts,
      })
      .where(eq(crmLeads.id, existing.id));
    if (input.note?.trim()) {
      await db.insert(crmNotes).values({
        id: newId("note"),
        leadId: existing.id,
        body: input.note.trim(),
        kind: "user",
        createdAt: ts,
      });
    }
    return (await neonGetLead(existing.id))!;
  }

  const id = newId("lead");
  await db.insert(crmLeads).values({
    id,
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
    followUpOn: input.followUpOn ?? null,
    archivedAt: null,
    fieldValues: input.fieldValues ?? {},
    createdAt: ts,
    updatedAt: ts,
  });
  await db.insert(crmNotes).values({
    id: newId("note"),
    leadId: id,
    body: "Lead created",
    kind: "system",
    createdAt: ts,
  });
  if (input.note?.trim()) {
    await db.insert(crmNotes).values({
      id: newId("note"),
      leadId: id,
      body: input.note.trim(),
      kind: "user",
      createdAt: ts,
    });
  }
  return (await neonGetLead(id))!;
}

async function neonPatchLead(
  id: string,
  patch: CrmLeadPatch
): Promise<CrmLeadDetail | null> {
  await ensureNeonSeeded();
  const db = getDb();
  const [prev] = await db.select().from(crmLeads).where(eq(crmLeads.id, id));
  if (!prev) return null;
  const ts = nowIso();
  if (patch.statusId && patch.statusId !== prev.statusId) {
    const settings = await neonGetSettings();
    const from =
      settings.statuses.find((s) => s.id === prev.statusId)?.name ?? "Unknown";
    const to =
      settings.statuses.find((s) => s.id === patch.statusId)?.name ?? "Unknown";
    await db.insert(crmNotes).values({
      id: newId("note"),
      leadId: id,
      body: `Status changed: ${from} → ${to}`,
      kind: "system",
      createdAt: ts,
    });
  }
  await db
    .update(crmLeads)
    .set({
      ...patch,
      fieldValues: patch.fieldValues
        ? { ...(prev.fieldValues ?? {}), ...patch.fieldValues }
        : undefined,
      updatedAt: ts,
    })
    .where(eq(crmLeads.id, id));
  return neonGetLead(id);
}

async function neonDeleteLead(id: string): Promise<boolean> {
  const db = getDb();
  const [prev] = await db.select().from(crmLeads).where(eq(crmLeads.id, id));
  if (!prev) return false;
  await db.delete(crmNotes).where(eq(crmNotes.leadId, id));
  await db.delete(crmContacts).where(eq(crmContacts.leadId, id));
  await db.delete(crmLeads).where(eq(crmLeads.id, id));
  return true;
}

async function neonAddNote(
  leadId: string,
  body: string,
  kind: "user" | "system" = "user"
): Promise<CrmNote | null> {
  const db = getDb();
  const [lead] = await db.select().from(crmLeads).where(eq(crmLeads.id, leadId));
  if (!lead) return null;
  const ts = nowIso();
  const note = {
    id: newId("note"),
    leadId,
    body: body.trim(),
    kind,
    createdAt: ts,
  };
  await db.insert(crmNotes).values(note);
  await db
    .update(crmLeads)
    .set({ updatedAt: ts })
    .where(eq(crmLeads.id, leadId));
  return note as CrmNote;
}

async function neonAddContact(
  leadId: string,
  input: CrmContactInput
): Promise<CrmContact | null> {
  const db = getDb();
  const [lead] = await db.select().from(crmLeads).where(eq(crmLeads.id, leadId));
  if (!lead) return null;
  const ts = nowIso();
  const prepared = prepareContactInput(input);
  const contact: CrmContact = {
    id: newId("contact"),
    leadId,
    name: prepared.name,
    role: prepared.role ?? "",
    phones: prepared.phones ?? [],
    emails: prepared.emails ?? [],
    address: prepared.address ?? "",
    createdAt: ts,
    updatedAt: ts,
  };
  await db.insert(crmContacts).values(contact);
  await db
    .update(crmLeads)
    .set({ updatedAt: ts })
    .where(eq(crmLeads.id, leadId));
  return contact;
}

async function neonPatchContact(
  leadId: string,
  contactId: string,
  input: Partial<CrmContactInput>
): Promise<CrmContact | null> {
  const db = getDb();
  const [prev] = await db
    .select()
    .from(crmContacts)
    .where(and(eq(crmContacts.id, contactId), eq(crmContacts.leadId, leadId)));
  if (!prev) return null;
  const ts = nowIso();
  const prevContact = normalizeCrmContact(prev);
  const prepared = prepareContactInput({
    ...prevContact,
    ...input,
    name: input.name ?? prevContact.name,
  });
  await db
    .update(crmContacts)
    .set({ ...prepared, updatedAt: ts })
    .where(eq(crmContacts.id, contactId));
  await db
    .update(crmLeads)
    .set({ updatedAt: ts })
    .where(eq(crmLeads.id, leadId));
  const [next] = await db
    .select()
    .from(crmContacts)
    .where(eq(crmContacts.id, contactId));
  return next ? normalizeCrmContact(next) : null;
}

async function neonDeleteContact(
  leadId: string,
  contactId: string
): Promise<boolean> {
  const db = getDb();
  const [prev] = await db
    .select()
    .from(crmContacts)
    .where(and(eq(crmContacts.id, contactId), eq(crmContacts.leadId, leadId)));
  if (!prev) return false;
  await db.delete(crmContacts).where(eq(crmContacts.id, contactId));
  return true;
}

async function neonSeedFromYesList(
  items: SeedParcelItem[]
): Promise<{ created: number; skipped: number }> {
  let created = 0;
  let skipped = 0;
  for (const item of items) {
    const db = getDb();
    const rows = await db.select().from(crmLeads);
    const exists = rows.some(
      (l) =>
        l.parcelId === item.parcelId ||
        (!!item.lrid && (l.lrid === item.lrid || l.parcelId === item.lrid))
    );
    if (exists) {
      skipped += 1;
      continue;
    }
    await neonUpsertLead({
      parcelId: item.parcelId,
      lrid: item.lrid,
      address: item.address,
      ownerName: item.ownerName,
      county: item.county,
      acres: item.acres,
      marketValue: item.marketValue,
      latitude: item.latitude,
      longitude: item.longitude,
      note: item.note,
    });
    created += 1;
  }
  return { created, skipped };
}

async function neonLeadCount(): Promise<number> {
  await ensureNeonSeeded();
  const db = getDb();
  const rows = await db
    .select()
    .from(crmLeads)
    .where(isNull(crmLeads.archivedAt));
  return rows.length;
}

/* ---------------- Public API ---------------- */

function useNeon(): boolean {
  return hasDatabaseUrl();
}

export async function getCrmSettings(): Promise<CrmSettings> {
  return useNeon() ? neonGetSettings() : blobGetSettings();
}

export async function putCrmSettings(
  settings: CrmSettings
): Promise<CrmSettings> {
  return useNeon() ? neonPutSettings(settings) : blobPutSettings(settings);
}

export async function listCrmLeads(opts: ListLeadsOptions = {}) {
  return useNeon() ? neonListLeads(opts) : blobListLeads(opts);
}

export async function getCrmLead(id: string) {
  return useNeon() ? neonGetLead(id) : blobGetLead(id);
}

export async function upsertCrmLead(input: CrmLeadInput) {
  return useNeon() ? neonUpsertLead(input) : blobUpsertLead(input);
}

export async function patchCrmLead(id: string, patch: CrmLeadPatch) {
  return useNeon() ? neonPatchLead(id, patch) : blobPatchLead(id, patch);
}

export async function deleteCrmLead(id: string) {
  return useNeon() ? neonDeleteLead(id) : blobDeleteLead(id);
}

export async function addCrmNote(
  leadId: string,
  body: string,
  kind: "user" | "system" = "user"
) {
  return useNeon()
    ? neonAddNote(leadId, body, kind)
    : blobAddNote(leadId, body, kind);
}

export async function addCrmContact(leadId: string, input: CrmContactInput) {
  return useNeon()
    ? neonAddContact(leadId, input)
    : blobAddContact(leadId, input);
}

export async function patchCrmContact(
  leadId: string,
  contactId: string,
  input: Partial<CrmContactInput>
) {
  return useNeon()
    ? neonPatchContact(leadId, contactId, input)
    : blobPatchContact(leadId, contactId, input);
}

export async function deleteCrmContact(leadId: string, contactId: string) {
  return useNeon()
    ? neonDeleteContact(leadId, contactId)
    : blobDeleteContact(leadId, contactId);
}

export async function seedCrmFromYesList(items: SeedParcelItem[]) {
  return useNeon()
    ? neonSeedFromYesList(items)
    : blobSeedFromYesList(items);
}

export async function getCrmLeadCount() {
  return useNeon() ? neonLeadCount() : blobLeadCount();
}

export function crmBackend(): "neon" | "blob" {
  return useNeon() ? "neon" : "blob";
}
