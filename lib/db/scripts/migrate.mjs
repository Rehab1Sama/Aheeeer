import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;
const connectionString =
  process.env.SUPABASE_DB_URL ||
  process.env.SUPABASE_DATABASE_URL ||
  process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL must be set before running database migrations");
}

const pool = new Pool({
  connectionString,
  ssl:
    connectionString.includes("supabase") ||
    connectionString.includes("neon") ||
    (!connectionString.includes("localhost") &&
      !connectionString.includes("127.0.0.1") &&
      !connectionString.includes("helium"))
      ? { rejectUnauthorized: false }
      : undefined,
});

const migrationsDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../drizzle",
);
const migrationFiles = (await fs.readdir(migrationsDir))
  .filter((file) => file.endsWith(".sql"))
  .sort();

const client = await pool.connect();

// قفل على مستوى المعاملة (xact) لا الجلسة: مع مُجمّع اتصالات Supabase (وضع المعاملات) كان قفل الجلسة
// يبقى عالقًا على اتصال آخر بعد الإقلاع السابق، فيتوقف النشر التالي بخطأ انتهاء المهلة (57014).
// قفل المعاملة يُفك تلقائيًا مع COMMIT/ROLLBACK أيًّا كان الاتصال.
async function withMigrationLock(fn) {
  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL lock_timeout = '120s'");
    await client.query("SELECT pg_advisory_xact_lock(384921)");
    const result = await fn();
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  }
}

try {
  await withMigrationLock(() => client.query(`
    CREATE TABLE IF NOT EXISTS "__sana_migrations" (
      "filename" text PRIMARY KEY,
      "applied_at" timestamptz NOT NULL DEFAULT now()
    )
  `));

  for (const filename of migrationFiles) {
    const sql = await fs.readFile(path.join(migrationsDir, filename), "utf8");
    const statements = sql
      .split(/--> statement-breakpoint/g)
      .map((statement) => statement.trim())
      .filter(Boolean);

    const applied = await withMigrationLock(async () => {
      // يُفحص داخل القفل: إقلاعان متزامنان لا يطبّقان الملف مرتين
      const alreadyApplied = await client.query(
        `SELECT 1 FROM "__sana_migrations" WHERE "filename" = $1`,
        [filename],
      );
      if (alreadyApplied.rowCount) return false;
      for (const statement of statements) {
        await client.query(statement);
      }
      await client.query(
        `INSERT INTO "__sana_migrations" ("filename") VALUES ($1)`,
        [filename],
      );
      return true;
    });
    if (applied) console.log(`Applied database migration: ${filename}`);
  }

  console.log("Database migrations are up to date");
} finally {
  client.release();
  await pool.end();
}