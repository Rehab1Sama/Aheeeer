import { Router, type IRouter } from "express";
import {
  db, trackSupervisorNamesTable, dailyCircleTasksTable,
  customQuestionsTable, customQuestionAnswersTable, circlesTable, tracksTable
} from "@workspace/db";
import { eq, and, gte, lte } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { authenticate } from "../middlewares/authenticate";

const router: IRouter = Router();

// --- Supervisor Names ---

router.get("/tracks/:id/supervisor-names", authenticate, async (req, res): Promise<void> => {
  const trackId = parseInt(req.params.id as string);
  const names = await db.select()
    .from(trackSupervisorNamesTable)
    .where(eq(trackSupervisorNamesTable.trackId, trackId));
  res.json(names.map(n => ({ ...n, createdAt: n.createdAt.toISOString() })));
});

router.post("/tracks/:id/supervisor-names", authenticate, async (req, res): Promise<void> => {
  if (req.userRole !== "leader") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const trackId = parseInt(req.params.id as string);
  const { name } = req.body as { name: string };
  if (!name?.trim()) {
    res.status(400).json({ error: "name required" });
    return;
  }
  const [row] = await db.insert(trackSupervisorNamesTable)
    .values({ trackId, name: name.trim() })
    .returning();
  res.status(201).json({ ...row, createdAt: row.createdAt.toISOString() });
});

router.delete("/supervisor-names/:id", authenticate, async (req, res): Promise<void> => {
  if (req.userRole !== "leader") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  await db.delete(trackSupervisorNamesTable).where(eq(trackSupervisorNamesTable.id, parseInt(req.params.id as string)));
  res.status(204).send();
});

// --- Daily Circle Tasks ---

router.get("/daily-circle-tasks", authenticate, async (req, res): Promise<void> => {
  const { date, dateFrom, dateTo, supervisorNameId } = req.query as Record<string, string | undefined>;

  const allCircles = await db.select({ id: circlesTable.id, name: circlesTable.name, track: circlesTable.track }).from(circlesTable);
  const circleMap: Record<number, { name: string; track: string }> = {};
  allCircles.forEach(c => { circleMap[c.id] = { name: c.name, track: c.track }; });

  const allNames = await db.select().from(trackSupervisorNamesTable);
  const nameMap: Record<number, string> = {};
  allNames.forEach(n => { nameMap[n.id] = n.name; });

  const filters: SQL[] = [];
  if (date) filters.push(eq(dailyCircleTasksTable.date, date));
  if (dateFrom) filters.push(gte(dailyCircleTasksTable.date, dateFrom));
  if (dateTo) filters.push(lte(dailyCircleTasksTable.date, dateTo));
  if (supervisorNameId) filters.push(eq(dailyCircleTasksTable.supervisorNameId, parseInt(supervisorNameId)));

  const rows = await db.select().from(dailyCircleTasksTable)
    .where(filters.length ? and(...filters as [SQL, ...SQL[]]) : undefined);

  const result = rows.map(r => ({
    ...r,
    circleName: circleMap[r.circleId]?.name ?? "غير معروف",
    supervisorName: nameMap[r.supervisorNameId] ?? "غير معروف",
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt?.toISOString(),
  }));

  res.json(result);
});

