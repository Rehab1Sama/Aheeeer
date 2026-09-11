import { pgTable, serial, integer, timestamp } from "drizzle-orm/pg-core";

export const dataEntryCircleAssignmentsTable = pgTable("data_entry_circle_assignments", {
  id: serial("id").primaryKey(),
  dataEntryUserId: integer("data_entry_user_id").notNull(),
  circleId: integer("circle_id").notNull(),
  assignedById: integer("assigned_by_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type DataEntryCircleAssignment = typeof dataEntryCircleAssignmentsTable.$inferSelect;
