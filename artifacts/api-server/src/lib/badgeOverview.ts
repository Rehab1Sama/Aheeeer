// ============================================================================
// نظرة عامة على "المستحقات" لكل وسام — ملف جديد مستقل.
// ============================================================================
// كل دالة هنا تُرجع قائمة *بكل* الجهات المستحقة لوسام معيّن ضمن فلتر تاريخ
// (أسبوع / شهر / تاريخ مرجعي)، بدل جهة واحدة فقط كما بـ badgeEngine.ts.
// تُستخدم بصفحة "مستحقات الأوسمة" (badge-entitlements.tsx) وراوت
// liveBadgesOverview.ts. لا تكتب أي شيء بقاعدة البيانات (لحظي بالكامل تمامًا
// مثل badgeEngine.ts)، ولا تُعدّل أي دالة موجودة هناك — فقط تُعيد استخدامها.
//
// ملاحظة: دالة إنهاء خطة المراجعة معاد كتابتها هنا (بدل استدعاء النسخة
// الفردية بـ badgeEngine.ts) عشان تقبل تاريخ مرجعي (asOf) قابل للتغيير من
// الفلتر، بينما النسخة الأصلية تستخدم تاريخ اليوم فقط. باقي الدوال هنا كلها
// تنادي دوال badgeEngine.ts الأصلية بدون أي تغيير على منطقها.
// ============================================================================

import {
  db,
  circlesTable,
  studentsTable,
  trackSupervisorNamesTable,
  tracksTable,
  reviewPlansTable,
  reviewPlanDaysTable,
  recordsTable,
} from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { getLastCompletedWeekStart, getMakkahDay } from "./date";
import { getPlanCycleDates, getEffectiveEndDate, PLAN_TOTAL_DAYS, type PlanType } from "../routes/reviewPlans";
import { getBadgeTier } from "./badgeDefinitions";
import {
  computeAllCirclesWeeklyMoonBadges,
  computeStudentMonthlyPerfectAttendance,
  computeStudentPerfectAttendanceInRange,
  computeStudentImprovement,
  computeTrackNoShortcoming,
  computeSupervisorWeeklyCommitment,
  type EarnedBadge,
} from "./badgeEngine";

export interface OverviewEntry {
  key: string;      // معرف فريد للصف (id الجهة أو اسم المسار)
  label: string;    // الاسم المعروض (اسم الحلقة/الطالبة/المسار/مسؤولة المسار)
  meta?: string;    // سياق إضافي (اسم الحلقة للطالبة، اسم المسار للحلقة/المسؤولة..)
  badge: EarnedBadge;
}

/** يُطابق نفس المنطق المستخدم بـ liveBadges.ts لمقارنة أسماء المسارات بادئة "مسار " */
export const stripPrefix = (s: string) => s.replace(/^مسار\s+/, "").trim();

// ── ١. أقمر الحلقة الأسبوعي — كل الحلقات النشطة ───────────────────────────
export async function overviewCircleWeeklyMoon(weekStart: string = getLastCompletedWeekStart()): Promise<OverviewEntry[]> {
  const badgeMap = await computeAllCirclesWeeklyMoonBadges(weekStart);
  if (badgeMap.size === 0) return [];

  const circles = await db.select({ id: circlesTable.id, name: circlesTable.name, track: circlesTable.track })
    .from(circlesTable).where(inArray(circlesTable.id, [...badgeMap.keys()]));

  return circles
    .map(c => ({ key: String(c.id), label: c.name, meta: c.track, badge: badgeMap.get(c.id)! }))
    .sort((a, b) => a.badge.tier - b.badge.tier || a.label.localeCompare(b.label, "ar"));
}

