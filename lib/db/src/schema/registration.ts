import { pgTable, text, serial, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const registrationSettingsTable = pgTable("registration_settings", {
  id: serial("id").primaryKey(),
  isOpen: boolean("is_open").notNull().default(false),
  staffRegistrationOpen: boolean("staff_registration_open").notNull().default(true),
  existingStudentRegOpen: boolean("existing_student_reg_open").notNull().default(false),
  autoApproveStudents: boolean("auto_approve_students").notNull().default(false),
  startDate: text("start_date"),
  deadline: text("deadline"),
  customQuestions: text("custom_questions"),
  staffCustomQuestions: text("staff_custom_questions"),
  wizardConfig: text("wizard_config"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertRegistrationSettingsSchema = createInsertSchema(registrationSettingsTable).omit({ id: true, updatedAt: true });
export type InsertRegistrationSettings = z.infer<typeof insertRegistrationSettingsSchema>;
export type RegistrationSettings = typeof registrationSettingsTable.$inferSelect;
