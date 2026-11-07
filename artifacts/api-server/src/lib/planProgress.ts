// منطق تقدّم الخطة (نقي — بلا قاعدة بيانات) المستخدم في حساب "متأخرة / في الوقت / متقدمة".
//
// لماذا هذا الملف؟
//  ١. خطط المراجعة المجدَّدة تلقائيًا تُخزَّن بأيام فيها عدد الصفحات فقط، بلا سورة/آية
//     (الواجهة تحسب النطاقات من لقطة الخطة وقت العرض). أما الخادم فكان يقرأ المواضع
//     المخزّنة فقط، فلا يجد هدفًا لأي يوم، فيُعدّ كل يوم له سجل "تأخيرًا" (٩٨٪ من
//     الخطط "متأخرة"). الحل: نفس حساب الواجهة على الخادم (withComputedTargets).
//  ٢. لو لم يُعرف محتوى الخطة أصلًا (لا لقطة ولا نطاق) نحسب التقدّم بالصفحات احتياطًا.
//  ٣. "اليوم الحالي" في أيام لا تدخل في الدورة (الجمعة للبنات؛ الخميس/الجمعة/السبت
//     للتثبيت) كان يُرجِع طول الدورة + ١ بدل اليوم الصحيح.

import { computeDayRanges, getPlanQuotaRanges } from "./quranRanges";

// ─── اليوم الحالي ─────────────────────────────────────────────────

/**
 * ترتيب اليوم ضمن الدورة (١..طولها):
 *  - اليوم من أيام الدورة            → ترتيبه
 *  - قبل بداية الدورة                → 0
 *  - بعد نهاية الدورة                → طولها + ١ (انتهت)
 *  - داخل الدورة لكنه ليس من أيامها → عدد أيام الدورة التي مضت (آخر يوم دوام)
 */
export function computeCurrentDay(cycleDates: readonly string[], today: string, totalDays: number): number {
  if (cycleDates.length === 0) return 0;
  const idx = cycleDates.indexOf(today);
  if (idx >= 0) return idx + 1;
  if (today < cycleDates[0]!) return 0;
  if (today > cycleDates[cycleDates.length - 1]!) return totalDays + 1;
  let elapsed = 0;
  for (const d of cycleDates) if (d <= today) elapsed++;
  return elapsed;
}

// ─── السبت ────────────────────────────────────────────────────────

/**
 * السبت من أيام دورة البنات لكنه بلا إدخال في المقرأة، فلا يُعدّ تقصيرًا ولا غيابًا
 * عن الإدخال أبدًا (كما تفعل الواجهة في computeDayStatuses). وتُعدّ حصته مغطّاة حين
 * تتجاوزها الطالبة في إدخال اليوم التالي، لأن هدف كل يوم تراكمي.
 */
export function isSaturdayDate(date: string): boolean {
  return new Date(date + "T12:00:00Z").getUTCDay() === 6;
}

// ─── أهداف الأيام ─────────────────────────────────────────────────

type PlanLike = Parameters<typeof getPlanQuotaRanges>[0];

export interface DayTargetLike {
  dayNumber: number;
  pages: number | null;
  surahStart?: string | null;
  surahEnd: string | null;
  ayahEnd: number | null;
}

export function hasStoredTargets(days: readonly DayTargetLike[]): boolean {
  return days.some((d) => !!d.surahEnd && d.ayahEnd != null);
}

/**
 * أهداف حدّدتها الطالبة نفسها (نطاق كل يوم: بداية ونهاية) — هي وحدها تُقاس مواضعيًا.
 * الأهداف المحسوبة من لقطة الخطة (نهاية فقط) لا تُعتمد للحكم: اختبار على خطط حقيقية أثبت أنها
 * لا تطابق ما تراجعه الطالبة فعلًا فتُظهر متقدمات ومتأخرات خطأً. فما عداها يُقاس بالصفحات.
 */
export function hasStudentTargets(days: readonly DayTargetLike[]): boolean {
  return days.some((d) => !!d.surahStart && !!d.surahEnd && d.ayahEnd != null);
}

/** هدف كل يوم = آخر سورة/آية يصلها نصيبه في ترتيب محتوى الخطة (نفس ما تعرضه الواجهة). */
export function computeTargetEnds(plan: PlanLike, days: readonly DayTargetLike[]): Array<{ surahEnd: string; ayahEnd: number } | null> {
  const ranges = getPlanQuotaRanges(plan);
  if (ranges.length === 0) return days.map(() => null);
  const segs = computeDayRanges(ranges, [...days]);
  return days.map((_, i) => {
    const s = segs[i];
    const last = s && s.length > 0 ? s[s.length - 1] : undefined;
    return last ? { surahEnd: last.surahEnd, ayahEnd: last.ayahEnd } : null;
  });
}

/**
 * يُكمل أيام الخطة بأهدافها المحسوبة إن لم تكن مخزّنة. الأيام المخزّنة لا تُمَسّ.
 * تُرجع نسخة مرتبة بالأيام؛ ولا تغيّر الصفوف الأصلية.
 */
export function withComputedTargets<T extends DayTargetLike>(plan: PlanLike, days: readonly T[]): T[] {
  const sorted = [...days].sort((a, b) => a.dayNumber - b.dayNumber);
  if (hasStoredTargets(sorted)) return sorted;
  const ends = computeTargetEnds(plan, sorted);
  return sorted.map((d, i) => (ends[i] ? { ...d, surahEnd: ends[i]!.surahEnd, ayahEnd: ends[i]!.ayahEnd } : d));
}

