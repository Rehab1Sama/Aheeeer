// تقرير التوثيق للجهات الخارجية (الجمعية) — قراءة فقط، أرقام مجمّعة بلا بيانات شخصية.
//
// التفعيل: أضيفي متغير البيئة VERIFICATION_API_KEY (16 حرفًا فأكثر) في Render.
// بدونه تبقى الواجهة غير موجودة (404).
//
//   GET /api/verification/stats?key=...[&month=2026-10]   ← JSON  (أو ترويسة x-api-key)
//   GET /api/verification/report?key=...[&month=2026-10]  ← صفحة تقرير قابلة للطباعة
//
// VERIFICATION_MIN_CELL (اختياري، الافتراضي 3): الفئات الأصغر منه تُدمج تحت "أخرى"
// حتى لا تكشف أرقام مثل 1 أو 2 هوية طالبة. ضعي 1 لتعطيل الدمج وإظهار كل التفاصيل.

import { Router, type IRouter, type Request, type Response } from "express";
import { createHash, timingSafeEqual } from "node:crypto";
import { db, recordsTable, circlesTable, tracksTable, studentEnrollmentsTable, usersTable } from "@workspace/db";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { getMakkahDay } from "../lib/date";
import {
  buildStudentStats, buildVolunteerStats, summarizeRecords, suppressSmall, countBy,
  isValidMonth, previousMonth, monthLabel,
  type VStudent, type VVolunteer, type VRecord, type StudentGroup, type Entry,
} from "../lib/verificationStats";

const router: IRouter = Router();

// ─── الحماية: مفتاح سري + حد للطلبات ───────────────────────────────

const hits = new Map<string, { count: number; resetAt: number }>();
function rateLimited(req: Request): boolean {
  const ip = String(req.headers["x-forwarded-for"] ?? req.ip ?? "x").split(",")[0]!.trim();
  const now = Date.now();
  const cur = hits.get(ip);
  if (!cur || cur.resetAt < now) { hits.set(ip, { count: 1, resetAt: now + 60_000 }); return false; }
  cur.count++;
  return cur.count > 20;
}

function authorize(req: Request, res: Response): boolean {
  const expected = process.env.VERIFICATION_API_KEY ?? "";
  if (expected.length < 16) { res.status(404).json({ error: "Not found" }); return false; }
  if (rateLimited(req)) { res.status(429).json({ error: "Too many requests" }); return false; }
  const provided = String(req.header("x-api-key") ?? req.query.key ?? "");
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  if (!timingSafeEqual(a, b)) { res.status(401).json({ error: "Unauthorized" }); return false; }
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  return true;
}

// ─── تحميل البيانات وبناء التقرير ──────────────────────────────────

const CHILDREN_TRACKS = new Set(["سراج", "ألق"]);
const MOTHERS_TRACKS = new Set(["مهج"]);

function minCell(): number {
  const n = Number(process.env.VERIFICATION_MIN_CELL ?? 3);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 3;
}

async function loadRecords(month: string, scopeCircleIds: Set<number>): Promise<VRecord[]> {
  const rows = await db.select({
    studentId: recordsTable.studentId,
    circleId: recordsTable.circleId,
    date: recordsTable.date,
    isAbsent: recordsTable.isAbsent,
    memorizePages: recordsTable.memorizePages,
    reviewNearPages: recordsTable.reviewNearPages,
    reviewFarPages: recordsTable.reviewFarPages,
    reviewFar2Pages: recordsTable.reviewFar2Pages,
    reviewPages: recordsTable.reviewPages,
    recitationPages: recordsTable.recitationPages,
  }).from(recordsTable).where(and(gte(recordsTable.date, `${month}-01`), lte(recordsTable.date, `${month}-31`)));
  return rows.filter((r) => scopeCircleIds.has(r.circleId)) as VRecord[];
}

