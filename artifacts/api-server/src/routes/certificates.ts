import { Router, type IRouter } from "express";
import ExcelJS from "exceljs";
import {
  db,
  certificateTermsTable,
  certificateScoresTable,
  certificateImportCandidatesTable,
  studentsTable,
  circlesTable,
  tracksTable,
  recordsTable,
  reviewPlansTable,
  reviewPlanDaysTable,
  studentEnrollmentsTable,
  usersTable,
} from "@workspace/db";
import { and, desc, eq, gte, lte, inArray } from "drizzle-orm";
import {
  CreateCertificateTermBody,
  UpdateCertificateTermBody,
  SaveCertificateGradesBody,
  ResolveCertificateImportCandidatesBody,
} from "@workspace/api-zod";
import { isShortcomingRecord } from "../lib/shortcoming";
import { authenticate } from "../middlewares/authenticate";
import { isEntryExpectedOn } from "../lib/dataEntrySchedule";
import { getMakkahDay } from "../lib/date";
import { isOwnStudent } from "../lib/access";
import { loadGirlsCoverage, getPlanCycleDates } from "./reviewPlans";

const router: IRouter = Router();
const MANAGER_ROLES = ["leader", "deputy", "track_supervisor"];

type ScoreRule = {
  testMax: number;
  attendanceMax: number;
  shortcomingsMax: number;
  reviewPlanMax: number;
};

function normalize(value: string | null | undefined): string {
  return (value ?? "").replace(/^مسار\s+/, "").trim().replace(/\s+/g, " ").toLowerCase();
}

function getRule(trackType: string, trackName?: string | null): ScoreRule {
  const normalizedTrack = normalize(trackName);
  if (normalizedTrack.includes("سُنى") || normalizedTrack.includes("سنى") || normalizedTrack.includes("مشكاة")) {
    return { testMax: 20, reviewPlanMax: 0, attendanceMax: 20, shortcomingsMax: 10 };
  }
  if (trackType === "girls") return { testMax: 50, reviewPlanMax: 20, attendanceMax: 20, shortcomingsMax: 10 };
  if (trackType === "mothers") return { testMax: 70, reviewPlanMax: 0, attendanceMax: 30, shortcomingsMax: 0 };
  if (trackType === "children") return { testMax: 70, reviewPlanMax: 0, attendanceMax: 30, shortcomingsMax: 0 };
  return { testMax: 60, reviewPlanMax: 0, attendanceMax: 30, shortcomingsMax: 10 };
}

function asIso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function publicTerm(term: typeof certificateTermsTable.$inferSelect) {
  return {
    id: term.id,
    name: term.name,
    academicYear: term.academicYear,
    startDate: term.startDate,
    endDate: term.endDate,
    reviewCycleOneStart: term.reviewCycleOneStart,
    reviewCycleTwoStart: term.reviewCycleTwoStart,
    status: term.status as "draft" | "published",
    publishedAt: asIso(term.publishedAt),
    publishedTracks: (term.publishedTracks ?? []) as string[],
    createdAt: term.createdAt.toISOString(),
  };
}