// ── ٢. إنهاء خطة المراجعة — كل الطالبات، حتى تاريخ مرجعي (asOf) ───────────
export async function overviewReviewPlanCompletion(asOf: string = getMakkahDay()): Promise<OverviewEntry[]> {
  const plans = await db.select().from(reviewPlansTable).where(eq(reviewPlansTable.approvalStatus, "approved"));
  const relevant = plans.filter(p => p.planType === "girls_review" || p.planType === "fixation");
  if (relevant.length === 0) return [];

  const withEnd = await Promise.all(relevant.map(async p => ({ plan: p, effectiveEndDate: await getEffectiveEndDate(p) })));
  const finished = withEnd.filter(({ effectiveEndDate }) => asOf > effectiveEndDate);

  // نأخذ آخر دورة منتهية لكل طالبة فقط — نفس منطق النسخة الفردية بـ badgeEngine.ts
  const latestByStudent = new Map<number, { plan: typeof relevant[number]; effectiveEndDate: string }>();
  for (const item of finished) {
    const existing = latestByStudent.get(item.plan.studentId);
    if (!existing || item.plan.startDate > existing.plan.startDate) latestByStudent.set(item.plan.studentId, item);
  }

  const entries: { studentId: number; effectiveEndDate: string; badge: EarnedBadge }[] = [];
  for (const [studentId, { plan, effectiveEndDate }] of latestByStudent) {
    const planType = plan.planType as PlanType;
    const daysSinceEnd = Math.round((new Date(asOf).getTime() - new Date(effectiveEndDate).getTime()) / 86400000);
    if (daysSinceEnd > PLAN_TOTAL_DAYS[planType] * 2) continue; // دورة قديمة جدًا — تجاهليها

    const dates = getPlanCycleDates(plan.startDate, planType).filter(d => d <= effectiveEndDate);
    if (dates.length === 0) continue;

    const [dayRows, records] = await Promise.all([
      db.select().from(reviewPlanDaysTable).where(eq(reviewPlanDaysTable.planId, plan.id)),
      db.select().from(recordsTable).where(and(
        eq(recordsTable.studentId, studentId), eq(recordsTable.circleId, plan.circleId), inArray(recordsTable.date, dates),
      )),
    ]);
    const quotaByDayNumber = new Map(dayRows.map(d => [d.dayNumber, d.pages ?? 0]));
    const recordByDate = new Map(records.map(r => [r.date, r]));

    let cumQuota = 0, cumDone = 0, everBehind = false;
    dates.forEach((d, i) => {
      cumQuota += quotaByDayNumber.get(i + 1) ?? 0;
      const rec = recordByDate.get(d);
      const done = rec ? (planType === "fixation" ? (rec.reviewPages ?? rec.reviewFarPages) : rec.reviewFarPages) ?? 0 : 0;
      cumDone += done;
      if (cumDone < cumQuota) everBehind = true;
    });

    const tier = !everBehind ? 0 : (cumDone >= cumQuota ? 1 : 2);
    const tierDef = getBadgeTier("review_plan_completion", tier);
    if (!tierDef) continue;
    entries.push({
      studentId, effectiveEndDate,
      badge: { badgeId: "review_plan_completion", tier: tierDef.tier, name: tierDef.name, subtitle: tierDef.subtitle, emoji: tierDef.emoji, image: tierDef.image ?? null, color: tierDef.color },
    });
  }
  if (entries.length === 0) return [];

  // إلحاق أسماء الطالبات والحلقات
  const studentIds = entries.map(e => e.studentId);
  const students = await db.select({ id: studentsTable.id, fullName: studentsTable.fullName, circleId: studentsTable.circleId })
    .from(studentsTable).where(inArray(studentsTable.id, studentIds));
  const studentById = new Map(students.map(s => [s.id, s]));
  const circleIds = [...new Set(students.map(s => s.circleId).filter((x): x is number => x != null))];
  const circles = circleIds.length ? await db.select({ id: circlesTable.id, name: circlesTable.name }).from(circlesTable).where(inArray(circlesTable.id, circleIds)) : [];
  const circleNameById = new Map(circles.map(c => [c.id, c.name]));

  return entries
    .map(e => {
      const s = studentById.get(e.studentId);
      return {
        key: String(e.studentId),
        label: s?.fullName ?? `#${e.studentId}`,
        meta: s?.circleId ? circleNameById.get(s.circleId) : undefined,
        badge: e.badge,
      };
    })
    .sort((a, b) => a.badge.tier - b.badge.tier || a.label.localeCompare(b.label, "ar"));
}

// ── ٣. حضور الشهر الكامل — كل الطالبات النشيطات ───────────────────────────
export async function overviewMonthlyPerfect(month: string = getMakkahDay().slice(0, 7)): Promise<OverviewEntry[]> {
  const students = await db.select({ id: studentsTable.id, fullName: studentsTable.fullName, circleId: studentsTable.circleId })
    .from(studentsTable).where(eq(studentsTable.isArchived, false));
  if (students.length === 0) return [];

  const results = await Promise.all(students.map(async s => ({ s, badge: await computeStudentMonthlyPerfectAttendance(s.id, month) })));
  const qualifying = results.filter((r): r is { s: typeof students[number]; badge: EarnedBadge } => r.badge !== null);
  if (qualifying.length === 0) return [];

  const circleIds = [...new Set(qualifying.map(r => r.s.circleId).filter((x): x is number => x != null))];
  const circles = circleIds.length ? await db.select({ id: circlesTable.id, name: circlesTable.name }).from(circlesTable).where(inArray(circlesTable.id, circleIds)) : [];
  const circleNameById = new Map(circles.map(c => [c.id, c.name]));

  return qualifying
    .map(({ s, badge }) => ({ key: String(s.id), label: s.fullName, meta: s.circleId ? circleNameById.get(s.circleId) : undefined, badge }))
    .sort((a, b) => a.label.localeCompare(b.label, "ar"));
}

