// وسام إنهاء خطة المراجعة — مصدر واحد لصفحة الطالبة، ومستحقات الأوسمة، وإرسال الرسائل.
//
// خطط الحافظات (girls_review): بنفس حساب صفحة الخطط بالضبط (مقارنة النطاقات بالوجه، الترتيب العكسي
// بالسور، سماح وجه، المراجعة البعيدة ١ و٢، أيام لم تُدخل فيها المشرفة لا تُحسب على الطالبة):
//   - أنهت كل أيام الخطة، ولم يتراكم عليها تأخير في أي يوم ← «قمرتنا أنهت خطتها!» (الدرجة ٠)
//   - أنهت كل أيام الخطة لكن تأخرت في بعض الأيام ثم لحقت ← «ما بغيتِ بس وصلتِ» (الدرجة ١)
//   - لم تُنهِ الخطة ← بلا وسام
// خطط التثبيت (fixation): بلا نطاقات، فتبقى بمجموع الصفحات التراكمي كما كانت.
//
// أي خطة تُحسب: آخر خطة انتهت دورتها خلال ضعف مدتها — نشطة، أو أُغلقت بالتجديد التلقائي للدورة.
// (كانت تُحسب النشطة فقط، فإذا جُدّدت الخطة مع بداية الدورة الجديدة اختفى الوسام قبل أن تراه الطالبة.)
// الخطة الملغاة بطلب إلغاء لا تُحسب.
import { db, reviewPlansTable, reviewPlanDaysTable, recordsTable, globalSettingsTable } from "@workspace/db";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { getPlanCycleDates, getEffectiveEndDate, loadGirlsCoverage, PLAN_TOTAL_DAYS, type PlanType } from "../routes/reviewPlans";

export type ReviewCompletion = { studentId: number; planId: number; effectiveEndDate: string; tier: 0 | 1 };

export async function reviewCompletions(asOf: string, studentId?: number): Promise<ReviewCompletion[]> {
  const plans = (await db.select().from(reviewPlansTable).where(and(
    eq(reviewPlansTable.approvalStatus, "approved"),
    or(eq(reviewPlansTable.status, "active"), and(eq(reviewPlansTable.status, "cancelled"), isNull(reviewPlansTable.cancellationRequestedAt))),
    ...(studentId != null ? [eq(reviewPlansTable.studentId, studentId)] : []),
  ))).filter((p) => (p.planType === "girls_review" || p.planType === "fixation") && p.startDate);
  if (plans.length === 0) return [];

  // خطط أُلغي وسامها بقرار القائدة (مثل أوسمة ١٣ نوفمبر التي ظهرت خطأً بعد تحويل التثبيت إلى ٣٢ يومًا)
  const [sup] = await db.select({ v: globalSettingsTable.value }).from(globalSettingsTable).where(eq(globalSettingsTable.key, "suppressed_review_badge_plans"));
  let suppressed = new Set<number>();
  try { suppressed = new Set((JSON.parse(sup?.v ?? "[]") as number[]).map(Number)); } catch { /* */ }
  const plansAll = plans;
  plans.splice(0, plans.length, ...plansAll.filter((p) => !suppressed.has(p.id)));
  if (plans.length === 0) return [];

  // خطة واحدة لكل (طالبة، نوع، تاريخ بداية): الأحدث إنشاءً (الخطة المُستبدلة لا تُحسب)
  const latestPerStart = new Map<string, (typeof plans)[number]>();
  for (const p of plans) {
    const k = `${p.studentId}|${p.planType}|${p.startDate}`;
    const prev = latestPerStart.get(k);
    if (!prev || p.createdAt > prev.createdAt) latestPerStart.set(k, p);
  }

  // آخر خطة منتهية لكل طالبة، خلال ضعف مدة الدورة
  const finishedByStudent = new Map<number, { plan: (typeof plans)[number]; end: string }>();
  for (const p of latestPerStart.values()) {
    const end = await getEffectiveEndDate(p as { startDate: string; planType: string });
    if (!(asOf > end)) continue;
    const daysSinceEnd = Math.round((new Date(asOf).getTime() - new Date(end).getTime()) / 86400000);
    if (daysSinceEnd > PLAN_TOTAL_DAYS[p.planType as PlanType] * 2) continue;
    const prev = finishedByStudent.get(p.studentId);
    if (!prev || p.startDate! > prev.plan.startDate!) finishedByStudent.set(p.studentId, { plan: p, end });
  }
  if (finishedByStudent.size === 0) return [];

  const out: ReviewCompletion[] = [];
  const girls = [...finishedByStudent.values()].filter((x) => x.plan.planType === "girls_review").map((x) => x.plan);
  const coverage = girls.length ? await loadGirlsCoverage(girls, undefined, { withCompletion: true }) : new Map();
  for (const { plan, end } of finishedByStudent.values()) {
    if (plan.planType === "girls_review") {
      const c = coverage.get(plan.id)?.completion;
      if (c?.reached) out.push({ studentId: plan.studentId, planId: plan.id, effectiveEndDate: end, tier: c.onTime ? 0 : 1 });
      continue;
    }
    // التثبيت: مجموع الصفحات التراكمي
    // أيام الخطة نفسها (خطط ٢٤ يومًا القديمة تُحسب على ٢٤، لا على مدة التثبيت الحالية ٣٢)
    const dayRows = await db.select().from(reviewPlanDaysTable).where(eq(reviewPlanDaysTable.planId, plan.id));
    const ownLen = dayRows.length || PLAN_TOTAL_DAYS.fixation;
    const dates = getPlanCycleDates(plan.startDate!, "fixation").slice(0, ownLen).filter((d) => d <= end);
    if (dates.length === 0) continue;
    const [records] = await Promise.all([
      db.select().from(recordsTable).where(and(eq(recordsTable.studentId, plan.studentId), eq(recordsTable.circleId, plan.circleId), inArray(recordsTable.date, dates))),
    ]);
    const quota = new Map(dayRows.map((d) => [d.dayNumber, d.pages ?? 0]));
    const byDate = new Map(records.map((r) => [r.date, r]));
    let cumQuota = 0, cumDone = 0, everBehind = false;
    dates.forEach((d, i) => {
      cumQuota += quota.get(i + 1) ?? 0;
      const r = byDate.get(d);
      cumDone += r ? (r.reviewPages ?? r.reviewFarPages ?? 0) : 0;
      if (cumDone < cumQuota) everBehind = true;
    });
    if (cumDone >= cumQuota) out.push({ studentId: plan.studentId, planId: plan.id, effectiveEndDate: end, tier: everBehind ? 1 : 0 });
  }
  return out;
}