router.post("/daily-circle-tasks", authenticate, async (req, res): Promise<void> => {
  if (req.userRole !== "track_supervisor" && req.userRole !== "leader") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const { circleId, date, supervisorNameId, teacherAttendance, prepStatus,
    motivationStatus, reportStatus, circleAbsenceCount, notes, customAnswers } = req.body as {
    circleId: number; date: string; supervisorNameId: number;
    teacherAttendance: string; prepStatus: string; motivationStatus: string;
    reportStatus: string; circleAbsenceCount: number; notes?: string | null;
    customAnswers?: { questionId: number; answer: string }[];
  };

  if (!circleId || !date || !supervisorNameId || !teacherAttendance || !prepStatus || !motivationStatus || !reportStatus) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }

  const [existing] = await db.select()
    .from(dailyCircleTasksTable)
    .where(and(eq(dailyCircleTasksTable.circleId, circleId), eq(dailyCircleTasksTable.date, date)));
  if (existing && existing.supervisorNameId !== supervisorNameId) {
    res.status(409).json({ error: "هذه الحلقة سجّلتها مسؤولة أخرى لهذا اليوم", lockedBy: existing.supervisorNameId });
    return;
  }

  const [row] = await db.insert(dailyCircleTasksTable).values({
    circleId, date, supervisorNameId, teacherAttendance, prepStatus,
    motivationStatus, reportStatus,
    circleAbsenceCount: circleAbsenceCount ?? 0,
    notes: notes ?? null,
  }).onConflictDoUpdate({
    target: [dailyCircleTasksTable.circleId, dailyCircleTasksTable.date, dailyCircleTasksTable.supervisorNameId],
    set: { teacherAttendance, prepStatus, motivationStatus, reportStatus, circleAbsenceCount: circleAbsenceCount ?? 0, notes: notes ?? null },
  }).returning();

  // save custom answers
  if (customAnswers && customAnswers.length > 0) {
    for (const ca of customAnswers) {
      await db.insert(customQuestionAnswersTable).values({
        questionId: ca.questionId,
        supervisorNameId,
        date,
        answer: ca.answer,
      }).onConflictDoUpdate({
        target: [customQuestionAnswersTable.questionId, customQuestionAnswersTable.supervisorNameId, customQuestionAnswersTable.date],
        set: { answer: ca.answer },
      });
    }
  }

  const allCircles = await db.select({ id: circlesTable.id, name: circlesTable.name }).from(circlesTable);
  const circleMap: Record<number, string> = {};
  allCircles.forEach(c => { circleMap[c.id] = c.name; });

  const allNames = await db.select().from(trackSupervisorNamesTable);
  const nameMap: Record<number, string> = {};
  allNames.forEach(n => { nameMap[n.id] = n.name; });

  res.status(201).json({
    ...row,
    circleName: circleMap[row.circleId] ?? "غير معروف",
    supervisorName: nameMap[row.supervisorNameId] ?? "غير معروف",
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt?.toISOString(),
  });
});

router.patch("/daily-circle-tasks/:id", authenticate, async (req, res): Promise<void> => {
  if (req.userRole !== "track_supervisor" && req.userRole !== "leader") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { teacherAttendance, prepStatus, motivationStatus, reportStatus,
    circleAbsenceCount, notes, customAnswers, supervisorNameId } = req.body as {
    teacherAttendance?: string; prepStatus?: string; motivationStatus?: string;
    reportStatus?: string; circleAbsenceCount?: number; notes?: string | null;
    customAnswers?: { questionId: number; answer: string }[];
    supervisorNameId?: number;
  };

  const [existing] = await db.select().from(dailyCircleTasksTable).where(eq(dailyCircleTasksTable.id, id));
  if (!existing) { res.status(404).json({ error: "Task not found" }); return; }

  const [updated] = await db.update(dailyCircleTasksTable)
    .set({
      ...(teacherAttendance !== undefined && { teacherAttendance }),
      ...(prepStatus !== undefined && { prepStatus }),
      ...(motivationStatus !== undefined && { motivationStatus }),
      ...(reportStatus !== undefined && { reportStatus }),
      ...(circleAbsenceCount !== undefined && { circleAbsenceCount }),
      ...(notes !== undefined && { notes }),
    })
    .where(eq(dailyCircleTasksTable.id, id))
    .returning();

  if (customAnswers && customAnswers.length > 0 && supervisorNameId) {
    const date = existing.date;
    for (const ca of customAnswers) {
      await db.insert(customQuestionAnswersTable).values({
        questionId: ca.questionId, supervisorNameId, date, answer: ca.answer,
      }).onConflictDoUpdate({
        target: [customQuestionAnswersTable.questionId, customQuestionAnswersTable.supervisorNameId, customQuestionAnswersTable.date],
        set: { answer: ca.answer },
      });
    }
  }

  const allCircles = await db.select({ id: circlesTable.id, name: circlesTable.name }).from(circlesTable);
  const circleMap: Record<number, string> = {};
  allCircles.forEach(c => { circleMap[c.id] = c.name; });
  const allNames = await db.select().from(trackSupervisorNamesTable);
  const nameMap: Record<number, string> = {};
  allNames.forEach(n => { nameMap[n.id] = n.name; });

  res.json({
    ...updated,
    circleName: circleMap[updated.circleId] ?? "غير معروف",
    supervisorName: nameMap[updated.supervisorNameId] ?? "غير معروف",
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt?.toISOString(),
  });
});

