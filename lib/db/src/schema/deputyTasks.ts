import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const deputyTasksTable = pgTable("deputy_tasks", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  taskType: text("task_type").notNull().default("general"),
  // answerType: 'text' | 'select' | 'boolean'
  answerType: text("answer_type").notNull().default("text"),
  // JSON array of strings for select type, e.g. '["Option A","Option B"]'
  selectOptions: text("select_options"),
  response: text("response"),
  isCompleted: boolean("is_completed").notNull().default(false),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdById: integer("created_by_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertDeputyTaskSchema = createInsertSchema(deputyTasksTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDeputyTask = z.infer<typeof insertDeputyTaskSchema>;
export type DeputyTask = typeof deputyTasksTable.$inferSelect;
