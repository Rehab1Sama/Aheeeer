import { Router, type IRouter } from "express";
import { db, teacherAbsencesTable, circlesTable } from "@workspace/db";
import { eq, and, gte, lte } from "drizzle-orm";
import { authenticate } from "../middlewares/authenticate";
import { MarkTeacherAbsentBody } from "@workspace/api-zod";
import { getMakkahDay, getMakkahDaysAgo } from "../lib/date";

const router: IRouter = Router();

router.get("/circles/:id/teacher-absence", authenticate, async (req, res): Promise<void> => {
  const circleId = parseInt(req.params.id as string);
  const { date } = req.query as { date?: string };
  if (!date) {
    res.status(400).json({ error: "date query param required" });
    return;
  }
  const [row] = await db.select().from(teacherAbsencesTable)
    .where(and(eq(teacherAbsencesTable.circleId, circleId), eq(teacherAbsencesTable.date, date)));
  res.json({ absent: !!row, date, circleId });
});

router.post("/circles/:id/teacher-absence", authenticate, async (req, res): Promise<void> => {
  const circleId = parseInt(req.params.id as string);
  const parsed = MarkTeacherAbsentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { date } = parsed.data;
  // الغياب يُحسب على المعلمة نفسها (معلمة الحلقة يومها). لو سجّلته مسؤولة المسار من المهام
  // اليومية لنفس الحلقة واليوم، يبقى غيابًا واحدًا (القيد الفريد على الحلقة واليوم).
  const [circle] = await db.select({ teacherId: circlesTable.teacherId }).from(circlesTable).where(eq(circlesTable.id, circleId));
  try {
    await db.insert(teacherAbsencesTable).values({
      circleId,
      date,
      reportedById: req.userId!,
      teacherId: circle?.teacherId ?? null,
      source: "entry",
    }).onConflictDoNothing();
  } catch {
    // duplicate — already marked absent
  }
  res.status(201).json({ absent: true, date, circleId });
});

router.delete("/circles/:id/teacher-absence", authenticate, async (req, res): Promise<void> => {
  const circleId = parseInt(req.params.id as string);
  const { date } = req.query as { date?: string };
  if (!date) {
    res.status(400).json({ error: "date query param required" });
    return;
  }
  const allowedRoles = ["leader", "track_supervisor", "data_entry", "supervisor"];
  if (!allowedRoles.includes(req.userRole!)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  // مشرفة الحلقة تقدر تلغي الغياب فقط لحلقتها هي (اللي تشرف عليها فعليًا)
  if (req.userRole === "supervisor") {
    const [circle] = await db.select({ id: circlesTable.id, supervisorId: circlesTable.supervisorId })
      .from(circlesTable).where(eq(circlesTable.id, circleId));
    const owns = Boolean(circle && (circle.id === req.userCircleId || circle.supervisorId === req.userId));
    if (!owns) {
      res.status(403).json({ error: "لا يمكنك إلغاء الغياب إلا لحلقتك" });
      return;
    }
  }
  await db.delete(teacherAbsencesTable)
    .where(and(eq(teacherAbsencesTable.circleId, circleId), eq(teacherAbsencesTable.date, date)));
  res.json({ absent: false, date, circleId });
});

router.get("/teacher-absences", authenticate, async (req, res): Promise<void> => {
  const { dateFrom, dateTo } = req.query as Record<string, string | undefined>;
  const today = getMakkahDay();
  const from = dateFrom ?? getMakkahDaysAgo(30);
  const to = dateTo ?? today;

  const absences = await db.select().from(teacherAbsencesTable)
    .where(and(gte(teacherAbsencesTable.date, from), lte(teacherAbsencesTable.date, to)));

  const circles = await db.select({ id: circlesTable.id, name: circlesTable.name }).from(circlesTable);
  const circleMap: Record<number, string> = {};
  circles.forEach(c => { circleMap[c.id] = c.name; });

  const result = absences.map(a => ({
    ...a,
    circleName: circleMap[a.circleId] ?? "غير معروف",
    createdAt: a.createdAt.toISOString(),
  }));

  res.json(result);
});

export default router;
