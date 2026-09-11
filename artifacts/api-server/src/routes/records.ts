import { Router, type IRouter } from "express";
import { db, recordsTable, studentsTable, usersTable, circlesTable, tracksTable, globalSettingsTable, studentEnrollmentsTable, dataEntryCircleAssignmentsTable } from "@workspace/db";
import { eq, and, gte, lte, inArray } from "drizzle-orm";
import { authenticate } from "../middlewares/authenticate";
import { CreateRecordBody, UpdateRecordBody } from "@workspace/api-zod";
import { checkAndCreateLowMemorizationAlert } from "./lowMemorizationAlerts";

const router: IRouter = Router();

function sameText(a: string | null | undefined, b: string | null | undefined): boolean {
  return Boolean(a && b && a.trim().replace(/\s+/g, " ").toLowerCase() === b.trim().replace(/\s+/g, " ").toLowerCase());
}

async function allowedCircle(req: any, circleId: number): Promise<boolean> {
  if (req.userRole === "leader" || req.userRole === "deputy") return true;
  if (req.userRole === "teacher" || req.userRole === "supervisor") {
    const [circle] = await db.select({ id: circlesTable.id, teacherId: circlesTable.teacherId, supervisorId: circlesTable.supervisorId })
      .from(circlesTable).where(eq(circlesTable.id, circleId));
    return Boolean(circle && (
      circle.id === req.userCircleId ||
      (req.userRole === "teacher" ? circle.teacherId === req.userId : circle.supervisorId === req.userId)
    ));
  }
  if (req.userRole === "track_supervisor") {
    const [circle] = await db.select().from(circlesTable).where(eq(circlesTable.id, circleId));
    return Boolean(circle && sameText(circle.track, req.userTrack));
  }
  if (req.userRole === "data_entry") {
    const assignments = await db.select({ circleId: dataEntryCircleAssignmentsTable.circleId })
      .from(dataEntryCircleAssignmentsTable)
      .where(and(
        eq(dataEntryCircleAssignmentsTable.circleId, circleId),
        eq(dataEntryCircleAssignmentsTable.dataEntryUserId, req.userId),
      ));
    return assignments.length > 0;
  }
  return false;
}

async function allowedDataEntryRole(req: any, circleId: number): Promise<boolean> {
  if (req.userRole === "leader" || req.userRole === "deputy") return true;
  if (!(req.userRole === "teacher" || req.userRole === "supervisor" || req.userRole === "data_entry")) return false;
  if (req.userRole === "data_entry") return allowedCircle(req, circleId);
  const [circle] = await db.select({ circleId: circlesTable.id, circleType: circlesTable.trackType, trackId: circlesTable.trackId })
    .from(circlesTable).where(eq(circlesTable.id, circleId));
  if (!circle) return false;
  const [track] = circle.trackId
    ? await db.select({ dataEntryType: tracksTable.dataEntryType }).from(tracksTable).where(eq(tracksTable.id, circle.trackId))
    : [];
  const type = track?.dataEntryType ?? circle.circleType;
  const teacherOwns = type === "children" || type === "mothers";
  return teacherOwns ? req.userRole === "teacher" : req.userRole === "supervisor";
}

