import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";

export const storeProductsTable = pgTable("store_products", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  price: text("price").notNull(),
  imageUrl: text("image_url"),
  whatsappNumber: text("whatsapp_number").notNull(),
  category: text("category"),
  isActive: boolean("is_active").notNull().default(true),
  displayOrder: integer("display_order").notNull().default(0),
  createdById: integer("created_by_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type StoreProduct = typeof storeProductsTable.$inferSelect;
