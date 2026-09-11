import { Router, type IRouter } from "express";
import { db, calendarEventsTable } from "@workspace/db";
import { eq, and, gte, lte, sql } from "drizzle-orm";
import { authenticate } from "../middlewares/authenticate";

const router: IRouter = Router();

// Public read-only calendar for sharing with people who do not have an account.
router.get("/public/calendar-events", async (_req, res): Promise<void> => {
  const events = await db.select().from(calendarEventsTable);
  res.json(events.map(e => ({
    id: e.id,
    title: e.title,
    date: e.date,
    endDate: e.endDate,
    color: e.color,
    eventType: e.eventType,
    description: e.description,
  })));
});

router.get("/calendar-events", authenticate, async (req, res): Promise<void> => {
  const { year, month } = req.query as Record<string, string | undefined>;
  let events = await db.select().from(calendarEventsTable);
  if (year && month) {
    const ym = `${year}-${month.padStart(2, "0")}`;
    events = events.filter(e => e.date.startsWith(ym));
  } else if (year) {
    events = events.filter(e => e.date.startsWith(year));
  }
  res.json(events.map(e => ({ ...e, createdAt: e.createdAt.toISOString(), updatedAt: e.updatedAt?.toISOString() })));
});

router.post("/calendar-events", authenticate, async (req, res): Promise<void> => {
  if (req.userRole !== "leader" && req.userRole !== "deputy") { res.status(403).json({ error: "Forbidden" }); return; }
  const { title, date, endDate, color, eventType, description } = req.body;
  if (!title || !date || !color || !eventType) { res.status(400).json({ error: "Missing required fields" }); return; }
  const [row] = await db.insert(calendarEventsTable).values({
    title, date, endDate: endDate ?? null, color, eventType, description: description ?? null, createdById: req.userId!,
  }).returning();
  res.status(201).json({ ...row, createdAt: row.createdAt.toISOString() });
});

router.patch("/calendar-events/:id", authenticate, async (req, res): Promise<void> => {
  if (req.userRole !== "leader" && req.userRole !== "deputy") { res.status(403).json({ error: "Forbidden" }); return; }
  const id = parseInt(req.params.id as string);
  const { title, date, endDate, color, eventType, description } = req.body;
  const [row] = await db.update(calendarEventsTable).set({ title, date, endDate, color, eventType, description }).where(eq(calendarEventsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ ...row, createdAt: row.createdAt.toISOString() });
});

router.delete("/calendar-events/:id", authenticate, async (req, res): Promise<void> => {
  if (req.userRole !== "leader" && req.userRole !== "deputy") { res.status(403).json({ error: "Forbidden" }); return; }
  await db.delete(calendarEventsTable).where(eq(calendarEventsTable.id, parseInt(req.params.id as string)));
  res.status(204).send();
});

export default router;
