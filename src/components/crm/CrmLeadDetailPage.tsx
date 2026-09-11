"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Archive,
  Mail,
  MapPinned,
  Pencil,
  Phone,
  Plus,
  Trash2,
  X,
} from "lucide-react";

import { CrmShell } from "@/components/crm/CrmShell";
import { PropertyRadarButton } from "@/components/parcel/PropertyRadarButton";
import {
  HeaderActionLink,
  headerBtnDestructiveClass,
  headerBtnOutlineClass,
} from "@/components/shared/appHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { contactToDraft, emptyContactDraft } from "@/lib/crm/contacts";
import { cn } from "@/lib/utils";
import type {
  CrmContact,
  CrmContactInput,
  CrmCustomField,
  CrmLeadDetail,
  CrmNote,
  CrmSettings,
} from "@/lib/crm/types";

function isOverdue(followUpOn: string | null): boolean {
  if (!followUpOn) return false;
  return followUpOn.slice(0, 10) < new Date().toISOString().slice(0, 10);
}

export function CrmLeadDetailPage({ leadId }: { leadId: string }) {
  const router = useRouter();
  const [lead, setLead] = useState<CrmLeadDetail | null>(null);
  const [settings, setSettings] = useState<CrmSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [showContactForm, setShowContactForm] = useState(false);
  const [editingContactId, setEditingContactId] = useState<string | null>(
    null
  );
  const [savingContact, setSavingContact] = useState(false);
  const [contactDraft, setContactDraft] = useState<CrmContactInput>(
    emptyContactDraft
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [leadRes, settingsRes] = await Promise.all([
        fetch(`/api/crm/leads/${leadId}`),
        fetch("/api/crm/settings"),
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

  const patch = async (body: Record<string, unknown>) => {
    if (!lead) return;
    const prev = lead;
    setLead({ ...lead, ...body } as CrmLeadDetail);
    try {
      const res = await fetch(`/api/crm/leads/${leadId}`, {
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

  const addNote = async () => {
    if (!noteBody.trim()) return;
    setSavingNote(true);
    try {
      const res = await fetch(`/api/crm/leads/${leadId}/notes`, {
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
      setSavingNote(false);
    }
  };

  const addContact = async () => {
    if (!contactDraft.name.trim()) return;
    setSavingContact(true);
    try {
      const res = await fetch(`/api/crm/leads/${leadId}/contacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(contactDraft),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to add contact");
        return;
      }
      setContactDraft(emptyContactDraft());
      setShowContactForm(false);
      await load();
    } finally {
      setSavingContact(false);
    }
  };

  const cancelContactForm = () => {
    setContactDraft(emptyContactDraft());
    setShowContactForm(false);
  };

  const startAddContact = () => {
    setEditingContactId(null);
    setContactDraft(emptyContactDraft());
    setShowContactForm(true);
  };

  const startEditContact = (contact: CrmContact) => {
    setShowContactForm(false);
    setEditingContactId(contact.id);
    setContactDraft(contactToDraft(contact));
  };

  const cancelContactEdit = () => {
    setEditingContactId(null);
    setContactDraft(emptyContactDraft());
  };

  const saveContactEdit = async () => {
    if (!editingContactId || !contactDraft.name.trim()) return;
    setSavingContact(true);
    try {
      const res = await fetch(`/api/crm/leads/${leadId}/contacts`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId: editingContactId,
          ...contactDraft,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to update contact");
        return;
      }
      setEditingContactId(null);
      setContactDraft(emptyContactDraft());
      await load();
    } finally {
      setSavingContact(false);
    }
  };

  const removeContact = async (contactId: string) => {
    if (!confirm("Delete this contact?")) return;
    await fetch(
      `/api/crm/leads/${leadId}/contacts?contactId=${encodeURIComponent(contactId)}`,
      { method: "DELETE" }
    );
    if (editingContactId === contactId) {
      setEditingContactId(null);
      setContactDraft(emptyContactDraft());
    }
    await load();
  };

  const archive = async () => {
    await patch({ archivedAt: new Date().toISOString() });
    router.push("/crm");
  };

  const remove = async () => {
    if (!confirm("Delete this lead permanently?")) return;
    const res = await fetch(`/api/crm/leads/${leadId}`, { method: "DELETE" });
    if (res.ok) router.push("/crm");
  };

  if (loading) {
    return (
      <CrmShell>
        <div className="flex h-full items-center justify-center pt-6 text-sm text-muted-foreground md:pt-8">
          Loading lead…
        </div>
      </CrmShell>
    );
  }

  if (!lead) {
    return (
      <CrmShell>
        <div className="flex h-full flex-col items-center justify-center gap-2">
          <p className="text-sm">{error || "Lead not found"}</p>
          <Link href="/crm" className="text-xs text-emerald-700 underline">
            Back to pipeline
          </Link>
        </div>
      </CrmShell>
    );
  }

  return (
    <CrmShell
      title={lead.address || lead.parcelId}
      actions={
        <>
          <HeaderActionLink
            href={`/?crmParcel=${encodeURIComponent(lead.parcelId)}&lat=${lead.latitude}&lng=${lead.longitude}${lead.lrid ? `&lrid=${encodeURIComponent(lead.lrid)}` : ""}`}
          >
            <MapPinned className="size-4" strokeWidth={2.5} />
            View on map
          </HeaderActionLink>
          <PropertyRadarButton
            variant="header"
            parcel={{
              address: lead.address,
              apn: lead.parcelId,
              county: lead.county,
              lat: lead.latitude,
              lng: lead.longitude,
            }}
          />
          <Button
            className={headerBtnOutlineClass}
            variant="outline"
            onClick={() => void archive()}
          >
            <Archive className="size-4" />
            Archive
          </Button>
          <Button
            className={headerBtnDestructiveClass}
            variant="destructive"
            onClick={() => void remove()}
          >
            <Trash2 className="size-4" />
            Delete
          </Button>
        </>
      }
    >
      <div className="h-full overflow-y-auto pt-6 md:pt-8">
        {error && (
          <div className="border-b bg-amber-50 px-4 py-2 text-xs text-amber-900">
            {error}
          </div>
        )}
        <div className="mx-auto grid max-w-5xl gap-6 px-4 pb-4 md:grid-cols-[1fr_320px]">
          <div className="space-y-6">
            <section className="space-y-3 rounded-xl border p-4">
              <h2 className="text-sm font-semibold">Parcel</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  label="Address"
                  value={lead.address}
                  onSave={(v) => void patch({ address: v })}
                />
                <Field
                  label="Owner"
                  value={lead.ownerName}
                  onSave={(v) => void patch({ ownerName: v })}
                />
                <Field
                  label="County"
                  value={lead.county}
                  onSave={(v) => void patch({ county: v })}
                />
                <Field
                  label="Acres"
                  value={lead.acres != null ? String(lead.acres) : ""}
                  onSave={(v) => {
                    const n = v.trim() === "" ? null : parseFloat(v);
                    void patch({
                      acres: n != null && Number.isFinite(n) ? n : null,
                    });
                  }}
                />
                <Field
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
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    Parcel ID
                  </Label>
                  <div className="rounded-lg border bg-muted/40 px-3 py-2 text-sm">
                    {lead.parcelId}
                  </div>
                </div>
              </div>
            </section>

            {(settings?.customFields?.length ?? 0) > 0 && (
              <section className="space-y-3 rounded-xl border p-4">
                <h2 className="text-sm font-semibold">Custom fields</h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  {settings!.customFields.map((f) => (
                    <CustomFieldInput
                      key={f.id}
                      field={f}
                      value={lead.fieldValues[f.id] ?? ""}
                      onSave={(v) =>
                        void patch({
                          fieldValues: { ...lead.fieldValues, [f.id]: v },
                        })
                      }
                    />
                  ))}
                </div>
              </section>
            )}

            <section className="space-y-3 rounded-xl border p-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">Contacts</h2>
                {!showContactForm && !editingContactId && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={startAddContact}
                  >
                    <Plus className="size-3.5" />
                    Add contact
                  </Button>
                )}
              </div>
              <ul className="space-y-2">
                {lead.contacts.length === 0 && !showContactForm && (
                  <li className="text-xs text-muted-foreground">
                    No contacts yet. Click Add contact to add owner or broker
                    info.
                  </li>
                )}
                {lead.contacts.map((c: CrmContact) =>
                  editingContactId === c.id ? (
                    <li key={c.id}>
                      <ContactForm
                        title="Edit contact"
                        saveLabel="Save changes"
                        draft={contactDraft}
                        saving={savingContact}
                        onChange={setContactDraft}
                        onSave={() => void saveContactEdit()}
                        onCancel={cancelContactEdit}
                      />
                    </li>
                  ) : (
                    <li
                      key={c.id}
                      className="flex items-start justify-between gap-2 rounded-lg border p-3"
                    >
                      <div className="min-w-0 space-y-1 text-sm">
                        <div className="font-medium">{c.name}</div>
                        {c.role ? (
                          <div className="text-xs text-muted-foreground">
                            {c.role}
                          </div>
                        ) : null}
                        {c.phones.map((phone) => (
                          <div
                            key={phone}
                            className="flex items-center gap-1.5 text-xs text-muted-foreground"
                          >
                            <Phone className="size-3 shrink-0" />
                            <a
                              href={`tel:${phone}`}
                              className="hover:underline"
                            >
                              {phone}
                            </a>
                          </div>
                        ))}
                        {c.emails.map((email) => (
                          <div
                            key={email}
                            className="flex items-center gap-1.5 text-xs text-muted-foreground"
                          >
                            <Mail className="size-3 shrink-0" />
                            <a
                              href={`mailto:${email}`}
                              className="hover:underline"
                            >
                              {email}
                            </a>
                          </div>
                        ))}
                        {c.address ? (
                          <div className="text-xs text-muted-foreground">
                            {c.address}
                          </div>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 gap-0.5">
                        <Button
                          size="icon-xs"
                          variant="ghost"
                          title="Edit contact"
                          onClick={() => startEditContact(c)}
                        >
                          <Pencil className="size-3" />
                        </Button>
                        <Button
                          size="icon-xs"
                          variant="ghost"
                          title="Delete contact"
                          onClick={() => void removeContact(c.id)}
                        >
                          <Trash2 className="size-3" />
                        </Button>
                      </div>
                    </li>
                  )
                )}
              </ul>
              {showContactForm && (
                <ContactForm
                  title="New contact"
                  saveLabel="Save contact"
                  draft={contactDraft}
                  saving={savingContact}
                  onChange={setContactDraft}
                  onSave={() => void addContact()}
                  onCancel={cancelContactForm}
                />
              )}
            </section>

            <section className="space-y-3 rounded-xl border p-4">
              <h2 className="text-sm font-semibold">Notes</h2>
              <div className="flex gap-2">
                <Input
                  placeholder="Add a note…"
                  value={noteBody}
                  onChange={(e) => setNoteBody(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void addNote();
                  }}
                />
                <Button
                  size="sm"
                  onClick={() => void addNote()}
                  disabled={savingNote || !noteBody.trim()}
                >
                  Add
                </Button>
              </div>
              <ul className="space-y-2">
                {lead.notes.map((n: CrmNote) => (
                  <li
                    key={n.id}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-sm",
                      n.kind === "system" && "bg-muted/40 text-muted-foreground"
                    )}
                  >
                    <div>{n.body}</div>
                    <div className="mt-1 text-[10px] text-muted-foreground">
                      {new Date(n.createdAt).toLocaleString()}
                      {n.kind === "system" ? " · system" : ""}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <aside className="space-y-4">
            <section className="space-y-3 rounded-xl border p-4">
              <h2 className="text-sm font-semibold">Pipeline</h2>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Status</Label>
                <select
                  className="h-8 w-full rounded-lg border bg-background px-2 text-sm"
                  value={lead.statusId}
                  onChange={(e) => void patch({ statusId: e.target.value })}
                >
                  {(settings?.statuses ?? []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label
                  className={cn(
                    "text-xs",
                    isOverdue(lead.followUpOn)
                      ? "font-medium text-red-600"
                      : "text-muted-foreground"
                  )}
                >
                  Follow-up date
                  {isOverdue(lead.followUpOn) ? " (overdue)" : ""}
                </Label>
                <Input
                  type="date"
                  value={lead.followUpOn?.slice(0, 10) ?? ""}
                  onChange={(e) =>
                    void patch({
                      followUpOn: e.target.value ? e.target.value : null,
                    })
                  }
                />
              </div>
            </section>
          </aside>
        </div>
      </div>
    </CrmShell>
  );
}

function Field({
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

function ContactForm({
  title = "New contact",
  saveLabel = "Save contact",
  draft,
  saving,
  onChange,
  onSave,
  onCancel,
}: {
  title?: string;
  saveLabel?: string;
  draft: CrmContactInput;
  saving: boolean;
  onChange: (draft: CrmContactInput) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const phones = draft.phones ?? [""];
  const emails = draft.emails ?? [""];

  const updatePhone = (index: number, value: string) => {
    onChange({
      ...draft,
      phones: phones.map((p, i) => (i === index ? value : p)),
    });
  };

  const updateEmail = (index: number, value: string) => {
    onChange({
      ...draft,
      emails: emails.map((e, i) => (i === index ? value : e)),
    });
  };

  return (
    <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
      <div className="text-xs font-medium text-muted-foreground">{title}</div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Input
          autoFocus
          placeholder="Name *"
          value={draft.name}
          onChange={(e) => onChange({ ...draft, name: e.target.value })}
        />
        <Input
          placeholder="Role (owner, broker, attorney…)"
          value={draft.role ?? ""}
          onChange={(e) => onChange({ ...draft, role: e.target.value })}
        />
      </div>

      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Phones</Label>
        {phones.map((phone, i) => (
          <div key={`phone-${i}`} className="flex gap-2">
            <Input
              placeholder="Phone"
              value={phone}
              onChange={(e) => updatePhone(i, e.target.value)}
            />
            {phones.length > 1 && (
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                onClick={() =>
                  onChange({
                    ...draft,
                    phones: phones.filter((_, j) => j !== i),
                  })
                }
              >
                <X className="size-3.5" />
              </Button>
            )}
          </div>
        ))}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs"
          onClick={() => onChange({ ...draft, phones: [...phones, ""] })}
        >
          <Plus className="size-3" />
          Add phone
        </Button>
      </div>

      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Emails</Label>
        {emails.map((email, i) => (
          <div key={`email-${i}`} className="flex gap-2">
            <Input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => updateEmail(i, e.target.value)}
            />
            {emails.length > 1 && (
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                onClick={() =>
                  onChange({
                    ...draft,
                    emails: emails.filter((_, j) => j !== i),
                  })
                }
              >
                <X className="size-3.5" />
              </Button>
            )}
          </div>
        ))}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs"
          onClick={() => onChange({ ...draft, emails: [...emails, ""] })}
        >
          <Plus className="size-3" />
          Add email
        </Button>
      </div>

      <Input
        placeholder="Mailing address (optional)"
        value={draft.address ?? ""}
        onChange={(e) => onChange({ ...draft, address: e.target.value })}
      />

      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={onSave}
          disabled={saving || !draft.name.trim()}
        >
          {saving ? "Saving…" : saveLabel}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={onCancel}
          disabled={saving}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

function CustomFieldInput({
  field,
  value,
  onSave,
}: {
  field: CrmCustomField;
  value: string;
  onSave: (v: string) => void;
}) {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);

  if (field.type === "select") {
    return (
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">{field.name}</Label>
        <select
          className="h-8 w-full rounded-lg border bg-background px-2 text-sm"
          value={local}
          onChange={(e) => {
            setLocal(e.target.value);
            onSave(e.target.value);
          }}
        >
          <option value="">—</option>
          {field.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{field.name}</Label>
      <Input
        type={
          field.type === "number"
            ? "number"
            : field.type === "date"
              ? "date"
              : "text"
        }
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => {
          if (local !== value) onSave(local);
        }}
      />
    </div>
  );
}
