import { pgTable, text, serial, timestamp, integer, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const reviewPlansTable = pgTable("review_plans", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull(),
  circleId: integer("circle_id").notNull(),
  planType: text("plan_type").notNull(), // 'girls_review' | 'fixation'
  status: text("status").notNull().default("active"), // 'pending_approval' | 'active' | 'cancelled'
  approvalStatus: text("approval_status").notNull().default("approved"), // 'pending' | 'approved' | 'rejected'
  approvedById: integer("approved_by_id"),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  cancellationRequestedAt: timestamp("cancellation_requested_at", { withTimezone: true }),
  cancellationRequestedById: integer("cancellation_requested_by_id"),

  quotaType: text("quota_type"), // 'juz' | 'surah'
  quotaJuz: integer("quota_juz"),
  quotaSurahStart: text("quota_surah_start"),
  quotaAyahStart: integer("quota_ayah_start"),
  quotaSurahEnd: text("quota_surah_end"),
  quotaAyahEnd: integer("quota_ayah_end"),
  planMode: text("plan_mode"), // 'auto' | 'manual'
  totalPages: real("total_pages"),

  quantity: text("quantity"), // 'half' | 'full' | 'double' (fixation only)

  extraRanges: text("extra_ranges"),
  // Immutable description of the memorization sources included when a girls
  // review cycle was created. This keeps an active cycle stable while later
  // daily records are reserved for its renewal.
  reviewSourceSnapshot: text("review_source_snapshot"),

  startDate: text("start_date").notNull(),
  themeColor: text("theme_color").notNull().default("#E8D5F5"),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const reviewPlanDaysTable = pgTable("review_plan_days", {
  id: serial("id").primaryKey(),
  planId: integer("plan_id").notNull(),
  dayNumber: integer("day_number").notNull(),
  surahStart: text("surah_start"),
  ayahStart: integer("ayah_start"),
  surahEnd: text("surah_end"),
  ayahEnd: integer("ayah_end"),
  pages: real("pages"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertReviewPlanSchema = createInsertSchema(reviewPlansTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertReviewPlan = z.infer<typeof insertReviewPlanSchema>;
export type ReviewPlan = typeof reviewPlansTable.$inferSelect;
export type ReviewPlanDay = typeof reviewPlanDaysTable.$inferSelect;
