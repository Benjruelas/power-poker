import type { CrmCustomField, CrmStatus } from "./types";

export const DEFAULT_CRM_STATUSES: Omit<CrmStatus, "id">[] = [
  { name: "New", color: "#059669", sortOrder: 0, isDefault: true, isClosed: false },
  {
    name: "Researching",
    color: "#0d9488",
    sortOrder: 1,
    isDefault: false,
    isClosed: false,
  },
  {
    name: "Outreach",
    color: "#2563eb",
    sortOrder: 2,
    isDefault: false,
    isClosed: false,
  },
  {
    name: "In conversation",
    color: "#7c3aed",
    sortOrder: 3,
    isDefault: false,
    isClosed: false,
  },
  { name: "LOI", color: "#d97706", sortOrder: 4, isDefault: false, isClosed: false },
  {
    name: "Under contract",
    color: "#ea580c",
    sortOrder: 5,
    isDefault: false,
    isClosed: false,
  },
  {
    name: "Closed",
    color: "#16a34a",
    sortOrder: 6,
    isDefault: false,
    isClosed: true,
  },
  {
    name: "Passed",
    color: "#64748b",
    sortOrder: 7,
    isDefault: false,
    isClosed: true,
  },
];

export const DEFAULT_CUSTOM_FIELDS: Omit<CrmCustomField, "id">[] = [];

export function newId(prefix = ""): string {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return prefix ? `${prefix}_${id}` : id;
}
