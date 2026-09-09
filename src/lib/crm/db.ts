import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

export function hasDatabaseUrl(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

function createDb() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not configured");
  }
  const sql = neon(url);
  return drizzle(sql, { schema });
}

let _db: ReturnType<typeof createDb> | null = null;

/** Lazy Neon + Drizzle client (safe for build time when env is unset). */
export function getDb() {
  if (!_db) _db = createDb();
  return _db;
}
