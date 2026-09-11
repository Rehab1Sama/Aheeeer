import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";

export const badgeEventsTable = pgTable("badge_events", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  emoji: text("emoji").notNull().default("🏅"),
  color: text("color").notNull().default("#f59e0b"),
  targetType: text("target_type").notNull(),
  dateFrom: text("date_from").notNull(),
  dateTo: text("date_to").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdById: integer("created_by_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const badgeAssignmentsTable = pgTable("badge_assignments", {
  id: serial("id").primaryKey(),
  badgeEventId: integer("badge_event_id").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: integer("entity_id").notNull(),
  entityName: text("entity_name").notNull(),
  notes: text("notes"),
  createdById: integer("created_by_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type BadgeEvent = typeof badgeEventsTable.$inferSelect;
export type BadgeAssignment = typeof badgeAssignmentsTable.$inferSelect;
