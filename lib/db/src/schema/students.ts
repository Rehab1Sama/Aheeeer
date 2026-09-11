import { pgTable, text, serial, timestamp, integer, boolean, real, pgEnum, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const studentsTable = pgTable("students", {
  id: serial("id").primaryKey(),
  fullName: text("full_name").notNull(),
  circleId: integer("circle_id"),
  phone: text("phone"),
  country: text("country"),
  ageRange: text("age_range"),
  educationLevel: text("education_level"),
  memorizeFrom: text("memorize_from"),
  extraData: text("extra_data"),
  isArchived: boolean("is_archived").notNull().default(false),
  isNewcomer: boolean("is_newcomer").notNull().default(false),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  withdrawalPeriod: text("withdrawal_period"),
  withdrawalReason: text("withdrawal_reason"),
  withdrawalNotes: text("withdrawal_notes"),
  leaveStart: text("leave_start"),
  leaveEnd: text("leave_end"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertStudentSchema = createInsertSchema(studentsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertStudent = z.infer<typeof insertStudentSchema>;
export type Student = typeof studentsTable.$inferSelect;

export const studentTransfersTable = pgTable("student_transfers", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull(),
  fromCircleId: integer("from_circle_id"),
  toCircleId: integer("to_circle_id").notNull(),
  transferredById: integer("transferred_by_id").notNull(),
  note: text("note"),
  transferredAt: timestamp("transferred_at", { withTimezone: true }).notNull().defaultNow(),
});

export const studentNotesTable = pgTable("student_notes", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull(),
  authorId: integer("author_id").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Historical memorization is deliberately independent from daily records.
// A row represents memorization the student joined with or that staff verified
// later; its credit is included in the student's overall progress and exam quota.
export const studentMemorizationsTable = pgTable("student_memorizations", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull(),
  label: text("label").notNull(),
  juzNumbers: text("juz_numbers"),
  pages: real("pages").notNull().default(0),
  createdById: integer("created_by_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type StudentMemorization = typeof studentMemorizationsTable.$inferSelect;

export const studentArchiveEventsTable = pgTable("student_archive_events", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull(),
  eventType: text("event_type").notNull(), // 'archived' | 'restored'
  circleIdAtTime: integer("circle_id_at_time"),
  performedById: integer("performed_by_id"),
  eventDate: timestamp("event_date", { withTimezone: true }).notNull().defaultNow(),
});

export type StudentArchiveEvent = typeof studentArchiveEventsTable.$inferSelect;

export const studentLeaveHistoryTable = pgTable("student_leave_history", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull(),
  leaveStart: text("leave_start").notNull(),
  leaveEnd: text("leave_end").notNull(),
  reason: text("reason"),
  grantedById: integer("granted_by_id"),
  grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  cancelledById: integer("cancelled_by_id"),
});

export type StudentLeaveHistory = typeof studentLeaveHistoryTable.$inferSelect;

export const studentEnrollmentsTable = pgTable("student_enrollments", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull(),
  circleId: integer("circle_id").notNull(),
  isArchived: boolean("is_archived").notNull().default(false),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  withdrawalPeriod: text("withdrawal_period"),
  withdrawalReason: text("withdrawal_reason"),
  withdrawalNotes: text("withdrawal_notes"),
  leaveStart: text("leave_start"),
  leaveEnd: text("leave_end"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [unique("student_circle_unique").on(t.studentId, t.circleId)]);

export type StudentEnrollment = typeof studentEnrollmentsTable.$inferSelect;
export type InsertStudentEnrollment = typeof studentEnrollmentsTable.$inferInsert;

export const messagesTable = pgTable("messages", {
  id: serial("id").primaryKey(),
  senderId: integer("sender_id").notNull(),
  targetType: text("target_type").notNull(), // 'student' | 'circle' | 'track'
  targetId: text("target_id").notNull(),     // studentId | circleId | track name
  content: text("content").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
