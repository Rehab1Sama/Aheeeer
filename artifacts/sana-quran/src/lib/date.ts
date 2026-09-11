/**
 * تاريخ "اليوم" بتوقيت مكة المكرمة مع بدء اليوم عند الساعة 5 صباحاً.
 *
 * مكة = UTC+3، واليوم يبدأ الساعة 5 صباحاً مكةً.
 * أي: ما قبل الساعة 5 صباحاً مكةً يُحسب ضمن اليوم السابق.
 */
export function getMakkahDay(): string {
  const meccaMs = Date.now() + 3 * 60 * 60 * 1000;
  const d = new Date(meccaMs);
  if (d.getUTCHours() < 5) d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
