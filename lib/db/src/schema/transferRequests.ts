import { pgTable, serial, integer, text, timestamp, index } from "drizzle-orm/pg-core";

// طلبات نقل الطالبات: من لا تملك صلاحية النقل ترسل طلبًا، والقائدة أو النائبة توافق بضغطة.
export const transferRequestsTable = pgTable("transfer_requests", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull(),
  fromCircleId: integer("from_circle_id"),
  toCircleId: integer("to_circle_id").notNull(),
  requestedById: integer("requested_by_id").notNull(),
  note: text("note"),
  status: text("status").notNull().default("pending"), // pending | approved | rejected
  decidedById: integer("decided_by_id"),
  decisionNote: text("decision_note"),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("transfer_requests_status_idx").on(t.status)]);

export type TransferRequest = typeof transferRequestsTable.$inferSelect;
