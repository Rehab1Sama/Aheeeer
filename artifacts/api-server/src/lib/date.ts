/**
 * تاريخ "اليوم" بتوقيت مكة المكرمة مع بدء اليوم عند الساعة 5 صباحاً.
 *
 * مكة = UTC+3، واليوم يبدأ الساعة 5 صباحاً مكةً.
 * أي: ما قبل الساعة 5 صباحاً مكةً يُحسب ضمن اليوم السابق.
 */
export function getMakkahDay(): string {
  const meccaMs = Date.now() + 3 * 60 * 60 * 1000; // UTC+3
  const d = new Date(meccaMs);
  if (d.getUTCHours() < 5) d.setUTCDate(d.getUTCDate() - 1); // قبل 5 صباحاً = ما زلنا في الأمس
  return d.toISOString().slice(0, 10);
}

/**
 * تاريخ من X أيام مضت بتوقيت مكة (مع نفس منطق 5 صباحاً).
 */
export function getMakkahDaysAgo(days: number): string {
  const meccaMs = Date.now() + 3 * 60 * 60 * 1000;
  const d = new Date(meccaMs);
  if (d.getUTCHours() < 5) d.setUTCDate(d.getUTCDate() - 1);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/** بداية الأسبوع الحالي (الأحد) بتوقيت مكة */
export function getMakkahWeekStart(): string {
  const meccaMs = Date.now() + 3 * 60 * 60 * 1000;
  const d = new Date(meccaMs);
  if (d.getUTCHours() < 5) d.setUTCDate(d.getUTCDate() - 1);
  d.setUTCDate(d.getUTCDate() - d.getUTCDay()); // الأحد = 0
  return d.toISOString().slice(0, 10);
}

/** بداية الأسبوع الماضي (الأحد السابق) بتوقيت مكة */
export function getMakkahLastWeekStart(): string {
  const meccaMs = Date.now() + 3 * 60 * 60 * 1000;
  const d = new Date(meccaMs);
  if (d.getUTCHours() < 5) d.setUTCDate(d.getUTCDate() - 1);
  d.setUTCDate(d.getUTCDate() - d.getUTCDay() - 7);
  return d.toISOString().slice(0, 10);
}

/** نهاية الأسبوع الماضي (السبت) بتوقيت مكة */
export function getMakkahLastWeekEnd(): string {
  const meccaMs = Date.now() + 3 * 60 * 60 * 1000;
  const d = new Date(meccaMs);
  if (d.getUTCHours() < 5) d.setUTCDate(d.getUTCDate() - 1);
  d.setUTCDate(d.getUTCDate() - d.getUTCDay() - 1);
  return d.toISOString().slice(0, 10);
}

/** يضيف/يطرح n يوم من تاريخ YYYY-MM-DD ويرجّع YYYY-MM-DD */
export function addDaysStr(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** يرجّع تاريخ الأحد من نفس الأسبوع اللي فيه dateStr */
export function normalizeToSunday(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() - d.getUTCDay()); // الأحد = 0
  return d.toISOString().slice(0, 10);
}

/**
 * بداية آخر أسبوع عمل مكتمل (الأحد-الخميس) بتوقيت مكة.
 * أسبوع العمل عندنا الأحد للخميس؛ لو اليوم جمعة أو سبت فالأسبوع الحالي خلص فعليًا،
 * وإلا فآخر أسبوع مكتمل هو اللي قبل هذا الأسبوع.
 */
export function getLastCompletedWeekStart(): string {
  const today = getMakkahDay();
  const sunday = normalizeToSunday(today);
  const dow = new Date(today + "T12:00:00Z").getUTCDay(); // الجمعة=5، السبت=6
  return dow >= 5 ? sunday : addDaysStr(sunday, -7);
}

/**
 * عدد الدقائق بين بداية "يوم العمل" businessDate (الساعة ٥ صباحًا مكةً لنفس
 * التاريخ) ولحظة زمنية معيّنة `at`. تُستخدم لتحويل أوقات دخول متأخرة (بعد
 * منتصف الليل، وبالتالي "اليوم التالي" تقويميًا لكنها لسا ضمن يوم العمل نفسه)
 * إلى قيمة رقمية قابلة للمقارنة والمتوسط، بدل التعامل معاها كأنها يوم جديد.
 *
 * مثال: لو businessDate = "2026-09-10" و`at` = الساعة ١:٠٠ فجرًا بتوقيت مكة
 * (تقويميًا ١١ سبتمبر)، فالنتيجة = ٢٠ ساعة = ١٢٠٠ دقيقة (٥ص + ٢٠س = ١ص لليوم التالي).
 */
export function minutesSinceMakkahDayStart(businessDate: string, at: Date): number {
  const atMeccaMs = at.getTime() + 3 * 60 * 60 * 1000; // UTC+3
  const [y, m, d] = businessDate.split("-").map(Number);
  const dayStartMeccaMs = Date.UTC(y, m - 1, d, 5, 0, 0); // ٥ صباحًا مكةً لنفس تاريخ يوم العمل
  return (atMeccaMs - dayStartMeccaMs) / 60000;
}

/** الساعة ١ فجرًا (اليوم التقويمي التالي) كدقائق منذ بداية يوم العمل (٥ص + ٢٠س). */
export const ONE_AM_MINUTES_SINCE_DAY_START = 20 * 60;

