// ============================================================================
// تقرير القائدة اليومي — يُرسل إلى بوت تيليجرام رسائل منفصلة مرتبة حسب المسار.
// ============================================================================
// اليوم المُبلَّغ عنه = يوم العمل الذي انتهى (أمس بتوقيت مكة افتراضيًا).
// الرسائل:
//   ٠. العنوان والملخص
//   ١. مستحقات الأوسمة
//   ٢. المعلمات الغائبات والمتأخرات
//   ٣. المشرفات: إدخال البيانات (لم تُدخل / ناقص / متأخر) ومهام التحضير والتحفيز والتقرير
//   ٤. مسؤولات المسارات: مهام اليوم غير المعبّأة، وتأخر إنهاء المسار، وعدم الدخول
//   ٥. الطالبات المتعثرات: تأخر الخطة، الغياب، التقصير، نزول المستوى
//   ٦. من أتممن خطة المراجعة
// لا يكتب شيئًا في القاعدة سوى إعدادين صغيرين (معرّف المحادثة وتاريخ آخر إرسال).
// ============================================================================

import {
  db, circlesTable, tracksTable, usersTable, studentsTable, studentEnrollmentsTable, recordsTable,
  dailyCircleTasksTable, teacherAbsencesTable, trackSupervisorNamesTable, reviewPlansTable,
  lowMemorizationAlertsTable, globalSettingsTable,
} from "@workspace/db";
import { and, eq, gte, lte, inArray } from "drizzle-orm";
import { addDaysStr, getMakkahDay, getLastCompletedWeekStart, minutesSinceMakkahDayStart, ONE_AM_MINUTES_SINCE_DAY_START } from "./date";
import { isEntryExpectedOn } from "./dataEntrySchedule";
import { loadGirlsCoverage } from "../routes/reviewPlans";
import {
  overviewCircleWeeklyMoon, overviewImprovement, overviewTrackNoShortcoming,
  overviewSupervisorWeeklyCommitment, overviewPerfectAttendanceInRange, overviewMonthlyPerfect,
  type OverviewEntry,
} from "./badgeOverview";
import { logger } from "./logger";
import { splitForTelegram } from "./telegramFormat";
export { splitForTelegram };

// ── أدوات عرض ─────────────────────────────────────────────────────────────

const esc = (s: string | null | undefined) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const ar = (n: number | string) => String(n).replace(/\d/g, (d) => AR_DIGITS[Number(d)]!);
const DAY_NAMES = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
const dow = (d: string) => new Date(d + "T12:00:00Z").getUTCDay();
const fmtDate = (d: string) => `${DAY_NAMES[dow(d)]} ${ar(Number(d.slice(8, 10)))} ${MONTHS[Number(d.slice(5, 7)) - 1]}`;
const fmtTime = (at: Date) => at.toLocaleTimeString("ar-SA", { timeZone: "Asia/Riyadh", hour: "2-digit", minute: "2-digit" });
// نداءات القائدة بأسلوبها — تتناوب على الرسائل
const NAMES = ["قمرتنا رِحاب", "رِحابنا", "رِحاب السـمـاء", "قائدتنا"];
let greetIdx = 0;
/** سطر افتتاح كل رسالة: «🌙 قمرتنا رِحاب، إليكِ حبيبة تقرير …» */
function greet(icon: string, what: string): string {
  const name = NAMES[greetIdx++ % NAMES.length];
  return `${icon} <b>${name}</b>، إليكِ حبيبة ${what}`;
}

function trackOrder(a: string, b: string) { return a.localeCompare(b, "ar"); }

// ── تجميع البيانات ────────────────────────────────────────────────────────

export interface DailyReport { date: string; messages: string[] }

