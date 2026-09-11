import { createRequire } from "module";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const pgPath = path.resolve(__dirname, "../node_modules/.pnpm/pg@8.21.0/node_modules/pg");
const { Client } = require(pgPath);

const TRACKS = [
  "بريق", "إشراق", "سُنى", "ضياء", "وهج",
  "مهج", "مشكاة نور", "ألق", "سراج", "قبس", "البهور",
];
const ARABIC_NUMS = ["١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩", "١٠"];

const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const { rows: existing } = await client.query("SELECT name FROM circles");
const existingNames = new Set(existing.map(r => r.name));

let added = 0;
for (const track of TRACKS) {
  for (let i = 0; i < 10; i++) {
    const name = `${track} ${ARABIC_NUMS[i]}`;
    if (!existingNames.has(name)) {
      await client.query(
        "INSERT INTO circles (name, track, track_type, is_archived) VALUES ($1, $2, 'girls', false)",
        [name, track]
      );
      added++;
    }
  }
}

console.log(added > 0 ? `✅ تم إنشاء ${added} حلقة.` : "✅ الحلقات موجودة مسبقًا.");
await client.end();
