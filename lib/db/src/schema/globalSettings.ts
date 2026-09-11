import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const globalSettingsTable = pgTable("global_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type GlobalSetting = typeof globalSettingsTable.$inferSelect;
