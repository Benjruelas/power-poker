import type { PartnerStatus } from "./types";

export const DEFAULT_PARTNER_STATUSES: Omit<PartnerStatus, "id">[] = [
  {
    name: "New",
    color: "#059669",
    sortOrder: 0,
    isDefault: true,
    isClosed: false,
  },
  {
    name: "Working",
    color: "#2563eb",
    sortOrder: 1,
    isDefault: false,
    isClosed: false,
  },
  {
    name: "Waiting",
    color: "#d97706",
    sortOrder: 2,
    isDefault: false,
    isClosed: false,
  },
  {
    name: "Done",
    color: "#16a34a",
    sortOrder: 3,
    isDefault: false,
    isClosed: true,
  },
];

export function newId(prefix = ""): string {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return prefix ? `${prefix}_${id}` : id;
}

export const PARTNER_FILE_MAX_BYTES = 20 * 1024 * 1024;

const BLOCKED_EXTENSIONS = new Set([
  "exe",
  "bat",
  "cmd",
  "com",
  "msi",
  "scr",
  "ps1",
  "sh",
  "bash",
  "dll",
  "jar",
  "app",
  "dmg",
  "pkg",
  "deb",
  "rpm",
  "vbs",
  "js",
  "mjs",
  "cjs",
]);

export function isBlockedUploadFilename(name: string): boolean {
  const base = name.split(/[/\\]/).pop() ?? name;
  const dot = base.lastIndexOf(".");
  if (dot < 0) return false;
  const ext = base.slice(dot + 1).toLowerCase();
  return BLOCKED_EXTENSIONS.has(ext);
}
