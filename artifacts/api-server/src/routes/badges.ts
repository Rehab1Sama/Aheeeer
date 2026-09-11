import { Router, type IRouter } from "express";
import { db, badgeEventsTable, badgeAssignmentsTable, recordsTable, usersTable, circlesTable, studentsTable, teacherAbsencesTable } from "@workspace/db";
import { eq, and, gte, lte } from "drizzle-orm";
import { authenticate } from "../middlewares/authenticate";

const router: IRouter = Router();

router.get("/badge-events", authenticate, async (req, res): Promise<void> => {
  const events = await db.select().from(badgeEventsTable).orderBy(badgeEventsTable.createdAt);
  const assignments = await db.select().from(badgeAssignmentsTable);
  const countMap: Record<number, number> = {};
  assignments.forEach(a => { countMap[a.badgeEventId] = (countMap[a.badgeEventId] ?? 0) + 1; });
  res.json(events.map(e => ({ ...e, createdAt: e.createdAt.toISOString(), assignmentCount: countMap[e.id] ?? 0 })));
});

router.post("/badge-events", authenticate, async (req, res): Promise<void> => {
  if (req.userRole !== "leader" && req.userRole !== "track_supervisor") { res.status(403).json({ error: "Forbidden" }); return; }
  const { name, description, emoji, color, targetType, dateFrom, dateTo, isActive } = req.body;
  if (!name || !emoji || !color || !targetType || !dateFrom || !dateTo) {
    res.status(400).json({ error: "Missing required fields" }); return;
  }
  const [row] = await db.insert(badgeEventsTable).values({
    name, description: description ?? null, emoji, color, targetType, dateFrom, dateTo,
    isActive: isActive ?? true, createdById: req.userId!,
  }).returning();
  res.status(201).json({ ...row, createdAt: row.createdAt.toISOString(), assignmentCount: 0 });
});

