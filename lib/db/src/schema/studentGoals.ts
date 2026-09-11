import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const studentGoalsTable = pgTable("student_goals", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull(),
  title: text("title").notNull(),
  targetDate: text("target_date"),
  notes: text("notes"),
  motivationalMessage: text("motivational_message"),
  createdById: integer("created_by_id").notNull(),
  isCompleted: boolean("is_completed").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertStudentGoalSchema = createInsertSchema(studentGoalsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertStudentGoal = z.infer<typeof insertStudentGoalSchema>;
export type StudentGoal = typeof studentGoalsTable.$inferSelect;
