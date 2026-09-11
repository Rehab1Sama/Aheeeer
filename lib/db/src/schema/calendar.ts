import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";

export const calendarEventsTable = pgTable("calendar_events", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  date: text("date").notNull(),
  endDate: text("end_date"),
  color: text("color").notNull().default("#6366f1"),
  eventType: text("event_type").notNull().default("general"),
  description: text("description"),
  createdById: integer("created_by_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type CalendarEvent = typeof calendarEventsTable.$inferSelect;
