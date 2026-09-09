/**
 * One-time migration: crm_contacts phone/email columns → phones/emails jsonb arrays.
 * Run: npm run db:migrate-contacts
 */
import { neon } from "@neondatabase/serverless";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.log("DATABASE_URL not set — skipping Neon contact migration");
    return;
  }

  const sql = neon(url);

  await sql`ALTER TABLE crm_contacts ADD COLUMN IF NOT EXISTS phones jsonb NOT NULL DEFAULT '[]'::jsonb`;
  await sql`ALTER TABLE crm_contacts ADD COLUMN IF NOT EXISTS emails jsonb NOT NULL DEFAULT '[]'::jsonb`;

  const legacy = await sql`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'crm_contacts'
      AND column_name IN ('phone', 'email')
  `;

  if (legacy.length > 0) {
    await sql`
      UPDATE crm_contacts
      SET phones = CASE
        WHEN phone IS NOT NULL AND phone != '' THEN jsonb_build_array(phone)
        ELSE '[]'::jsonb
      END
      WHERE phones = '[]'::jsonb OR phones IS NULL
    `;
    await sql`
      UPDATE crm_contacts
      SET emails = CASE
        WHEN email IS NOT NULL AND email != '' THEN jsonb_build_array(email)
        ELSE '[]'::jsonb
      END
      WHERE emails = '[]'::jsonb OR emails IS NULL
    `;
    await sql`ALTER TABLE crm_contacts DROP COLUMN IF EXISTS phone`;
    await sql`ALTER TABLE crm_contacts DROP COLUMN IF EXISTS email`;
    console.log("Migrated legacy phone/email columns to arrays");
  } else {
    console.log("No legacy phone/email columns — arrays already in place");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