export async function buildDailyReport(reportDate?: string): Promise<DailyReport> {
  const today = getMakkahDay();
  const D = reportDate ?? addDaysStr(today, -1);
  const d14 = addDaysStr(D, -13);
  const d28 = addDaysStr(D, -27);
  const d30 = addDaysStr(D, -29);

  const [tracks, circles, users, tsNames] = await Promise.all([
    db.select().from(tracksTable),
    db.select().from(circlesTable).where(eq(circlesTable.isArchived, false)),
    db.select({ id: usersTable.id, name: usersTable.name, role: usersTable.role, track: usersTable.track, isArchived: usersTable.isArchived, lastLoginAt: usersTable.lastLoginAt }).from(usersTable),
    db.select().from(trackSupervisorNamesTable),
  ]);
  const userName = new Map(users.map((u) => [u.id, u.name]));
  const trackById = new Map(tracks.map((t) => [t.id, t]));
  const typeOf = (c: typeof circles[number]) => (c.trackId ? trackById.get(c.trackId)?.dataEntryType : null) ?? c.trackType ?? "girls";
  const trackNameOf = (c: typeof circles[number]) => (c.trackId ? trackById.get(c.trackId)?.name : null) ?? c.track ?? "بلا مسار";
  const circleById = new Map(circles.map((c) => [c.id, c]));
  const expected = circles.filter((c) => isEntryExpectedOn(typeOf(c), c.name, D));
  const expectedIds = expected.map((c) => c.id);
  const circleIds = circles.map((c) => c.id);

  const [enrollRows, dayRecords, recentRecords, tasks30, absences, plans, lowAlerts] = await Promise.all([
    circleIds.length ? db.select({
      studentId: studentEnrollmentsTable.studentId, circleId: studentEnrollmentsTable.circleId,
      leaveStart: studentEnrollmentsTable.leaveStart, leaveEnd: studentEnrollmentsTable.leaveEnd,
      fullName: studentsTable.fullName, studentArchived: studentsTable.isArchived,
    }).from(studentEnrollmentsTable)
      .innerJoin(studentsTable, eq(studentsTable.id, studentEnrollmentsTable.studentId))
      .where(and(eq(studentEnrollmentsTable.isArchived, false), inArray(studentEnrollmentsTable.circleId, circleIds))) : Promise.resolve([]),
    db.select({ studentId: recordsTable.studentId, circleId: recordsTable.circleId, isAbsent: recordsTable.isAbsent, createdAt: recordsTable.createdAt })
      .from(recordsTable).where(eq(recordsTable.date, D)),
    db.select({
      studentId: recordsTable.studentId, circleId: recordsTable.circleId, date: recordsTable.date, isAbsent: recordsTable.isAbsent,
      memorizePages: recordsTable.memorizePages, reviewNearPages: recordsTable.reviewNearPages, reviewFarPages: recordsTable.reviewFarPages,
      reviewFar2Pages: recordsTable.reviewFar2Pages, reviewPages: recordsTable.reviewPages, recitationPages: recordsTable.recitationPages,
    }).from(recordsTable).where(and(gte(recordsTable.date, d28), lte(recordsTable.date, D))),
    db.select().from(dailyCircleTasksTable).where(and(gte(dailyCircleTasksTable.date, d30), lte(dailyCircleTasksTable.date, D))),
    db.select().from(teacherAbsencesTable).where(and(gte(teacherAbsencesTable.date, d30), lte(teacherAbsencesTable.date, D))),
    db.select().from(reviewPlansTable).where(and(eq(reviewPlansTable.status, "active"), eq(reviewPlansTable.planType, "girls_review"))),
    db.select().from(lowMemorizationAlertsTable).where(eq(lowMemorizationAlertsTable.isRead, false)),
  ]);

  const onLeave = (e: { leaveStart: string | null; leaveEnd: string | null }) => !!(e.leaveStart && e.leaveEnd && e.leaveStart <= D && D <= e.leaveEnd);
  const roster = new Map<number, Array<{ studentId: number; fullName: string }>>();
  for (const e of enrollRows) {
    if (e.studentArchived || onLeave(e)) continue;
    const list = roster.get(e.circleId) ?? [];
    list.push({ studentId: e.studentId, fullName: e.fullName });
    roster.set(e.circleId, list);
  }
  const studentName = new Map(enrollRows.map((e) => [e.studentId, e.fullName]));
  const recsByCircle = new Map<number, typeof dayRecords>();
  for (const r of dayRecords) { const l = recsByCircle.get(r.circleId) ?? []; l.push(r); recsByCircle.set(r.circleId, l); }
  const tasks = tasks30.filter((t) => t.date === D);
  const tasksByCircle = new Map<number, typeof tasks>();
  for (const t of tasks) { const l = tasksByCircle.get(t.circleId) ?? []; l.push(t); tasksByCircle.set(t.circleId, l); }
  const tsNameById = new Map(tsNames.map((n) => [n.id, n.name]));

  const messages: string[] = [];
  // رأس كل رسالة: النداء، ثم التاريخ، ثم فاصل
  const header = (icon: string, what: string) => [greet(icon, what), `<i>${fmtDate(D)}</i>`, ""];
  const isWorkDay = expected.length > 0;

  // ── ٣. المشرفات (يُحسب أولًا لأن الملخص يحتاجه) ──
  type CircleIssue = Issue;
  const supIssues: CircleIssue[] = [];
  let completeCircles = 0;
  let presentCount = 0;
  let absentCount = 0;
  for (const c of expected) {
    const r = roster.get(c.id) ?? [];
    if (r.length === 0) continue;
    const recs = recsByCircle.get(c.id) ?? [];
    const entered = new Set(recs.map((x) => x.studentId));
    presentCount += recs.filter((x) => !x.isAbsent).length;
    absentCount += recs.filter((x) => x.isAbsent).length;
    const missing = r.filter((s) => !entered.has(s.studentId));
    const problems: Row[] = [];
    if (recs.length === 0) problems.push(["الإدخال", "لم تُدخل البيانات"]);
    else if (missing.length > 0) problems.push(["الإدخال", `ناقص ${ar(missing.length)} من ${ar(r.length)} (${missing.slice(0, 6).map((s) => esc(s.fullName.split(" ")[0])).join("، ")}${missing.length > 6 ? "…" : ""})`]);
    const lastAt = recs.reduce<Date | null>((m, x) => (x.createdAt && (!m || x.createdAt > m) ? x.createdAt : m), null);
    if (lastAt && minutesSinceMakkahDayStart(D, lastAt) > ONE_AM_MINUTES_SINCE_DAY_START) problems.push(["وقت الإنهاء", `متأخر ${fmtTime(lastAt)}`]);
    for (const t of tasksByCircle.get(c.id) ?? []) {
      // يوم غياب المعلمة تُعلَّم مهام المشرفة «لم تتم» تلقائيًا — لا تُحسب عليها
      if (t.teacherAttendance === "absent") continue;
      if (t.prepStatus === "not_done") problems.push(["التحضير", "لم يُرسل"]);
      else if (t.prepStatus === "late") problems.push(["التحضير", "متأخر"]);
      if (t.motivationStatus === "not_done") problems.push(["التحفيز", "لم يتم"]);
      if (t.reportStatus === "not_done") problems.push(["التقرير", "لم يُرسل"]);
      else if (t.reportStatus === "late") problems.push(["التقرير", "متأخر"]);
    }
    if (problems.length === 0) { completeCircles++; continue; }
    const dayTask = (tasksByCircle.get(c.id) ?? [])[0];
    const supId = dayTask?.supervisorId ?? c.supervisorId;
    const who = supId ? userName.get(supId) : (c.teacherId ? userName.get(c.teacherId) : null);
    supIssues.push({ track: trackNameOf(c), title: `${esc(c.name)}${who ? ` | ${esc(who)}` : ""}`, rows: problems });
  }
  const circlesWithRoster = expected.filter((c) => (roster.get(c.id) ?? []).length > 0).length;

  // ── خطط المراجعة ──
  const coverage = await loadGirlsCoverage(plans);
  let behind = 0, ontrack = 0, ahead = 0;
  const completed: Array<{ track: string; circle: string; name: string; pages: number | null }> = [];
  const planDelay = new Map<string, number>();
  for (const p of plans) {
    const cv = coverage.get(p.id);
    if (!cv || !cv.status) continue;
    if (cv.status === "behind") behind++; else if (cv.status === "ahead") ahead++; else ontrack++;
    planDelay.set(`${p.studentId}:${p.circleId}`, cv.unresolvedDelayDays);
    const c = circleById.get(p.circleId);
    if (c && cv.daysReached >= 21) completed.push({ track: trackNameOf(c), circle: c.name, name: studentName.get(p.studentId) ?? `#${p.studentId}`, pages: p.totalPages });
  }

  greetIdx = 1; // النداء الأول محجوز للملخص (يُبنى في آخر الدالة ويوضع أولًا)

  // ── ١. مستحقات الأوسمة ──
  const badgeLines: string[] = [...header("🎀", "مستحقات الأوسمة")];
  const todayDow = dow(today);
  const addOverview = async (title: string, fn: () => Promise<OverviewEntry[]>) => {
    try {
      const rows = await fn();
      if (rows.length === 0) return;
      badgeLines.push(`<code>${esc(title)}</code> ✨`);
      badgeLines.push(`<blockquote>${rows.map((e) => `<b>${esc(e.label)}</b>${e.meta ? ` | ${esc(e.meta)}` : ""}${e.badge.name ? ` ← ${esc(e.badge.name)}` : ""}`).join("\n")}</blockquote>`, "");
    } catch (err) {
      logger.error({ err, title }, "daily report: badge overview failed");
    }
  };
  if (completed.length > 0) badgeLines.push(`<code>وسام إتمام خطة المراجعة</code> ✨`, `<blockquote><b>المستحقات</b> ← ${ar(completed.length)} طالبة\n<i>أسماؤهن في التقرير الأخير</i></blockquote>`, "");
  if (todayDow === 5) {
    const weekStart = getLastCompletedWeekStart();
    await addOverview("أقمر حلقة الأسبوع", () => overviewCircleWeeklyMoon(weekStart));
    await addOverview("حضور كامل هذا الأسبوع", () => overviewPerfectAttendanceInRange(weekStart, addDaysStr(weekStart, 4)));
    await addOverview("التحسّن", () => overviewImprovement(weekStart));
    await addOverview("مسار بلا تقصير", () => overviewTrackNoShortcoming(weekStart));
    await addOverview("التزام مسؤولة المسار", () => overviewSupervisorWeeklyCommitment(weekStart));
  }
  if (today.slice(8, 10) === "01") {
    await addOverview("الحضور الكامل للشهر الماضي", () => overviewMonthlyPerfect(addDaysStr(today, -1).slice(0, 7)));
  }
  if (badgeLines.length === 3) badgeLines.push("لا مستحقات جديدة اليوم.");
  if (todayDow !== 5) badgeLines.push("<i>الأوسمة الأسبوعية تصلكِ يوم الجمعة</i>");
  messages.push(badgeLines.join("\n"));

  if (!isWorkDay) { messages.unshift(buildSummary()); return { date: D, messages }; }

  // ── ٢. المعلمات (تُحسب المعلمة بعينها: غياب واحد في اليوم مهما تعدّد مصدره أو حلقاتها) ──
  const absentDaysByTeacher = new Map<number, Set<string>>();
  const lateDaysByTeacher = new Map<number, Set<string>>();
  for (const a of absences) {
    const tid = a.teacherId ?? circleById.get(a.circleId)?.teacherId;
    if (!tid) continue;
    absentDaysByTeacher.set(tid, (absentDaysByTeacher.get(tid) ?? new Set()).add(a.date));
  }
  for (const t of tasks30) {
    const tid = t.teacherId ?? circleById.get(t.circleId)?.teacherId;
    if (!tid) continue;
    if (t.teacherAttendance === "absent") absentDaysByTeacher.set(tid, (absentDaysByTeacher.get(tid) ?? new Set()).add(t.date));
    else if (t.teacherAttendance === "late") lateDaysByTeacher.set(tid, (lateDaysByTeacher.get(tid) ?? new Set()).add(t.date));
  }
  const absentTodayRows = absences.filter((a) => a.date === D);
  const teacherIssues: CircleIssue[] = [];
  const reportedTeachers = new Set<number>();
  for (const c of expected) {
    const dayTasks = tasksByCircle.get(c.id) ?? [];
    const absRow = absentTodayRows.find((a) => a.circleId === c.id);
    const tid = dayTasks[0]?.teacherId ?? absRow?.teacherId ?? c.teacherId ?? null;
    const statuses = new Set(dayTasks.map((t) => t.teacherAttendance));
    let label: string | null = null;
    if (absRow || statuses.has("absent")) label = "غابت";
    else if (statuses.has("late")) label = "تأخرت";
    if (!label) continue;
    if (tid && reportedTeachers.has(tid)) continue; // المعلمة في حلقتين: تُذكر مرة واحدة
    if (tid) reportedTeachers.add(tid);
    const nAbs = tid ? absentDaysByTeacher.get(tid)?.size ?? 0 : 0;
    const nLate = tid ? lateDaysByTeacher.get(tid)?.size ?? 0 : 0;
    const rows: Row[] = [["الحالة", label]];
    if (nAbs > 1) rows.push(["الغياب", `${ar(nAbs)} أيام خلال ٣٠ يومًا`]);
    if (nLate > 1) rows.push(["التأخر", `${ar(nLate)} أيام خلال ٣٠ يومًا`]);
    teacherIssues.push({ track: trackNameOf(c), title: `${esc(c.name)} | ${esc(tid ? userName.get(tid) ?? "—" : "بلا معلمة مسجلة")}`, rows });
  }
  const noTaskCircles = expected.filter((c) => !(tasksByCircle.get(c.id)?.length));
  const teacherMsg = [...header("🌷", "تقرير المعلمات"), ...groupByTrack(teacherIssues, "ما شاء الله، لا غياب ولا تأخير.")];
  if (noTaskCircles.length > 0) teacherMsg.push(`<i>لم يُسجَّل حضور المعلمة في ${ar(noTaskCircles.length)} حلقة لعدم تعبئة مهام اليوم.</i>`);
  messages.push(teacherMsg.join("\n"));

  // ── ٣. المشرفات ──
  messages.push([
    ...header("💐", "تقرير المشرفات"),
    `مكتملة بلا ملاحظات: <b>${ar(completeCircles)}</b> من ${ar(circlesWithRoster)} حلقة`,
    ...groupByTrack(supIssues, "ما شاء الله، كل الحلقات مكتملة."),
  ].join("\n"));

  // ── ٤. مسؤولات المسارات ──
  const tsLines: string[] = [...header("🌙", "تقرير مسؤولات المسارات")];
  const byTrack = new Map<string, typeof expected>();
  for (const c of expected) { const k = trackNameOf(c); byTrack.set(k, [...(byTrack.get(k) ?? []), c]); }
  let tsProblems = 0;
  for (const [trackName, cs] of [...byTrack.entries()].sort((a, b) => trackOrder(a[0], b[0]))) {
    const problems: Row[] = [];
    const missingTasks = cs.filter((c) => !(tasksByCircle.get(c.id)?.length));
    if (missingTasks.length === cs.length) problems.push(["المهام", `لم تُعبّأ لأي حلقة (${ar(cs.length)})`]);
    else if (missingTasks.length > 0) problems.push(["المهام", `ناقصة ${ar(missingTasks.length)}: ${missingTasks.map((c) => esc(c.name)).join("، ")}`]);
    const times = [
      ...cs.flatMap((c) => (recsByCircle.get(c.id) ?? []).map((r) => r.createdAt)),
      ...cs.flatMap((c) => (tasksByCircle.get(c.id) ?? []).map((t) => t.createdAt)),
    ].filter((x): x is Date => !!x);
    if (times.length) {
      const finish = new Date(Math.max(...times.map((t) => t.getTime())));
      if (minutesSinceMakkahDayStart(D, finish) > ONE_AM_MINUTES_SINCE_DAY_START) problems.push(["وقت الإنهاء", `متأخر ${fmtTime(finish)}`]);
    }
    const trackId = cs[0]?.trackId;
    const names = tsNames.filter((n) => n.trackId === trackId).map((n) => n.name);
    const filledBy = [...new Set(cs.flatMap((c) => (tasksByCircle.get(c.id) ?? []).map((t) => tsNameById.get(t.supervisorNameId)).filter(Boolean)))];
    const accounts = users.filter((u) => u.role === "track_supervisor" && !u.isArchived && u.track && (u.track === trackName || u.track.replace(/^مسار\s+/, "") === trackName));
    for (const a of accounts) {
      const days = a.lastLoginAt ? Math.floor((Date.now() - new Date(a.lastLoginAt).getTime()) / 86400000) : null;
      if (days === null) problems.push([esc(a.name), "لم تدخل الموقع أبدًا"]);
      else if (days >= 3) problems.push([esc(a.name), `لم تدخل منذ ${ar(days)} أيام`]);
    }
    if (problems.length === 0) continue;
    tsProblems++;
    const who = names.length ? names.join("، ") : accounts.map((a) => a.name).join("، ");
    if (filledBy.length) problems.push(["عبّأت المهام", filledBy.map((n) => esc(n!)).join("، ")]);
    tsLines.push(itemBlock({ track: trackName, title: `مسار ${esc(trackName.replace(/^مسار\s+/, ""))}${who ? ` | ${esc(who)}` : ""}`, rows: problems }), "");
  }
  if (tsProblems === 0) tsLines.push("ما شاء الله، كل المسارات أنجزت مهامها.");
  messages.push(tsLines.join("\n"));

  // ── ٥. الطالبات المتعثرات ──
  const pagesOf = (r: typeof recentRecords[number]) =>
    (r.memorizePages ?? 0) + (r.reviewNearPages ?? 0) + (r.reviewFarPages ?? 0) + (r.reviewFar2Pages ?? 0) + (r.reviewPages ?? 0) + (r.recitationPages ?? 0);
  const recsByStudent = new Map<string, typeof recentRecords>();
  for (const r of recentRecords) { const k = `${r.studentId}:${r.circleId}`; const l = recsByStudent.get(k) ?? []; l.push(r); recsByStudent.set(k, l); }
  const lowByStudent = new Map(lowAlerts.map((a) => [`${a.studentId}:${a.circleId}`, a]));
  const studentIssues: CircleIssue[] = [];
  for (const c of circles) {
    for (const s of roster.get(c.id) ?? []) {
      const k = `${s.studentId}:${c.id}`;
      const recs = (recsByStudent.get(k) ?? []).sort((a, b) => a.date.localeCompare(b.date));
      const last14 = recs.filter((r) => r.date >= d14);
      const reasons: Row[] = [];
      const delay = planDelay.get(k) ?? 0;
      if (delay >= 3) reasons.push(["خطة المراجعة", `متأخرة ${ar(delay)} أيام`]);
      const abs14 = last14.filter((r) => r.isAbsent).length;
      const tail = recs.slice(-3);
      if (tail.length === 3 && tail.every((r) => r.isAbsent)) reasons.push(["الغياب", "آخر ٣ أيام متتالية"]);
      else if (abs14 >= 3) reasons.push(["الغياب", `${ar(abs14)} أيام في أسبوعين`]);
      const short14 = last14.filter((r) => !r.isAbsent && pagesOf(r) === 0).length;
      if (short14 >= 3) reasons.push(["التقصير", `${ar(short14)} أيام بلا إنجاز`]);
      const present = recs.filter((r) => !r.isAbsent);
      const recent = present.filter((r) => r.date > addDaysStr(D, -7));
      const prev = present.filter((r) => r.date <= addDaysStr(D, -7));
      if (recent.length >= 2 && prev.length >= 3) {
        const avgRecent = recent.reduce((a, r) => a + pagesOf(r), 0) / recent.length;
        const avgPrev = prev.reduce((a, r) => a + pagesOf(r), 0) / prev.length;
        if (avgPrev >= 2 && avgRecent <= avgPrev * 0.5) reasons.push(["الإنجاز", `نزل من ${ar(Math.round(avgPrev * 10) / 10)} إلى ${ar(Math.round(avgRecent * 10) / 10)} صفحة يوميًا`]);
      }
      const low = lowByStudent.get(k);
      if (low) reasons.push(["الحفظ", `منخفض: ${ar(Math.round((low.totalPages ?? 0) * 10) / 10)} صفحة في ${ar(low.periodDays)} يومًا`]);
      if (reasons.length === 0) continue;
      studentIssues.push({ track: trackNameOf(c), title: `${esc(c.name)} | ${esc(s.fullName)}`, rows: reasons });
    }
  }
  messages.push([...header("🌸", "تقرير الطالبات اللواتي يحتجن متابعة"), `العدد: <b>${ar(studentIssues.length)}</b> طالبة`, ...groupByTrack(studentIssues, "ما شاء الله، لا طالبات متعثرات.")].join("\n"));

  // ── ٦. من أتممن خطة المراجعة ──
  const doneIssues: CircleIssue[] = completed.map((x) => ({ track: x.track, title: `${esc(x.circle)} | ${esc(x.name)}`, rows: x.pages ? [["الخطة", `${ar(x.pages)} صفحة`]] : [] }));
  messages.push([...header("✨", "بشرى من أتممن خطة المراجعة"), `العدد: <b>${ar(completed.length)}</b> طالبة`, ...groupByTrack(doneIssues, "لم تُتمّ أي طالبة خطتها بعد."), "", "<i>بارك الله فيكِ وفي جهودكِ يا رِحاب</i>"].join("\n"));

  messages.unshift(buildSummary({ teachers: teacherIssues.length, supervisors: supIssues.length, tracks: tsProblems, students: studentIssues.length, completed: completed.length }));

  return { date: D, messages };

  // ── ٠. الملخص (يُبنى أخيرًا ليحمل أعداد التقارير التالية، ويوضع أول رسالة) ──
  function buildSummary(counts?: { teachers: number; supervisors: number; tracks: number; students: number; completed: number }): string {
    greetIdx = 0;
    const lines = [greet("🌙", "ملخص اليوم"), `<i>${fmtDate(D)}</i>`, ""];
    if (!isWorkDay) { lines.push("لا دوام في هذا اليوم، دمتِ بخير."); return lines.join("\n"); }
    const attendTotal = presentCount + absentCount;
    const pct = attendTotal ? ar(Math.round((presentCount / attendTotal) * 100)) : "٠";
    lines.push(
      "<code>أرقام اليوم</code> ✨",
      `▫️ الحلقات المكتملة: <b>${ar(completeCircles)}</b> من ${ar(circlesWithRoster)}`,
      `▫️ الحضور: <b>${pct}٪</b> (${ar(presentCount)} حاضرة، ${ar(absentCount)} غائبة)`,
      `▫️ خطط المراجعة: <b>${ar(ontrack)}</b> منتظمة، <b>${ar(behind)}</b> متأخرة، <b>${ar(ahead)}</b> متقدمة`,
    );
    if (counts) {
      lines.push(
        "",
        "<code>في التقارير التالية</code>",
        `▫️ غياب المعلمات وتأخرهن: <b>${ar(counts.teachers)}</b>`,
        `▫️ حلقات عليها ملاحظات: <b>${ar(counts.supervisors)}</b>`,
        `▫️ مسارات عليها ملاحظات: <b>${ar(counts.tracks)}</b>`,
        `▫️ طالبات يحتجن متابعة: <b>${ar(counts.students)}</b>`,
        `▫️ أتممن خطة المراجعة: <b>${ar(counts.completed)}</b>`,
      );
    }
    return lines.join("\n");
  }
}

