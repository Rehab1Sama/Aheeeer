import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";

export const whitelabelConfigsTable = pgTable("whitelabel_configs", {
  id: serial("id").primaryKey(),
  schoolName: text("school_name").notNull(),
  schoolTagline: text("school_tagline").default("نظام إدارة المقرأة"),
  logoUrl: text("logo_url"),
  adminEmail: text("admin_email"),
  primaryHsl: text("primary_hsl").notNull().default("210 51% 21%"),
  secondaryHsl: text("secondary_hsl").notNull().default("177 35% 57%"),
  sidebarHsl: text("sidebar_hsl").notNull().default("210 51% 21%"),
  enabledFeatures: text("enabled_features").notNull().default("[]"),
  dataEntryRoles: text("data_entry_roles").notNull().default('["teacher","supervisor","data_entry"]'),
  roleNames: text("role_names").notNull().default("{}"),
  trackTypes: text("track_types").notNull().default("[]"),
  circleGenders: text("circle_genders").notNull().default('["girls"]'),
  renderServiceId: text("render_service_id"),
  renderDbId: text("render_db_id"),
  renderServiceUrl: text("render_service_url"),
  deployStatus: text("deploy_status").notNull().default("draft"),
  deployError: text("deploy_error"),
  customDatabaseUrl: text("custom_database_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type WhitelabelConfig = typeof whitelabelConfigsTable.$inferSelect;
