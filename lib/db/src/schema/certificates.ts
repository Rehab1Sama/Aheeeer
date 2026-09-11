import { pgTable, text, serial, timestamp, integer, real, boolean, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const certificateTermsTable = pgTable("certificate_terms", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  academicYear: text("academic_year"),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  reviewCycleOneStart: text("review_cycle_one_start"),
  reviewCycleTwoStart: text("review_cycle_two_start"),
  status: text("status").notNull().default("draft"),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  createdById: integer("created_by_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const certificateScoresTable = pgTable("certificate_scores", {
  id: serial("id").primaryKey(),
  termId: integer("term_id").notNull(),
  studentId: integer("student_id").notNull(),
  circleId: integer("circle_id"),
  trackId: integer("track_id"),
  trackType: text("track_type").notNull(),
  testScore: real("test_score"),
  testNotes: text("test_notes"),
  priorNisab: real("prior_nisab"),
  currentNisab: real("current_nisab"),
  cumulativeNisab: real("cumulative_nisab"),
  importedFirstTermScore: real("imported_first_term_score"),
  status: text("status").notNull().default("missing_exam"),
  enteredById: integer("entered_by_id"),
  updatedById: integer("updated_by_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [unique("certificate_score_term_student_unique").on(t.termId, t.studentId)]);

export const certificateImportCandidatesTable = pgTable("certificate_import_candidates", {
  id: serial("id").primaryKey(),
  termId: integer("term_id").notNull(),
  sourceSheet: text("source_sheet"),
  sourceRow: integer("source_row"),
  sourceName: text("source_name").notNull(),
  sourceTrack: text("source_track"),
  sourcePhone: text("source_phone"),
  sourceCountry: text("source_country"),
  sourceQuotaFrom: text("source_quota_from"),
  sourceQuotaTo: text("source_quota_to"),
  sourceScore: real("source_score"),
  sourcePriorNisab: real("source_prior_nisab"),
  sourceCurrentNisab: real("source_current_nisab"),
  matchedStudentId: integer("matched_student_id"),
  confidence: text("confidence").notNull().default("unmatched"),
  resolved: boolean("resolved").notNull().default(false),
  reviewedById: integer("reviewed_by_id"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertCertificateTermSchema = createInsertSchema(certificateTermsTable)
  .omit({ id: true, createdAt: true, updatedAt: true, publishedAt: true });
export type InsertCertificateTerm = z.infer<typeof insertCertificateTermSchema>;
export type CertificateTerm = typeof certificateTermsTable.$inferSelect;
export type CertificateScore = typeof certificateScoresTable.$inferSelect;
export type CertificateImportCandidate = typeof certificateImportCandidatesTable.$inferSelect;