function isoDaysBetween(start: string, end: string): string[] {
  const days: string[] = [];
  const cursor = new Date(`${start}T12:00:00Z`);
  const final = new Date(`${end}T12:00:00Z`);
  while (cursor <= final) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

const onLeave = (day: string, ...periods: Array<{ leaveStart: string | null; leaveEnd: string | null } | undefined>) =>
  periods.some((p) => Boolean(p?.leaveStart && p.leaveEnd && day >= p.leaveStart && day <= p.leaveEnd));

function canManageTrack(
  req: Express.Request,
  trackName: string | null | undefined,
): boolean {
  if (req.userRole === "leader" || req.userRole === "deputy") return true;
  return req.userRole === "track_supervisor" && normalize(req.userTrack) === normalize(trackName);
}

/** هل نتيجة هذا المسار منشورة؟ (الفصل كله منشور، أو المسار ضمن المنشورة) */
function isTrackPublished(term: typeof certificateTermsTable.$inferSelect, trackName: string | null | undefined): boolean {
  if (term.status === "published") return true;
  return ((term.publishedTracks ?? []) as string[]).some((t) => normalize(t) === normalize(trackName ?? "بلا مسار"));
}

async function getTerm(termId: number) {
  const [term] = await db.select().from(certificateTermsTable).where(eq(certificateTermsTable.id, termId));
  return term ?? null;
}

// استيراد تاريخي لا يعتمد على تواريخ التقويم أو الحضور.
router.post("/certificate-historical-import", authenticate, async (req, res): Promise<void> => {
  if (!["leader", "deputy"].includes(req.userRole!)) { res.status(403).json({ error: "Forbidden" }); return; }
  const rows = req.body?.rows;
  if (!Array.isArray(rows) || !rows.length || rows.length > 10000) { res.status(400).json({ error: "ملف الاستيراد غير صالح" }); return; }
  const [term] = await db.insert(certificateTermsTable).values({
    name: "الفصل الأول — بيانات تاريخية", startDate: "1900-01-01", endDate: "1900-01-01", status: "draft", createdById: req.userId!,
  }).returning();
  const values = rows.map((r: any, i: number) => ({
    termId: term.id, sourceSheet: String(r.sheet ?? "").slice(0, 200), sourceRow: Number(r.row) || i + 1,
    sourceName: String(r.name ?? "").trim().slice(0, 300), sourceTrack: String(r.track ?? "").trim().slice(0, 200) || null,
    sourceQuotaFrom: String(r.quotaFrom ?? "").trim().slice(0, 200) || null, sourceQuotaTo: String(r.quotaTo ?? "").trim().slice(0, 200) || null,
    sourceScore: typeof r.score === "number" && Number.isFinite(r.score) ? r.score : null, confidence: "unmatched" as const, resolved: false,
  })).filter((r: any) => r.sourceName);
  if (!values.length) { res.status(400).json({ error: "لم يتم العثور على أسماء" }); return; }
  await db.insert(certificateImportCandidatesTable).values(values);
  res.status(201).json({ termId: term.id, imported: values.length });
});

export type CertificateResult = Awaited<ReturnType<typeof computeResults>>[number];

/**
 * نتيجة كل تسجيل (طالبة + حلقة). الطالبة في أكثر من حلقة لها نتيجة لكل حلقة،
 * وتُحسب كل نتيجة من سجلات تلك الحلقة فقط.
 * بعد النشر تُعرض النسخة المحفوظة لحظة النشر (snapshot) فلا تتغير الشهادة بتعديل السجلات لاحقًا.
 */
async function buildResults(
  term: typeof certificateTermsTable.$inferSelect,
  opts: { trackId?: number; studentIds?: number[] } = {},
): Promise<CertificateResult[]> {
  // المسارات المنشورة: النسخة المثبّتة لحظة النشر؛ والباقي يُحسب الآن
  const saved = await db.select({ snapshot: certificateScoresTable.snapshot }).from(certificateScoresTable).where(and(
    eq(certificateScoresTable.termId, term.id),
    ...(opts.studentIds ? [inArray(certificateScoresTable.studentId, opts.studentIds.length ? opts.studentIds : [-1])] : []),
  ));
  const snaps = saved.map((r) => r.snapshot as CertificateResult | null)
    .filter((r): r is CertificateResult => !!r && isTrackPublished(term, r.trackName))
    .filter((r) => !opts.trackId || r.trackId === opts.trackId);
  const snapKeys = new Set(snaps.map((r) => `${r.studentId}:${r.circleId}`));
  const live = (await computeResults(term, opts))
    .filter((r) => !snapKeys.has(`${r.studentId}:${r.circleId}`) && !isTrackPublished(term, r.trackName));
  return [...snaps, ...live];
}

async function computeResults(
  term: typeof certificateTermsTable.$inferSelect,
  opts: { trackId?: number; studentIds?: number[] } = {},
) {
  const [circles, tracks] = await Promise.all([db.select().from(circlesTable), db.select().from(tracksTable)]);
  const circleById = new Map(circles.map((c) => [c.id, c]));
  const trackById = new Map(tracks.map((t) => [t.id, t]));

  const enrollments = (await db.select({
    studentId: studentEnrollmentsTable.studentId, circleId: studentEnrollmentsTable.circleId,
    leaveStart: studentEnrollmentsTable.leaveStart, leaveEnd: studentEnrollmentsTable.leaveEnd,
    fullName: studentsTable.fullName, studentLeaveStart: studentsTable.leaveStart, studentLeaveEnd: studentsTable.leaveEnd,
  }).from(studentEnrollmentsTable)
    .innerJoin(studentsTable, eq(studentsTable.id, studentEnrollmentsTable.studentId))
    .where(and(
      eq(studentEnrollmentsTable.isArchived, false),
      eq(studentsTable.isArchived, false),
      ...(opts.studentIds ? [inArray(studentEnrollmentsTable.studentId, opts.studentIds.length ? opts.studentIds : [-1])] : []),
    )))
    .filter((e) => !opts.trackId || circleById.get(e.circleId)?.trackId === opts.trackId);
  if (enrollments.length === 0) return [];

  const circleIds = [...new Set(enrollments.map((e) => e.circleId))];
  const studentIds = [...new Set(enrollments.map((e) => e.studentId))];
  // لا تُحسب أيام لم تأتِ بعد (النتيجة أثناء الفصل = حتى اليوم)
  const lastDay = term.endDate < getMakkahDay() ? term.endDate : getMakkahDay();
  const [rawRecords, plans, savedScores, candidates] = await Promise.all([
    db.select({
      studentId: recordsTable.studentId, circleId: recordsTable.circleId, date: recordsTable.date, isAbsent: recordsTable.isAbsent,
      reviewNearPages: recordsTable.reviewNearPages, reviewFarPages: recordsTable.reviewFarPages, reviewFar2Pages: recordsTable.reviewFar2Pages,
      shortcomingOverride: recordsTable.shortcomingOverride, listenedToReciter: recordsTable.listenedToReciter, updatedAt: recordsTable.updatedAt,
    }).from(recordsTable).where(and(
      gte(recordsTable.date, term.startDate), lte(recordsTable.date, lastDay), inArray(recordsTable.circleId, circleIds),
    )),
    db.select().from(reviewPlansTable).where(and(
      gte(reviewPlansTable.startDate, term.startDate), lte(reviewPlansTable.startDate, term.endDate),
      eq(reviewPlansTable.planType, "girls_review"), inArray(reviewPlansTable.studentId, studentIds),
    )),
    db.select().from(certificateScoresTable).where(eq(certificateScoresTable.termId, term.id)),
    db.select({ matchedStudentId: certificateImportCandidatesTable.matchedStudentId, resolved: certificateImportCandidatesTable.resolved })
      .from(certificateImportCandidatesTable).where(eq(certificateImportCandidatesTable.termId, term.id)),
  ]);

  const key = (studentId: number, circleId: number | null | undefined) => `${studentId}:${circleId ?? ""}`;
  const scoreByKey = new Map(savedScores.map((s) => [key(s.studentId, s.circleId), s]));
  const ambiguous = new Set(candidates.filter((c) => !c.resolved && c.matchedStudentId != null).map((c) => c.matchedStudentId!));

  // سجلات كل (طالبة، حلقة) بالتاريخ، والأيام التي انعقدت فيها كل حلقة (فيها إدخال لأي طالبة)
  const recordsByKey = new Map<string, Map<string, typeof rawRecords[number]>>();
  const heldDays = new Map<number, Set<string>>();
  for (const r of rawRecords) {
    (heldDays.get(r.circleId) ?? heldDays.set(r.circleId, new Set()).get(r.circleId)!).add(r.date);
    const k = key(r.studentId, r.circleId);
    const byDate = recordsByKey.get(k) ?? recordsByKey.set(k, new Map()).get(k)!;
    const prev = byDate.get(r.date);
    if (!prev || r.updatedAt > prev.updatedAt) byDate.set(r.date, r);
  }

  // خطة واحدة لكل دورة (تاريخ بداية) لكل تسجيل: الأحدث إنشاءً
  const latestPlan = new Map<string, (typeof plans)[number]>();
  for (const plan of plans) {
    const k = `${key(plan.studentId, plan.circleId)}|${plan.startDate}`;
    const prev = latestPlan.get(k);
    if (!prev || plan.createdAt > prev.createdAt) latestPlan.set(k, plan);
  }
  const termPlans = [...latestPlan.values()];
  const coverage = await loadGirlsCoverage(termPlans);
  const planDayCounts = new Map<number, number>();
  if (termPlans.length) {
    const rows = await db.select({ planId: reviewPlanDaysTable.planId, pages: reviewPlanDaysTable.pages })
      .from(reviewPlanDaysTable).where(inArray(reviewPlanDaysTable.planId, termPlans.map((p) => p.id)));
    for (const r of rows) planDayCounts.set(r.planId, (planDayCounts.get(r.planId) ?? 0) + 1);
  }
  const plansByKey = new Map<string, typeof termPlans>();
  for (const p of termPlans) {
    const k = key(p.studentId, p.circleId);
    plansByKey.set(k, [...(plansByKey.get(k) ?? []), p]);
  }
  const termDays = isoDaysBetween(term.startDate, lastDay);

  return enrollments.map((enr) => {
    const circle = circleById.get(enr.circleId) ?? null;
    const track = circle?.trackId ? trackById.get(circle.trackId) ?? null : null;
    const trackType = track?.dataEntryType ?? circle?.trackType ?? "girls";
    const rule = getRule(trackType, track?.name ?? circle?.track);
    const k = key(enr.studentId, enr.circleId);
    const savedScore = scoreByKey.get(k);
    const byDate = recordsByKey.get(k) ?? new Map<string, typeof rawRecords[number]>();
    const firstDay = [...byDate.keys()].sort()[0];
    const held = heldDays.get(enr.circleId) ?? new Set<string>();

    // الأيام المحتسبة: يوم دوام لهذه الحلقة (حسب جدول مسارها) انعقدت فيه فعلًا، بعد التحاق الطالبة
    // بها (أول سجل لها فيها)، وليست في إجازة معتمدة. يوم لم تُدخل فيه المشرفة لأحد لا يُحسب على الطالبة.
    const eligibleDays = firstDay ? termDays.filter((day) =>
      day >= firstDay
      && isEntryExpectedOn(trackType, circle?.name, day)
      && held.has(day)
      && !onLeave(day, enr, { leaveStart: enr.studentLeaveStart, leaveEnd: enr.studentLeaveEnd })) : [];

    const presentDays = eligibleDays.filter((day) => {
      const record = byDate.get(day);
      return Boolean(record && !record.isAbsent);
    }).length;
    const attendanceScore = rule.attendanceMax === 0 || eligibleDays.length === 0
      ? rule.attendanceMax
      : Number(((presentDays / eligibleDays.length) * rule.attendanceMax).toFixed(2));

    const shortcomingDays = rule.shortcomingsMax === 0 ? 0 : eligibleDays.filter((day) => {
      const record = byDate.get(day);
      return Boolean(record && isShortcomingRecord(record, trackType));
    }).length;
    const shortcomingsScore = rule.shortcomingsMax === 0 || eligibleDays.length === 0
      ? rule.shortcomingsMax
      : Number((rule.shortcomingsMax * Math.max(0, 1 - (shortcomingDays / eligibleDays.length))).toFixed(2));

    // خطة المراجعة: الأيام المنجزة فعلًا بمقارنة النطاقات (نفس حساب صفحة الخطط)، من أيام الخطة التي مضت
    let reviewDaysDone = 0;
    let reviewDaysDue = 0;
    for (const plan of plansByKey.get(k) ?? []) {
      const total = planDayCounts.get(plan.id) ?? 0;
      if (total === 0) continue;
      const cycle = getPlanCycleDates(plan.startDate!, "girls_review");
      const elapsed = Math.min(total, cycle.filter((d) => d <= lastDay).length);
      const reached = Math.min(total, coverage.get(plan.id)?.daysReached ?? 0);
      reviewDaysDue += elapsed;
      reviewDaysDone += Math.min(reached, elapsed);
    }
    const reviewPlanScore = rule.reviewPlanMax === 0 ? 0 : Number((
      reviewDaysDue > 0 ? Math.min(1, reviewDaysDone / reviewDaysDue) * rule.reviewPlanMax : 0
    ).toFixed(2));

    const testScore = savedScore?.testScore ?? null;
    // no_exam = حددت مسؤولة المسار أنها لم تختبر: تُنشر نتيجتها بدرجة اختبار صفر
    const status = ambiguous.has(enr.studentId) ? "ambiguous_import"
      : savedScore?.status === "no_exam" ? "no_exam"
      : testScore == null ? "missing_exam" : "ready";
    const totalScore = Number(((testScore ?? 0) + attendanceScore + shortcomingsScore + reviewPlanScore).toFixed(2));

    return {
      studentId: enr.studentId,
      studentName: enr.fullName,
      circleId: circle?.id ?? null,
      circleName: circle?.name ?? null,
      trackId: track?.id ?? null,
      trackName: track?.name ?? circle?.track ?? null,
      trackType,
      testScore,
      testMax: rule.testMax,
      priorNisab: savedScore?.priorNisab ?? null,
      currentNisab: savedScore?.currentNisab ?? null,
      cumulativeNisab: savedScore?.cumulativeNisab ?? null,
      attendanceDays: presentDays,
      eligibleAttendanceDays: eligibleDays.length,
      shortcomingDays,
      eligibleShortcomingDays: rule.shortcomingsMax === 0 ? 0 : eligibleDays.length,
      // بالأيام: أيام الخطة المنجزة من أيامها التي مضت
      reviewUnitsCompleted: reviewDaysDone,
      reviewUnitsPlanned: reviewDaysDue,
      totalScore,
      breakdown: {
        test: testScore ?? 0,
        testMax: rule.testMax,
        attendance: attendanceScore,
        attendanceMax: rule.attendanceMax,
        shortcomings: shortcomingsScore,
        shortcomingsMax: rule.shortcomingsMax,
        deduction: Number(Math.max(0, rule.shortcomingsMax - shortcomingsScore).toFixed(2)),
        reviewPlan: reviewPlanScore,
        reviewPlanMax: rule.reviewPlanMax,
      },
      status,
    };
  });
}

router.get("/certificate-terms", authenticate, async (req, res): Promise<void> => {
  const terms = await db.select().from(certificateTermsTable).orderBy(desc(certificateTermsTable.startDate));
  const visible = req.userRole === "student"
    ? terms.filter((term) => term.status === "published" || ((term.publishedTracks ?? []) as string[]).length > 0)
    : terms;
  res.json(visible.map(publicTerm));
});

router.post("/certificate-terms", authenticate, async (req, res): Promise<void> => {
  if (!["leader", "deputy"].includes(req.userRole!)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const parsed = CreateCertificateTermBody.safeParse(req.body);
  if (!parsed.success || parsed.data.endDate < parsed.data.startDate) {
    res.status(400).json({ error: "بيانات الفصل غير صحيحة" });
    return;
  }
  const [term] = await db.insert(certificateTermsTable).values({
    ...parsed.data,
    academicYear: parsed.data.academicYear ?? null,
    reviewCycleOneStart: parsed.data.reviewCycleOneStart ?? parsed.data.startDate,
    reviewCycleTwoStart: parsed.data.reviewCycleTwoStart ?? null,
    createdById: req.userId!,
  }).returning();
  res.status(201).json(publicTerm(term!));
});

router.patch("/certificate-terms/:termId", authenticate, async (req, res): Promise<void> => {
  if (!["leader", "deputy"].includes(req.userRole!)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const termId = Number(req.params.termId);
  const parsed = UpdateCertificateTermBody.safeParse(req.body);
  const term = await getTerm(termId);
  if (!term) {
    res.status(404).json({ error: "الفصل غير موجود" });
    return;
  }
  if (term.status === "published") {
    res.status(409).json({ error: "لا يمكن تعديل فصل منشور" });
    return;
  }
  if (!parsed.success) {
    res.status(400).json({ error: "بيانات الفصل غير صحيحة" });
    return;
  }
  const [updated] = await db.update(certificateTermsTable).set(parsed.data)
    .where(eq(certificateTermsTable.id, termId)).returning();
  res.json(publicTerm(updated!));
});

router.get("/certificate-terms/:termId/students", authenticate, async (req, res): Promise<void> => {
  if (!MANAGER_ROLES.includes(req.userRole!)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const term = await getTerm(Number(req.params.termId));
  if (!term) {
    res.status(404).json({ error: "الفصل غير موجود" });
    return;
  }
  let trackId = req.query.trackId ? Number(req.query.trackId) : undefined;
  const tracks = await db.select().from(tracksTable);
  if (req.userRole === "track_supervisor") {
    // مسؤولة المسار ترى مسارها تلقائيًا
    const own = tracks.find((track) => canManageTrack(req, track.name));
    if (trackId == null) trackId = own?.id;
    const requestedTrack = trackId ? tracks.find((track) => track.id === trackId) : undefined;
    if (!requestedTrack || !canManageTrack(req, requestedTrack.name)) {
      res.status(403).json({ error: "اختر مسارك فقط" });
      return;
    }
  }
  let results = await buildResults(term, { trackId });
  if (req.userRole === "track_supervisor") {
    results = results.filter((result) => canManageTrack(req, result.trackName));
  }
  const status = typeof req.query.status === "string" ? req.query.status : "all";
  if (status !== "all") results = results.filter((result) => result.status === status);
  res.json(results);
});

router.put("/certificate-terms/:termId/grades", authenticate, async (req, res): Promise<void> => {
  if (!MANAGER_ROLES.includes(req.userRole!)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const term = await getTerm(Number(req.params.termId));
  const parsed = SaveCertificateGradesBody.safeParse(req.body);
  if (!term) {
    res.status(404).json({ error: "الفصل غير موجود" });
    return;
  }
  if (term.status === "published") {
    res.status(409).json({ error: "لا يمكن تعديل فصل منشور" });
    return;
  }
  if (!parsed.success) {
    res.status(400).json({ error: "درجات الاختبار غير صحيحة" });
    return;
  }
  const grades = parsed.data.grades;
  const studentIds = [...new Set(grades.map((g) => g.studentId))];
  const [enrollments, circles, tracks] = await Promise.all([
    db.select({ studentId: studentEnrollmentsTable.studentId, circleId: studentEnrollmentsTable.circleId })
      .from(studentEnrollmentsTable)
      .where(and(eq(studentEnrollmentsTable.isArchived, false), inArray(studentEnrollmentsTable.studentId, studentIds))),
    db.select().from(circlesTable),
    db.select().from(tracksTable),
  ]);
  // تحقق من كل الدرجات أولًا، ثم احفظها معًا (لا حفظ جزئي إن كانت إحداها خاطئة)
  const rows: Array<typeof certificateScoresTable.$inferInsert> = [];
  for (const grade of grades) {
    const mine = enrollments.filter((e) => e.studentId === grade.studentId);
    const enr = grade.circleId != null ? mine.find((e) => e.circleId === grade.circleId) : mine.length === 1 ? mine[0] : undefined;
    const circle = enr ? circles.find((c) => c.id === enr.circleId) : undefined;
    const track = tracks.find((t) => t.id === circle?.trackId);
    const trackType = track?.dataEntryType ?? circle?.trackType ?? "girls";
    const rule = getRule(trackType, track?.name ?? circle?.track);
    const noExam = grade.noExam === true;
    if (!enr || !circle || !canManageTrack(req, track?.name ?? circle.track) || (!noExam && (grade.score < 0 || grade.score > rule.testMax))) {
      res.status(400).json({ error: "إحدى درجات الاختبار أو صلاحيات المسار غير صحيحة" });
      return;
    }
    if (isTrackPublished(term, track?.name ?? circle.track)) {
      res.status(409).json({ error: `نتائج ${track?.name ?? circle.track ?? "المسار"} منشورة، لا يمكن تعديلها` });
      return;
    }
    rows.push({
      termId: term.id, studentId: grade.studentId, circleId: circle.id, trackId: track?.id ?? null, trackType,
      testScore: noExam ? null : grade.score, testNotes: grade.notes ?? null, enteredById: req.userId!, updatedById: req.userId!,
      status: noExam ? "no_exam" : "ready",
    });
  }
  await db.transaction(async (tx) => {
    for (const row of rows) {
      await tx.insert(certificateScoresTable).values(row).onConflictDoUpdate({
        target: [certificateScoresTable.termId, certificateScoresTable.studentId, certificateScoresTable.circleId],
        set: { testScore: row.testScore, testNotes: row.testNotes, trackId: row.trackId, trackType: row.trackType, updatedById: req.userId!, status: row.status },
      });
    }
  });
  const results = await buildResults(term, { studentIds });
  res.json(results.filter((r) => rows.some((row) => row.studentId === r.studentId && row.circleId === r.circleId)));
});

/**
 * النشر لكل مسار على حدة: ?track=اسم المسار (بدونه = كل المسارات الجاهزة دفعة واحدة).
 * يُشترط أن تكون كل طالبات المسار جاهزات (درجة اختبار أو «لم تختبر»).
 */
router.post("/certificate-terms/:termId/publish", authenticate, async (req, res): Promise<void> => {
  if (!["leader", "deputy"].includes(req.userRole!)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const term = await getTerm(Number(req.params.termId));
  if (!term) {
    res.status(404).json({ error: "الفصل غير موجود" });
    return;
  }
  const trackParam = typeof req.query.track === "string" && req.query.track.trim() ? req.query.track.trim() : null;
  const all = (await computeResults(term)).filter((r) => !isTrackPublished(term, r.trackName));
  const results = trackParam ? all.filter((r) => normalize(r.trackName) === normalize(trackParam)) : all;
  if (results.length === 0) {
    res.status(400).json({ error: trackParam ? "لا توجد نتائج غير منشورة لهذا المسار" : "لا توجد نتائج غير منشورة" });
    return;
  }
  const notReady = results.filter((r) => r.status !== "ready" && r.status !== "no_exam");
  if (notReady.length > 0) {
    res.status(409).json({ error: `أكملي درجات الاختبار (أو اختاري «لم تختبر») وراجعي المطابقات قبل النشر — ${notReady.length} طالبة` });
    return;
  }
  const tracksNow = [...new Set(results.map((r) => r.trackName ?? "بلا مسار"))];
  const published = await db.transaction(async (tx) => {
    // تثبيت النتيجة لحظة النشر
    for (const r of results) {
      await tx.update(certificateScoresTable).set({ snapshot: r }).where(and(
        eq(certificateScoresTable.termId, term.id),
        eq(certificateScoresTable.studentId, r.studentId),
        eq(certificateScoresTable.circleId, r.circleId!),
      ));
    }
    const publishedTracks = [...new Set([...((term.publishedTracks ?? []) as string[]), ...tracksNow])];
    const everything = all.length === results.length;
    const [row] = await tx.update(certificateTermsTable)
      .set({ publishedTracks, ...(everything ? { status: "published", publishedAt: new Date() } : {}) })
      .where(eq(certificateTermsTable.id, term.id))
      .returning();
    return row;
  });
  res.json(publicTerm(published!));
});

router.get("/certificate-terms/:termId/my-result", authenticate, async (req, res): Promise<void> => {
  if (req.userRole !== "student") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const term = await getTerm(Number(req.params.termId));
  if (!term) {
    res.status(404).json({ error: "النتيجة غير منشورة" });
    return;
  }
  // الطالبة: بالربط المحفوظ، وإلا بالاسم ثم السجل في حلقة الحساب (حسابات الطالبات في أكثر من حلقة)
  const [me] = await db.select({ name: usersTable.name, circleId: usersTable.circleId }).from(usersTable).where(eq(usersTable.id, req.userId!));
  const accountCircle = req.userCircleId ?? me?.circleId ?? null;
  let studentIds: number[] = req.userStudentId ? [req.userStudentId] : [];
  if (studentIds.length === 0 && me?.name) {
    const candidates = await db.select({ id: studentsTable.id }).from(studentsTable).where(eq(studentsTable.fullName, me.name.trim()));
    for (const c of candidates) if (await isOwnStudent(req, c.id, accountCircle)) studentIds.push(c.id);
  }
  const results = (studentIds.length ? await buildResults(term, { studentIds }) : [])
    .filter((r) => isTrackPublished(term, r.trackName));
  const result = results.find((r) => r.circleId === accountCircle) ?? results[0];
  if (!result) {
    res.status(404).json({ error: "لا توجد نتيجة مرتبطة بالحساب" });
    return;
  }
  res.json(result);
});

router.get("/certificate-terms/:termId/import-candidates", authenticate, async (req, res): Promise<void> => {
  if (!["leader", "deputy"].includes(req.userRole!)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const rows = await db.select().from(certificateImportCandidatesTable)
    .where(eq(certificateImportCandidatesTable.termId, Number(req.params.termId)));
  const students = await db.select().from(studentsTable);
  res.json(rows.map((row) => {
    const student = students.find((item) => item.id === row.matchedStudentId);
    return {
      id: row.id,
      sourceName: row.sourceName,
      sourceTrack: row.sourceTrack,
      sourcePhone: row.sourcePhone,
      quotaFrom: row.sourceQuotaFrom,
      quotaTo: row.sourceQuotaTo,
      importedScore: row.sourceScore,
      matchedStudentId: row.matchedStudentId,
      matchedStudentName: student?.fullName ?? null,
      confidence: row.confidence as "exact" | "likely" | "ambiguous" | "unmatched",
      resolved: row.resolved,
    };
  }));
});

// استقبال صفوف Excel بعد تحليلها في المتصفح. تحفظ كمرشحين تاريخيين فقط؛
// لا تُنشئ حسابًا ولا تغيّر students.circle_id، حتى تتم مراجعة الأسماء المتشابهة يدويًا.
router.post("/certificate-terms/:termId/import-candidates", authenticate, async (req, res): Promise<void> => {
  if (!["leader", "deputy"].includes(req.userRole!)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const term = await getTerm(Number(req.params.termId));
  const rows = req.body?.rows;
  if (!term || term.status === "published" || !Array.isArray(rows) || rows.length === 0 || rows.length > 10000) {
    res.status(400).json({ error: "ملف الاستيراد غير صالح أو الفصل منشور" });
    return;
  }
  const values = rows.map((row: any, index: number) => ({
    termId: term.id,
    sourceSheet: typeof row.sheet === "string" ? row.sheet.slice(0, 200) : null,
    sourceRow: Number.isInteger(row.row) ? row.row : index + 1,
    sourceName: String(row.name ?? "").trim().slice(0, 300),
    sourceTrack: typeof row.track === "string" ? row.track.trim().slice(0, 200) : null,
    sourceQuotaFrom: typeof row.quotaFrom === "string" ? row.quotaFrom.trim().slice(0, 200) : null,
    sourceQuotaTo: typeof row.quotaTo === "string" ? row.quotaTo.trim().slice(0, 200) : null,
    sourceScore: typeof row.score === "number" && Number.isFinite(row.score) ? row.score : null,
    confidence: "unmatched" as const,
    resolved: false,
  })).filter((row: any) => row.sourceName.length > 0);
  if (!values.length) {
    res.status(400).json({ error: "لم يتم العثور على أسماء في الملف" });
    return;
  }
  await db.insert(certificateImportCandidatesTable).values(values);
  res.status(201).json({ imported: values.length });
});

router.put("/certificate-terms/:termId/import-candidates", authenticate, async (req, res): Promise<void> => {
  if (!["leader", "deputy"].includes(req.userRole!)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const term = await getTerm(Number(req.params.termId));
  const parsed = ResolveCertificateImportCandidatesBody.safeParse(req.body);
  if (!term || !parsed.success) {
    res.status(400).json({ error: "بيانات المطابقة غير صحيحة" });
    return;
  }
  for (const item of parsed.data.candidates) {
    const [candidate] = await db.select().from(certificateImportCandidatesTable).where(and(
      eq(certificateImportCandidatesTable.id, item.id),
      eq(certificateImportCandidatesTable.termId, term.id),
    ));
    if (!candidate) continue;
    await db.update(certificateImportCandidatesTable).set({
      matchedStudentId: item.accept ? item.studentId ?? candidate.matchedStudentId : null,
      confidence: item.accept ? "exact" : "unmatched",
      resolved: true,
      reviewedById: req.userId!,
      reviewedAt: new Date(),
    }).where(eq(certificateImportCandidatesTable.id, candidate.id));
  }
  const rows = await db.select().from(certificateImportCandidatesTable)
    .where(eq(certificateImportCandidatesTable.termId, term.id));
  const students = await db.select().from(studentsTable);
  res.json(rows.map((row) => ({
    id: row.id,
    sourceName: row.sourceName,
    sourceTrack: row.sourceTrack,
    sourcePhone: row.sourcePhone,
      quotaFrom: row.sourceQuotaFrom,
      quotaTo: row.sourceQuotaTo,
    importedScore: row.sourceScore,
    matchedStudentId: row.matchedStudentId,
    matchedStudentName: students.find((student) => student.id === row.matchedStudentId)?.fullName ?? null,
    confidence: row.confidence,
    resolved: row.resolved,
  })));
});

router.get("/certificate-terms/:termId/export", authenticate, async (req, res): Promise<void> => {
  if (!MANAGER_ROLES.includes(req.userRole!)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const term = await getTerm(Number(req.params.termId));
  const trackId = req.query.trackId ? Number(req.query.trackId) : undefined;
  if (!term) {
    res.status(404).json({ error: "الفصل غير موجود" });
    return;
  }
  const tracks = await db.select().from(tracksTable);
  const track = trackId ? tracks.find((item) => item.id === trackId) : undefined;
  if (req.userRole === "track_supervisor" && track && !canManageTrack(req, track.name)) {
    res.status(403).json({ error: "اختر مسارك فقط" });
    return;
  }
  let results = await buildResults(term, { trackId });
  if (req.userRole === "track_supervisor") results = results.filter((r) => canManageTrack(req, r.trackName));
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("نتائج الشهادات", { views: [{ rightToLeft: true }] });
  sheet.columns = [
    { header: "الطالبة", key: "studentName", width: 28 },
    { header: "الحلقة", key: "circleName", width: 22 },
    { header: "المسار", key: "trackName", width: 20 },
    { header: "الاختبار", key: "test", width: 12 },
    { header: "الحضور", key: "attendance", width: 12 },
    { header: "التقصير", key: "shortcomings", width: 12 },
    { header: "خطة المراجعة", key: "review", width: 16 },
    { header: "المجموع / 100", key: "total", width: 16 },
    { header: "النصاب السابق", key: "priorNisab", width: 16 },
    { header: "النصاب الحالي", key: "currentNisab", width: 16 },
    { header: "النصاب التراكمي", key: "cumulativeNisab", width: 18 },
    { header: "الحالة", key: "status", width: 16 },
  ];
  for (const result of results) {
    sheet.addRow({
      studentName: result.studentName,
      circleName: result.circleName ?? "",
      trackName: result.trackName ?? "",
      test: `${result.breakdown.test}/${result.breakdown.testMax}`,
      attendance: `${result.breakdown.attendance}/${result.breakdown.attendanceMax}`,
      shortcomings: `${result.breakdown.shortcomings}/${result.breakdown.shortcomingsMax}`,
      review: `${result.breakdown.reviewPlan}/${result.breakdown.reviewPlanMax}`,
      total: result.totalScore,
      priorNisab: result.priorNisab ?? "",
      currentNisab: result.currentNisab ?? "",
      cumulativeNisab: result.cumulativeNisab ?? "",
      status: result.status === "ready" ? "مكتملة" : result.status === "missing_exam" ? "بانتظار الاختبار" : "مطابقة معلقة",
    });
  }
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF3B4A8A" } };
  sheet.eachRow((row) => row.alignment = { horizontal: "right", vertical: "middle", readingOrder: "rtl" });
  const buffer = await workbook.xlsx.writeBuffer();
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(`نتائج-${term.name}`)}.xlsx`);
  res.send(Buffer.from(buffer));
});

export default router;