router.get("/records", authenticate, async (req, res): Promise<void> => {
  const { circleId, studentId, date, dateFrom, dateTo } = req.query as Record<string, string | undefined>;

  // الطالبات: يُسمح لهن برؤية سجلاتهن الخاصة — مفلترة بالحلقة النشطة حالياً إذا أُرسلت
  if (req.userRole === "student") {
    const linkedStudentId = req.userStudentId ?? null;
    if (!linkedStudentId) { res.json([]); return; }

    // فلترة بـ (studentId + circleId) إذا أرسلت الطالبة circleId — يمنع خلط سجلات الحلقات
    const activeCircleId = circleId ? parseInt(circleId, 10) : null;
    if (activeCircleId) {
      const [enrollment] = await db.select({ id: studentEnrollmentsTable.id })
        .from(studentEnrollmentsTable)
        .where(and(eq(studentEnrollmentsTable.studentId, linkedStudentId), eq(studentEnrollmentsTable.circleId, activeCircleId), eq(studentEnrollmentsTable.isArchived, false)));
      if (!enrollment) { res.status(403).json({ error: "هذه الحلقة غير مرتبطة بحسابك" }); return; }
    }
    const whereClause = activeCircleId
      ? and(eq(recordsTable.studentId, linkedStudentId), eq(recordsTable.circleId, activeCircleId))
      : eq(recordsTable.studentId, linkedStudentId);

    let studentRecords = await db.select().from(recordsTable).where(whereClause);
    const [archiveSetting] = await db.select({ value: globalSettingsTable.value }).from(globalSettingsTable)
      .where(eq(globalSettingsTable.key, "student_record_archive_periods"));
    let archivedPeriods: { from: string; to: string }[] = [];
    try {
      const parsed = archiveSetting ? JSON.parse(archiveSetting.value) : [];
      archivedPeriods = Array.isArray(parsed) ? parsed : [];
    } catch { archivedPeriods = []; }
    const isArchived = (date: string) => archivedPeriods.some(p => date >= p.from && date <= p.to);
    // Keep progress fields, but hide absence and shortcomings from the student account.
    studentRecords = studentRecords
      .filter(r => !isArchived(r.date) || !r.isAbsent)
      .map(r => isArchived(r.date) ? { ...r, shortcomingOverride: false } : r);
    if (date) studentRecords = studentRecords.filter(r => r.date === date);
    if (dateFrom) studentRecords = studentRecords.filter(r => r.date >= dateFrom);
    if (dateTo) studentRecords = studentRecords.filter(r => r.date <= dateTo);

    const [user] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, req.userId!));
    res.json(studentRecords.map(r => ({ ...r, studentName: user?.name ?? "" })));
    return;
  }

  let records = await db.select().from(recordsTable);

  if (req.userRole === "teacher" || req.userRole === "supervisor") {
    records = records.filter(r => r.circleId === req.userCircleId);
  } else if (req.userRole === "track_supervisor") {
    const circles = await db.select({ id: circlesTable.id, track: circlesTable.track }).from(circlesTable);
    const permitted = new Set(circles.filter(c => sameText(c.track, req.userTrack)).map(c => c.id));
    records = records.filter(r => permitted.has(r.circleId));
  }

  // سجلات الفصل المؤرشف تبقى للإدارة والتقارير، ولا تظهر للمعلمة أو المشرفة.
  if (req.userRole === "teacher" || req.userRole === "supervisor") {
    const [setting] = await db.select({ value: globalSettingsTable.value })
      .from(globalSettingsTable).where(eq(globalSettingsTable.key, "student_record_archive_periods"));
    try {
      const periods = JSON.parse(setting?.value ?? "[]") as { from: string; to: string }[];
      records = records.filter(r => !periods.some(p => r.date >= p.from && r.date <= p.to));
    } catch { /* invalid setting: keep current records */ }
  }

  if (circleId) records = records.filter(r => r.circleId === parseInt(circleId, 10));
  if (studentId) records = records.filter(r => r.studentId === parseInt(studentId, 10));
  if (date) records = records.filter(r => r.date === date);
  if (dateFrom) records = records.filter(r => r.date >= dateFrom);
  if (dateTo) records = records.filter(r => r.date <= dateTo);

  // Enrich with student names
  const sIds = [...new Set(records.map(r => r.studentId))];
  let nameMap: Record<number, string> = {};
  if (sIds.length > 0) {
    const rows = await db.select({ id: studentsTable.id, fullName: studentsTable.fullName })
      .from(studentsTable).where(inArray(studentsTable.id, sIds));
    rows.forEach(s => { nameMap[s.id] = s.fullName; });
  }

  res.json(records.map(r => ({ ...r, studentName: nameMap[r.studentId] ?? "" })));
});

// إدخال جماعي لحلقات إشراق وسُنى
router.post("/records/bulk", authenticate, async (req, res): Promise<void> => {
  if (!["leader", "deputy", "data_entry", "teacher", "supervisor"].includes(req.userRole!)) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  const records = req.body as any[];
  if (!Array.isArray(records) || records.length === 0) {
    res.status(400).json({ error: "يجب إرسال قائمة سجلات" });
    return;
  }
  const date = records[0]?.date as string;
  if (!date) { res.status(400).json({ error: "date is required" }); return; }

  // المفتاح المركب (studentId-circleId) لأن نفس الطالبة قد تكون في حلقتين مختلفتين
  const existing = await db.select({ studentId: recordsTable.studentId, circleId: recordsTable.circleId })
    .from(recordsTable).where(eq(recordsTable.date, date));
  const alreadyEntered = new Set(existing.map(r => `${r.studentId}-${r.circleId}`));

  let created = 0;
  let skipped = 0;
  for (const rec of records) {
    const { studentId, circleId, isAbsent = false, ...rest } = rec;
    if (!studentId || !circleId) { skipped++; continue; }
    if (!await allowedDataEntryRole(req, Number(circleId))) { res.status(403).json({ error: "دورك لا يسمح بإدخال بيانات هذه الحلقة" }); return; }
    const [enrollment] = await db.select({ id: studentEnrollmentsTable.id }).from(studentEnrollmentsTable).where(and(
      eq(studentEnrollmentsTable.studentId, Number(studentId)),
      eq(studentEnrollmentsTable.circleId, Number(circleId)),
      eq(studentEnrollmentsTable.isArchived, false),
    ));
    if (!enrollment) { skipped++; continue; }
    if (alreadyEntered.has(`${studentId}-${circleId}`)) { skipped++; continue; }
    await db.insert(recordsTable).values({
      studentId,
      circleId,
      date,
      enteredById: req.userId!,
      isAbsent,
      memorizePages: 0,
      reviewNearPages: 0,
      reviewFarPages: 0,
      reviewPages: 0,
      recitationPages: 0,
      ...rest,
    });
    created++;
  }

  res.json({ created, skipped });
});

