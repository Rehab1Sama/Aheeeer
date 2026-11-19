// خلاصة طالبات المسار لمسؤولتيه على تيليجرام — عن الطالبات فقط:
//   متكاسلات 🌧️ : خطة متأخرة ٣ أيام فأكثر (سُنى: يومان)، أو ٥ أيام فأكثر بلا حفظ في أسبوعين (سُنى: ٣)، أو تقصير مرتين فأكثر في أسبوعين
//   يحتجن متابعة 🌿 : غياب ٣ أيام متتالية أو ٣ مرات في أسبوعين، أو نزول الإنجاز إلى النصف
//   متميِّزات ♥️ (الخميس فقط): أسبوع بلا غياب ولا تقصير، مع تقدُّم في الخطة أو حفظ فوق معدَّلها
// كل المسارات: الفتيات (خطة المراجعة)، سُنى (التثبيت)، الأطفال، الأمهات (مهج)، والتصحيح (مشكاة نور).
import {
  db, circlesTable, tracksTable, studentEnrollmentsTable, studentsTable, recordsTable,
  reviewPlansTable, reviewPlanDaysTable,
} from "@workspace/db";
import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { addDaysStr } from "./date";
import { mirroredRecordsInRange } from "./tableMirror";
import { isShortcomingRecord } from "./shortcoming";
import { loadGirlsCoverage, getPlanCycleDates } from "../routes/reviewPlans";

const ar = (n: number) => n.toLocaleString("ar-EG");
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const firstTwo = (n: string) => n.trim().split(/\s+/).slice(0, 2).join(" ");
const days = (n: number) => `${ar(n)} ${n >= 3 && n <= 10 ? "أيام" : "يومًا"}`;
const times = (n: number) => (n === 2 ? "مرتين" : `${ar(n)} ${n >= 3 && n <= 10 ? "مرات" : "مرة"}`);
const MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
const DAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const fmtDate = (d: string) => { const x = new Date(d + "T12:00:00Z"); return `${DAYS[x.getUTCDay()]} ${ar(x.getUTCDate())} ${MONTHS[x.getUTCMonth()]}`; };

type Line = { circle: string; name: string; reasons: string[] };
export type TrackStudentDigest = { track: string; kind: string; lazy: Line[]; follow: Line[]; excellent: Line[]; hadData: boolean };

const SUPPORTED = new Set(["girls", "fixation", "children", "mothers", "recitation"]);
// مسارات بلا حفظ يومي: لا يُحسب عليها «بلا حفظ»
const NO_MEMO = new Set(["mothers", "recitation"]);
/** صيغة المذكَّر والمؤنَّث: الأطفال (بنين وبنات) بصيغة عامة */
const g = (kind: string, fem: string, neutral: string) => (kind === "children" ? neutral : fem);

