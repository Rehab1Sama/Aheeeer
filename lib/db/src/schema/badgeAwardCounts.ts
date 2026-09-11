import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";

// عداد بسيط بس — "كم مرة" تكرر وسام معيّن لجهة معيّنة (حلقة/طالبة/مسار...).
// ما يخزّن تاريخ كامل، بس رقم + آخر فترة اتحسبت فيها (عشان ما نعد نفس الأسبوع مرتين).
// ملاحظة: القيد الفريد (entity_type, entity_id, badge_id) مُنشأ مباشرة بملف الـ
// migration (0009) كـ SQL خام، بدل التصريح عنه هنا بالـ schema — تفاديًا لأي
// فرق صياغة محتمل بين إصدارات drizzle-orm لطريقة تعريف extraConfig.
export const badgeAwardCountsTable = pgTable("badge_award_counts", {
  id: serial("id").primaryKey(),
  entityType: text("entity_type").notNull(), // "circle" | "student" | "track" | "track_supervisor"
  entityId: integer("entity_id").notNull(),
  badgeId: text("badge_id").notNull(), // يطابق id بـ badgeDefinitions.ts (مثلاً "circle_weekly_moon")
  tier: integer("tier").notNull().default(0),
  count: integer("count").notNull().default(0),
  lastPeriod: text("last_period").notNull(), // مثلاً تاريخ بداية الأسبوع أو الشهر (YYYY-MM أو YYYY-MM-DD)
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type BadgeAwardCount = typeof badgeAwardCountsTable.$inferSelect;