// إدخال يوم الخميس تلقائيًا: مراجعة عامة لكل محفوظ الأحد–الأربعاء
router.post("/records/thursday-bulk", authenticate, async (req, res): Promise<void> => {
  if (req.userRole !== "leader") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const { date } = req.body as { date?: string };
  if (!date) {
    res.status(400).json({ error: "date is required" });
    return;
  }
  const thursdayDate = new Date(date + "T12:00:00Z");
  if (thursdayDate.getUTCDay() !== 4) {
    res.status(400).json({ error: "يجب أن يكون التاريخ يوم خميس" });
    return;
  }
  // حساب نطاق الأحد–الأربعاء من نفس الأسبوع
  const sundayDate = new Date(thursdayDate.getTime() - 4 * 86400000);
  const wednesdayDate = new Date(thursdayDate.getTime() - 1 * 86400000);
  const dateFrom = sundayDate.toISOString().slice(0, 10);
  const dateTo = wednesdayDate.toISOString().slice(0, 10);

  // المصدر الصحيح: التسجيلات النشطة — لأن الطالبة قد تكون في أكثر من حلقة
  const activeEnrollments = await db
    .select({ studentId: studentEnrollmentsTable.studentId, circleId: studentEnrollmentsTable.circleId })
    .from(studentEnrollmentsTable)
    .where(eq(studentEnrollmentsTable.isArchived, false));

  // سجلات الأسبوع (الأحد–الأربعاء)
  const weekRecords = await db.select().from(recordsTable).where(
    and(gte(recordsTable.date, dateFrom), lte(recordsTable.date, dateTo))
  );
  // سجلات الخميس الموجودة — المفتاح المركب (studentId-circleId) لأن الطالبة قد تكون في حلقتين
  const existingThursday = await db.select({ studentId: recordsTable.studentId, circleId: recordsTable.circleId })
    .from(recordsTable).where(eq(recordsTable.date, date));
  const alreadyEntered = new Set(existingThursday.map(r => `${r.studentId}-${r.circleId}`));

  let created = 0;
  let skipped = 0;

  for (const enrollment of activeEnrollments) {
    const { studentId, circleId } = enrollment;
    if (alreadyEntered.has(`${studentId}-${circleId}`)) { skipped++; continue; }

    // سجلات الطالبة من نفس الحلقة التي تحتوي على حفظ جديد هذا الأسبوع
    const memRecords = weekRecords
      .filter(r =>
        r.studentId === studentId &&
        r.circleId === circleId &&
        !r.isAbsent &&
        r.memorizeSurahStart != null &&
        (r.memorizePages ?? 0) > 0
      )
      .sort((a, b) => a.date.localeCompare(b.date));

    if (memRecords.length === 0) { skipped++; continue; }

    const firstRec = memRecords[0];
    const lastRec = memRecords[memRecords.length - 1];
    const totalPages = memRecords.reduce((s, r) => s + (r.memorizePages ?? 0), 0);

    await db.insert(recordsTable).values({
      studentId,
      circleId,
      enteredById: req.userId!,
      date,
      isAbsent: false,
      reviewSurahStart: firstRec.memorizeSurahStart,
      reviewAyahStart: firstRec.memorizeAyahStart,
      reviewSurahEnd: lastRec.memorizeSurahEnd,
      reviewAyahEnd: lastRec.memorizeAyahEnd,
      reviewPages: totalPages,
    });
    created++;
  }

  res.json({ created, skipped });
});

router.get("/records/thursday-history", authenticate, async (req, res): Promise<void> => {
  if (req.userRole !== "leader") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const twelveWeeksAgo = new Date(Date.now() - 84 * 86400000);
  const dateFrom = twelveWeeksAgo.toISOString().slice(0, 10);
  const allRecords = await db.select().from(recordsTable).where(gte(recordsTable.date, dateFrom));
  const thursdayRecs = allRecords.filter(r => new Date(r.date + "T12:00:00Z").getUTCDay() === 4);
  const grouped: Record<string, { date: string; count: number; totalPages: number }> = {};
  for (const r of thursdayRecs) {
    if (!grouped[r.date]) grouped[r.date] = { date: r.date, count: 0, totalPages: 0 };
    grouped[r.date].count++;
    grouped[r.date].totalPages += r.reviewPages ?? 0;
  }
  res.json(Object.values(grouped).sort((a, b) => b.date.localeCompare(a.date)));
});