type Row = [label: string, value: string];
type Issue = { track: string; title: string; rows: Row[] };

/** بند واحد بأسلوب القائدة: إطار، أوله «الحلقة | الاسم»، ثم «<b>البند</b> ← القيمة» */
function itemBlock(it: Issue): string {
  const rows = it.rows.map(([l, v]) => (v ? `<b>${l}</b> ← ${v}` : `<b>${l}</b>`));
  return `<blockquote>${[it.title, ...rows].join("\n")}</blockquote>`;
}

function groupByTrack(items: Issue[], emptyText: string): string[] {
  if (items.length === 0) return [emptyText];
  const map = new Map<string, Issue[]>();
  for (const it of items) map.set(it.track, [...(map.get(it.track) ?? []), it]);
  const out: string[] = [];
  for (const [t, list] of [...map.entries()].sort((a, b) => trackOrder(a[0], b[0]))) {
    out.push(`<code>مسار ${esc(t.replace(/^مسار\s+/, ""))} · ${ar(list.length)}</code> ✨`);
    for (const it of list) out.push(itemBlock(it), "");
  }
  return out;
}

// ── الإرسال إلى تيليجرام ─────────────────────────────────────────────────

async function getSetting(key: string): Promise<string | null> {
  const [row] = await db.select().from(globalSettingsTable).where(eq(globalSettingsTable.key, key));
  return row?.value ?? null;
}
async function setSetting(key: string, value: string): Promise<void> {
  await db.insert(globalSettingsTable).values({ key, value })
    .onConflictDoUpdate({ target: globalSettingsTable.key, set: { value } });
}

