export type CustomFieldType = "text" | "number" | "date" | "select";

export type CrmStatus = {
  id: string;
  name: string;
  color: string;
  sortOrder: number;
  isDefault: boolean;
  isClosed: boolean;
};

export type CrmCustomField = {
  id: string;
  name: string;
  type: CustomFieldType;
  options: string[];
  sortOrder: number;
};

export type CrmContact = {
  id: string;
  leadId: string;
  name: string;
  role: string;
  phones: string[];
  emails: string[];
  address: string;
  createdAt: string;
  updatedAt: string;
};

export type CrmNoteKind = "user" | "system";

export type CrmNote = {
  id: string;
  leadId: string;
  body: string;
  kind: CrmNoteKind;
  createdAt: string;
};

export type CrmLead = {
  id: string;
  parcelId: string;
  lrid: string | null;
  address: string;
  ownerName: string;
  county: string;
  acres: number | null;
  marketValue: number | null;
  latitude: number;
  longitude: number;
  statusId: string;
  followUpOn: string | null;
  archivedAt: string | null;
  fieldValues: Record<string, string>;
  createdAt: string;
  updatedAt: string;
};

export type CrmLeadDetail = CrmLead & {
  contacts: CrmContact[];
  notes: CrmNote[];
  status: CrmStatus | null;
};

export type CrmSettings = {
  statuses: CrmStatus[];
  customFields: CrmCustomField[];
};

export type CrmLeadInput = {
  parcelId: string;
  lrid?: string | null;
  address?: string;
  ownerName?: string;
  county?: string;
  acres?: number | null;
  marketValue?: number | null;
  latitude: number;
  longitude: number;
  statusId?: string;
  followUpOn?: string | null;
  note?: string;
  fieldValues?: Record<string, string>;
};

export type CrmLeadPatch = Partial<{
  address: string;
  ownerName: string;
  county: string;
  acres: number | null;
  marketValue: number | null;
  latitude: number;
  longitude: number;
  statusId: string;
  followUpOn: string | null;
  archivedAt: string | null;
  fieldValues: Record<string, string>;
  lrid: string | null;
}>;

export type CrmContactInput = {
  name: string;
  role?: string;
  phones?: string[];
  emails?: string[];
  address?: string;
};

export type ListLeadsOptions = {
  statusId?: string;
  q?: string;
  includeArchived?: boolean;
};

export type SeedParcelItem = {
  parcelId: string;
  lrid?: string;
  address: string;
  ownerName: string;
  county: string;
  acres: number | null;
  marketValue: number | null;
  latitude: number;
  longitude: number;
  note?: string;
};