router.post("/records/student-self-entry-disabled", authenticate, async (_req, res): Promise<void> => {
  res.status(410).json({ error: "هذه الخاصية غير متاحة حاليًا" });
});


router.post("/records", authenticate, async (req, res): Promise<void> => {
  if (!["leader", "deputy", "track_supervisor", "data_entry", "teacher", "supervisor"].includes(req.userRole!)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const parsed = CreateRecordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (!await allowedCircle(req, parsed.data.circleId)) {
    res.status(403).json({ error: "دورك لا يسمح بإدخال بيانات هذه الحلقة" });
    return;
  }
  if (["teacher", "supervisor"].includes(req.userRole!) &&
      !await allowedDataEntryRole(req, parsed.data.circleId)) {
    res.status(403).json({ error: "دورك لا يسمح بإدخال بيانات هذه الحلقة" });
    return;
  }
  const [enrollment] = await db.select({ id: studentEnrollmentsTable.id }).from(studentEnrollmentsTable).where(and(
    eq(studentEnrollmentsTable.studentId, parsed.data.studentId),
    eq(studentEnrollmentsTable.circleId, parsed.data.circleId),
    eq(studentEnrollmentsTable.isArchived, false),
  ));
  if (!enrollment) {
    res.status(403).json({ error: "الطالبة غير مسجلة في هذه الحلقة" });
    return;
  }
  const [record] = await db.insert(recordsTable).values({
    ...parsed.data,
    enteredById: req.userId!,
  }).returning();

  // فحص إنذار قلة الحفظ بعد الإدخال (بشكل غير متزامن لئلا يعيق الاستجابة)
  checkAndCreateLowMemorizationAlert(parsed.data.studentId, req.userId!).catch(() => {});

  res.status(201).json(record);
});

router.patch("/records/:id", authenticate, async (req, res): Promise<void> => {
  if (!["leader", "deputy", "track_supervisor", "data_entry", "teacher", "supervisor"].includes(req.userRole!)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [existingRecord] = await db.select().from(recordsTable).where(eq(recordsTable.id, id));
  if (!existingRecord) { res.status(404).json({ error: "Record not found" }); return; }
  if (!await allowedCircle(req, existingRecord.circleId)) {
    res.status(403).json({ error: "لا يمكنك تعديل سجل هذه الحلقة" }); return;
  }
  if (["teacher", "supervisor"].includes(req.userRole!) &&
      !await allowedDataEntryRole(req, existingRecord.circleId)) {
    res.status(403).json({ error: "دورك لا يسمح بتعديل بيانات هذه الحلقة" }); return;
  }

  // For data_entry: enforce 2-hour edit window
  if (req.userRole === "data_entry") {
    const existing = existingRecord;
    const isThursdayRecord = new Date(existing.date + "T12:00:00Z").getUTCDay() === 4;
    const windowMs = isThursdayRecord ? 48 * 60 * 60 * 1000 : 2 * 60 * 60 * 1000;
    const cutoff = new Date(Date.now() - windowMs);
    if (existing.createdAt < cutoff) {
      const label = isThursdayRecord ? "٤٨ ساعة" : "٢ ساعة";
      res.status(403).json({ error: `انتهت مدة التعديل (${label} من وقت الإدخال)` });
      return;
    }
  }

  const parsed = UpdateRecordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [record] = await db.update(recordsTable).set(parsed.data).where(eq(recordsTable.id, id)).returning();
  if (!record) {
    res.status(404).json({ error: "Record not found" });
    return;
  }

  // فحص إنذار قلة الحفظ بعد التحديث أيضًا (بشكل غير متزامن)
  checkAndCreateLowMemorizationAlert(record.studentId, req.userId!).catch(() => {});

  res.json(record);
});

router.delete("/records/:id", authenticate, async (req, res): Promise<void> => {
  if (!["leader", "deputy", "track_supervisor", "data_entry", "teacher", "supervisor"].includes(req.userRole!)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [existing] = await db.select().from(recordsTable).where(eq(recordsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Record not found" }); return; }
  if (!await allowedCircle(req, existing.circleId)) {
    res.status(403).json({ error: "لا يمكنك حذف سجل هذه الحلقة" }); return;
  }
  if (["teacher", "supervisor"].includes(req.userRole!) &&
      !await allowedDataEntryRole(req, existing.circleId)) {
    res.status(403).json({ error: "دورك لا يسمح بحذف بيانات هذه الحلقة" }); return;
  }
  await db.delete(recordsTable).where(eq(recordsTable.id, id));
  res.sendStatus(204);
});

export default router;
