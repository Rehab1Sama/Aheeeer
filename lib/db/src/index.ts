import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

const connectionString = process.env.SUPABASE_DB_URL || process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const isRemoteDb = connectionString.includes("supabase") ||
  connectionString.includes("neon") ||
  (!connectionString.includes("localhost") && !connectionString.includes("helium") && !connectionString.includes("127.0.0.1"));

export const pool = new Pool({
  connectionString,
  ...(isRemoteDb ? { ssl: { rejectUnauthorized: false } } : {}),
});

export const db = drizzle(pool, { schema });

export * from "./schema";
