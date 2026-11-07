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

import { computeDayRanges, getPlanQuotaRanges, getWajhIndex, MUSHAF_PAGES, wajhIndexToRange, type DayQuotaRange } from "./quranRanges";

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

// ─── التقدّم بالنطاق الدقيق (سورة/آية ← وجه) ──────────────────────
// قرار الإدارة: تُقارَن نطاقات المراجعة البعيدة المُدخلة بنطاقات الخطة نفسها (خطة الطالبة
// وخطة الإدارة بلا فرق، إنشاءً وتجديدًا). كل وجه (نصف صفحة) في الخطة إمّا مغطّى بما أُدخل أو لا.
// وإن بدأت الطالبة من آخر النطاق فالخطة تُحسب عكسية (لا «متقدمة»).

// السماح بنقص وجه واحد (نصف صفحة) لأن أيام الخطة تنتهي أحيانًا بآيات قليلة داخل وجه جديد.
export const WAJH_TOLERANCE = 1;

export interface WajhRangeLike { surahStart: string; ayahStart: number; surahEnd: string; ayahEnd: number }

/** الأوجه (فهارس) التي يغطيها نطاق، أو null لو السورة مجهولة. */
export function wajhIntervalOf(r: WajhRangeLike): [number, number] | null {
  const a = getWajhIndex(r.surahStart, r.ayahStart);
  const b = getWajhIndex(r.surahEnd, r.ayahEnd);
  if (a < 0 || b < 0) return null;
  return a <= b ? [a, b] : [b, a];
}

/** أوجه الخطة بترتيب نطاقاتها (كما يوزّعها computeDayRanges على الأيام). */
export function orderedPlanWajhs(ranges: readonly WajhRangeLike[]): number[] {
  const out: number[] = [];
  for (const r of ranges) {
    const iv = wajhIntervalOf(r);
    if (!iv) continue;
    for (let i = iv[0]; i <= iv[1]; i++) out.push(i);
  }
  return out;
}

/**
 * ترتيب الخطة العكسي: السور تُعكس (آخر سورة في الخطة أولًا) لكن كل سورة تبقى من أول آياتها صعودًا.
 * الطالبة لا تختار الاتجاه؛ يُستنتج من نطاق المراجعة البعيدة المُدخل.
 */
export function surahReversedWajhs(planWajhs: readonly number[]): number[] {
  const runs: number[][] = [];
  let lastSurah = -1;
  for (const w of planWajhs) {
    const surah = MUSHAF_PAGES[w]?.[0] ?? -1;
    if (runs.length === 0 || surah !== lastSurah) runs.push([]);
    runs[runs.length - 1]!.push(w);
    lastSurah = surah;
  }
  return runs.reverse().flat();
}

/** نطاقات (بداية/نهاية) تُقابل أوجهًا مرتّبة، لتغذية computeDayRanges بترتيب الخطة العكسي. */
export function wajhsToQuotaRanges(wajhs: readonly number[]): DayQuotaRange[] {
  const out: DayQuotaRange[] = [];
  let i = 0;
  while (i < wajhs.length) {
    let j = i;
    while (j + 1 < wajhs.length && wajhs[j + 1] === wajhs[j]! + 1) j++;
    const a = wajhIndexToRange(wajhs[i]!);
    const b = wajhIndexToRange(wajhs[j]!);
    if (a && b) out.push({ surahStart: a.surahStart, ayahStart: a.ayahStart, surahEnd: b.surahEnd, ayahEnd: b.ayahEnd });
    i = j + 1;
  }
  return out;
}

/** مجموعة الأوجه المغطّاة بنطاقات مُدخلة. */
export function coveredWajhSet(ranges: readonly WajhRangeLike[]): Set<number> {
  const set = new Set<number>();
  for (const r of ranges) {
    const iv = wajhIntervalOf(r);
    if (!iv) continue;
    for (let i = iv[0]; i <= iv[1]; i++) set.add(i);
  }
  return set;
}

/** أيام الخطة التي غُطّيت أوجهها كاملة بما أُدخل (بترتيب نطاق الخطة الأصلي، مهما كان ترتيب مراجعة الطالبة). */
export function coveredDayNumbers(
  planWajhs: readonly number[],
  days: readonly Pick<DayTargetLike, "dayNumber" | "pages">[],
  covered: ReadonlySet<number>,
): number[] {
  const sorted = [...days].sort((a, b) => a.dayNumber - b.dayNumber);
  const out: number[] = [];
  let pos = 0;
  for (const d of sorted) {
    const cnt = d.pages && d.pages > 0 ? Math.round(d.pages * 2) : 0;
    if (cnt === 0 || pos >= planWajhs.length) continue;
    const slice = planWajhs.slice(pos, pos + cnt);
    pos += cnt;
    if (slice.length > 0 && slice.every((w) => covered.has(w))) out.push(d.dayNumber);
  }
  return out;
}

export function coverageProgress(
  planWajhs: readonly number[],
  days: readonly Pick<DayTargetLike, "dayNumber" | "pages">[],
  currentDay: number,
  covered: ReadonlySet<number>,
): { daysReached: number; prefix: number; plannedWajhsToday: number; direction: "asc" | "desc"; ordered: number[] } {
  const prefixOf = (list: readonly number[]) => { let n = 0; while (n < list.length && covered.has(list[n]!)) n++; return n; };
  const fwd = prefixOf(planWajhs);
  const reversedList = surahReversedWajhs(planWajhs);
  const rev = prefixOf(reversedList);
  const direction: "asc" | "desc" = rev > fwd ? "desc" : "asc";
  const prefix = Math.max(fwd, rev);
  const sorted = [...days].sort((a, b) => a.dayNumber - b.dayNumber);
  let cum = 0;
  let daysReached = 0;
  for (const d of sorted) {
    if (d.dayNumber > currentDay) break;
    cum += d.pages && d.pages > 0 ? Math.round(d.pages * 2) : 0;
    if (prefix + WAJH_TOLERANCE >= Math.min(cum, planWajhs.length)) daysReached = d.dayNumber;
  }
  return { daysReached, prefix, plannedWajhsToday: Math.min(cum, planWajhs.length), direction, ordered: direction === "desc" ? reversedList : [...planWajhs] };
}

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