async function buildReport(month: string) {
  const min = minCell();
  const [circles, tracks, enrollments, studentRes, users] = await Promise.all([
    db.select({
      id: circlesTable.id, name: circlesTable.name, track: circlesTable.track,
      trackType: circlesTable.trackType, trackId: circlesTable.trackId, isArchived: circlesTable.isArchived,
    }).from(circlesTable),
    db.select({ id: tracksTable.id, name: tracksTable.name, dataEntryType: tracksTable.dataEntryType }).from(tracksTable),
    db.select({ studentId: studentEnrollmentsTable.studentId, circleId: studentEnrollmentsTable.circleId })
      .from(studentEnrollmentsTable).where(eq(studentEnrollmentsTable.isArchived, false)),
    db.execute(sql`SELECT id, country, age_range, education_level, is_archived FROM students`),
    db.select({ id: usersTable.id, role: usersTable.role, country: usersTable.country, isArchived: usersTable.isArchived }).from(usersTable),
  ]);

  // الحلقات المحسوبة: غير مؤرشفة، ليست حلقة تسجيل، وليست الحلقة الوهمية "محذوفة"
  const scope = circles.filter((c) => !c.isArchived && c.trackType !== "registration" && c.name !== "محذوفة");
  const scopeIds = new Set(scope.map((c) => c.id));
  const info = new Map(scope.map((c) => {
    const t = c.trackId ? tracks.find((x) => x.id === c.trackId) : undefined;
    const type = t?.dataEntryType ?? c.trackType ?? "girls";
    const name = t?.name ?? c.track ?? "";
    return [c.id, { type, name }] as const;
  }));

  // طالبات كل حلقة (التسجيلات النشطة)
  const circlesByStudent = new Map<number, number[]>();
  for (const e of enrollments) {
    if (!scopeIds.has(e.circleId)) continue;
    const arr = circlesByStudent.get(e.studentId) ?? [];
    arr.push(e.circleId);
    circlesByStudent.set(e.studentId, arr);
  }

  const students: VStudent[] = [];
  const studentsByTrack = new Map<string, Set<number>>();
  const activeCircleIds = new Set<number>(); // حلقات فيها طالبة نشطة واحدة على الأقل

  for (const row of (studentRes as any).rows as any[]) {
    if (row.is_archived === true) continue;
    const cids = circlesByStudent.get(Number(row.id));
    if (!cids || cids.length === 0) continue;
    const kinds = cids.map((cid) => info.get(cid)!);
    for (const cid of cids) activeCircleIds.add(cid);
    const isChild = kinds.some((k) => k.type === "children" || CHILDREN_TRACKS.has(k.name));
    const isMother = kinds.some((k) => k.type === "mothers" || MOTHERS_TRACKS.has(k.name));
    const group: StudentGroup = isChild ? "children" : isMother ? "mothers" : "girls";
    students.push({ group, country: row.country ?? null, ageRange: row.age_range ?? null, educationLevel: row.education_level ?? null });
    for (const k of kinds) {
      const set = studentsByTrack.get(k.name) ?? new Set<number>();
      set.add(Number(row.id));
      studentsByTrack.set(k.name, set);
    }
  }

  const volunteers: VVolunteer[] = users
    .filter((u) => !u.isArchived && (u.role === "teacher" || u.role === "supervisor" || u.role === "track_supervisor"))
    .map((u) => ({ role: u.role as VVolunteer["role"], country: u.country ?? null }));

  const prev = previousMonth(month);
  const [cur, prv] = await Promise.all([loadRecords(month, scopeIds), loadRecords(prev, scopeIds)]);

  const circlesByTrack = new Map<string, number>();
  for (const cid of activeCircleIds) {
    const name = info.get(cid)!.name;
    circlesByTrack.set(name, (circlesByTrack.get(name) ?? 0) + 1);
  }
  const trackNames = [...circlesByTrack.keys()].filter(Boolean).sort((a, b) => a.localeCompare(b, "ar", { numeric: true }));
  const byTrack = trackNames.map((name) => ({
    track: name,
    circles: circlesByTrack.get(name) ?? 0,
    students: studentsByTrack.get(name)?.size ?? 0,
  }));

  const studentStats = buildStudentStats(students, min);
  return {
    generatedAt: new Date().toISOString(),
    month,
    monthLabel: monthLabel(month),
    minCell: min,
    circles: { total: activeCircleIds.size, tracks: trackNames.length },
    students: studentStats,
    volunteers: buildVolunteerStats(volunteers, min),
    byTrack,
    activity: { current: { month, label: monthLabel(month), ...summarizeRecords(cur) }, previous: { month: prev, label: monthLabel(prev), ...summarizeRecords(prv) } },
    notes: [
      "الطالبات: النشطات المسجّلات في حلقة قائمة (تُستثنى المؤرشفات وحلقة التسجيل).",
      "المتطوعات: المعلمات والمشرفات ومشرفات المسارات النشطات.",
      min > 1 ? `الفئات الأقل من ${min} تُدمج تحت "أخرى" لحماية الخصوصية.` : "عرض كامل التفاصيل بدون دمج الفئات الصغيرة.",
      "طالبة قد تُحسب في أكثر من مسار في جدول المسارات، لذلك لا يساوي مجموعه إجمالي الطالبات.",
      "المستوى الدراسي مسجّل لجزء من الطالبات فقط (انظر نسبة التغطية).",
      "الصفحات = أوجه المصحف، وتُقرَّب لأقرب نصف صفحة.",
    ],
  };
}

// ─── الواجهات ──────────────────────────────────────────────────────

const cache = new Map<string, { at: number; data: Awaited<ReturnType<typeof buildReport>> }>();
async function cachedReport(month: string) {
  const hit = cache.get(month);
  if (hit && Date.now() - hit.at < 60_000) return hit.data;
  const data = await buildReport(month);
  cache.set(month, { at: Date.now(), data });
  return data;
}

function pickMonth(req: Request, res: Response): string | null {
  const m = String(req.query.month ?? getMakkahDay().slice(0, 7));
  if (!isValidMonth(m)) { res.status(400).json({ error: "month must be YYYY-MM" }); return null; }
  return m;
}

router.get("/verification/stats", async (req, res): Promise<void> => {
  if (!authorize(req, res)) return;
  const month = pickMonth(req, res);
  if (!month) return;
  res.json(await cachedReport(month));
});

