import { pgTable, text, serial, timestamp, integer, boolean, real, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const recordsTable = pgTable("records", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull(),
  circleId: integer("circle_id").notNull(),
  enteredById: integer("entered_by_id").notNull(),
  date: text("date").notNull(),
  isAbsent: boolean("is_absent").notNull().default(false),
  memorizeSurahStart: text("memorize_surah_start"),
  memorizeAyahStart: integer("memorize_ayah_start"),
  memorizeSurahEnd: text("memorize_surah_end"),
  memorizeAyahEnd: integer("memorize_ayah_end"),
  memorizePages: real("memorize_pages"),
  reviewNearSurahStart: text("review_near_surah_start"),
  reviewNearAyahStart: integer("review_near_ayah_start"),
  reviewNearSurahEnd: text("review_near_surah_end"),
  reviewNearAyahEnd: integer("review_near_ayah_end"),
  reviewNearPages: real("review_near_pages"),
  reviewFarSurahStart: text("review_far_surah_start"),
  reviewFarAyahStart: integer("review_far_ayah_start"),
  reviewFarSurahEnd: text("review_far_surah_end"),
  reviewFarAyahEnd: integer("review_far_ayah_end"),
  reviewFarPages: real("review_far_pages"),
  reviewFar2SurahStart: text("review_far_2_surah_start"),
  reviewFar2AyahStart: integer("review_far_2_ayah_start"),
  reviewFar2SurahEnd: text("review_far_2_surah_end"),
  reviewFar2AyahEnd: integer("review_far_2_ayah_end"),
  reviewFar2Pages: real("review_far_2_pages"),
  reviewSurahStart: text("review_surah_start"),
  reviewAyahStart: integer("review_ayah_start"),
  reviewSurahEnd: text("review_surah_end"),
  reviewAyahEnd: integer("review_ayah_end"),
  reviewPages: real("review_pages"),
  recitationSurahStart: text("recitation_surah_start"),
  recitationAyahStart: integer("recitation_ayah_start"),
  recitationSurahEnd: text("recitation_surah_end"),
  recitationAyahEnd: integer("recitation_ayah_end"),
  recitationPages: real("recitation_pages"),
  repetitions: integer("repetitions"),
  listenedToReciter: boolean("listened_to_reciter"),
  shortcomingOverride: boolean("shortcoming_override"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  // مفتاح فريد مركب: طالبة + حلقة + تاريخ — يمنع تكرار السجل من أي مسار
  unique("records_student_circle_date_unique").on(t.studentId, t.circleId, t.date),
]);

export const insertRecordSchema = createInsertSchema(recordsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertRecord = z.infer<typeof insertRecordSchema>;
export type Record = typeof recordsTable.$inferSelect;
