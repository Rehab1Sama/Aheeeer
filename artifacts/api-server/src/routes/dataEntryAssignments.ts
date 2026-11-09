import { Router, type IRouter } from "express";
import { db, dataEntryCircleAssignmentsTable, usersTable, circlesTable, recordsTable, studentsTable, teacherAbsencesTable, tracksTable } from "@workspace/db";
import { eq, and, gte, inArray } from "drizzle-orm";
import { authenticate } from "../middlewares/authenticate";
import { getMakkahDay } from "../lib/date";
import { isEntryExpectedOn } from "../lib/dataEntrySchedule";

const router: IRouter = Router();

function getMeccaTodayServer(): string {
  return getMakkahDay();
}

// يبني خريطة circleId → dataEntryType (نوع إدخال البيانات) عبر جدول المسارات،
// تُستخدم مع isEntryExpectedOn لمعرفة هل يُتوقع إدخال بيانات اليوم لهذه الحلقة أصلًا.
async function buildDataEntryTypeByCircle(
  circles: { id: number; trackId: number | null }[],
): Promise<Map<number, string | null>> {
  const trackIds = Array.from(new Set(circles.map(c => c.trackId).filter((id): id is number => !!id)));
  const dataEntryTypeByTrackId = new Map<number, string>();
  if (trackIds.length > 0) {
    const tracksMeta = await db.select({ id: tracksTable.id, dataEntryType: tracksTable.dataEntryType })
      .from(tracksTable).where(inArray(tracksTable.id, trackIds));
    for (const t of tracksMeta) dataEntryTypeByTrackId.set(t.id, t.dataEntryType);
  }
  const result = new Map<number, string | null>();
  for (const c of circles) {
    result.set(c.id, c.trackId ? dataEntryTypeByTrackId.get(c.trackId) ?? null : null);
  }
  return result;
}

// GET /api/data-entry/my-circles — حلقات مدخلة البيانات المعيّنة لها
router.get("/data-entry/my-circles", authenticate, async (req, res): Promise<void> => {
  if (req.userRole !== "data_entry") {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  const assignments = await db.select().from(dataEntryCircleAssignmentsTable)
    .where(eq(dataEntryCircleAssignmentsTable.dataEntryUserId, req.userId!));

  if (assignments.length === 0) {
    // عدم وجود إسناد يعني عدم عرض أي حلقة.
    res.json([]); return;
  }

  const circleIds = assignments.map(a => a.circleId);
  const circles = await db.select().from(circlesTable)
    .where(and(
      inArray(circlesTable.id, circleIds),
      eq(circlesTable.isArchived, false),
    ));

  res.json(circles);
});

// GET /api/data-entry/assignments — جميع الإسناد (للقائدة والنائبة)
router.get("/data-entry/assignments", authenticate, async (req, res): Promise<void> => {
  if (!["leader", "deputy"].includes(req.userRole!)) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  const assignments = await db.select().from(dataEntryCircleAssignmentsTable);
  const allUsers = await db.select().from(usersTable).where(eq(usersTable.role, "data_entry"));
  const allCircles = await db.select().from(circlesTable);

  // تجميع الإسناد حسب مدخلة البيانات
  const grouped: Record<number, {
    userId: number;
    userName: string;
    circleIds: number[];
    circleNames: string[];
  }> = {};

  for (const user of allUsers.filter(u => !u.isArchived)) {
    grouped[user.id] = {
      userId: user.id,
      userName: user.name,
      circleIds: [],
      circleNames: [],
    };
  }

  for (const a of assignments) {
    if (!grouped[a.dataEntryUserId]) continue;
    const circle = allCircles.find(c => c.id === a.circleId);
    if (circle) {
      grouped[a.dataEntryUserId].circleIds.push(circle.id);
      grouped[a.dataEntryUserId].circleNames.push(circle.name);
    }
  }

  res.json(Object.values(grouped));
});

// POST /api/data-entry/assignments/:userId — إسناد حلقات لمدخلة بيانات (للقائدة والنائبة)
router.post("/data-entry/assignments/:userId", authenticate, async (req, res): Promise<void> => {
  if (!["leader", "deputy"].includes(req.userRole!)) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  const userId = parseInt(req.params.userId as string);
  const { circleIds } = req.body as { circleIds: number[] };

  if (!Array.isArray(circleIds)) {
    res.status(400).json({ error: "circleIds يجب أن يكون مصفوفة" }); return;
  }

  // التحقق من أن المستخدم هو مدخلة بيانات
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user || user.role !== "data_entry") {
    res.status(400).json({ error: "المستخدم ليس مدخلة بيانات" }); return;
  }

  // حذف الإسناد القديم
  await db.delete(dataEntryCircleAssignmentsTable)
    .where(eq(dataEntryCircleAssignmentsTable.dataEntryUserId, userId));

  // إضافة الإسناد الجديد
  if (circleIds.length > 0) {
    await db.insert(dataEntryCircleAssignmentsTable).values(
      circleIds.map(cid => ({
        dataEntryUserId: userId,
        circleId: cid,
        assignedById: req.userId!,
      }))
    );
  }

  res.json({ ok: true, assigned: circleIds.length });
});

