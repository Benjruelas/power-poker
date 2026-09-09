import type { CrmContact, CrmContactInput } from "./types";

/** Normalize legacy single phone/email fields when reading stored contacts. */
export function normalizeCrmContact(
  raw: Partial<CrmContact> & { phone?: string; email?: string }
): CrmContact {
  const phones = Array.isArray(raw.phones)
    ? raw.phones.map((p) => String(p).trim()).filter(Boolean)
    : raw.phone?.trim()
      ? [raw.phone.trim()]
      : [];
  const emails = Array.isArray(raw.emails)
    ? raw.emails.map((e) => String(e).trim()).filter(Boolean)
    : raw.email?.trim()
      ? [raw.email.trim()]
      : [];

  return {
    id: raw.id ?? "",
    leadId: raw.leadId ?? "",
    name: raw.name ?? "",
    role: raw.role ?? "",
    phones,
    emails,
    address: raw.address ?? "",
    createdAt: raw.createdAt ?? new Date().toISOString(),
    updatedAt: raw.updatedAt ?? new Date().toISOString(),
  };
}

export function prepareContactInput(input: CrmContactInput): CrmContactInput {
  return {
    name: input.name.trim(),
    role: input.role?.trim() ?? "",
    phones: (input.phones ?? []).map((p) => p.trim()).filter(Boolean),
    emails: (input.emails ?? []).map((e) => e.trim()).filter(Boolean),
    address: input.address?.trim() ?? "",
  };
}

export function contactSearchText(contact: CrmContact): string {
  return [
    contact.name,
    contact.role,
    contact.address,
    ...contact.phones,
    ...contact.emails,
  ]
    .join(" ")
    .toLowerCase();
}

export const emptyContactDraft = (): CrmContactInput => ({
  name: "",
  role: "",
  phones: [""],
  emails: [""],
  address: "",
});

/** Convert a saved contact into an editable form draft. */
export function contactToDraft(contact: CrmContact): CrmContactInput {
  return {
    name: contact.name,
    role: contact.role,
    phones: contact.phones.length ? [...contact.phones] : [""],
    emails: contact.emails.length ? [...contact.emails] : [""],
    address: contact.address,
  };
}
