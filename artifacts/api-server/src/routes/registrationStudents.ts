import { Router, type IRouter } from "express";
import { performTransfer } from "../lib/studentTransfer";
import { db, studentsTable, circlesTable, usersTable, studentEnrollmentsTable } from "@workspace/db";
import { eq, and, inArray, sql } from "drizzle-orm";
import { authenticate } from "../middlewares/authenticate";

const router: IRouter = Router();

// GET /api/registration-students — طالبات حلقات التسجيل
router.get("/registration-students", authenticate, async (req, res): Promise<void> => {
  if (!["leader", "deputy"].includes(req.userRole!)) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  const regCircles = await db.select().from(circlesTable)
    .where(and(eq(circlesTable.trackType, "registration"), eq(circlesTable.isArchived, false)));

  if (regCircles.length === 0) { res.json([]); return; }

  const regCircleIds = regCircles.map(c => c.id);
  const students = await db.select().from(studentsTable)
    .where(and(inArray(studentsTable.circleId, regCircleIds), eq(studentsTable.isArchived, false)));

  res.json(students.map(s => {
    let email: string | null = null;
    try { if (s.extraData) email = JSON.parse(s.extraData).__email ?? null; } catch {}
    return {
      id: s.id,
      fullName: s.fullName,
      phone: s.phone ?? null,
      email,
      circleId: s.circleId,
      circleName: regCircles.find(c => c.id === s.circleId)?.name ?? "",
    };
  }));
});

// POST /api/registration-students/bulk-transfer — نقل طالبات لحلقات جديدة
router.post("/registration-students/bulk-transfer", authenticate, async (req, res): Promise<void> => {
  if (!["leader", "deputy"].includes(req.userRole!)) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  const { transfers } = req.body as { transfers: { studentId: number; circleId: number }[] };
  if (!Array.isArray(transfers) || transfers.length === 0) {
    res.status(400).json({ error: "transfers is required" }); return;
  }

  // نفس النقل الكامل في كل الموقع: تخرج من قائمة التسجيل نهائيًا، ويُنقل حساب دخولها إلى حلقتها
  for (const t of transfers) {
    const [studentBefore] = await db.select({ circleId: studentsTable.circleId }).from(studentsTable).where(eq(studentsTable.id, t.studentId));
    if (!studentBefore) continue;
    await performTransfer({ studentId: t.studentId, fromCircleId: studentBefore.circleId ?? null, toCircleId: t.circleId, byUserId: req.userId! });
  }

  res.json({ ok: true, transferred: transfers.length });
});

// GET /api/circles/staffing — حلقات بدون معلمة أو مشرفة + المتطوعات المتاحات
router.get("/circles/staffing", authenticate, async (req, res): Promise<void> => {
  if (!["leader", "deputy", "track_supervisor"].includes(req.userRole!)) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  // ملاحظة: قائمة الحلقات (الوجهة) لا تُفلتر حسب مسار مسؤولة المسار عمدًا —
  // تقدر تسند كادر مسارها لأي حلقة ناقصة بالمقرأة كاملة، مو بس حلقات مسارها.
  const allCircles = await db.select().from(circlesTable).where(eq(circlesTable.isArchived, false));
  // مصدر الكادر (المعلمات/المشرفات المتاحات) يبقى مقصورًا على مسارها فقط.
  const allUsers = await db.select().from(usersTable).where(eq(usersTable.isArchived, false));

  const teachers = allUsers.filter(u => u.role === "teacher" && (req.userRole !== "track_supervisor" || u.track === req.userTrack));
  const supervisors = allUsers.filter(u => u.role === "supervisor" && (req.userRole !== "track_supervisor" || u.track === req.userTrack));

  const assignedTeacherIds = new Set(allCircles.filter(c => c.teacherId).map(c => c.teacherId!));
  const assignedSupervisorIds = new Set(allCircles.filter(c => c.supervisorId).map(c => c.supervisorId!));

  const freeTeachers = teachers.filter(t => !assignedTeacherIds.has(t.id));
  const freeSupervisors = supervisors.filter(s => !assignedSupervisorIds.has(s.id));

  const circles = allCircles
    .filter(c => c.trackType !== "registration")
    .map(c => ({
      id: c.id,
      name: c.name,
      track: c.track,
      meetingTime: c.meetingTime,
      teacherId: c.teacherId,
      teacherName: c.teacherId ? (allUsers.find(u => u.id === c.teacherId)?.name ?? null) : null,
      supervisorId: c.supervisorId,
      supervisorName: c.supervisorId ? (allUsers.find(u => u.id === c.supervisorId)?.name ?? null) : null,
      missingTeacher: !c.teacherId,
      missingSupervisor: !c.supervisorId,
    }))
    .filter(c => c.missingTeacher || c.missingSupervisor);

  res.json({
    circles,
    freeTeachers: freeTeachers.map(t => ({ id: t.id, name: t.name, track: t.track })),
    freeSupervisors: freeSupervisors.map(s => ({ id: s.id, name: s.name, track: s.track })),
  });
});

// POST /api/circles/assign-staff — تعيين معلمة أو مشرفة لحلقة
router.post("/circles/assign-staff", authenticate, async (req, res): Promise<void> => {
  if (!["leader", "deputy", "track_supervisor"].includes(req.userRole!)) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  const { circleId, teacherId, supervisorId } = req.body as {
    circleId: number;
    teacherId?: number | null;
    supervisorId?: number | null;
  };
  if (!circleId) { res.status(400).json({ error: "circleId is required" }); return; }
  const [circle] = await db.select().from(circlesTable).where(eq(circlesTable.id, circleId));
  if (!circle) { res.status(404).json({ error: "الحلقة غير موجودة" }); return; }
  // الحلقة الهدف (وجهة الإسناد) غير مقيّدة بمسار مسؤولة المسار عمدًا — تقدر
  // تسند كادر مسارها لأي حلقة بالمقرأة كاملة. المصدر (الكادر) مُتحقَّق منه أدناه.

  const update: Record<string, unknown> = {};
  if (teacherId !== undefined) update.teacherId = teacherId;
  if (supervisorId !== undefined) update.supervisorId = supervisorId;

  if (Object.keys(update).length === 0) {
    res.status(400).json({ error: "No fields to update" }); return;
  }
  const staffIds = [teacherId, supervisorId].filter((id): id is number => typeof id === "number");
  if (staffIds.length) {
    const staff = await db.select({ id: usersTable.id, role: usersTable.role, track: usersTable.track })
      .from(usersTable).where(inArray(usersTable.id, staffIds));
    if (staff.length !== staffIds.length || staff.some(s => s.role !== (teacherId ? "teacher" : "supervisor"))) {
      res.status(400).json({ error: "الموظفة المحددة غير صالحة لهذا الدور" }); return;
    }
    if (req.userRole === "track_supervisor" && staff.some(s => s.track !== req.userTrack)) {
      res.status(403).json({ error: "الموظفة خارج نطاق مسارك" }); return;
    }
  }

  await db.update(circlesTable).set(update).where(eq(circlesTable.id, circleId));

  if (teacherId) await db.update(usersTable).set({ circleId }).where(eq(usersTable.id, teacherId));
  if (supervisorId) await db.update(usersTable).set({ circleId }).where(eq(usersTable.id, supervisorId));

  res.json({ ok: true });
});

export default router;