/** يبني بيانات كل مسار (الفتيات وسُنى) ليوم التقرير D */
export async function buildTrackStudentDigests(D: string, opts: { weekly: boolean }): Promise<Map<string, TrackStudentDigest>> {
  const d14 = addDaysStr(D, -13);
  const d28 = addDaysStr(D, -27);
  const d7 = addDaysStr(D, -6);
  const [tracks, allCircles] = await Promise.all([
    db.select({ id: tracksTable.id, t: tracksTable.dataEntryType }).from(tracksTable),
    db.select().from(circlesTable).where(eq(circlesTable.isArchived, false)),
  ]);
  const typeById = new Map(tracks.map((t) => [t.id, t.t]));
  const typeOf = (c: typeof allCircles[number]) => (c.trackId ? typeById.get(c.trackId) : null) ?? c.trackType ?? "girls";
  const circles = allCircles.filter((c) => SUPPORTED.has(typeOf(c)) && c.track);
  const out = new Map<string, TrackStudentDigest>();
  if (circles.length === 0) return out;
  const ids = circles.map((c) => c.id);
  const circleById = new Map(circles.map((c) => [c.id, c]));

  const [enrolls, recs, plans] = await Promise.all([
    db.select({
      studentId: studentEnrollmentsTable.studentId, circleId: studentEnrollmentsTable.circleId,
      leaveStart: studentEnrollmentsTable.leaveStart, leaveEnd: studentEnrollmentsTable.leaveEnd, fullName: studentsTable.fullName,
    }).from(studentEnrollmentsTable)
      .innerJoin(studentsTable, eq(studentsTable.id, studentEnrollmentsTable.studentId))
      .where(and(eq(studentEnrollmentsTable.isArchived, false), eq(studentsTable.isArchived, false), inArray(studentEnrollmentsTable.circleId, ids))),
    mirroredRecordsInRange(d28, D).then((rs) => { const set = new Set(ids); return rs.filter((r) => set.has(r.circleId)); }),
    db.select().from(reviewPlansTable).where(and(inArray(reviewPlansTable.circleId, ids), eq(reviewPlansTable.status, "active"))),
  ]);

  // حالة الخطة لكل (طالبة، حلقة): تأخر بالأيام، أو تقدُّم
  const planState = new Map<string, { delay: number; ahead: boolean }>();
  const girlsPlans = plans.filter((p) => p.planType === "girls_review");
  if (girlsPlans.length) {
    const cov = await loadGirlsCoverage(girlsPlans);
    for (const p of girlsPlans) {
      const c = cov.get(p.id);
      if (c?.status) planState.set(`${p.studentId}:${p.circleId}`, { delay: c.unresolvedDelayDays ?? 0, ahead: c.status === "ahead" });
    }
  }
  const fixPlans = plans.filter((p) => p.planType === "fixation" && p.startDate);
  if (fixPlans.length) {
    const pdays = await db.select().from(reviewPlanDaysTable).where(inArray(reviewPlanDaysTable.planId, fixPlans.map((p) => p.id)));
    const allFix = await db.select({ studentId: recordsTable.studentId, circleId: recordsTable.circleId, date: recordsTable.date, memorizePages: recordsTable.memorizePages })
      .from(recordsTable).where(and(inArray(recordsTable.circleId, [...new Set(fixPlans.map((p) => p.circleId))]), lte(recordsTable.date, D)));
    for (const p of fixPlans) {
      const dates = getPlanCycleDates(p.startDate!, "fixation").filter((d) => d <= D);
      if (dates.length === 0) continue;
      const quota = new Map(pdays.filter((d) => d.planId === p.id).map((d) => [d.dayNumber, d.pages ?? 0]));
      const dateSet = new Set(dates);
      let cumQ = 0;
      dates.forEach((_, i) => { cumQ += quota.get(i + 1) ?? 0; });
      const done = allFix.filter((r) => r.studentId === p.studentId && r.circleId === p.circleId && dateSet.has(r.date))
        .reduce((a, r) => a + (r.memorizePages ?? 0), 0);
      const daily = dates.length ? cumQ / dates.length : 0;
      const deficit = cumQ - done;
      planState.set(`${p.studentId}:${p.circleId}`, {
        delay: daily > 0 && deficit > 0 ? Math.round(deficit / daily) : 0,
        ahead: daily > 0 && done >= cumQ + daily,
      });
    }
  }

  const recsByKey = new Map<string, typeof recs>();
  for (const r of recs) { const k = `${r.studentId}:${r.circleId}`; const l = recsByKey.get(k) ?? []; l.push(r); recsByKey.set(k, l); }
  const tracksWithData = new Set(recs.filter((r) => r.date === D).map((r) => circleById.get(r.circleId)?.track).filter(Boolean) as string[]);

  for (const e of enrolls) {
    if (e.leaveStart && e.leaveEnd && e.leaveStart <= D && D <= e.leaveEnd) continue;
    const c = circleById.get(e.circleId);
    if (!c?.track) continue;
    const t = typeOf(c);
    const dg = out.get(c.track) ?? { track: c.track, kind: t, lazy: [], follow: [], excellent: [], hadData: tracksWithData.has(c.track) };
    out.set(c.track, dg);
    const k = `${e.studentId}:${e.circleId}`;
    const rs = (recsByKey.get(k) ?? []).sort((a, b) => a.date.localeCompare(b.date));
    const last14 = rs.filter((r) => r.date >= d14);
    const present14 = last14.filter((r) => !r.isAbsent);
    const lazy: string[] = [];
    const follow: string[] = [];
    const ps = planState.get(k);
    if (ps && ps.delay >= (t === "fixation" ? 2 : 3)) lazy.push(`${g(t, "متأخرة عن خطتها", "تأخر عن الخطة")} ${days(ps.delay)}`);
    const noMemo = present14.filter((r) => (r.memorizePages ?? 0) === 0).length;
    if (noMemo >= (t === "fixation" ? 3 : 5) && !NO_MEMO.has(t)) lazy.push(`بلا ${t === "fixation" ? "تثبيت" : "حفظ"} ${days(noMemo)}`);
    const short = last14.filter((r) => isShortcomingRecord(r, t)).length;
    if (short >= 2) lazy.push(`تقصير ${times(short)}`);
    const tail = rs.slice(-3);
    const abs14 = last14.filter((r) => r.isAbsent).length;
    if (tail.length === 3 && tail.every((r) => r.isAbsent)) follow.push(t === "mothers" ? "غابت ٣ لقاءات متتالية" : g(t, "غابت ٣ أيام متتالية", "غياب ٣ أيام متتالية"));
    else if (abs14 >= 3) follow.push(`${g(t, "غابت", "غياب")} ${days(abs14)} في أسبوعين`);
    const pages = (r: typeof rs[number]) => (r.memorizePages ?? 0) + (r.reviewNearPages ?? 0) + (r.reviewFarPages ?? 0) + (r.reviewFar2Pages ?? 0) + (r.reviewPages ?? 0) + (r.recitationPages ?? 0);
    const present = rs.filter((r) => !r.isAbsent);
    const recent = present.filter((r) => r.date >= d7);
    const prev = present.filter((r) => r.date < d7);
    if (recent.length >= 2 && prev.length >= 3) {
      const a = recent.reduce((s, r) => s + pages(r), 0) / recent.length;
      const b = prev.reduce((s, r) => s + pages(r), 0) / prev.length;
      if (b >= 2 && a <= b * 0.5) follow.push(g(t, "إنجازها نزل للنصف", "الإنجاز نزل للنصف"));
    }
    const name = esc(firstTwo(e.fullName));
    if (lazy.length) dg.lazy.push({ circle: c.name, name, reasons: [...lazy, ...follow] });
    else if (follow.length) dg.follow.push({ circle: c.name, name, reasons: follow });

    if (opts.weekly && !lazy.length && !follow.length) {
      const week = rs.filter((r) => r.date >= d7);
      const clean = week.length >= (t === "mothers" ? 1 : 2) && week.every((r) => !r.isAbsent && !isShortcomingRecord(r, t));
      if (clean) {
        const why: string[] = [];
        if (ps?.ahead) why.push(g(t, "متقدِّمة في خطتها", "متقدِّم في الخطة"));
        const weekMemo = week.reduce((s, r) => s + (r.memorizePages ?? 0), 0);
        const prevWeeks = rs.filter((r) => r.date < d7);
        const prevAvg = prevWeeks.length ? (prevWeeks.reduce((s, r) => s + (r.memorizePages ?? 0), 0) / prevWeeks.length) * week.length : 0;
        if (weekMemo > 0 && prevAvg > 0 && weekMemo >= prevAvg * 1.25) why.push(t === "fixation" ? "ثبَّتت أكثر من معدَّلها" : g(t, "حفظت أكثر من معدَّلها", "حفظ أكثر من المعدَّل"));
        if (t === "mothers" || t === "recitation") why.push(g(t, "حضرت الأسبوع كاملًا", ""));
        if (why.length) dg.excellent.push({ circle: c.name, name, reasons: [...why, "بلا غياب ولا تقصير"] });
      }
    }
  }
  return out;
}