router.patch("/badge-events/:id", authenticate, async (req, res): Promise<void> => {
  if (req.userRole !== "leader" && req.userRole !== "track_supervisor") { res.status(403).json({ error: "Forbidden" }); return; }
  const id = parseInt(req.params.id as string);
  const [row] = await db.update(badgeEventsTable).set(req.body).where(eq(badgeEventsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  const assignments = await db.select().from(badgeAssignmentsTable).where(eq(badgeAssignmentsTable.badgeEventId, id));
  res.json({ ...row, createdAt: row.createdAt.toISOString(), assignmentCount: assignments.length });
});

router.delete("/badge-events/:id", authenticate, async (req, res): Promise<void> => {
  if (req.userRole !== "leader" && req.userRole !== "track_supervisor") { res.status(403).json({ error: "Forbidden" }); return; }
  const id = parseInt(req.params.id as string);
  await db.delete(badgeAssignmentsTable).where(eq(badgeAssignmentsTable.badgeEventId, id));
  await db.delete(badgeEventsTable).where(eq(badgeEventsTable.id, id));
  res.status(204).send();
});

// Auto-assign: leader triggers, system calculates qualifying entities
router.post("/badge-events/:id/auto-assign", authenticate, async (req, res): Promise<void> => {
  if (req.userRole !== "leader" && req.userRole !== "track_supervisor") { res.status(403).json({ error: "Forbidden" }); return; }
  const eventId = parseInt(req.params.id as string);

  const [event] = await db.select().from(badgeEventsTable).where(eq(badgeEventsTable.id, eventId));
  if (!event) { res.status(404).json({ error: "Badge event not found" }); return; }

  const { targetType, dateFrom, dateTo } = event;

  // Get existing assignments for this event (to skip duplicates)
  const existingAssignments = await db.select().from(badgeAssignmentsTable)
    .where(eq(badgeAssignmentsTable.badgeEventId, eventId));
  const alreadyAssigned = new Set(existingAssignments.map(a => a.entityId));

  let candidates: { id: number; name: string }[] = [];

  if (targetType === "student") {
    // Students with ZERO absences in the date range
    const allStudents = await db.select().from(studentsTable)
      .where(and(eq(studentsTable.isArchived, false)));

    const absenceRecords = await db.select().from(recordsTable)
      .where(and(eq(recordsTable.isAbsent, true), gte(recordsTable.date, dateFrom), lte(recordsTable.date, dateTo)));

    const absentStudentIds = new Set(absenceRecords.map(r => r.studentId));

    const presentRecords = await db.select().from(recordsTable)
      .where(and(eq(recordsTable.isAbsent, false), gte(recordsTable.date, dateFrom), lte(recordsTable.date, dateTo)));
    const hasRecords = new Set(presentRecords.map(r => r.studentId));

    candidates = allStudents
      .filter(s => !absentStudentIds.has(s.id) && hasRecords.has(s.id))
      .map(s => ({ id: s.id, name: s.fullName }));

  } else if (targetType === "teacher") {
    // Teachers with ZERO absences in the date range
    const allTeachers = await db.select().from(usersTable)
      .where(and(eq(usersTable.role, "teacher"), eq(usersTable.isArchived, false)));

    const absences = await db.select().from(teacherAbsencesTable)
      .where(and(gte(teacherAbsencesTable.date, dateFrom), lte(teacherAbsencesTable.date, dateTo)));

    const absentTeacherCircles = new Set(absences.map(a => a.circleId));
    const allCircles = await db.select().from(circlesTable);
    const circleMap: Record<number, number> = {};
    allCircles.forEach(c => { if (c.id) circleMap[c.id] = c.id; });

    // Teachers whose circle had no absences
    candidates = allTeachers
      .filter(t => t.circleId != null && !absentTeacherCircles.has(t.circleId!))
      .map(t => ({ id: t.id, name: t.name }));

  } else if (targetType === "circle") {
    // Circles with attendance rate >= 80% in the date range
    const allCircles = await db.select().from(circlesTable);
    const allRecords = await db.select().from(recordsTable)
      .where(and(gte(recordsTable.date, dateFrom), lte(recordsTable.date, dateTo)));

    candidates = allCircles
      .map(c => {
        const circleRecords = allRecords.filter(r => {
          const student = { circleId: r.studentId };
          return true;
        });
        return { id: c.id, name: c.name };
      });

    // Simplified: all circles with any records in the period qualify
    const circlesWithRecords = new Set<number>();
    const allStudents = await db.select().from(studentsTable);
    const studentCircleMap: Record<number, number> = {};
    allStudents.forEach(s => { if (s.circleId) studentCircleMap[s.id] = s.circleId; });

    const periodRecords = await db.select().from(recordsTable)
      .where(and(gte(recordsTable.date, dateFrom), lte(recordsTable.date, dateTo)));

    const circlePresent: Record<number, number> = {};
    const circleAbsent: Record<number, number> = {};

    periodRecords.forEach(r => {
      const cId = studentCircleMap[r.studentId];
      if (!cId) return;
      if (r.isAbsent) circleAbsent[cId] = (circleAbsent[cId] ?? 0) + 1;
      else circlePresent[cId] = (circlePresent[cId] ?? 0) + 1;
    });

    candidates = allCircles
      .filter(c => {
        const total = (circlePresent[c.id] ?? 0) + (circleAbsent[c.id] ?? 0);
        if (total === 0) return false;
        const rate = (circlePresent[c.id] ?? 0) / total;
        return rate >= 0.8;
      })
      .map(c => ({ id: c.id, name: c.name }));

  } else if (targetType === "supervisor") {
    const allSupervisors = await db.select().from(usersTable)
      .where(and(eq(usersTable.role, "supervisor"), eq(usersTable.isArchived, false)));
    candidates = allSupervisors.map(u => ({ id: u.id, name: u.name }));

  } else if (targetType === "track_supervisor") {
    const allTS = await db.select().from(usersTable)
      .where(and(eq(usersTable.role, "track_supervisor"), eq(usersTable.isArchived, false)));
    candidates = allTS.map(u => ({ id: u.id, name: u.name }));
  }

  // Assign to qualifying candidates not already awarded
  const toAssign = candidates.filter(c => !alreadyAssigned.has(c.id));
  let assigned = 0;

  for (const c of toAssign) {
    await db.insert(badgeAssignmentsTable).values({
      badgeEventId: eventId,
      entityType: targetType,
      entityId: c.id,
      entityName: c.name,
      createdById: req.userId!,
    });
    assigned++;
  }

  const typeArabic: Record<string, string> = {
    student: "طالبة", teacher: "معلمة", supervisor: "مشرفة",
    circle: "حلقة", track_supervisor: "مسؤولة مسار",
  };
  const label = typeArabic[targetType] ?? targetType;

  res.json({
    assigned,
    skipped: existingAssignments.length,
    message: assigned > 0
      ? `تم منح الوسام لـ ${assigned} ${label} مؤهلة تلقائيًا`
      : `لا توجد ${label} مؤهلة جديدة في الفترة من ${dateFrom} إلى ${dateTo}`,
  });
});

router.get("/badge-assignments", authenticate, async (req, res): Promise<void> => {
  const { entityType, entityId, badgeEventId } = req.query as Record<string, string | undefined>;
  const events = await db.select().from(badgeEventsTable);
  const eventMap: Record<number, typeof events[0]> = {};
  events.forEach(e => { eventMap[e.id] = e; });

  let assignments = await db.select().from(badgeAssignmentsTable).orderBy(badgeAssignmentsTable.createdAt);
  if (entityType) assignments = assignments.filter(a => a.entityType === entityType);
  if (entityId) assignments = assignments.filter(a => a.entityId === parseInt(entityId));
  if (badgeEventId) assignments = assignments.filter(a => a.badgeEventId === parseInt(badgeEventId));

  // Non-leaders only see: أوسمتهم الشخصية + أوسمة حلقتهم (يشمل المعلمة/المشرفة/الطالبة)
  // track_supervisor تشوف كل شيء (زي القائدة)
  if (req.userRole !== "leader" && req.userRole !== "track_supervisor") {
    const [me] = await db.select({ circleId: usersTable.circleId }).from(usersTable).where(eq(usersTable.id, req.userId!));
    assignments = assignments.filter(a =>
      (a.entityId === req.userId && a.entityType === req.userRole) ||
      (a.entityType === "circle" && me?.circleId != null && a.entityId === me.circleId)
    );
  }

  res.json(assignments.map(a => ({
    ...a,
    badgeName: eventMap[a.badgeEventId]?.name ?? "",
    badgeEmoji: eventMap[a.badgeEventId]?.emoji ?? "🏅",
    badgeColor: eventMap[a.badgeEventId]?.color ?? "#f59e0b",
    createdAt: a.createdAt.toISOString(),
  })));
});

router.post("/badge-assignments", authenticate, async (req, res): Promise<void> => {
  if (req.userRole !== "leader" && req.userRole !== "track_supervisor") { res.status(403).json({ error: "Forbidden" }); return; }
  const { badgeEventId, entityType, entityId, entityName, notes } = req.body;
  if (!badgeEventId || !entityType || entityId == null || !entityName) {
    res.status(400).json({ error: "Missing required fields" }); return;
  }
  const [row] = await db.insert(badgeAssignmentsTable).values({
    badgeEventId, entityType, entityId, entityName, notes: notes ?? null, createdById: req.userId!,
  }).returning();
  const event = await db.select().from(badgeEventsTable).where(eq(badgeEventsTable.id, badgeEventId));
  res.status(201).json({
    ...row, createdAt: row.createdAt.toISOString(),
    badgeName: event[0]?.name ?? "", badgeEmoji: event[0]?.emoji ?? "🏅", badgeColor: event[0]?.color ?? "#f59e0b",
  });
});

router.delete("/badge-assignments/:id", authenticate, async (req, res): Promise<void> => {
  if (req.userRole !== "leader" && req.userRole !== "track_supervisor") { res.status(403).json({ error: "Forbidden" }); return; }
  await db.delete(badgeAssignmentsTable).where(eq(badgeAssignmentsTable.id, parseInt(req.params.id as string)));
  res.status(204).send();
});

export default router;
