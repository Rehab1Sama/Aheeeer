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
} from "@workspace/db";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import {
  CreateCertificateTermBody,
  UpdateCertificateTermBody,
  SaveCertificateGradesBody,
  ResolveCertificateImportCandidatesBody,
} from "@workspace/api-zod";
import { authenticate } from "../middlewares/authenticate";

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
    createdAt: term.createdAt.toISOString(),
  };
}

function isoDaysBetween(start: string, end: string): string[] {
  const days: string[] = [];
  const cursor = new Date(`${start}T12:00:00Z`);
  const final = new Date(`${end}T12:00:00Z`);
  while (cursor <= final) {
    // Friday is the normal non-study day. The number of eligible days therefore
    // follows the term dates rather than a hard-coded monthly number.
    if (cursor.getUTCDay() !== 5) days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

function isOnApprovedLeave(
  day: string,
  student: typeof studentsTable.$inferSelect,
): boolean {
  return Boolean(student.leaveStart && student.leaveEnd && day >= student.leaveStart && day <= student.leaveEnd);
}

function canManageTrack(
  req: Express.Request,
  trackName: string | null | undefined,
): boolean {
  if (req.userRole === "leader" || req.userRole === "deputy") return true;
  return req.userRole === "track_supervisor" && normalize(req.userTrack) === normalize(trackName);
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

async function buildResults(
  term: typeof certificateTermsTable.$inferSelect,
  selectedTrackId?: number,
) {
  const [students, circles, tracks, rawRecords, plans, planDays, savedScores, candidates, enrollments] = await Promise.all([
    db.select().from(studentsTable),
    db.select().from(circlesTable),
    db.select().from(tracksTable),
    db.select().from(recordsTable).where(and(gte(recordsTable.date, term.startDate), lte(recordsTable.date, term.endDate))),
    db.select().from(reviewPlansTable).where(and(gte(reviewPlansTable.startDate, term.startDate), lte(reviewPlansTable.startDate, term.endDate))),
    db.select().from(reviewPlanDaysTable),
    db.select().from(certificateScoresTable).where(eq(certificateScoresTable.termId, term.id)),
    db.select().from(certificateImportCandidatesTable).where(eq(certificateImportCandidatesTable.termId, term.id)),
    db.select().from(studentEnrollmentsTable).where(eq(studentEnrollmentsTable.isArchived, false)),
  ]);

  const circleById = new Map(circles.map((circle) => [circle.id, circle]));
  const trackById = new Map(tracks.map((track) => [track.id, track]));
  const scoreByStudentId = new Map(savedScores.map((score) => [score.studentId, score]));
  const candidateByStudentId = new Map(
    candidates.filter((candidate) => !candidate.resolved && candidate.matchedStudentId != null)
      .map((candidate) => [candidate.matchedStudentId!, candidate]),
  );
  const scheduledDays = isoDaysBetween(term.startDate, term.endDate);
  const dayRowsByPlanId = new Map<number, typeof planDays>();
  for (const day of planDays) {
    const rows = dayRowsByPlanId.get(day.planId) ?? [];
    rows.push(day);
    dayRowsByPlanId.set(day.planId, rows);
  }

  const enrollmentByStudent = new Map<number, typeof enrollments[number]>();
  for (const enrollment of enrollments) {
    // Prefer the student's legacy primary circle when it is still active;
    // otherwise use the first active enrollment. This keeps multi-circle
    // students visible without inventing a random empty-circle result.
    const existing = enrollmentByStudent.get(enrollment.studentId);
    if (!existing || enrollment.circleId === students.find(s => s.id === enrollment.studentId)?.circleId) {
      enrollmentByStudent.set(enrollment.studentId, enrollment);
    }
  }
  const currentStudents = students
    .filter((student) => !student.isArchived && enrollmentByStudent.has(student.id))
    .filter((student) => {
      if (!selectedTrackId) return true;
      return circleById.get(enrollmentByStudent.get(student.id)!.circleId)?.trackId === selectedTrackId;
    });

  return currentStudents.map((student) => {
    const circle = circleById.get(enrollmentByStudent.get(student.id)?.circleId ?? -1) ?? null;
    const track = circle?.trackId ? trackById.get(circle.trackId) ?? null : null;
    const trackType = track?.dataEntryType ?? circle?.trackType ?? "girls";
    const rule = getRule(trackType, track?.name ?? circle?.track);
    const savedScore = scoreByStudentId.get(student.id);
    const eligibleDays = scheduledDays.filter((day) => !isOnApprovedLeave(day, student));

    // The existing daily record key is student + circle + date. A student can
    // temporarily appear in more than one circle, so retain the latest entry per
    // calendar day while keeping the score attached to one stable student ID.
    const recordsByDate = new Map<string, typeof rawRecords[number]>();
    for (const record of rawRecords) {
      if (record.studentId !== student.id) continue;
      const previous = recordsByDate.get(record.date);
      if (!previous || record.updatedAt > previous.updatedAt) recordsByDate.set(record.date, record);
    }
    const presentDays = eligibleDays.filter((day) => {
      const record = recordsByDate.get(day);
      return Boolean(record && !record.isAbsent);
    }).length;
    const attendanceScore = rule.attendanceMax === 0 || eligibleDays.length === 0
      ? rule.attendanceMax
      : Number(((presentDays / eligibleDays.length) * rule.attendanceMax).toFixed(2));

    const shortcomingDays = rule.shortcomingsMax === 0 ? 0 : eligibleDays.filter((day) => {
      const record = recordsByDate.get(day);
      if (!record || record.isAbsent) return false;
      if (record.shortcomingOverride != null) return record.shortcomingOverride;
      if (trackType === "girls") {
        // Missing both reviews is intentionally one shortcoming for the day.
        return (record.reviewNearPages ?? 0) === 0 &&
          (record.reviewFarPages ?? 0) === 0 &&
          (record.reviewFar2Pages ?? 0) === 0;
      }
      return record.listenedToReciter === false;
    }).length;
    const shortcomingsScore = rule.shortcomingsMax === 0 || eligibleDays.length === 0
      ? rule.shortcomingsMax
      : Number((rule.shortcomingsMax * Math.max(0, 1 - (shortcomingDays / eligibleDays.length))).toFixed(2));

    const studentPlans = plans.filter((plan) => plan.studentId === student.id && plan.planType === "girls_review");
    const reviewUnitsPlanned = studentPlans.reduce((sum, plan) => sum + (dayRowsByPlanId.get(plan.id) ?? [])
      .reduce((pageSum, day) => pageSum + (day.pages ?? 0), 0), 0);
    const reviewUnitsCompleted = [...recordsByDate.values()]
      .filter((record) => !record.isAbsent)
      .reduce((sum, record) => sum + (record.reviewFarPages ?? 0) + (record.reviewFar2Pages ?? 0), 0);
    const reviewPlanScore = rule.reviewPlanMax === 0 ? 0 : Number((
      reviewUnitsPlanned > 0
        ? Math.min(1, reviewUnitsCompleted / reviewUnitsPlanned) * rule.reviewPlanMax
        : 0
    ).toFixed(2));

    const testScore = savedScore?.testScore ?? null;
    const hasAmbiguousImport = candidateByStudentId.has(student.id);
    const status = hasAmbiguousImport
      ? "ambiguous_import"
      : testScore == null
        ? "missing_exam"
        : "ready";
    const totalScore = Number(((testScore ?? 0) + attendanceScore + shortcomingsScore + reviewPlanScore).toFixed(2));

    return {
      studentId: student.id,
      studentName: student.fullName,
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
      reviewUnitsCompleted: Number(reviewUnitsCompleted.toFixed(2)),
      reviewUnitsPlanned: Number(reviewUnitsPlanned.toFixed(2)),
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
  const visible = req.userRole === "student" ? terms.filter((term) => term.status === "published") : terms;
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
  const trackId = req.query.trackId ? Number(req.query.trackId) : undefined;
  const tracks = await db.select().from(tracksTable);
  const requestedTrack = trackId ? tracks.find((track) => track.id === trackId) : undefined;
  if (req.userRole === "track_supervisor" && (!requestedTrack || !canManageTrack(req, requestedTrack.name))) {
    res.status(403).json({ error: "اختر مسارك فقط" });
    return;
  }
  let results = await buildResults(term, trackId);
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
  const students = await db.select().from(studentsTable);
  const circles = await db.select().from(circlesTable);
  const tracks = await db.select().from(tracksTable);
  for (const grade of parsed.data.grades) {
    const student = students.find((item) => item.id === grade.studentId);
    const circle = circles.find((item) => item.id === student?.circleId);
    const track = tracks.find((item) => item.id === circle?.trackId);
    const trackType = track?.dataEntryType ?? circle?.trackType ?? "girls";
    const rule = getRule(trackType, track?.name ?? circle?.track);
    if (!student || !canManageTrack(req, track?.name ?? circle?.track) || grade.score < 0 || grade.score > rule.testMax) {
      res.status(400).json({ error: "إحدى درجات الاختبار أو صلاحيات المسار غير صحيحة" });
      return;
    }
    const [existing] = await db.select().from(certificateScoresTable).where(and(
      eq(certificateScoresTable.termId, term.id),
      eq(certificateScoresTable.studentId, student.id),
    ));
    const values = {
      testScore: grade.score,
      testNotes: grade.notes ?? null,
      circleId: circle?.id ?? null,
      trackId: track?.id ?? null,
      trackType,
      enteredById: existing?.enteredById ?? req.userId!,
      updatedById: req.userId!,
      status: "ready",
    };
    if (existing) {
      await db.update(certificateScoresTable).set(values).where(eq(certificateScoresTable.id, existing.id));
    } else {
      await db.insert(certificateScoresTable).values({
        termId: term.id,
        studentId: student.id,
        ...values,
      });
    }
  }
  const results = await buildResults(term);
  res.json(results.filter((result) => parsed.data.grades.some((grade) => grade.studentId === result.studentId)));
});

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
  const results = await buildResults(term);
  if (results.some((result) => result.status !== "ready")) {
    res.status(409).json({ error: "أكملي درجات الاختبار وراجعي المطابقات الملتبسة قبل النشر" });
    return;
  }
  const [published] = await db.update(certificateTermsTable)
    .set({ status: "published", publishedAt: new Date() })
    .where(eq(certificateTermsTable.id, term.id))
    .returning();
  res.json(publicTerm(published!));
});

router.get("/certificate-terms/:termId/my-result", authenticate, async (req, res): Promise<void> => {
  if (req.userRole !== "student" || !req.userStudentId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const term = await getTerm(Number(req.params.termId));
  if (!term || term.status !== "published") {
    res.status(404).json({ error: "النتيجة غير منشورة" });
    return;
  }
  const result = (await buildResults(term)).find((item) => item.studentId === req.userStudentId);
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
  if (req.userRole === "track_supervisor" && (!track || !canManageTrack(req, track.name))) {
    res.status(403).json({ error: "اختر مسارك فقط" });
    return;
  }
  const results = await buildResults(term, trackId);
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