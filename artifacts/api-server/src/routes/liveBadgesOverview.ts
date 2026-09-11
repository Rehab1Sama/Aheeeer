// ============================================================================
// راوت "مستحقات الأوسمة" — نظرة عامة على كل الجهات المستحقة لكل وسام، مع فلتر
// تاريخ (أسبوع/شهر/تاريخ مرجعي). ملف جديد مستقل، منفصل عن liveBadges.ts
// (اللي يعرض وسام جهة واحدة فقط). راجعي INTEGRATION_NOTES.md لطريقة التركيب.
// ============================================================================

import { Router, type IRouter } from "express";
import { authenticate } from "../middlewares/authenticate";
import {
  overviewCircleWeeklyMoon,
  overviewReviewPlanCompletion,
  overviewMonthlyPerfect,
  overviewPerfectAttendanceInRange,
  overviewImprovement,
  overviewTrackNoShortcoming,
  overviewSupervisorWeeklyCommitment,
  stripPrefix,
  type OverviewEntry,
} from "../lib/badgeOverview";
import { ensureWeeklyMoonBadgeRan } from "../lib/weeklyMoonBadge";
import { sendPerfectAttendanceBadges } from "../lib/monthlyAttendanceBadge";
import { withCache, CACHE_TTL_MS } from "../lib/simpleCache";

const router: IRouter = Router();

/** الوصول: القائدة/النائبة تشوف كل شيء، مسؤولة المسار تشوف مسارها فقط. غير هذا ممنوع. */
function assertOverviewAccess(role?: string): boolean {
  return role === "leader" || role === "deputy" || role === "track_supervisor";
}

/** لو مسؤولة مسار، نبقي بس الصفوف اللي meta (اسم المسار) يطابق مسارها. القائدة/النائبة يشوفن كل شيء. */
function scopeToTrack<T extends OverviewEntry>(entries: T[], role: string, userTrack: string | null | undefined): T[] {
  if (role !== "track_supervisor") return entries;
  const mine = stripPrefix(userTrack ?? "");
  return entries.filter(e => e.meta && stripPrefix(e.meta) === mine);
}

router.get("/live-badges/overview/circle-weekly-moon", authenticate, async (req, res): Promise<void> => {
  if (!assertOverviewAccess(req.userRole)) { res.status(403).json({ error: "Forbidden" }); return; }
  const weekStart = typeof req.query.weekStart === "string" ? req.query.weekStart : undefined;
  const entries = await withCache(`overview:circle-weekly-moon:${weekStart ?? ""}`, CACHE_TTL_MS, () => overviewCircleWeeklyMoon(weekStart));
  res.json(scopeToTrack(entries, req.userRole!, req.userTrack));
});

router.get("/live-badges/overview/review-plan-completion", authenticate, async (req, res): Promise<void> => {
  if (!assertOverviewAccess(req.userRole)) { res.status(403).json({ error: "Forbidden" }); return; }
  const asOf = typeof req.query.asOf === "string" ? req.query.asOf : undefined;
  const entries = await withCache(`overview:review-plan-completion:${asOf ?? ""}`, CACHE_TTL_MS, () => overviewReviewPlanCompletion(asOf));
  res.json(scopeToTrack(entries, req.userRole!, req.userTrack));
});

router.get("/live-badges/overview/monthly-perfect", authenticate, async (req, res): Promise<void> => {
  if (!assertOverviewAccess(req.userRole)) { res.status(403).json({ error: "Forbidden" }); return; }
  // تفضّل فترة حرة (dateFrom/dateTo) لو موجودة — تسمح للقائدة تحدد أي فترة بنفسها،
  // مو بس شهر تقويمي لازم ينتهي أولًا. month لسا مدعوم للتوافق مع أي استخدام قديم.
  const dateFrom = typeof req.query.dateFrom === "string" ? req.query.dateFrom : undefined;
  const dateTo = typeof req.query.dateTo === "string" ? req.query.dateTo : undefined;
  const month = typeof req.query.month === "string" ? req.query.month : undefined;
  const entries = dateFrom && dateTo
    ? await withCache(`overview:monthly-perfect:${dateFrom}:${dateTo}`, CACHE_TTL_MS, () => overviewPerfectAttendanceInRange(dateFrom, dateTo))
    : await withCache(`overview:monthly-perfect:${month ?? ""}`, CACHE_TTL_MS, () => overviewMonthlyPerfect(month));
  res.json(scopeToTrack(entries, req.userRole!, req.userTrack));
});

/**
 * إرسال وسام "حضور الفترة الكاملة" فعليًا لكل المستحقات ضمن [dateFrom, dateTo] —
 * القائدة/النائبة فقط. يُنشئ رسالة تهنئة لكل طالبة مستحقة عبر جدول messages،
 * فورًا لحظة الضغط — بدون انتظار أي كرون.
 */
