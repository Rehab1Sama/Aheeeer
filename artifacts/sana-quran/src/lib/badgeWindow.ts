// الأوسمة في الصفحات الأمامية تظهر ٢٤ ساعة من منحها فقط، ثم تبقى في صفحة «أوسمتي/الأوسمة».
export const FRONT_BADGE_WINDOW_MS = 24 * 60 * 60 * 1000;

export function isFreshBadge(b: { awardedAt?: string | null; createdAt?: string | null; assignedAt?: string | null }, now = Date.now()): boolean {
  const t = b.awardedAt ?? b.assignedAt ?? b.createdAt;
  if (!t) return false;
  const ms = new Date(t).getTime();
  return Number.isFinite(ms) && now - ms < FRONT_BADGE_WINDOW_MS;
}
