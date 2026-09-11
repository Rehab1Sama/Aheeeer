import { Router, type IRouter } from "express";
import { db, tracksTable, circlesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { authenticate } from "../middlewares/authenticate";

const router: IRouter = Router();

router.get("/tracks", authenticate, async (req, res): Promise<void> => {
  const tracks = await db.select().from(tracksTable).orderBy(tracksTable.createdAt);
  res.json(tracks);
});

router.post("/tracks", authenticate, async (req, res): Promise<void> => {
  if (req.userRole !== "leader") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const { name, dataEntryType } = req.body as { name: string; dataEntryType: string };
  if (!name?.trim()) {
    res.status(400).json({ error: "اسم المسار مطلوب" });
    return;
  }
  const validTypes = ["girls", "girls_near", "girls_far", "girls_no_review", "simple_review", "recitation", "fixation", "children", "mothers"];
  if (!validTypes.includes(dataEntryType)) {
    res.status(400).json({ error: "نوع المسار غير صحيح" });
    return;
  }
  const [existing] = await db.select().from(tracksTable).where(eq(tracksTable.name, name.trim()));
  if (existing) {
    res.status(409).json({ error: "اسم المسار موجود مسبقًا" });
    return;
  }
  const [track] = await db.insert(tracksTable).values({ name: name.trim(), dataEntryType }).returning();
  res.status(201).json(track);
});

router.patch("/tracks/:id", authenticate, async (req, res): Promise<void> => {
  if (req.userRole !== "leader") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const id = parseInt(req.params.id as string, 10);
  const { name } = req.body as { name?: string };
  if (!name?.trim()) {
    res.status(400).json({ error: "الاسم مطلوب" });
    return;
  }
  const [existing] = await db.select().from(tracksTable).where(eq(tracksTable.name, name.trim()));
  if (existing && existing.id !== id) {
    res.status(409).json({ error: "هذا الاسم مستخدم مسبقًا" });
    return;
  }
  const [track] = await db.update(tracksTable).set({ name: name.trim() }).where(eq(tracksTable.id, id)).returning();
  if (!track) { res.status(404).json({ error: "المسار غير موجود" }); return; }
  res.json(track);
});

router.delete("/tracks/:id", authenticate, async (req, res): Promise<void> => {
  if (req.userRole !== "leader") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const id = parseInt(req.params.id as string, 10);
  const circles = await db.select().from(circlesTable).where(eq(circlesTable.trackId, id));
  if (circles.length > 0) {
    res.status(409).json({ error: "لا يمكن حذف مسار يحتوي على حلقات" });
    return;
  }
  await db.delete(tracksTable).where(eq(tracksTable.id, id));
  res.status(204).end();
});

router.post("/tracks/:id/circles", authenticate, async (req, res): Promise<void> => {
  if (req.userRole !== "leader") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const trackId = parseInt(req.params.id as string, 10);
  const [track] = await db.select().from(tracksTable).where(eq(tracksTable.id, trackId));
  if (!track) {
    res.status(404).json({ error: "المسار غير موجود" });
    return;
  }
  const { name } = req.body as { name: string };
  if (!name?.trim()) {
    res.status(400).json({ error: "اسم الحلقة مطلوب" });
    return;
  }
  const [circle] = await db.insert(circlesTable).values({
    name: name.trim(),
    track: track.name,
    trackId: track.id,
    trackType: track.dataEntryType ?? "girls",
  }).returning();
  res.status(201).json(circle);
});

router.delete("/circles/:id", authenticate, async (req, res): Promise<void> => {
  if (req.userRole !== "leader") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const id = parseInt(req.params.id as string, 10);
  const [circle] = await db.select().from(circlesTable).where(eq(circlesTable.id, id));
  if (!circle) {
    res.status(404).json({ error: "الحلقة غير موجودة" });
    return;
  }
  await db.delete(circlesTable).where(eq(circlesTable.id, id));
  res.status(204).end();
});

export default router;
