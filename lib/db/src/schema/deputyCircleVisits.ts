import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const deputyCircleVisitsTable = pgTable("deputy_circle_visits", {
  id: serial("id").primaryKey(),
  circleId: integer("circle_id").notNull(),
  visitDate: text("visit_date").notNull(),
  notes: text("notes"),
  createdById: integer("created_by_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertDeputyCircleVisitSchema = createInsertSchema(deputyCircleVisitsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDeputyCircleVisit = z.infer<typeof insertDeputyCircleVisitSchema>;
export type DeputyCircleVisit = typeof deputyCircleVisitsTable.$inferSelect;