// GET /api/data-entry/circles-today — حالة حلقات كل مدخلة اليوم (للقائدة والنائبة)
router.get("/data-entry/circles-today", authenticate, async (req, res): Promise<void> => {
  if (!["leader", "deputy"].includes(req.userRole!)) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  const today = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const allDataEntryUsers = await db.select().from(usersTable)
    .where(and(eq(usersTable.role, "data_entry"), eq(usersTable.isArchived, false)));
  const allAssignments = await db.select().from(dataEntryCircleAssignmentsTable);
  const allCircles = await db.select().from(circlesTable).where(eq(circlesTable.isArchived, false));

  // نستثني الحلقات اللي اليوم مو من أيام إدخالها المتوقعة (مثل مشكاة/الأطفال/الأمهات)
  const dataEntryTypeByCircle = await buildDataEntryTypeByCircle(allCircles);
  const expectedCircleIds = new Set(
    allCircles
      .filter(c => isEntryExpectedOn(dataEntryTypeByCircle.get(c.id), c.name, today))
      .map(c => c.id),
  );

  // الحلقات التي أُدخلت فيها سجلات اليوم (بأي مدخلة)
  const todayRecords = await db.select({
    circleId: recordsTable.circleId,
    enteredById: recordsTable.enteredById,
  }).from(recordsTable).where(eq(recordsTable.date, today));

  const enteredCirclesByUser = new Map<number, Set<number>>();
  for (const r of todayRecords) {
    if (!r.enteredById) continue;
    if (!enteredCirclesByUser.has(r.enteredById)) enteredCirclesByUser.set(r.enteredById, new Set());
    enteredCirclesByUser.get(r.enteredById)!.add(r.circleId);
  }

  const result = allDataEntryUsers.map(user => {
    const myAssignments = allAssignments.filter(a => a.dataEntryUserId === user.id && expectedCircleIds.has(a.circleId));
    const enteredToday = enteredCirclesByUser.get(user.id) ?? new Set<number>();

    const circles = myAssignments.map(a => {
      const circle = allCircles.find(c => c.id === a.circleId);
      return {
        circleId: a.circleId,
        circleName: circle?.name ?? "؟",
        track: circle?.track ?? "؟",
        enteredToday: enteredToday.has(a.circleId),
      };
    });

    return {
      userId: user.id,
      userName: user.name,
      assignedCount: circles.length,
      enteredCount: circles.filter(c => c.enteredToday).length,
      circles,
    };
  });

  res.json(result);
});