/**
 * عدد أيام الخطة (حتى اليوم الحالي) التي لها نصيب بالصفحات لكن بلا هدف موضعي.
 * الأهداف المحسوبة من لقطة الخطة قد لا تغطي كل صفحاتها (جزء من المحتوى بلا مواضع
 * مسجّلة)؛ حينها تنتهي «قائمة المحتوى» مبكرًا وتتجمّد الأهداف عند آخر موضع، فيُحكم
 * على الطالبة بمقارنة غير عادلة. إذا كان هذا العدد > ٠ فلا نعتمد المواضع ونستعمل الصفحات.
 */
export function uncoveredDaysThrough(days: readonly DayTargetLike[], currentDay: number): number {
  let n = 0;
  for (const d of days) {
    if (d.dayNumber > currentDay) continue;
    if ((d.pages ?? 0) > 0 && !(d.surahEnd && d.ayahEnd != null)) n++;
  }
  return n;
}

// ─── النصاب هو الأساس (لا يُضاف المحفوظ المعتمد) ─────────────────

/**
 * القرار: خطة الطالبة الأولى (نصابها) هي أساس الخطة. التجديد يضيف إليها ما استجد من حفظ
 * يومي مسجّل فقط، ولا يُضاف المحفوظ المعتمد/اليدوي فوقها؛ فيبقى إجمالي الخطة = نصابها +
 * الحفظ المستجد، لا نصابها + المحفوظ المعتمد (عدّ مزدوج كان يضخّم الإجمالي ٤٧ صفحة في المتوسط).
 */
export function stripApprovedMemorization<
  T extends { approvedMemorizationCount: number; approvedMemorizationPages: number; manualApprovedPages: number; approvedJuzNumbers: number[] },
>(snapshot: T): T {
  return { ...snapshot, approvedMemorizationCount: 0, approvedMemorizationPages: 0, manualApprovedPages: 0, approvedJuzNumbers: [] };
}

// ─── ترحيل محتوى الخطة الأولى عند أول تجديد ───────────────────────

export interface SnapshotRangeLike {
  surahStart: string;
  ayahStart: number;
  surahEnd: string;
  ayahEnd: number;
}

/**
 * الخطة التي أنشأتها الطالبة بنفسها (بلا لقطة) تحمل محتواها في حقول النصاب (أجزاء/سورة
 * + نطاقات إضافية) أو في نطاقات أيامها. التجديد كان يُسقط هذا المحتوى ويحوّله إلى رقم
 * صفحات معتم، فتضيع أهدافها. هذه الدالة تستخرج محتواها مرتّبًا ليُحمل داخل لقطة
 * الدورة الجديدة، فتبقى الأهداف نفسها (وترتيب مراجعتها) في كل التجديدات التالية.
 * الأولوية: حقول النصاب (كما تعرضها الواجهة)، ثم نطاقات الأيام.
 */
export function seedRangesFromOldPlan(
  oldPlan: PlanLike,
  oldDays: ReadonlyArray<{ surahStart: string | null; ayahStart: number | null; surahEnd: string | null; ayahEnd: number | null; pages: number | null }>,
): SnapshotRangeLike[] {
  const quota = getPlanQuotaRanges({ ...oldPlan, reviewSourceSnapshot: null });
  if (quota.length > 0) {
    return quota.map((r) => ({ surahStart: r.surahStart, ayahStart: r.ayahStart, surahEnd: r.surahEnd, ayahEnd: r.ayahEnd }));
  }
  const out: SnapshotRangeLike[] = [];
  for (const d of oldDays) {
    if (d.surahStart && d.surahEnd && d.ayahStart != null && d.ayahEnd != null && (d.pages ?? 0) > 0) {
      out.push({ surahStart: d.surahStart, ayahStart: d.ayahStart, surahEnd: d.surahEnd, ayahEnd: d.ayahEnd });
    }
  }
  return out;
}

// ─── التقدّم بالصفحات (احتياطي حين لا هدف موضعيًا) ────────────────

// وجه كامل: الإدخال يحسب أنصاف الصفحات الكاملة فقط فيتراكم نقص التقريب يوميًا.
export const PAGES_TOLERANCE = 1;

/** آخر يوم تكفي صفحات الطالبة المنجزة (تراكميًا) لتغطية نصيبه التراكمي. */
export function pagesDaysReached(
  days: readonly Pick<DayTargetLike, "dayNumber" | "pages">[],
  currentDay: number,
  donePages: number,
): { daysReached: number; plannedThroughToday: number } {
  const sorted = [...days].sort((a, b) => a.dayNumber - b.dayNumber);
  let cum = 0;
  let reached = 0;
  for (const d of sorted) {
    if (d.dayNumber > currentDay) break;
    cum += d.pages ?? 0;
    if (donePages + PAGES_TOLERANCE >= cum) reached = d.dayNumber;
  }
  return { daysReached: reached, plannedThroughToday: cum };
}

/** تراكمي النصيب المخطط حتى نهاية يوم معيّن. */
export function plannedPagesThrough(days: readonly Pick<DayTargetLike, "dayNumber" | "pages">[], dayNumber: number): number {
  let cum = 0;
  for (const d of days) if (d.dayNumber <= dayNumber) cum += d.pages ?? 0;
  return cum;
}