/** معرّف محادثة القائدة: من البيئة، أو المحفوظ، أو آخر من راسل البوت (ثم يُحفظ). */
async function resolveChatId(token: string): Promise<string | null> {
  if (process.env.TELEGRAM_CHAT_ID) return process.env.TELEGRAM_CHAT_ID;
  const saved = await getSetting("telegram_chat_id");
  if (saved) return saved;
  const r = await fetch(`https://api.telegram.org/bot${token}/getUpdates`);
  const data = (await r.json()) as { ok: boolean; result?: Array<{ message?: { chat?: { id: number; type: string } } }> };
  const chat = [...(data.result ?? [])].reverse().find((u) => u.message?.chat?.type === "private")?.message?.chat;
  if (!chat) return null;
  await setSetting("telegram_chat_id", String(chat.id));
  return String(chat.id);
}

export async function sendDailyReportToTelegram(opts: { date?: string; force?: boolean } = {}): Promise<{ sent: number; date: string; skipped?: string }> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN غير مضبوط في إعدادات الخادم");
  const report = await buildDailyReport(opts.date);
  if (!opts.force && (await getSetting("telegram_last_report_date")) === report.date) {
    return { sent: 0, date: report.date, skipped: "أُرسل تقرير هذا اليوم مسبقًا" };
  }
  const chatId = await resolveChatId(token);
  if (!chatId) throw new Error("لا أعرف محادثتك بعد: أرسلي أي رسالة إلى البوت ثم أعيدي المحاولة");
  let sent = 0;
  for (const msg of report.messages) {
    for (const part of splitForTelegram(msg)) {
      const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: part, parse_mode: "HTML", disable_web_page_preview: true }),
      });
      if (!r.ok) throw new Error(`تيليجرام رفض الرسالة: ${r.status} ${await r.text()}`);
      sent++;
    }
  }
  await setSetting("telegram_last_report_date", report.date);
  return { sent, date: report.date };
}
