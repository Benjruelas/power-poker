export type PartnerStatus = {
  id: string;
  name: string;
  color: string;
  sortOrder: number;
  isDefault: boolean;
  isClosed: boolean;
};

export type PartnerNote = {
  id: string;
  leadId: string;
  body: string;
  kind: "user" | "system";
  createdAt: string;
};

export type PartnerTask = {
  id: string;
  leadId: string;
  title: string;
  done: boolean;
  createdAt: string;
  updatedAt: string;
};

export type PartnerReminder = {
  id: string;
  leadId: string;
  dueOn: string; // YYYY-MM-DD
  note: string;
  createdAt: string;
};

export type PartnerFile = {
  id: string;
  leadId: string;
  name: string;
  contentType: string;
  size: number;
  blobPath: string;
  createdAt: string;
};

export type PartnerLead = {
  id: string;
  /** Source internal CRM lead id (unique; one send per internal lead). */
  sourceCrmLeadId: string;
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
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PartnerLeadDetail = PartnerLead & {
  status: PartnerStatus | null;
  notes: PartnerNote[];
  tasks: PartnerTask[];
  reminders: PartnerReminder[];
  files: PartnerFile[];
};

export type PartnerSettings = {
  statuses: PartnerStatus[];
};

export type PartnerLeadInput = {
  sourceCrmLeadId: string;
  parcelId: string;
  lrid?: string | null;
  address?: string;
  ownerName?: string;
  county?: string;
  acres?: number | null;
  marketValue?: number | null;
  latitude: number;
  longitude: number;
};

export type PartnerLeadPatch = Partial<{
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
  archivedAt: string | null;
}>;

/** Fields copied from the main (CL1) CRM onto a partner (CL2) lead. */
export type PartnerSharedFieldPatch = Partial<{
  parcelId: string;
  lrid: string | null;
  address: string;
  ownerName: string;
  county: string;
  acres: number | null;
  marketValue: number | null;
  latitude: number;
  longitude: number;
}>;

export type ListPartnerLeadsOptions = {
  statusId?: string;
  q?: string;
  includeArchived?: boolean;
};
