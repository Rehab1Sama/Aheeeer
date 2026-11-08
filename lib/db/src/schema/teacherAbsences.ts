import { pgTable, text, serial, timestamp, integer, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const teacherAbsencesTable = pgTable("teacher_absences", {
  id: serial("id").primaryKey(),
  circleId: integer("circle_id").notNull(),
  date: text("date").notNull(),
  reportedById: integer("reported_by_id").notNull(),
  // المعلمة الفعلية يوم الغياب (يُحسب الغياب عليها هي، لا على الحلقة)
  teacherId: integer("teacher_id"),
  // entry = إدخال الأنصبة، tasks = مهام مسؤولة المسار اليومية
  source: text("source").notNull().default("entry"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [unique().on(t.circleId, t.date)]);

export const insertTeacherAbsenceSchema = createInsertSchema(teacherAbsencesTable).omit({ id: true, createdAt: true });
export type InsertTeacherAbsence = z.infer<typeof insertTeacherAbsenceSchema>;
export type TeacherAbsence = typeof teacherAbsencesTable.$inferSelect;
