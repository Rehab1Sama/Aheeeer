import { Router, type IRouter } from "express";
import { db, usersTable, deputyTasksTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { authenticate, requireRole } from "../middlewares/authenticate";

const router: IRouter = Router();

const VALID_ANSWER_TYPES = ["text", "select", "boolean"];
const VALID_TASK_TYPES = ["general", "optional", "qa"];

router.get("/deputy/tasks", authenticate, async (req, res): Promise<void> => {
  if (!["leader", "deputy"].includes(req.userRole!)) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  const tasks = await db.select().from(deputyTasksTable).orderBy(desc(deputyTasksTable.createdAt));
  res.json(tasks);
});

router.post("/deputy/tasks", authenticate, requireRole("leader"), async (req, res): Promise<void> => {
  const { title, description, taskType, answerType, selectOptions } = req.body as {
    title?: string; description?: string; taskType?: string;
    answerType?: string; selectOptions?: string[];
  };
  if (!title?.trim()) { res.status(400).json({ error: "العنوان مطلوب" }); return; }
  const resolvedType = VALID_TASK_TYPES.includes(taskType ?? "") ? taskType! : "general";
  const resolvedAnswerType = VALID_ANSWER_TYPES.includes(answerType ?? "") ? answerType! : "text";
  const [task] = await db.insert(deputyTasksTable).values({
    title: title.trim(),
    description: description?.trim() ?? null,
    taskType: resolvedType,
    answerType: resolvedAnswerType,
    selectOptions: selectOptions?.length ? JSON.stringify(selectOptions) : null,
    createdById: req.userId!,
  }).returning();
  res.status(201).json(task);
});

router.patch("/deputy/tasks/:id/complete", authenticate, requireRole("deputy"), async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string);
  const { response } = req.body as { response?: string };
  const [task] = await db.update(deputyTasksTable)
    .set({ isCompleted: true, completedAt: new Date(), response: response?.trim() ?? null })
    .where(eq(deputyTasksTable.id, id))
    .returning();
  res.json(task);
});

router.patch("/deputy/tasks/:id/uncomplete", authenticate, requireRole("deputy"), async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string);
  const [task] = await db.update(deputyTasksTable)
    .set({ isCompleted: false, completedAt: null, response: null })
    .where(eq(deputyTasksTable.id, id))
    .returning();
  res.json(task);
});

router.patch("/deputy/tasks/:id/respond", authenticate, requireRole("deputy"), async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string);
  const { response } = req.body as { response?: string };
  const [task] = await db.update(deputyTasksTable)
    .set({ response: response?.trim() ?? null })
    .where(eq(deputyTasksTable.id, id))
    .returning();
  res.json(task);
});

router.delete("/deputy/tasks/:id", authenticate, requireRole("leader"), async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string);
  await db.delete(deputyTasksTable).where(eq(deputyTasksTable.id, id));
  res.json({ ok: true });
});

router.get("/deputy/status", authenticate, requireRole("leader"), async (req, res): Promise<void> => {
  const allUsers = await db.select().from(usersTable);
  const deputies = allUsers.filter(u => u.role === "deputy" && !u.isArchived);
  if (!deputies.length) { res.json({ hasDeputy: false }); return; }
  const deputy = deputies[0]!;
  const lastLogin = deputy.lastLoginAt;
  const daysSinceLogin = lastLogin
    ? Math.floor((Date.now() - new Date(lastLogin).getTime()) / 86400000)
    : null;
  const tasks = await db.select().from(deputyTasksTable).orderBy(desc(deputyTasksTable.createdAt));
  const pendingTasks = tasks.filter(t => !t.isCompleted);
  const unansweredQaTasks = tasks.filter(t =>
    t.taskType === "qa" && !t.response &&
    Math.floor((Date.now() - new Date(t.createdAt).getTime()) / 86400000) >= 3
  );
  const { passwordHash: _, ...safeDeputy } = deputy;
  res.json({
    hasDeputy: true,
    deputy: safeDeputy,
    daysSinceLogin,
    inactive: daysSinceLogin !== null && daysSinceLogin >= 3,
    neverLoggedIn: lastLogin === null,
    pendingTasksCount: pendingTasks.length,
    unansweredQaCount: unansweredQaTasks.length,
  });
});

export default router;
