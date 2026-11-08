import { pgTable, serial, integer, text, jsonb, timestamp, index } from "drizzle-orm/pg-core";

// سجل التدقيق: كل تعديل أو حذف ناجح عبر الموقع — من، ومتى، وماذا (بلا كلمات سر أو رموز).
export const auditLogsTable = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  userName: text("user_name"),
  role: text("role"),
  method: text("method").notNull(),
  path: text("path").notNull(),
  status: integer("status").notNull(),
  body: jsonb("body"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("audit_logs_created_idx").on(t.createdAt), index("audit_logs_user_idx").on(t.userId)]);

export type AuditLog = typeof auditLogsTable.$inferSelect;