// GET /api/data-entry/my-stats — إحصائيات مدخلة البيانات (للمدخلة نفسها)
router.get("/data-entry/my-stats", authenticate, async (req, res): Promise<void> => {
  if (req.userRole !== "data_entry") {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  const today = getMeccaTodayServer();

  // الحلقات المُسندة لهذه المدخلة
  const assignments = await db.select().from(dataEntryCircleAssignmentsTable)
    .where(eq(dataEntryCircleAssignmentsTable.dataEntryUserId, req.userId!));

  if (assignments.length === 0) {
    res.json({
      assignedCircles: [],
      enteredToday: [],
      notEnteredToday: [],
      absentTeacherToday: [],
    }); return;
  }

  const circleIds = assignments.map(a => a.circleId);
  const circlesRaw = await db.select().from(circlesTable)
    .where(inArray(circlesTable.id, circleIds));

  // نستثني الحلقات اللي اليوم مو من أيام إدخالها المتوقعة (مثل مشكاة/الأطفال/الأمهات)
  const dataEntryTypeByCircle = await buildDataEntryTypeByCircle(circlesRaw);
  const circles = circlesRaw.filter(c => isEntryExpectedOn(dataEntryTypeByCircle.get(c.id), c.name, today));

  // السجلات التي دخلتها اليوم
  const todayRecords = await db.select({ circleId: recordsTable.circleId })
    .from(recordsTable)
    .where(and(
      eq(recordsTable.date, today),
      eq(recordsTable.enteredById, req.userId!),
    ));

  const enteredCircleIds = new Set(todayRecords.map(r => r.circleId));

  // حلقات غاب معلمتها اليوم
  const teacherAbsences = await db.select({ circleId: teacherAbsencesTable.circleId })
    .from(teacherAbsencesTable)
    .where(and(
      eq(teacherAbsencesTable.date, today),
      inArray(teacherAbsencesTable.circleId, circleIds),
    ));

  const absentTeacherCircleIds = new Set(teacherAbsences.map(a => a.circleId));

  // الطالبات الغائبات اليوم (في الحلقات المُسندة)
  const allStudents = await db.select().from(studentsTable)
    .where(and(
      inArray(studentsTable.circleId, circleIds),
      eq(studentsTable.isArchived, false),
    ));

  const absentStudentRecords = await db.select()
    .from(recordsTable)
    .where(and(
      eq(recordsTable.date, today),
      inArray(recordsTable.circleId, circleIds),
      eq(recordsTable.isAbsent, true),
    ));

  const absentStudentIds = new Set(absentStudentRecords.map(r => r.studentId));
  const absentStudents = allStudents.filter(s => absentStudentIds.has(s.id))
    .map(s => ({
      studentId: s.id,
      studentName: s.fullName,
      circleId: s.circleId,
      circleName: circles.find(c => c.id === s.circleId)?.name ?? "",
    }));

  res.json({
    assignedCircles: circles.map(c => ({
      circleId: c.id,
      circleName: c.name,
      track: c.track,
      entered: enteredCircleIds.has(c.id),
      teacherAbsent: absentTeacherCircleIds.has(c.id),
    })),
    enteredToday: circles.filter(c => enteredCircleIds.has(c.id)).map(c => c.name),
    notEnteredToday: circles.filter(c => !enteredCircleIds.has(c.id) && !absentTeacherCircleIds.has(c.id)).map(c => c.name),
    absentTeacherToday: circles.filter(c => absentTeacherCircleIds.has(c.id)).map(c => c.name),
    absentStudentsToday: absentStudents,
  });
});

// GET /api/data-entry/track-status?date=YYYY-MM-DD — لكل حلقة في مسار مسؤولة المسار: هل أُدخلت بياناتها اليوم ومين أدخلها (لمسؤولة المسار فقط)
router.get("/data-entry/track-status", authenticate, async (req, res): Promise<void> => {
  if (req.userRole !== "track_supervisor") {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  const today = getMeccaTodayServer();
  const date = (typeof req.query.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date))
    ? req.query.date : today;

  if (!req.userTrack) {
    res.json({ date, circles: [] }); return;
  }

  const trackCircles = await db.select({
      id: circlesTable.id,
      name: circlesTable.name,
      trackId: circlesTable.trackId,
      circleType: circlesTable.trackType,
    })
    .from(circlesTable)
    .where(and(eq(circlesTable.track, req.userTrack), eq(circlesTable.isArchived, false)));

  // نجيب نوع إدخال البيانات (dataEntryType) لكل حلقة من جدول المسارات، عشان نعرف
  // هل يُتوقع إدخال اليوم لهذه الحلقة أصلًا (مثلًا مشكاة/الأطفال/الأمهات ليست كل الأيام).
  const trackIds = Array.from(new Set(trackCircles.map(c => c.trackId).filter((id): id is number => !!id)));
  const tracksMeta = trackIds.length > 0
    ? await db.select({ id: tracksTable.id, dataEntryType: tracksTable.dataEntryType })
        .from(tracksTable).where(inArray(tracksTable.id, trackIds))
    : [];
  const dataEntryTypeByTrackId = new Map(tracksMeta.map(t => [t.id, t.dataEntryType]));

  const expectedTrackCircles = trackCircles.filter(circle => {
    const dataEntryType = circle.trackId ? dataEntryTypeByTrackId.get(circle.trackId) : undefined;
    return isEntryExpectedOn(dataEntryType, circle.name, date);
  });

  const circleIds = expectedTrackCircles.map(c => c.id);

  if (circleIds.length === 0) {
    res.json({ date, circles: [] }); return;
  }

  const [dayRecords, allStudents, lastRecordRows] = await Promise.all([
    db.select({
      studentId: recordsTable.studentId,
      circleId: recordsTable.circleId,
      enteredById: recordsTable.enteredById,
    }).from(recordsTable).where(and(eq(recordsTable.date, date), inArray(recordsTable.circleId, circleIds))),
    db.select({ id: studentsTable.id, circleId: studentsTable.circleId })
      .from(studentsTable)
      .where(and(inArray(studentsTable.circleId, circleIds), eq(studentsTable.isArchived, false))),
    db.select({ circleId: recordsTable.circleId, date: recordsTable.date })
      .from(recordsTable)
      .where(inArray(recordsTable.circleId, circleIds)),
  ]);

  // آخر تاريخ فيه إدخال فعلي لكل حلقة (يفيد لو ما دخلت اليوم)
  const lastDateByCircle = new Map<number, string>();
  for (const r of lastRecordRows) {
    const cur = lastDateByCircle.get(r.circleId);
    if (!cur || r.date > cur) lastDateByCircle.set(r.circleId, r.date);
  }

  // أسماء من أدخلوا بيانات اليوم
  const enteredByIds = Array.from(new Set(
    dayRecords.map(r => r.enteredById).filter((v): v is number => !!v)
  ));
  const enteredByUsers = enteredByIds.length > 0
    ? await db.select({ id: usersTable.id, name: usersTable.name })
        .from(usersTable).where(inArray(usersTable.id, enteredByIds))
    : [];
  const nameById = new Map(enteredByUsers.map(u => [u.id, u.name]));

  const circles = expectedTrackCircles.map(circle => {
    const totalStudents = allStudents.filter(s => s.circleId === circle.id).length;
    const circleRecords = dayRecords.filter(r => r.circleId === circle.id);
    const enteredStudentIds = new Set(circleRecords.map(r => r.studentId));
    const enteredCount = enteredStudentIds.size;
    const missingCount = Math.max(totalStudents - enteredCount, 0);
    const enteredByNames = Array.from(new Set(
      circleRecords
        .map(r => (r.enteredById ? nameById.get(r.enteredById) : undefined))
        .filter((n): n is string => !!n)
    ));

    return {
      circleId: circle.id,
      circleName: circle.name,
      totalStudents,
      enteredCount,
      missingCount,
      enteredToday: enteredCount > 0,
      completed: totalStudents > 0 && missingCount === 0,
      enteredByNames,
      lastEntryDate: lastDateByCircle.get(circle.id) ?? null,
    };
  });

  // الحلقات اللي ما دخّلت أولاً، ثم المكتملة
  circles.sort((a, b) => Number(a.completed) - Number(b.completed) || a.circleName.localeCompare(b.circleName, "ar", { numeric: true }));

  res.json({ date, circles });
});

export default router;
