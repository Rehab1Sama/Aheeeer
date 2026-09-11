import { pgTable, text, serial, timestamp, integer, real, boolean } from "drizzle-orm/pg-core";

export const planNotificationsTable = pgTable("plan_notifications", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull(),
  studentName: text("student_name").notNull(),
  circleId: integer("circle_id").notNull(),
  circleName: text("circle_name").notNull(),
  track: text("track").notNull(),
  type: text("type").notNull().default("plan_created"),
  cycleCount: integer("cycle_count").notNull().default(1),
  totalPages: real("total_pages").notNull().default(0),
  note: text("note"),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PlanNotification = typeof planNotificationsTable.$inferSelect;