const esc = (s: unknown) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const ar = (n: number) => n.toLocaleString("ar-EG", { maximumFractionDigits: 1 });

function table(title: string, rows: Entry[] | Array<Record<string, any>>, cols: Array<[string, string]>): string {
  const head = cols.map(([, h]) => `<th>${esc(h)}</th>`).join("");
  const body = (rows as any[]).map((r) => `<tr>${cols.map(([k], i) => `<td>${i === 0 ? esc(r[k]) : ar(Number(r[k]))}</td>`).join("")}</tr>`).join("");
  return `<h2>${esc(title)}</h2><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

router.get("/verification/report", async (req, res): Promise<void> => {
  if (!authorize(req, res)) return;
  const month = pickMonth(req, res);
  if (!month) return;
  const r = await cachedReport(month);
  const a = r.activity.current, p = r.activity.previous;
  const actRows = [
    { m: "الصفحات المحفوظة", c: a.memorizePages, p: p.memorizePages },
    { m: "صفحات المراجعة", c: a.reviewPages, p: p.reviewPages },
    { m: "   المراجعة القريبة", c: a.reviewNearPages, p: p.reviewNearPages },
    { m: "   المراجعة البعيدة", c: a.reviewFarPages, p: p.reviewFarPages },
    { m: "صفحات التلاوة", c: a.recitationPages, p: p.recitationPages },
    { m: "الطالبات اللاتي أنجزن في الشهر", c: a.studentsWithActivity, p: p.studentsWithActivity },
    { m: "أيام الإدخال", c: a.entryDays, p: p.entryDays },
    { m: "نسبة الحضور %", c: a.attendancePercent, p: p.attendancePercent },
  ];
  const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">
<title>تقرير التوثيق — ${esc(r.monthLabel)}</title>
<style>body{font-family:Tahoma,Arial,sans-serif;margin:0;background:#f6f5fb;color:#222}main{max-width:820px;margin:0 auto;padding:16px}
h1{font-size:22px;margin:8px 0}h2{font-size:17px;margin:22px 0 8px;color:#4b3f8f}.sub{color:#666;font-size:13px}
table{width:100%;border-collapse:collapse;background:#fff;border-radius:8px;overflow:hidden;font-size:14px}th,td{padding:7px 10px;border-bottom:1px solid #eee;text-align:right}th{background:#5b4b9a;color:#fff}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px}.card{background:#fff;border-radius:10px;padding:12px;text-align:center}.card b{display:block;font-size:24px;color:#4b3f8f}
ul{font-size:12px;color:#555;line-height:1.8}@media print{body{background:#fff}}</style></head><body><main>
<h1>تقرير التوثيق — ${esc(r.monthLabel)}</h1><div class="sub">أرقام مجمّعة بلا بيانات شخصية • ${esc(new Date(r.generatedAt).toLocaleDateString("ar-EG"))}</div>
<h2>ملخص</h2><div class="cards">
<div class="card"><b>${ar(r.students.total)}</b>طالبة نشطة</div>
<div class="card"><b>${ar(r.volunteers.total)}</b>متطوعة</div>
<div class="card"><b>${ar(r.circles.total)}</b>حلقة</div>
<div class="card"><b>${ar(r.circles.tracks)}</b>مسارات</div></div>
${table("الطالبات حسب الفئة", [
    { l: "فتيات", n: r.students.byGroup.girls }, { l: "أطفال", n: r.students.byGroup.children }, { l: "أمهات", n: r.students.byGroup.mothers },
  ], [["l", "الفئة"], ["n", "العدد"]])}
${table("الطالبات حسب البلد", r.students.byCountry, [["label", "البلد"], ["count", "العدد"]])}
${table("الطالبات حسب الفئة العمرية", r.students.byAge, [["label", "الفئة العمرية"], ["count", "العدد"]])}
${table("الطالبات حسب المستوى الدراسي", r.students.education.byLevel, [["label", "المستوى"], ["count", "العدد"]])}
<p class="sub">المستوى الدراسي مسجّل لـ${ar(r.students.education.recorded)} طالبة (${ar(r.students.education.coveragePercent)}٪). الجامعيات ودراسات عليا من المسجّل لديهن: ${ar(r.students.education.universityOrHigher)}.</p>
${table("المتطوعات", [
    { l: "معلمات", n: r.volunteers.byRole.teachers }, { l: "مشرفات", n: r.volunteers.byRole.supervisors }, { l: "مشرفات مسارات", n: r.volunteers.byRole.trackSupervisors },
  ], [["l", "الدور"], ["n", "العدد"]])}
${table("المتطوعات حسب البلد", r.volunteers.byCountry, [["label", "البلد"], ["count", "العدد"]])}
${table("المسارات", r.byTrack, [["track", "المسار"], ["circles", "الحلقات"], ["students", "الطالبات"]])}
${table("نشاط الشهر", actRows, [["m", "المؤشر"], ["c", esc(a.label)], ["p", esc(p.label)]])}
<h2>ملاحظات</h2><ul>${r.notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>
</main></body></html>`;
  res.type("html").send(html);
});

export default router;
