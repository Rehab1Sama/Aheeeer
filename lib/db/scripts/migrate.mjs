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

try {
  await client.query("SELECT pg_advisory_lock(384921)");
  await client.query(`
    CREATE TABLE IF NOT EXISTS "__sana_migrations" (
      "filename" text PRIMARY KEY,
      "applied_at" timestamptz NOT NULL DEFAULT now()
    )
  `);

  for (const filename of migrationFiles) {
    const alreadyApplied = await client.query(
      `SELECT 1 FROM "__sana_migrations" WHERE "filename" = $1`,
      [filename],
    );
    if (alreadyApplied.rowCount) continue;

    const sql = await fs.readFile(path.join(migrationsDir, filename), "utf8");
    const statements = sql
      .split(/--> statement-breakpoint/g)
      .map((statement) => statement.trim())
      .filter(Boolean);

    await client.query("BEGIN");
    try {
      for (const statement of statements) {
        await client.query(statement);
      }
      await client.query(
        `INSERT INTO "__sana_migrations" ("filename") VALUES ($1)`,
        [filename],
      );
      await client.query("COMMIT");
      console.log(`Applied database migration: ${filename}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }

  console.log("Database migrations are up to date");
} finally {
  await client.query("SELECT pg_advisory_unlock(384921)").catch(() => {});
  client.release();
  await pool.end();
}