router.post("/live-badges/send/monthly-perfect", authenticate, async (req, res): Promise<void> => {
  if (req.userRole !== "leader" && req.userRole !== "deputy") { res.status(403).json({ error: "Forbidden" }); return; }
  const { dateFrom, dateTo } = req.body as { dateFrom?: string; dateTo?: string };
  if (!dateFrom || !dateTo || dateFrom > dateTo) {
    res.status(400).json({ error: "حددي فترة تاريخ صحيحة (تاريخ البداية قبل النهاية)" });
    return;
  }
  const result = await sendPerfectAttendanceBadges(dateFrom, dateTo, req.userId!);
  res.json(result);
});

router.get("/live-badges/overview/improvement", authenticate, async (req, res): Promise<void> => {
  if (!assertOverviewAccess(req.userRole)) { res.status(403).json({ error: "Forbidden" }); return; }
  const weekStart = typeof req.query.weekStart === "string" ? req.query.weekStart : undefined;
  const entries = await withCache(`overview:improvement:${weekStart ?? ""}`, CACHE_TTL_MS, () => overviewImprovement(weekStart));
  res.json(scopeToTrack(entries, req.userRole!, req.userTrack));
});

router.get("/live-badges/overview/track-no-shortcoming", authenticate, async (req, res): Promise<void> => {
  if (!assertOverviewAccess(req.userRole)) { res.status(403).json({ error: "Forbidden" }); return; }
  const weekStart = typeof req.query.weekStart === "string" ? req.query.weekStart : undefined;
  const entries = await withCache(`overview:track-no-shortcoming:${weekStart ?? ""}`, CACHE_TTL_MS, () => overviewTrackNoShortcoming(weekStart));
  // هنا الـ label نفسه اسم المسار (ما فيه meta منفصل) — نفلتر عليه مباشرة
  const scoped = req.userRole === "track_supervisor"
    ? entries.filter(e => stripPrefix(e.label) === stripPrefix(req.userTrack ?? ""))
    : entries;
  res.json(scoped);
});

router.get("/live-badges/overview/supervisor-weekly-commitment", authenticate, async (req, res): Promise<void> => {
  if (!assertOverviewAccess(req.userRole)) { res.status(403).json({ error: "Forbidden" }); return; }
  const weekStart = typeof req.query.weekStart === "string" ? req.query.weekStart : undefined;
  const entries = await withCache(`overview:supervisor-weekly-commitment:${weekStart ?? ""}`, CACHE_TTL_MS, () => overviewSupervisorWeeklyCommitment(weekStart));
  res.json(scopeToTrack(entries, req.userRole!, req.userTrack));
});

/**
 * كل الأقسام الستة دفعة وحدة — يقبل نفس معاملات الأقسام الفردية أعلاه.
 * تُستخدمها صفحة "مستحقات الأوسمة" بطلب واحد بدل ستة عند أول تحميل.
 */
router.get("/live-badges/overview/all", authenticate, async (req, res): Promise<void> => {
  ensureWeeklyMoonBadgeRan();
  if (!assertOverviewAccess(req.userRole)) { res.status(403).json({ error: "Forbidden" }); return; }
  const q = (k: string) => (typeof req.query[k] === "string" ? (req.query[k] as string) : undefined);
  const role = req.userRole!;

  const wk = q("weekStart") ?? "";
  const [circleWeeklyMoon, reviewPlanCompletion, monthlyPerfect, improvement, trackNoShortcomingRaw, supervisorWeeklyCommitment] = await Promise.all([
    withCache(`overview:circle-weekly-moon:${wk}`, CACHE_TTL_MS, () => overviewCircleWeeklyMoon(q("weekStart"))),
    withCache(`overview:review-plan-completion:${q("asOf") ?? ""}`, CACHE_TTL_MS, () => overviewReviewPlanCompletion(q("asOf"))),
    withCache(`overview:monthly-perfect:${q("month") ?? ""}`, CACHE_TTL_MS, () => overviewMonthlyPerfect(q("month"))),
    withCache(`overview:improvement:${wk}`, CACHE_TTL_MS, () => overviewImprovement(q("weekStart"))),
    withCache(`overview:track-no-shortcoming:${wk}`, CACHE_TTL_MS, () => overviewTrackNoShortcoming(q("weekStart"))),
    withCache(`overview:supervisor-weekly-commitment:${wk}`, CACHE_TTL_MS, () => overviewSupervisorWeeklyCommitment(q("weekStart"))),
  ]);

  const trackNoShortcoming = role === "track_supervisor"
    ? trackNoShortcomingRaw.filter(e => stripPrefix(e.label) === stripPrefix(req.userTrack ?? ""))
    : trackNoShortcomingRaw;

  res.json({
    circleWeeklyMoon: scopeToTrack(circleWeeklyMoon, role, req.userTrack),
    reviewPlanCompletion: scopeToTrack(reviewPlanCompletion, role, req.userTrack),
    monthlyPerfect: scopeToTrack(monthlyPerfect, role, req.userTrack),
    improvement: scopeToTrack(improvement, role, req.userTrack),
    trackNoShortcoming,
    supervisorWeeklyCommitment: scopeToTrack(supervisorWeeklyCommitment, role, req.userTrack),
  });
});

export default router;
