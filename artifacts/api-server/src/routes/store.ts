import { Router, type IRouter } from "express";
import { db, storeProductsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { authenticate } from "../middlewares/authenticate";

const router: IRouter = Router();

router.get("/store-products", async (req, res): Promise<void> => {
  const { activeOnly } = req.query as { activeOnly?: string };
  let products = await db.select().from(storeProductsTable).orderBy(storeProductsTable.displayOrder);
  if (activeOnly === "true") products = products.filter(p => p.isActive);
  res.json(products.map(p => ({ ...p, createdAt: p.createdAt.toISOString() })));
});

router.post("/store-products", authenticate, async (req, res): Promise<void> => {
  if (req.userRole !== "leader") { res.status(403).json({ error: "Forbidden" }); return; }
  const { title, description, price, imageUrl, whatsappNumber, category, isActive, displayOrder } = req.body;
  if (!title || !price || !whatsappNumber) { res.status(400).json({ error: "title, price, whatsappNumber required" }); return; }
  const [row] = await db.insert(storeProductsTable).values({
    title, description: description ?? null, price, imageUrl: imageUrl ?? null,
    whatsappNumber, category: category ?? null, isActive: isActive ?? true,
    displayOrder: displayOrder ?? 0, createdById: req.userId!,
  }).returning();
  res.status(201).json({ ...row, createdAt: row.createdAt.toISOString() });
});

router.patch("/store-products/:id", authenticate, async (req, res): Promise<void> => {
  if (req.userRole !== "leader") { res.status(403).json({ error: "Forbidden" }); return; }
  const id = parseInt(req.params.id as string);
  const [row] = await db.update(storeProductsTable).set(req.body).where(eq(storeProductsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ ...row, createdAt: row.createdAt.toISOString() });
});

router.delete("/store-products/:id", authenticate, async (req, res): Promise<void> => {
  if (req.userRole !== "leader") { res.status(403).json({ error: "Forbidden" }); return; }
  await db.delete(storeProductsTable).where(eq(storeProductsTable.id, parseInt(req.params.id as string)));
  res.status(204).send();
});

export default router;
