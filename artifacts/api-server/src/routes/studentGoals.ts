import { Router, type IRouter } from "express";
import { db, studentGoalsTable, studentsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { authenticate } from "../middlewares/authenticate";

const router: IRouter = Router();

router.get("/students/:id/goals", authenticate, async (req, res): Promise<void> => {
  const allowed = ["leader", "track_supervisor", "teacher", "supervisor", "student"];
  if (!allowed.includes(req.userRole!)) { res.status(403).json({ error: "Forbidden" }); return; }
  const studentId = parseInt(req.params.id as string);
  const goals = await db.select().from(studentGoalsTable)
    .where(eq(studentGoalsTable.studentId, studentId));
  res.json(goals.map(g => ({
    ...g,
    createdAt: g.createdAt.toISOString(),
    updatedAt: g.updatedAt?.toISOString(),
  })));
});

router.post("/students/:id/goals", authenticate, async (req, res): Promise<void> => {
  const allowed = ["leader", "track_supervisor", "teacher", "supervisor", "student"];
  if (!allowed.includes(req.userRole!)) { res.status(403).json({ error: "Forbidden" }); return; }

  const studentId = parseInt(req.params.id as string);
  const { title, targetDate, notes, motivationalMessage } = req.body as {
    title: string; targetDate?: string; notes?: string; motivationalMessage?: string;
  };
  if (!title?.trim()) { res.status(400).json({ error: "العنوان مطلوب" }); return; }

  // Only leader/track_supervisor can set motivationalMessage
  const finalMotivational = ["leader", "track_supervisor"].includes(req.userRole!)
    ? (motivationalMessage ?? null) : null;

  const [row] = await db.insert(studentGoalsTable).values({
    studentId,
    title: title.trim(),
    targetDate: targetDate ?? null,
    notes: notes ?? null,
    motivationalMessage: finalMotivational,
    createdById: req.userId!,
  }).returning();

  res.status(201).json({ ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt?.toISOString() });
});

router.patch("/students/:id/goals/:goalId", authenticate, async (req, res): Promise<void> => {
  const allowed = ["leader", "track_supervisor", "teacher", "supervisor", "student"];
  if (!allowed.includes(req.userRole!)) { res.status(403).json({ error: "Forbidden" }); return; }

  const studentId = parseInt(req.params.id as string);
  const goalId = parseInt(req.params.goalId as string);
  const { isCompleted, title, targetDate, notes, motivationalMessage } = req.body as {
    isCompleted?: boolean; title?: string; targetDate?: string | null;
    notes?: string | null; motivationalMessage?: string | null;
  };

  const updates: Partial<typeof studentGoalsTable.$inferInsert> = {};

  if (req.userRole === "student") {
    // Students can update their own content fields only
    if (title !== undefined) updates.title = title.trim();
    if (targetDate !== undefined) updates.targetDate = targetDate;
    if (notes !== undefined) updates.notes = notes;
    if (isCompleted !== undefined) updates.isCompleted = isCompleted;
  } else if (["leader", "track_supervisor"].includes(req.userRole!)) {
    // Leaders/supervisors can update all fields including motivationalMessage
    if (motivationalMessage !== undefined) updates.motivationalMessage = motivationalMessage;
    if (isCompleted !== undefined) updates.isCompleted = isCompleted;
    if (title !== undefined) updates.title = title.trim();
    if (targetDate !== undefined) updates.targetDate = targetDate;
    if (notes !== undefined) updates.notes = notes;
  } else {
    // Teacher/supervisor role: only completion toggle
    if (isCompleted !== undefined) updates.isCompleted = isCompleted;
  }

  if (Object.keys(updates).length === 0) { res.status(400).json({ error: "لا تعديلات" }); return; }

  const [row] = await db.update(studentGoalsTable)
    .set(updates)
    .where(and(eq(studentGoalsTable.id, goalId), eq(studentGoalsTable.studentId, studentId)))
    .returning();
  if (!row) { res.status(404).json({ error: "الهدف غير موجود" }); return; }
  res.json({ ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt?.toISOString() });
});

router.delete("/students/:id/goals/:goalId", authenticate, async (req, res): Promise<void> => {
  const allowed = ["leader", "track_supervisor", "student"];
  if (!allowed.includes(req.userRole!)) { res.status(403).json({ error: "Forbidden" }); return; }
  const studentId = parseInt(req.params.id as string);
  const goalId = parseInt(req.params.goalId as string);
  await db.delete(studentGoalsTable)
    .where(and(eq(studentGoalsTable.id, goalId), eq(studentGoalsTable.studentId, studentId)));
  res.status(204).send();
});

export default router;
