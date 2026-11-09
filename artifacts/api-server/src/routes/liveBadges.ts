import { Router, type IRouter } from "express";
import { db, circlesTable, studentsTable, trackSupervisorNamesTable, tracksTable, badgeAwardCountsTable, reviewPlansTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { getMakkahDay, getLastCompletedWeekStart } from "../lib/date";
import { reviewCompletions } from "../lib/reviewCompletion";
import { authenticate } from "../middlewares/authenticate";
import {
  computeCircleWeeklyMoonBadge,
  computeStudentMonthlyPerfectAttendance,
  computeStudentImprovement,
  computeTrackNoShortcoming,
  computeSupervisorWeeklyCommitment,
  computeReviewPlanCompletion,
  type EarnedBadge,
} from "../lib/badgeEngine";

const router: IRouter = Router();

/**
 * وقت أول ظهور للوسام لهذه الجهة في فترته (شهر/أسبوع/دورة خطة): يُستخدم لعرض الوسام في الصفحة
 * الأمامية ٢٤ ساعة فقط، ثم يبقى في صفحة «أوسمتي». يُحفظ في عداد الأوسمة بنوع جهة منفصل
 * ("seen:...") فلا يمسّ عدّاد مرات الاستحقاق الأصلي.
 */
async function firstSeenAt(entityType: string, entityId: number, badgeId: string, tier: number, periodKey: string): Promise<string> {
  const seenType = `seen:${entityType}`;
  const [row] = await db.select().from(badgeAwardCountsTable).where(and(
    eq(badgeAwardCountsTable.entityType, seenType), eq(badgeAwardCountsTable.entityId, entityId), eq(badgeAwardCountsTable.badgeId, badgeId),
  ));
  const now = new Date();
  if (!row) {
    await db.insert(badgeAwardCountsTable).values({ entityType: seenType, entityId, badgeId, tier, count: 1, lastPeriod: periodKey, updatedAt: now })
      .onConflictDoNothing();
    return now.toISOString();
  }
  if (row.lastPeriod !== periodKey) {
    await db.update(badgeAwardCountsTable).set({ lastPeriod: periodKey, tier, count: row.count + 1, updatedAt: now })
      .where(eq(badgeAwardCountsTable.id, row.id));
    return now.toISOString();
  }
  return row.updatedAt.toISOString();
}

/**
 * الأوسمة اللحظية (بالكود، بدون تخزين قاعدة بيانات) لحلقة واحدة.
 * الوصول: نفس صلاحيات عرض الحلقة (المعلمة/المشرفة/الطالبة تشوف حلقتها،
 * مسؤولة المسار حلقات مسارها، القائدة/النائبة أي حلقة).
 */
router.get("/live-badges/circle/:id", authenticate, async (req, res): Promise<void> => {
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

  const badges: EarnedBadge[] = [];
  const moon = await computeCircleWeeklyMoonBadge(circleId);
  if (moon) badges.push(moon);

  // وقت أول ظهور: الواجهة تعرض الوسام في الصفحة الأمامية ٢٤ ساعة فقط
  const week = getLastCompletedWeekStart();
  res.json(await Promise.all(badges.map(async (b) => ({
    ...b, awardedAt: await firstSeenAt("circle", circleId, b.badgeId, b.tier, `${b.tier}:${week}`).catch(() => null),
  }))));
});

/**
 * الأوسمة اللحظية لطالبة واحدة (حضور الشهر + التطور).
 * الوصول: الطالبة نفسها، أو معلمة/مشرفة حلقتها، أو مسؤولة مسارها، أو القائدة/النائبة.
 */
router.get("/live-badges/student/:id", authenticate, async (req, res): Promise<void> => {
  const studentId = parseInt(req.params.id as string);
  if (isNaN(studentId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [student] = await db.select().from(studentsTable).where(eq(studentsTable.id, studentId));
  if (!student) { res.status(404).json({ error: "Student not found" }); return; }

  const role = req.userRole!;
  if (role === "student") {
    if (req.userStudentId !== studentId) { res.status(403).json({ error: "Forbidden" }); return; }
  } else if (role === "teacher" || role === "supervisor") {
    if (student.circleId !== req.userCircleId) { res.status(403).json({ error: "Forbidden" }); return; }
  } else if (role === "track_supervisor") {
    const [circle] = student.circleId ? await db.select().from(circlesTable).where(eq(circlesTable.id, student.circleId)) : [];
    if (!circle || circle.track !== req.userTrack) { res.status(403).json({ error: "Forbidden" }); return; }
  } else if (role !== "leader" && role !== "deputy") {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  const badges: EarnedBadge[] = [];
  const [monthly, improvement, planCompletion] = await Promise.all([
    computeStudentMonthlyPerfectAttendance(studentId),
    computeStudentImprovement(studentId),
    computeReviewPlanCompletion(studentId),
  ]);
  if (monthly) badges.push(monthly);
  if (improvement) badges.push(improvement);
  if (planCompletion) badges.push(planCompletion);

  // فترة كل وسام: الشهر، أو الأسبوع، أو دورة الخطة الحالية — وسام جديد في فترة جديدة يظهر من جديد ٢٤ ساعة
  let planKey = "none";
  if (planCompletion) {
    // الخطة التي استحقت عليها الوسام (قد تكون أُغلقت بتجديد الدورة)
    const [c] = await reviewCompletions(getMakkahDay(), studentId);
    planKey = c ? `plan:${c.planId}` : "none";
  }
  const periodOf = (b: EarnedBadge) =>
    b.badgeId === "monthly_perfect" ? getMakkahDay().slice(0, 7)
      : b.badgeId === "improvement" ? getLastCompletedWeekStart()
      : b.badgeId === "review_plan_completion" ? planKey
      : getMakkahDay().slice(0, 7);
  const withTime = await Promise.all(badges.map(async (b) => ({
    ...b,
    awardedAt: await firstSeenAt("student", studentId, b.badgeId, b.tier, `${b.tier}:${periodOf(b)}`).catch(() => null),
  })));

  res.json(withTime);
});

/**
 * الأوسمة اللحظية لمسار كامل (مسارنا الأحب).
 * الوصول: مسؤولة المسار لمسارها فقط، أو القائدة/النائبة لأي مسار.
 */
router.get("/live-badges/track/:trackName", authenticate, async (req, res): Promise<void> => {
  const trackName = decodeURIComponent(req.params.trackName as string);
  const role = req.userRole!;
  if (role === "track_supervisor") {
    if (trackName !== req.userTrack) { res.status(403).json({ error: "Forbidden" }); return; }
  } else if (role !== "leader" && role !== "deputy") {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  const badges: EarnedBadge[] = [];
  const noShortcoming = await computeTrackNoShortcoming(trackName);
  if (noShortcoming) badges.push(noShortcoming);

  const weekT = getLastCompletedWeekStart();
  const trackKey = [...trackName].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 2_000_000_000, 7);
  res.json(await Promise.all(badges.map(async (b) => ({
    ...b, awardedAt: await firstSeenAt("track", trackKey, b.badgeId, b.tier, `${b.tier}:${weekT}`).catch(() => null),
  }))));
});

const stripPrefix = (s: string) => s.replace(/^مسار\s+/, "").trim();

/**
 * الأوسمة اللحظية لاسم فردي (مسؤولة مسار) — فخر الأسبوع.
 * الوصول: مسؤولة المسار لاسم يتبع مسارها فقط، أو القائدة/النائبة لأي اسم.
 */
router.get("/live-badges/track-supervisor/:supervisorNameId", authenticate, async (req, res): Promise<void> => {
  const supervisorNameId = parseInt(req.params.supervisorNameId as string);
  if (isNaN(supervisorNameId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [nameRow] = await db.select().from(trackSupervisorNamesTable).where(eq(trackSupervisorNamesTable.id, supervisorNameId));
  if (!nameRow) { res.status(404).json({ error: "Not found" }); return; }

  const role = req.userRole!;
  if (role === "track_supervisor") {
    const [track] = await db.select().from(tracksTable).where(eq(tracksTable.id, nameRow.trackId));
    if (!track || stripPrefix(track.name) !== stripPrefix(req.userTrack ?? "")) { res.status(403).json({ error: "Forbidden" }); return; }
  } else if (role !== "leader" && role !== "deputy") {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  const badges: EarnedBadge[] = [];
  const pride = await computeSupervisorWeeklyCommitment(supervisorNameId);
  if (pride) badges.push(pride);

  const weekS = getLastCompletedWeekStart();
  res.json(await Promise.all(badges.map(async (b) => ({
    ...b, awardedAt: await firstSeenAt("track_supervisor", supervisorNameId, b.badgeId, b.tier, `${b.tier}:${weekS}`).catch(() => null),
  }))));
});

export default router;