const MAX_LINES = 30;
function section(title: string, lines: Line[]): string[] {
  if (lines.length === 0) return [];
  const sorted = [...lines].sort((a, b) => a.circle.localeCompare(b.circle, "ar", { numeric: true }));
  const shown = sorted.slice(0, MAX_LINES).map((l) => `• ${esc(l.circle)} | ${l.name}: ${l.reasons.join("، ")}`);
  if (sorted.length > MAX_LINES) shown.push(`<i>و${ar(sorted.length - MAX_LINES)} غيرهن</i>`);
  return [`<b>${title}</b>`, `<blockquote>${shown.join("\n")}</blockquote>`, ""];
}

/** رسالة مسؤولة المسار باسمها */
export function trackStudentMessage(dg: TrackStudentDigest, supervisorName: string, D: string, weekly: boolean): string {
  const first = esc((supervisorName || "").trim().split(/\s+/)[0] ?? "");
  const kid = dg.kind === "children";
  const who = kid ? "أطفال" : dg.kind === "mothers" ? "أمهات" : "طالبات";
  // اسم الدلع (أمواجنا، هبتنا…) يُنادى به كما هو، وغيره «قمرتنا فلانة»
  const call = /ـ|نا$/.test(first) ? first : `قمرتنا ${first}`;
  const lines = [`🌸 <b>${call}</b>، ${who} مسار ${esc(dg.track.replace(/^مسار\s+/, ""))}`, `<i>${fmtDate(D)}</i>`, ""];
  lines.push(...section(kid ? "متكاسلون 🌧️" : "متكاسلات 🌧️", dg.lazy));
  lines.push(...section(kid ? "يحتاجون متابعة 🌿" : "يحتجن متابعة 🌿", dg.follow));
  if (weekly) lines.push(...section(kid ? "متميِّزو الأسبوع ♥️" : "متميِّزات الأسبوع ♥️", dg.excellent));
  if (!dg.lazy.length && !dg.follow.length && !(weekly && dg.excellent.length)) lines.push(`ما شاء الله، ${who} مساركِ بخير اليوم 🌿`);
  return lines.join("\n").trim();
}
