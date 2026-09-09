import {
  boolean,
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const crmStatuses = pgTable("crm_statuses", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  color: text("color").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  isDefault: boolean("is_default").notNull().default(false),
  isClosed: boolean("is_closed").notNull().default(false),
});

export const crmCustomFields = pgTable("crm_custom_fields", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(), // text | number | date | select
  options: jsonb("options").$type<string[]>().notNull().default([]),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const crmLeads = pgTable(
  "crm_leads",
  {
    id: text("id").primaryKey(),
    parcelId: text("parcel_id").notNull(),
    lrid: text("lrid"),
    address: text("address").notNull().default(""),
    ownerName: text("owner_name").notNull().default(""),
    county: text("county").notNull().default(""),
    acres: doublePrecision("acres"),
    marketValue: doublePrecision("market_value"),
    latitude: doublePrecision("latitude").notNull(),
    longitude: doublePrecision("longitude").notNull(),
    statusId: text("status_id")
      .notNull()
      .references(() => crmStatuses.id),
    followUpOn: text("follow_up_on"),
    archivedAt: timestamp("archived_at", { withTimezone: true, mode: "string" }),
    fieldValues: jsonb("field_values")
      .$type<Record<string, string>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("crm_leads_parcel_id_uidx").on(t.parcelId)]
);

export const crmContacts = pgTable("crm_contacts", {
  id: text("id").primaryKey(),
  leadId: text("lead_id")
    .notNull()
    .references(() => crmLeads.id, { onDelete: "cascade" }),
  name: text("name").notNull().default(""),
  role: text("role").notNull().default(""),
  phones: jsonb("phones").$type<string[]>().notNull().default([]),
  emails: jsonb("emails").$type<string[]>().notNull().default([]),
  address: text("address").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
    .notNull()
    .defaultNow(),
});

export const crmNotes = pgTable("crm_notes", {
  id: text("id").primaryKey(),
  leadId: text("lead_id")
    .notNull()
    .references(() => crmLeads.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  kind: text("kind").notNull().default("user"), // user | system
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
    .notNull()
    .defaultNow(),
});
