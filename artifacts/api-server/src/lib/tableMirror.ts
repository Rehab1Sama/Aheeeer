// نسخة في ذاكرة الخادم من جدولَي الطالبات والسجلات، تُحدَّث بالأجزاء التي تغيَّرت فقط.
// السبب: كانت قوائم الطالبات وسجلات الشهر تُسحب كاملة مئات المرات يوميًا، فتجاوزت المقرأة
// حد البيانات الخارجة من قاعدة البيانات (Supabase egress).
//
// الطريقة: قاعدة البيانات تحسب «بصمة» (md5) لكل جزء — مئتا طالبة، أو يوم من السجلات —
// وترجع البصمات فقط (بايتات قليلة). نعيد جلب الجزء الذي تغيَّرت بصمته فقط.
// البصمة تُحسب من الصف كاملًا، فأي تعديل (من الموقع أو مباشرة في القاعدة) يُكتشف.
// لا نفحص البصمات أكثر من مرة كل CHECK_MS، إلا بعد أي كتابة في الموقع (markDirty).
import { db, studentsTable, recordsTable } from "@workspace/db";
import { and, or, gte, lt, inArray, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";

const CHECK_MS = 20_000;
type Student = typeof studentsTable.$inferSelect;
type RecordRow = typeof recordsTable.$inferSelect;

let dirtyGen = 0;
/** يُستدعى بعد أي كتابة ناجحة: الطلب التالي يفحص البصمات (لا يعيد الجلب إلا لما تغيَّر) */
export function markMirrorsDirty(): void { dirtyGen++; }

function rowsOf(res: unknown): Array<Record<string, unknown>> {
  return ((res as { rows?: Array<Record<string, unknown>> }).rows ?? []);
}

// ─── الطالبات: أجزاء من ٢٠٠ رقم ─────────────────────────────────────────────
const S_BUCKET = 200;
const sBuckets = new Map<number, { hash: string; rows: Student[] }>();
let sCheckedAt = 0;
let sCheckedGen = -1;
let sAll: Student[] = [];
let sInflight: Promise<Student[]> | null = null;

async function refreshStudents(): Promise<Student[]> {
  const fp = rowsOf(await db.execute(sql`
    select (id / ${S_BUCKET})::int as b, md5(string_agg(md5(s::text), '' order by id)) as h
    from students s group by 1`));
  const want = new Map(fp.map((r) => [Number(r.b), String(r.h)]));
  const changed = [...want].filter(([b, h]) => sBuckets.get(b)?.hash !== h).map(([b]) => b);
  for (const b of [...sBuckets.keys()]) if (!want.has(b)) sBuckets.delete(b);
  if (changed.length) {
    const conds = changed.map((b) => and(gte(studentsTable.id, b * S_BUCKET), lt(studentsTable.id, (b + 1) * S_BUCKET)));
    const fresh = await db.select().from(studentsTable).where(or(...conds));
    const byB = new Map<number, Student[]>();
    for (const r of fresh) { const b = Math.floor(r.id / S_BUCKET); (byB.get(b) ?? byB.set(b, []).get(b)!).push(r); }
    for (const b of changed) sBuckets.set(b, { hash: want.get(b)!, rows: byB.get(b) ?? [] });
    sAll = [...sBuckets.keys()].sort((a, b) => a - b).flatMap((b) => sBuckets.get(b)!.rows);
  }
  return sAll;
}

/** كل صفوف جدول الطالبات (نسخة سطحية) */
export async function mirroredStudents(): Promise<Student[]> {
  const now = Date.now();
  if (sCheckedGen === dirtyGen && now - sCheckedAt < CHECK_MS && sAll.length) return [...sAll];
  if (!sInflight) {
    const gen = dirtyGen;
    sInflight = refreshStudents()
      .then((r) => { sCheckedAt = Date.now(); sCheckedGen = gen; return r; })
      .finally(() => { sInflight = null; });
  }
  return [...(await sInflight)];
}

// ─── السجلات: جزء لكل يوم ───────────────────────────────────────────────────
const rDays = new Map<string, { hash: string; rows: RecordRow[]; used: number }>();
const rChecked = new Map<string, { at: number; gen: number }>(); // مفتاح الفترة
const MAX_DAYS = 200; // حد الذاكرة: نُسقط الأيام الأقدم استخدامًا

async function refreshRange(from: string, to: string): Promise<void> {
  const fp = rowsOf(await db.execute(sql`
    select date as d, md5(string_agg(md5(r::text), '' order by id)) as h
    from records r where date >= ${from} and date <= ${to} group by date`));
  const want = new Map(fp.map((r) => [String(r.d), String(r.h)]));
  // أيام اختفت سجلاتها كلها داخل الفترة
  for (const d of [...rDays.keys()]) if (d >= from && d <= to && !want.has(d)) rDays.set(d, { hash: "", rows: [], used: Date.now() });
  const changed = [...want].filter(([d, h]) => rDays.get(d)?.hash !== h).map(([d]) => d);
  if (changed.length) {
    const fresh = await db.select().from(recordsTable).where(inArray(recordsTable.date, changed));
    const byD = new Map<string, RecordRow[]>();
    for (const r of fresh) (byD.get(r.date) ?? byD.set(r.date, []).get(r.date)!).push(r);
    for (const d of changed) rDays.set(d, { hash: want.get(d)!, rows: byD.get(d) ?? [], used: Date.now() });
  }
  if (rDays.size > MAX_DAYS) {
    const old = [...rDays].filter(([d]) => d < from || d > to)
      .sort((a, b) => a[1].used - b[1].used).slice(0, rDays.size - MAX_DAYS);
    for (const [d] of old) rDays.delete(d);
    if (old.length) rChecked.clear(); // فترات أخرى فقدت أيامًا: تُفحص من جديد
  }
}

const rInflight = new Map<string, Promise<void>>();

/** سجلات فترة (شاملة الطرفين)، من النسخة المحفوظة */
export async function mirroredRecordsInRange(from: string, to: string): Promise<RecordRow[]> {
  if (from > to) return [];
  const key = `${from}|${to}`;
  const now = Date.now();
  const c = rChecked.get(key);
  if (!(c && c.gen === dirtyGen && now - c.at < CHECK_MS)) {
    let p = rInflight.get(key);
    if (!p) {
      const gen = dirtyGen;
      p = refreshRange(from, to)
        .then(() => { rChecked.set(key, { at: Date.now(), gen }); if (rChecked.size > 500) rChecked.clear(); })
        .finally(() => rInflight.delete(key));
      rInflight.set(key, p);
    }
    await p;
  }
  const out: RecordRow[] = [];
  for (const [d, v] of rDays) if (d >= from && d <= to) { v.used = now; out.push(...v.rows); }
  return out;
}

/** سجلات يوم واحد */
export function mirroredRecordsOn(date: string): Promise<RecordRow[]> {
  return mirroredRecordsInRange(date, date);
}

// للاختبار فقط
export function _resetMirrors(): void { sBuckets.clear(); sAll = []; sCheckedAt = 0; rDays.clear(); rChecked.clear(); }

// ─── قوائم صغيرة بالبصمة: تُعاد كاملة فقط إن تغيَّرت بصمتها ─────────────────
const fpStore = new Map<string, { hash: string; rows: unknown[]; at: number; gen: number }>();
const fpInflight = new Map<string, Promise<unknown[]>>();

/**
 * يرجع نتيجة fetch من الذاكرة ما دامت بصمة البيانات (fp: استعلام يرجع عمودًا واحدًا h) لم تتغيَّر.
 * اكتبي البصمة على نفس الأعمدة والشروط التي يجلبها fetch.
 */
export async function fingerprinted<T>(key: string, fp: SQL, fetch: () => Promise<T[]>): Promise<T[]> {
  const now = Date.now();
  const hit = fpStore.get(key);
  if (hit && hit.gen === dirtyGen && now - hit.at < CHECK_MS) return [...hit.rows] as T[];
  let p = fpInflight.get(key) as Promise<T[]> | undefined;
  if (!p) {
    const gen = dirtyGen;
    p = (async () => {
      const h = String(rowsOf(await db.execute(fp))[0]?.h ?? "");
      const cur = fpStore.get(key);
      if (cur && cur.hash === h) { cur.at = Date.now(); cur.gen = gen; return cur.rows as T[]; }
      const rows = await fetch();
      fpStore.set(key, { hash: h, rows, at: Date.now(), gen });
      return rows;
    })().finally(() => fpInflight.delete(key));
    fpInflight.set(key, p);
  }
  return [...(await p)];
}