// --- Custom Questions ---

router.get("/custom-questions", authenticate, async (req, res): Promise<void> => {
  const { date } = req.query as { date?: string };
  const all = await db.select().from(customQuestionsTable);
  const filtered = date
    ? all.filter(q => q.dateFrom <= date && q.dateTo >= date)
    : all;
  res.json(filtered.map(q => ({ ...q, createdAt: q.createdAt.toISOString() })));
});

router.post("/custom-questions", authenticate, async (req, res): Promise<void> => {
  if (req.userRole !== "leader") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const { question, dateFrom, dateTo, questionType, answerType, answerOptions } = req.body as {
    question: string; dateFrom: string; dateTo: string;
    questionType?: string; answerType?: string; answerOptions?: string;
  };
  if (!question?.trim() || !dateFrom || !dateTo) {
    res.status(400).json({ error: "question, dateFrom, dateTo required" });
    return;
  }
  const type = questionType === "collective" ? "collective" : "individual";
  const aType = ["text", "dropdown", "yesno"].includes(answerType ?? "") ? answerType! : "text";
  const [row] = await db.insert(customQuestionsTable)
    .values({
      question: question.trim(), dateFrom, dateTo,
      createdById: req.userId!, questionType: type,
      answerType: aType,
      answerOptions: aType === "dropdown" && answerOptions ? answerOptions : null,
    })
    .returning();
  res.status(201).json({ ...row, createdAt: row.createdAt.toISOString() });
});

router.delete("/custom-questions/:id", authenticate, async (req, res): Promise<void> => {
  if (req.userRole !== "leader") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  await db.delete(customQuestionsTable).where(eq(customQuestionsTable.id, parseInt(req.params.id as string)));
  res.status(204).send();
});

router.post("/custom-question-answers", authenticate, async (req, res): Promise<void> => {
  const { questionId, supervisorNameId, trackId, date, answer } = req.body as {
    questionId: number; supervisorNameId?: number; trackId?: number; date: string; answer: string;
  };

  if (trackId && !supervisorNameId) {
    // Collective answer: one per (questionId, trackId, date) — delete existing then insert
    await db.delete(customQuestionAnswersTable).where(
      and(
        eq(customQuestionAnswersTable.questionId, questionId),
        eq(customQuestionAnswersTable.trackId, trackId),
        eq(customQuestionAnswersTable.date, date),
      )
    );
    const [row] = await db.insert(customQuestionAnswersTable)
      .values({ questionId, trackId, date, answer })
      .returning();
    res.status(201).json({ ...row, createdAt: row.createdAt.toISOString() });
  } else {
    // Individual answer: upsert on (questionId, supervisorNameId, date)
    const [row] = await db.insert(customQuestionAnswersTable)
      .values({ questionId, supervisorNameId: supervisorNameId!, date, answer })
      .onConflictDoUpdate({
        target: [customQuestionAnswersTable.questionId, customQuestionAnswersTable.supervisorNameId, customQuestionAnswersTable.date],
        set: { answer },
      }).returning();
    res.status(201).json({ ...row, createdAt: row.createdAt.toISOString() });
  }
});

// GET collective answers for a track and date range
router.get("/collective-question-answers", authenticate, async (req, res): Promise<void> => {
  const { trackId, date } = req.query as { trackId?: string; date?: string };
  const filters = [];
  if (trackId) filters.push(eq(customQuestionAnswersTable.trackId, parseInt(trackId)));
  if (date) filters.push(eq(customQuestionAnswersTable.date, date));
  const rows = await db.select().from(customQuestionAnswersTable)
    .where(filters.length ? and(...filters as Parameters<typeof and>) : undefined);
  res.json(rows.map(r => ({ ...r, createdAt: r.createdAt.toISOString() })));
});

export default router;
