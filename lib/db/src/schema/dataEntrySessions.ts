import { pgTable, serial, integer, real, text, timestamp } from "drizzle-orm/pg-core";

export const dataEntrySessionsTable = pgTable("data_entry_sessions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  date: text("date").notNull(),
  morningMinutes: real("morning_minutes").notNull().default(0),
  eveningMinutes: real("evening_minutes").notNull().default(0),
  lastHeartbeatAt: timestamp("last_heartbeat_at", { withTimezone: true }),
  /** null لجلسات data_entry (زي ما كانت). مُعبّأ فقط لجلسات مسؤولة المسار — يحدد الفرد رغم الحساب المشترك. */
  supervisorNameId: integer("supervisor_name_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type DataEntrySession = typeof dataEntrySessionsTable.$inferSelect;
