import { Router, type IRouter } from "express";
import { db, deputyCircleVisitsTable, circlesTable } from "@workspace/db";
import { eq, and, gte } from "drizzle-orm";
import { authenticate } from "../middlewares/authenticate";
import { getMakkahDay } from "../lib/date";

const router: IRouter = Router();

function getMeccaToday(): string {
  return getMakkahDay();
}

function getWeekStart(): string {
  const today = getMakkahDay();
  const d = new Date(today + "T00:00:00Z");
  const day = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - (day === 0 ? 0 : day));
  return d.toISOString().slice(0, 10);
}

function getMonthStart(): string {
  const today = getMakkahDay();
  return today.slice(0, 8) + "01";
}

router.get("/deputy/circle-visits", authenticate, async (req, res): Promise<void> => {
  if (!["leader", "deputy"].includes(req.userRole!)) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  const visits = await db.select().from(deputyCircleVisitsTable);
  res.json(visits);
});

router.post("/deputy/circle-visits", authenticate, async (req, res): Promise<void> => {
  if (req.userRole !== "deputy") {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  const { circleId, notes } = req.body as { circleId?: number; notes?: string };
  if (!circleId) { res.status(400).json({ error: "circleId مطلوب" }); return; }

  const today = getMeccaToday();

  const [existing] = await db.select().from(deputyCircleVisitsTable)
    .where(and(
      eq(deputyCircleVisitsTable.circleId, circleId),
      eq(deputyCircleVisitsTable.visitDate, today),
    ));

  if (existing) {
    const [updated] = await db.update(deputyCircleVisitsTable)
      .set({ notes: notes?.trim() ?? existing.notes, updatedAt: new Date() })
      .where(eq(deputyCircleVisitsTable.id, existing.id))
      .returning();
    res.json(updated);
  } else {
    const [created] = await db.insert(deputyCircleVisitsTable).values({
      circleId,
      visitDate: today,
      notes: notes?.trim() ?? null,
      createdById: req.userId!,
    }).returning();
    res.status(201).json(created);
  }
});

router.patch("/deputy/circle-visits/:id/notes", authenticate, async (req, res): Promise<void> => {
  if (req.userRole !== "deputy") {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  const id = parseInt(req.params.id as string);
  const { notes } = req.body as { notes?: string };
  const [updated] = await db.update(deputyCircleVisitsTable)
    .set({ notes: notes?.trim() ?? null, updatedAt: new Date() })
    .where(eq(deputyCircleVisitsTable.id, id))
    .returning();
  res.json(updated);
});

router.delete("/deputy/circle-visits/:id", authenticate, async (req, res): Promise<void> => {
  if (req.userRole !== "deputy") {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  const id = parseInt(req.params.id as string);
  await db.delete(deputyCircleVisitsTable).where(eq(deputyCircleVisitsTable.id, id));
  res.json({ ok: true });
});

router.get("/deputy/circle-visits/history", authenticate, async (req, res): Promise<void> => {
  if (!["leader", "deputy"].includes(req.userRole!)) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  const filter = (req.query.filter as string) ?? "all";
  let fromDate: string;
  if (filter === "week") fromDate = getWeekStart();
  else if (filter === "month") fromDate = getMonthStart();
  else fromDate = "2000-01-01";

  const visits = await db.select().from(deputyCircleVisitsTable)
    .where(gte(deputyCircleVisitsTable.visitDate, fromDate));

  const circles = await db.select().from(circlesTable);
  const circleMap: Record<number, { name: string; track: string | null }> = {};
  for (const c of circles) circleMap[c.id] = { name: c.name, track: c.track };

  const result = visits.map(v => ({
    ...v,
    circleName: circleMap[v.circleId]?.name ?? "—",
    circleTrack: circleMap[v.circleId]?.track ?? null,
    createdAt: v.createdAt.toISOString(),
    updatedAt: v.updatedAt?.toISOString() ?? null,
  }));

  res.json(result);
});

export default router;
