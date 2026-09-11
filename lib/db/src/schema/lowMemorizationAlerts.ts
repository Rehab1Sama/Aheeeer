import { pgTable, text, serial, timestamp, integer, real, boolean } from "drizzle-orm/pg-core";

export const lowMemorizationAlertsTable = pgTable("low_memorization_alerts", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull(),
  studentName: text("student_name").notNull(),
  circleId: integer("circle_id").notNull(),
  circleName: text("circle_name").notNull(),
  track: text("track").notNull(),
  trackType: text("track_type").notNull().default("girls"),
  totalPages: real("total_pages").notNull().default(0),
  periodDays: integer("period_days").notNull().default(14),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type LowMemorizationAlert = typeof lowMemorizationAlertsTable.$inferSelect;
