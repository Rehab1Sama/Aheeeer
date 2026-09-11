import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";

export const examRotationsTable = pgTable("exam_rotations", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  teacherScope: text("teacher_scope").notNull().default("girls"),
  selectedTracks: text("selected_tracks").notNull().default("[]"),
  createdById: integer("created_by_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const examTeacherAssignmentsTable = pgTable("exam_teacher_assignments", {
  id: serial("id").primaryKey(),
  rotationId: integer("rotation_id").notNull(),
  teacherId: integer("teacher_id").notNull(),
  originalCircleId: integer("original_circle_id").notNull(),
  examCircleId: integer("exam_circle_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ExamRotation = typeof examRotationsTable.$inferSelect;
export type ExamTeacherAssignment = typeof examTeacherAssignmentsTable.$inferSelect;
