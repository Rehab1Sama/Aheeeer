import { Router, type IRouter } from "express";
import { db, recordsTable, circlesTable, globalSettingsTable } from "@workspace/db";
import { eq, and, gte, lte, inArray } from "drizzle-orm";
import { authenticate } from "../middlewares/authenticate";
import { getMakkahDay, getLastCompletedWeekStart, addDaysStr } from "../lib/date";

const router: IRouter = Router();

const SETTINGS_KEY = "leaderboard_window";

// GET /api/leaderboard/monthly — لوحة الصدارة الشهرية: حلقات صفر غياب خلال آخر أسبوع مكتمل،
// تظهر فقط ضمن نافذة الظهور اللي تحددها القائدة (leaderboard_window بالإعدادات).
// متاحة لكل الأدوار المسجّلة دخول (تحفيز جماعي مفتوح للكل).
router.get("/leaderboard/monthly", authenticate, async (req, res): Promise<void> => {
  const [setting] = await db.select().from(globalSettingsTable).where(eq(globalSettingsTable.key, SETTINGS_KEY));

  let visible = false;
  let windowFrom: string | null = null;
  let windowTo: string | null = null;
  if (setting) {
    try {
      const parsed = JSON.parse(setting.value) as { from?: string; to?: string };
      windowFrom = parsed.from ?? null;
      windowTo = parsed.to ?? null;
      const today = getMakkahDay();
      if (windowFrom && windowTo && today >= windowFrom && today <= windowTo) visible = true;
    } catch {
      // إعداد غير صالح — نتعامل معها كأنها غير مفعّلة
    }
  }

  if (!visible) {
    res.json({ visible: false, windowFrom, windowTo, weekStart: null, weekEnd: null, circles: [] });
    return;
  }

  const weekStart = getLastCompletedWeekStart();
  const weekEnd = addDaysStr(weekStart, 4);

  const circles = await db.select({
    id: circlesTable.id,
    name: circlesTable.name,
    track: circlesTable.track,
    trackType: circlesTable.trackType,
  }).from(circlesTable).where(eq(circlesTable.isArchived, false));
  const eligibleCircles = circles.filter(c => c.trackType !== "archive" && c.trackType !== "registration");
  const circleIds = eligibleCircles.map(c => c.id);

  if (circleIds.length === 0) {
    res.json({ visible: true, windowFrom, windowTo, weekStart, weekEnd, circles: [] });
    return;
  }

  const weekRecords = await db.select({ circleId: recordsTable.circleId, isAbsent: recordsTable.isAbsent })
    .from(recordsTable)
    .where(and(gte(recordsTable.date, weekStart), lte(recordsTable.date, weekEnd), inArray(recordsTable.circleId, circleIds)));

  const hasAnyRecord = new Set<number>();
  const hasAbsence = new Set<number>();
  for (const r of weekRecords) {
    hasAnyRecord.add(r.circleId);
    if (r.isAbsent) hasAbsence.add(r.circleId);
  }

  const zeroAbsenceCircles = eligibleCircles
    .filter(c => hasAnyRecord.has(c.id) && !hasAbsence.has(c.id))
    .map(c => ({ id: c.id, name: c.name, track: c.track }))
    .sort((a, b) => a.name.localeCompare(b.name, "ar", { numeric: true }));

  res.json({ visible: true, windowFrom, windowTo, weekStart, weekEnd, circles: zeroAbsenceCircles });
});

export default router;
