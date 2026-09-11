import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { circlesTable } from "../lib/db/src/schema/circles.js";
import { ne } from "drizzle-orm";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set");
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

const TRACKS = [
  "بريق",
  "إشراق",
  "سُنى",
  "ضياء",
  "وهج",
  "مهج",
  "مشكاة نور",
  "ألق",
  "سراج",
  "قبس",
  "البهور",
];

const ARABIC_NUMS = ["١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩", "١٠"];

async function seed() {
  const existing = await db.select({ name: circlesTable.name }).from(circlesTable);
  const existingNames = new Set(existing.map((c: { name: string }) => c.name));

  const toInsert: Array<typeof circlesTable.$inferInsert> = [];

  for (const track of TRACKS) {
    for (let i = 0; i < 10; i++) {
      const name = `${track} ${ARABIC_NUMS[i]}`;
      if (!existingNames.has(name)) {
        toInsert.push({
          name,
          track,
          trackType: "girls",
          isArchived: false,
        });
      }
    }
  }

  if (toInsert.length === 0) {
    console.log("✅ جميع الحلقات موجودة مسبقًا — لا حاجة لإضافة شيء.");
    await pool.end();
    return;
  }

  await db.insert(circlesTable).values(toInsert);
  console.log(`✅ تم إنشاء ${toInsert.length} حلقة بنجاح.`);
  await pool.end();
}

seed().catch(e => { console.error(e); process.exit(1); });
