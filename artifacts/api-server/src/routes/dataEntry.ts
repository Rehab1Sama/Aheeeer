import { Router, type IRouter } from "express";
import { cachedList } from "../lib/readCache";
import {
  db,
  recordsTable,
  circlesTable,
  studentsTable,
  teacherAbsencesTable,
  dataEntryCircleAssignmentsTable,
  studentEnrollmentsTable,
} from "@workspace/db";
import { eq, and, gte, inArray, sql } from "drizzle-orm";
import { authenticate } from "../middlewares/authenticate";

const router: IRouter = Router();

function getMeccaToday(): string {
  const meccaMs = Date.now() + 3 * 60 * 60 * 1000;
  const d = new Date(meccaMs);
  if (d.getUTCHours() < 5) d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function getWeekSunday(today: string): string {
  const d = new Date(today + "T00:00:00Z");
  const dow = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

/**
 * GET /api/data-entry/missing?date=YYYY-MM-DD
 *
 * Returns students who haven't had data entered for the given date.
 * For data_entry role: only students from their assigned circles.
 * If no assignments exist → returns no students.
 */
router.get("/data-entry/missing", authenticate, async (req, res): Promise<void> => {
  const today = (req.query.date as string) ?? getMeccaToday();
  const userId = req.userId;
  const userRole = req.userRole;

  // Students already recorded today — used to mark (not exclude) them
  // المفتاح: studentId-circleId لأن نفس الطالبة قد تكون في حلقتين بأنصبة مختلفة

  // نطاق الحلقات حسب الدور (نفس ما تراه في قائمة الحلقات): لا نسحب طالبات المقرأة كلها لمعلمة أو مشرفة
  // array = restrict to these circles; an empty array means no access; null = كل الحلقات (القائدة والنائبة)
  let assignedCircleIds: number[] | null = null;
  if (userRole === "data_entry" && userId) {
    const rows = await db
      .select({ circleId: dataEntryCircleAssignmentsTable.circleId })
      .from(dataEntryCircleAssignmentsTable)
      .where(eq(dataEntryCircleAssignmentsTable.dataEntryUserId, userId));
    assignedCircleIds = rows.map((r) => r.circleId);
  } else if ((userRole === "teacher" || userRole === "supervisor") && userId) {
    const owner = userRole === "teacher" ? circlesTable.teacherId : circlesTable.supervisorId;
    const owned = await db.select({ id: circlesTable.id }).from(circlesTable).where(eq(owner, userId));
    assignedCircleIds = [...new Set([...(req.userCircleId != null ? [req.userCircleId] : []), ...owned.map((c) => c.id)])];
  } else if (userRole === "track_supervisor") {
    const mine = await db.select({ id: circlesTable.id }).from(circlesTable).where(eq(circlesTable.track, req.userTrack ?? ""));
    assignedCircleIds = mine.map((c) => c.id);
  }

  const circleFilter = assignedCircleIds
    ? assignedCircleIds.length > 0
      ? inArray(studentEnrollmentsTable.circleId, assignedCircleIds)
      : sql`false`
    : sql`true`;

  // Primary source: enrollment table (source of truth)
  // القائمة الكاملة (القائدة والنائبة) واحدة للجميع: تُحفظ دقيقة
  const shared = assignedCircleIds === null;
  const byEnrollment = await (shared ? (q: () => Promise<any[]>) => cachedList("missing:byEnrollment", 60_000, q) : (q: () => Promise<any[]>) => q())(() => db
    .select({
      studentId: studentsTable.id,
      studentName: studentsTable.fullName,
      circleId: studentEnrollmentsTable.circleId,
      circleName: circlesTable.name,
      track: circlesTable.track,
      leaveStart: studentEnrollmentsTable.leaveStart,
      leaveEnd: studentEnrollmentsTable.leaveEnd,
    })
    .from(studentEnrollmentsTable)
    .innerJoin(studentsTable, eq(studentsTable.id, studentEnrollmentsTable.studentId))
    .innerJoin(circlesTable, eq(circlesTable.id, studentEnrollmentsTable.circleId))
    .where(
      and(
        eq(studentEnrollmentsTable.isArchived, false),
        eq(studentsTable.isArchived, false),
        circleFilter,
      ),
    ));

  const directCircleFilter = assignedCircleIds
    ? assignedCircleIds.length > 0
      ? inArray(studentsTable.circleId, assignedCircleIds)
      : sql`false`
    : sql`${studentsTable.circleId} IS NOT NULL`;

  // Fallback source: students with circleId directly on the row
  const byDirect = await (shared ? (q: () => Promise<any[]>) => cachedList("missing:byDirect", 60_000, q) : (q: () => Promise<any[]>) => q())(() => db
    .select({
      studentId: studentsTable.id,
      studentName: studentsTable.fullName,
      circleId: studentsTable.circleId,
      circleName: circlesTable.name,
      track: circlesTable.track,
      leaveStart: sql<string | null>`null`.as("leave_start"),
      leaveEnd: sql<string | null>`null`.as("leave_end"),
    })
    .from(studentsTable)
    .innerJoin(circlesTable, eq(circlesTable.id, studentsTable.circleId))
    .where(and(eq(studentsTable.isArchived, false), directCircleFilter)));

  // سجلات اليوم لنفس النطاق فقط
  const todayRecords = assignedCircleIds
    ? (assignedCircleIds.length ? await db
        .select({ studentId: recordsTable.studentId, circleId: recordsTable.circleId, recordId: recordsTable.id })
        .from(recordsTable)
        .where(and(eq(recordsTable.date, today), inArray(recordsTable.circleId, assignedCircleIds))) : [])
    : await cachedList(`records-ids:${today}`, 60_000, () => db
        .select({ studentId: recordsTable.studentId, circleId: recordsTable.circleId, recordId: recordsTable.id })
        .from(recordsTable)
        .where(eq(recordsTable.date, today)));
  const recordMap = new Map(todayRecords.map((r) => [`${r.studentId}-${r.circleId}`, r.recordId]));

  // Merge, deduplicate by (studentId + circleId), enrollment wins
  const seen = new Set<string>();
  const all: Array<{
    studentId: number;
    studentName: string;
    circleId: number;
    circleName: string;
    track: string | null;
    leaveStart: string | null;
    leaveEnd: string | null;
  }> = [];

  for (const s of [...byEnrollment, ...(byDirect as any)]) {
    const key = `${s.studentId}-${s.circleId}`;
    if (!seen.has(key)) {
      seen.add(key);
      all.push(s as any);
    }
  }

  // Mark each student with leave and record status — no longer filter out recorded students
  const result = all.map((s) => {
    const onLeave = !!(
      s.leaveStart &&
      s.leaveEnd &&
      s.leaveStart <= today &&
      today <= s.leaveEnd
    );
    const recordId = recordMap.get(`${s.studentId}-${s.circleId}`) ?? null;
    return { ...s, onLeave, recordId, hasRecord: recordId !== null };
  });

  res.json(result);
});

/**
 * GET /api/data-entry/circle-submitted-days?circleId=X
 *
 * Returns dates in the current week where the circle already has records
 * or a teacher absence, so the frontend can hide those dates.
 */
router.get(
  "/data-entry/circle-submitted-days",
  authenticate,
  async (req, res): Promise<void> => {
    const circleId = parseInt((req.query.circleId as string) ?? "0");
    if (!circleId) {
      res.json([]);
      return;
    }

    const today = getMeccaToday();
    const weekStart = getWeekSunday(today);

    const records = await db
      .select({ date: recordsTable.date })
      .from(recordsTable)
      .where(
        and(
          eq(recordsTable.circleId, circleId),
          gte(recordsTable.date, weekStart),
        ),
      );

    const absences = await db
      .select({ date: teacherAbsencesTable.date })
      .from(teacherAbsencesTable)
      .where(
        and(
          eq(teacherAbsencesTable.circleId, circleId),
          gte(teacherAbsencesTable.date, weekStart),
        ),
      );

    const days = new Set<string>();
    for (const r of records) days.add(r.date);
    for (const a of absences) days.add(a.date);

    res.json([...days]);
  },
);

export default router;
