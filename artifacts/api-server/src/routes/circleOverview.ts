import { Router, type IRouter } from "express";
import { db, circlesTable, studentsTable, usersTable, recordsTable, badgeAwardCountsTable } from "@workspace/db";
import { eq, and, gte, lte, inArray } from "drizzle-orm";
import { authenticate } from "../middlewares/authenticate";
import { getMakkahWeekStart, addDaysStr, getMakkahDay } from "../lib/date";
import { computeCircleWeeklyMoonBadge, type EarnedBadge } from "../lib/badgeEngine";
import { ensureWeeklyMoonBadgeRan } from "../lib/weeklyMoonBadge";
import { getBadgeAwardCount } from "../lib/badgeAwardCounts";
import { getBadgeTier } from "../lib/badgeDefinitions";

const router: IRouter = Router();

const WEEKDAY_NAMES_AR = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس"]; // الأحد-الخميس فقط (أسبوع العمل)

/**
 * GET /api/circles/:id/overview — كل ما تحتاجه صفحة "حلقتي" الموحّدة دفعة وحدة:
 * بيانات الحلقة، الأوسمة اللحظية، غياب اليوم بالاسم، وملخص الأسبوع (الأحد-الخميس).
 *
 * الوصول: معلمة/مشرفة/طالبة → حلقتها فقط. مسؤولة مسار → أي حلقة من مسارها.
 * قائدة/نائبة → أي حلقة.
 */
router.get("/circles/:id/overview", authenticate, async (req, res): Promise<void> => {
  ensureWeeklyMoonBadgeRan(); // تعويض بدون انتظار — ما يأخر الرد على المستخدمة
  const circleId = parseInt(req.params.id as string);
  if (isNaN(circleId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [circle] = await db.select().from(circlesTable).where(eq(circlesTable.id, circleId));
  if (!circle) { res.status(404).json({ error: "Circle not found" }); return; }

  const role = req.userRole!;
  if (role === "teacher" || role === "supervisor" || role === "student") {
    if (req.userCircleId !== circleId) { res.status(403).json({ error: "Forbidden" }); return; }
  } else if (role === "track_supervisor") {
    if (circle.track !== req.userTrack) { res.status(403).json({ error: "Forbidden" }); return; }
  } else if (role !== "leader" && role !== "deputy") {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  // ── معلومات الحلقة (اسم المعلمة والمشرفة) ────────────────────────────────
  const staffIds = [circle.teacherId, circle.supervisorId].filter((id): id is number => !!id);
  const staffUsers = staffIds.length > 0
    ? await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(inArray(usersTable.id, staffIds))
    : [];
  const staffMap = new Map(staffUsers.map(u => [u.id, u.name]));

  // ── الأوسمة اللحظية (حاليًا: أقمر الحلقة) ────────────────────────────────
  const badges: (EarnedBadge & { timesAwarded?: number })[] = [];
  const moon = await computeCircleWeeklyMoonBadge(circleId);
  if (moon) {
    const timesAwarded = await getBadgeAwardCount("circle", circleId, "circle_weekly_moon");
    badges.push({ ...moon, timesAwarded });
  }

  // ── أوسمة المعلمة والمشرفة بعينهما (تنتقل معهما بين الحلقات) ───────────────
  const staffBadges: Array<{ role: "teacher" | "supervisor"; personName: string; badgeId: string; name: string; emoji: string; count: number }> = [];
  for (const [role, personId] of [["teacher", circle.teacherId], ["supervisor", circle.supervisorId]] as const) {
    if (!personId) continue;
    const rows = await db.select().from(badgeAwardCountsTable)
      .where(and(eq(badgeAwardCountsTable.entityType, role), eq(badgeAwardCountsTable.entityId, personId)));
    for (const r of rows) {
      if (r.count <= 0) continue;
      const def = getBadgeTier(r.badgeId as Parameters<typeof getBadgeTier>[0], r.tier);
      staffBadges.push({ role, personName: staffMap.get(personId) ?? "", badgeId: r.badgeId, name: def?.name ?? r.badgeId, emoji: def?.emoji ?? "🏅", count: r.count });
    }
  }

  // ── طالبات الحلقة النشطات ────────────────────────────────────────────────
  const students = await db.select({ id: studentsTable.id, fullName: studentsTable.fullName })
    .from(studentsTable).where(and(eq(studentsTable.circleId, circleId), eq(studentsTable.isArchived, false)));
  const studentMap = new Map(students.map(s => [s.id, s.fullName]));

  // ── غياب اليوم بالاسم (شفافية كاملة — تشوف الطالبة زميلاتها بالاسم) ──────
  const today = getMakkahDay();
  const todayRecords = await db.select({ studentId: recordsTable.studentId, isAbsent: recordsTable.isAbsent })
    .from(recordsTable).where(and(eq(recordsTable.circleId, circleId), eq(recordsTable.date, today)));
  const todayAbsentNames = todayRecords
    .filter(r => r.isAbsent)
    .map(r => studentMap.get(r.studentId) ?? "—")
    .sort((a, b) => a.localeCompare(b, "ar"));
  const hasTodayData = todayRecords.length > 0;

  // ── ملخص الأسبوع الحالي (الأحد-الخميس): كل يوم كم حاضرة وكم غايبة ────────
  const weekStart = getMakkahWeekStart();
  const weekEnd = addDaysStr(weekStart, 4);
  const weekRecords = await db.select({ date: recordsTable.date, isAbsent: recordsTable.isAbsent })
    .from(recordsTable)
    .where(and(eq(recordsTable.circleId, circleId), gte(recordsTable.date, weekStart), lte(recordsTable.date, weekEnd)));

  const weekSummary = WEEKDAY_NAMES_AR.map((dayName, i) => {
    const date = addDaysStr(weekStart, i);
    const dayRecords = weekRecords.filter(r => r.date === date);
    const absentCount = dayRecords.filter(r => r.isAbsent).length;
    const presentCount = dayRecords.filter(r => !r.isAbsent).length;
    return { date, dayName, hasData: dayRecords.length > 0, presentCount, absentCount };
  });
  const weekTotalAbsent = weekSummary.reduce((s, d) => s + d.absentCount, 0);

  res.json({
    circle: {
      id: circle.id,
      name: circle.name,
      track: circle.track,
      teacherName: circle.teacherId ? staffMap.get(circle.teacherId) ?? null : null,
      supervisorName: circle.supervisorId ? staffMap.get(circle.supervisorId) ?? null : null,
    },
    badges,
    staffBadges,
    today: { date: today, hasData: hasTodayData, absentNames: todayAbsentNames },
    week: { weekStart, weekEnd, days: weekSummary, totalAbsent: weekTotalAbsent },
  });
});

export default router;
