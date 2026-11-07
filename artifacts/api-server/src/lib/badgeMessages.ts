// رسائل الأوسمة تُعرض ٢٤ ساعة فقط ثم تختفي من كل الشاشات (قرار الإدارة).
export const BADGE_MESSAGE_TTL_MS = 24 * 60 * 60 * 1000;

export function badgeMessageExpiry(from: Date = new Date()): Date {
  return new Date(from.getTime() + BADGE_MESSAGE_TTL_MS);
}