// ── ٣ب. حضور فترة كاملة بلا غياب — نطاق تاريخ حر (dateFrom/dateTo) تحدده القائدة ──
// نفس منطق overviewMonthlyPerfect أعلاه بالضبط، بس تقبل فترة حرة بدل شهر
// تقويمي ثابت — تُستخدم بزر "إرسال الوسام الآن" بصفحة مستحقات الأوسمة.
export async function overviewPerfectAttendanceInRange(dateFrom: string, dateTo: string): Promise<OverviewEntry[]> {
  const students = await db.select({ id: studentsTable.id, fullName: studentsTable.fullName, circleId: studentsTable.circleId })
    .from(studentsTable).where(eq(studentsTable.isArchived, false));
  if (students.length === 0) return [];

  const results = await Promise.all(students.map(async s => ({ s, badge: await computeStudentPerfectAttendanceInRange(s.id, dateFrom, dateTo) })));
  const qualifying = results.filter((r): r is { s: typeof students[number]; badge: EarnedBadge } => r.badge !== null);
  if (qualifying.length === 0) return [];

  const circleIds = [...new Set(qualifying.map(r => r.s.circleId).filter((x): x is number => x != null))];
  const circles = circleIds.length ? await db.select({ id: circlesTable.id, name: circlesTable.name }).from(circlesTable).where(inArray(circlesTable.id, circleIds)) : [];
  const circleNameById = new Map(circles.map(c => [c.id, c.name]));

  return qualifying
    .map(({ s, badge }) => ({ key: String(s.id), label: s.fullName, meta: s.circleId ? circleNameById.get(s.circleId) : undefined, badge }))
    .sort((a, b) => a.label.localeCompare(b.label, "ar"));
}

// ── ٤. التطور — كل الطالبات النشيطات ──────────────────────────────────────
export async function overviewImprovement(weekStart: string = getLastCompletedWeekStart()): Promise<OverviewEntry[]> {
  const students = await db.select({ id: studentsTable.id, fullName: studentsTable.fullName, circleId: studentsTable.circleId })
    .from(studentsTable).where(eq(studentsTable.isArchived, false));
  if (students.length === 0) return [];

  const results = await Promise.all(students.map(async s => ({ s, badge: await computeStudentImprovement(s.id, weekStart) })));
  const qualifying = results.filter((r): r is { s: typeof students[number]; badge: EarnedBadge } => r.badge !== null);
  if (qualifying.length === 0) return [];

  const circleIds = [...new Set(qualifying.map(r => r.s.circleId).filter((x): x is number => x != null))];
  const circles = circleIds.length ? await db.select({ id: circlesTable.id, name: circlesTable.name }).from(circlesTable).where(inArray(circlesTable.id, circleIds)) : [];
  const circleNameById = new Map(circles.map(c => [c.id, c.name]));

  return qualifying
    .map(({ s, badge }) => ({ key: String(s.id), label: s.fullName, meta: s.circleId ? circleNameById.get(s.circleId) : undefined, badge }))
    .sort((a, b) => a.label.localeCompare(b.label, "ar"));
}

// ── ٥. مسارنا الأحب — كل المسارات ─────────────────────────────────────────
export async function overviewTrackNoShortcoming(weekStart: string = getLastCompletedWeekStart()): Promise<OverviewEntry[]> {
  const circles = await db.select({ track: circlesTable.track }).from(circlesTable).where(eq(circlesTable.isArchived, false));
  const trackNames = [...new Set(circles.map(c => c.track))];
  if (trackNames.length === 0) return [];

  const results = await Promise.all(trackNames.map(async t => ({ t, badge: await computeTrackNoShortcoming(t, weekStart) })));
  return results
    .filter((r): r is { t: string; badge: EarnedBadge } => r.badge !== null)
    .map(({ t, badge }) => ({ key: t, label: t, badge }))
    .sort((a, b) => a.label.localeCompare(b.label, "ar"));
}

// ── ٦. فخر الأسبوع (مسؤولة المسار) — كل مسؤولات المسار ────────────────────
export async function overviewSupervisorWeeklyCommitment(weekStart: string = getLastCompletedWeekStart()): Promise<OverviewEntry[]> {
  const names = await db.select({ id: trackSupervisorNamesTable.id, name: trackSupervisorNamesTable.name, trackId: trackSupervisorNamesTable.trackId })
    .from(trackSupervisorNamesTable);
  if (names.length === 0) return [];

  const tracks = await db.select({ id: tracksTable.id, name: tracksTable.name }).from(tracksTable);
  const trackNameById = new Map(tracks.map(t => [t.id, t.name]));

  const results = await Promise.all(names.map(async n => ({ n, badge: await computeSupervisorWeeklyCommitment(n.id, weekStart) })));
  return results
    .filter((r): r is { n: typeof names[number]; badge: EarnedBadge } => r.badge !== null)
    .map(({ n, badge }) => ({ key: String(n.id), label: n.name, meta: trackNameById.get(n.trackId), badge }))
    .sort((a, b) => a.label.localeCompare(b.label, "ar"));
}
