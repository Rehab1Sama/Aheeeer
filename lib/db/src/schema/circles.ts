import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const circlesTable = pgTable("circles", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  track: text("track").notNull(),
  trackType: text("track_type").notNull().default("girls"),
  trackId: integer("track_id"),
  teacherId: integer("teacher_id"),
  supervisorId: integer("supervisor_id"),
  meetingTime: text("meeting_time"),
  whatsappLink: text("whatsapp_link"),
  newStudentCapacity: integer("new_student_capacity"),
  isArchived: boolean("is_archived").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertCircleSchema = createInsertSchema(circlesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCircle = z.infer<typeof insertCircleSchema>;
export type Circle = typeof circlesTable.$inferSelect;
