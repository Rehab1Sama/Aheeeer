// يشغّل اختبارات test/*.test.ts: يجمع كل ملف بـ esbuild (الموجود أصلًا لبناء الخادم) ثم يشغّله بـ node --test.
// لا يحتاج حزمًا إضافية، فلا يتغير ملف القفل (lockfile).
import { build } from "esbuild";
import { readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const dir = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(dir, ".dist");
rmSync(out, { recursive: true, force: true });
const files = readdirSync(dir).filter((f) => f.endsWith(".test.ts"));
await build({
  entryPoints: files.map((f) => path.join(dir, f)),
  bundle: true, platform: "node", format: "esm", outdir: out, outExtension: { ".js": ".mjs" }, logLevel: "warning",
});
const r = spawnSync(process.execPath, ["--test", ...files.map((f) => path.join(out, f.replace(/\.ts$/, ".mjs")))], { stdio: "inherit" });
rmSync(out, { recursive: true, force: true });
process.exit(r.status ?? 1);
