import { Router, type IRouter } from "express";
import { db, examRotationsTable, examTeacherAssignmentsTable, usersTable, circlesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { authenticate } from "../middlewares/authenticate";

const router: IRouter = Router();
const TEACHER_SCOPES = ["girls", "selected_tracks"] as const;
type TeacherScope = typeof TEACHER_SCOPES[number];

function parseTracks(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((track): track is string => typeof track === "string" && track.trim().length > 0);
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((track): track is string => typeof track === "string" && track.trim().length > 0) : [];
  } catch {
    return [];
  }
}

function serializeRotation(rotation: typeof examRotationsTable.$inferSelect) {
  return {
    ...rotation,
    selectedTracks: parseTracks(rotation.selectedTracks),
    createdAt: rotation.createdAt.toISOString(),
  };
}

function isGirlsCircle(circle: { trackType: string | null }) {
  return circle.trackType === "girls" || circle.trackType?.startsWith("girls_");
}

function circleIsInScope(
  circle: { track: string; trackType: string | null },
  teacherScope: TeacherScope,
  selectedTracks: string[],
) {
  return teacherScope === "girls" ? isGirlsCircle(circle) : selectedTracks.includes(circle.track);
}

function parseScope(value: unknown): TeacherScope | null {
  return typeof value === "string" && TEACHER_SCOPES.includes(value as TeacherScope)
    ? value as TeacherScope
    : null;
}

router.get("/exam-rotations", authenticate, async (req, res): Promise<void> => {
  if (req.userRole !== "leader" && req.userRole !== "track_supervisor") { res.status(403).json({ error: "Forbidden" }); return; }
  const rotations = await db.select().from(examRotationsTable).orderBy(examRotationsTable.createdAt);
  res.json(rotations.map(serializeRotation));
});

router.post("/exam-rotations", authenticate, async (req, res): Promise<void> => {
  if (req.userRole !== "leader") { res.status(403).json({ error: "Forbidden" }); return; }
  const { name, startDate, endDate, isActive } = req.body;
  const teacherScope = (req.body.teacherScope ?? "girls") as unknown;
  const selectedTracks = parseTracks(req.body.selectedTracks);
  if (!name || !startDate || !endDate) { res.status(400).json({ error: "name, startDate, endDate required" }); return; }
  if (!parseScope(teacherScope)) { res.status(400).json({ error: "teacherScope must be girls or selected_tracks" }); return; }
  if (teacherScope === "selected_tracks" && selectedTracks.length === 0) {
    res.status(400).json({ error: "اختاري مسارًا واحدًا على الأقل للشقلبة" }); return;
  }
  const [row] = await db.insert(examRotationsTable).values({
    name, startDate, endDate, isActive: isActive ?? true,
    teacherScope: teacherScope as TeacherScope,
    selectedTracks: JSON.stringify(selectedTracks),
    createdById: req.userId!,
  }).returning();
  res.status(201).json(serializeRotation(row));
});

