import { pgTable, text, serial, timestamp, integer, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const trackSupervisorNamesTable = pgTable("track_supervisor_names", {
  id: serial("id").primaryKey(),
  trackId: integer("track_id").notNull(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const dailyCircleTasksTable = pgTable("daily_circle_tasks", {
  id: serial("id").primaryKey(),
  circleId: integer("circle_id").notNull(),
  date: text("date").notNull(),
  supervisorNameId: integer("supervisor_name_id").notNull(),
  teacherAttendance: text("teacher_attendance").notNull(),
  prepStatus: text("prep_status").notNull(),
  motivationStatus: text("motivation_status").notNull(),
  reportStatus: text("report_status").notNull(),
  circleAbsenceCount: integer("circle_absence_count").notNull().default(0),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [unique().on(t.circleId, t.date, t.supervisorNameId)]);

export const customQuestionsTable = pgTable("custom_questions", {
  id: serial("id").primaryKey(),
  question: text("question").notNull(),
  dateFrom: text("date_from").notNull(),
  dateTo: text("date_to").notNull(),
  createdById: integer("created_by_id").notNull(),
  questionType: text("question_type").notNull().default("individual"),
  answerType: text("answer_type").notNull().default("text"),
  answerOptions: text("answer_options"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const customQuestionAnswersTable = pgTable("custom_question_answers", {
  id: serial("id").primaryKey(),
  questionId: integer("question_id").notNull(),
  supervisorNameId: integer("supervisor_name_id"),
  trackId: integer("track_id"),
  date: text("date").notNull(),
  answer: text("answer").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [unique().on(t.questionId, t.supervisorNameId, t.date)]);

export const insertDailyCircleTaskSchema = createInsertSchema(dailyCircleTasksTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDailyCircleTask = z.infer<typeof insertDailyCircleTaskSchema>;
export type DailyCircleTask = typeof dailyCircleTasksTable.$inferSelect;
