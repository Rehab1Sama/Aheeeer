import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";

export const examRecordsTable = pgTable("exam_records", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull(),
  examinerId: integer("examiner_id").notNull(),
  date: text("date").notNull(),
  juzNumber: integer("juz_number"),
  responded: boolean("responded").notNull().default(false),
  grade: text("grade"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type ExamRecord = typeof examRecordsTable.$inferSelect;