router.patch("/exam-rotations/:id", authenticate, async (req, res): Promise<void> => {
  if (req.userRole !== "leader") { res.status(403).json({ error: "Forbidden" }); return; }
  const id = parseInt(req.params.id as string);
  const current = await db.select().from(examRotationsTable).where(eq(examRotationsTable.id, id));
  if (!current[0]) { res.status(404).json({ error: "Not found" }); return; }
  const teacherScope = (req.body.teacherScope ?? current[0].teacherScope) as unknown;
  const selectedTracks = parseTracks(req.body.selectedTracks ?? current[0].selectedTracks);
  if (!parseScope(teacherScope)) { res.status(400).json({ error: "teacherScope must be girls or selected_tracks" }); return; }
  if (teacherScope === "selected_tracks" && selectedTracks.length === 0) {
    res.status(400).json({ error: "اختاري مسارًا واحدًا على الأقل للشقلبة" }); return;
  }
  const { name, startDate, endDate, isActive } = req.body;
  const [row] = await db.update(examRotationsTable).set({
    ...(name !== undefined ? { name } : {}),
    ...(startDate !== undefined ? { startDate } : {}),
    ...(endDate !== undefined ? { endDate } : {}),
    ...(isActive !== undefined ? { isActive } : {}),
    teacherScope: teacherScope as TeacherScope,
    selectedTracks: JSON.stringify(selectedTracks),
  }).where(eq(examRotationsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(serializeRotation(row));
});

router.delete("/exam-rotations/:id", authenticate, async (req, res): Promise<void> => {
  if (req.userRole !== "leader") { res.status(403).json({ error: "Forbidden" }); return; }
  const id = parseInt(req.params.id as string);
  await db.delete(examTeacherAssignmentsTable).where(eq(examTeacherAssignmentsTable.rotationId, id));
  await db.delete(examRotationsTable).where(eq(examRotationsTable.id, id));
  res.status(204).send();
});

// ── My assignment (for the logged-in teacher) ──────────────────────────────
router.get("/exam-rotations/my-assignment", authenticate, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const [activeRotation] = await db.select().from(examRotationsTable)
    .where(eq(examRotationsTable.isActive, true));
  if (!activeRotation) { res.json(null); return; }
  const [assignment] = await db.select().from(examTeacherAssignmentsTable)
    .where(and(
      eq(examTeacherAssignmentsTable.rotationId, activeRotation.id),
      eq(examTeacherAssignmentsTable.teacherId, userId),
    ));
  if (!assignment) { res.json(null); return; }
  const [examCircle] = await db.select().from(circlesTable).where(eq(circlesTable.id, assignment.examCircleId));
  res.json({
    rotationName: activeRotation.name,
    examCircleId: assignment.examCircleId,
    examCircleName: examCircle?.name ?? "غير معروف",
    examMeetingTime: examCircle?.meetingTime ?? null,
    examCircleWhatsappLink: examCircle?.whatsappLink ?? null,
  });
});

router.get("/exam-rotations/:id/assignments", authenticate, async (req, res): Promise<void> => {
  if (req.userRole !== "leader" && req.userRole !== "track_supervisor") { res.status(403).json({ error: "Forbidden" }); return; }
  const rotationId = parseInt(req.params.id as string);
  const assignments = await db.select().from(examTeacherAssignmentsTable).where(eq(examTeacherAssignmentsTable.rotationId, rotationId));
  const allUsers = await db.select().from(usersTable);
  const allCircles = await db.select().from(circlesTable);
  const userMap: Record<number, string> = {};
  allUsers.forEach(u => { userMap[u.id] = u.name; });
  const circleMap: Record<number, { name: string; meetingTime?: string | null }> = {};
  allCircles.forEach(c => { circleMap[c.id] = { name: c.name, meetingTime: c.meetingTime }; });

  res.json(assignments.map(a => ({
    ...a,
    teacherName: userMap[a.teacherId] ?? "غير معروف",
    originalCircleName: circleMap[a.originalCircleId]?.name ?? "غير معروف",
    originalMeetingTime: circleMap[a.originalCircleId]?.meetingTime ?? null,
    examCircleName: circleMap[a.examCircleId]?.name ?? "غير معروف",
    examMeetingTime: circleMap[a.examCircleId]?.meetingTime ?? null,
    createdAt: a.createdAt.toISOString(),
  })));
});

router.post("/exam-rotations/:id/assignments", authenticate, async (req, res): Promise<void> => {
  if (req.userRole !== "leader") { res.status(403).json({ error: "Forbidden" }); return; }
  const rotationId = parseInt(req.params.id as string);
  const { assignments } = req.body as { assignments: { teacherId: number; originalCircleId: number; examCircleId: number }[] };
  if (!Array.isArray(assignments)) { res.status(400).json({ error: "assignments array required" }); return; }
  const [rotation] = await db.select().from(examRotationsTable).where(eq(examRotationsTable.id, rotationId));
  if (!rotation) { res.status(404).json({ error: "Not found" }); return; }
  const allCircles = await db.select().from(circlesTable);
  const selectedTracks = parseTracks(rotation.selectedTracks);
  const scopedCircleIds = new Set(
    allCircles.filter(circle => circleIsInScope(circle, rotation.teacherScope as TeacherScope, selectedTracks)).map(circle => circle.id),
  );
  const invalidAssignment = assignments.find(a =>
    !scopedCircleIds.has(a.originalCircleId) || !scopedCircleIds.has(a.examCircleId),
  );
  if (invalidAssignment) {
    res.status(400).json({ error: "لا يمكن حفظ توزيع خارج نطاق المسارات المحدد للشقلبة" }); return;
  }
  await db.delete(examTeacherAssignmentsTable).where(eq(examTeacherAssignmentsTable.rotationId, rotationId));
  if (assignments.length > 0) {
    await db.insert(examTeacherAssignmentsTable).values(assignments.map(a => ({ ...a, rotationId })));
  }
  res.status(201).json({ saved: assignments.length });
});

export default router;
