import { Router, type IRouter } from "express";
import { db, dataEntrySessionsTable, trackSupervisorNamesTable, tracksTable } from "@workspace/db";
import { eq, and, gte } from "drizzle-orm";
import { authenticate } from "../middlewares/authenticate";
import { getMakkahDay } from "../lib/date";

const router: IRouter = Router();

// نفس منطق isMorning/الفترة المستخدم أصلًا بـ data_entry_sessions (توقيت مكة UTC+3)
function isMorning(): boolean {
  const meccaHour = (new Date().getUTCHours() + 3) % 24;
  return meccaHour >= 6 && meccaHour < 14;
}
const HEARTBEAT_INTERVAL_MINUTES = 2;
const stripPrefix = (s: string) => s.replace(/^مسار\s+/, "").trim();

/** يتأكد إن supervisorNameId فعلاً تابع لمسار المستخدمة الحالية (userTrack) */
async function resolveOwnTrackId(userTrack: string | null | undefined): Promise<number | null> {
  if (!userTrack) return null;
  const allTracks = await db.select().from(tracksTable);
  const match = allTracks.find(t => stripPrefix(t.name) === stripPrefix(userTrack));
  return match?.id ?? null;
}

/**
 * POST /api/track-supervisor/session/heartbeat — نفس فكرة heartbeat جلسات
 * data_entry بالضبط، لكن لدور track_supervisor فقط، ومربوطة بـ supervisorNameId
 * (تمييز الفرد رغم الحساب المشترك) بدل الاعتماد على userId لوحده.
 */
router.post("/track-supervisor/session/heartbeat", authenticate, async (req, res): Promise<void> => {
  if (req.userRole !== "track_supervisor") { res.status(403).json({ error: "Forbidden" }); return; }

  const { supervisorNameId } = req.body as { supervisorNameId?: number };
  if (!supervisorNameId) { res.status(400).json({ error: "supervisorNameId required" }); return; }

  const myTrackId = await resolveOwnTrackId(req.userTrack);
  if (!myTrackId) { res.status(403).json({ error: "Forbidden" }); return; }

  const [nameRow] = await db.select().from(trackSupervisorNamesTable).where(eq(trackSupervisorNamesTable.id, supervisorNameId));
  if (!nameRow || nameRow.trackId !== myTrackId) { res.status(403).json({ error: "الاسم لا يتبع مسارك" }); return; }

  const today = getMakkahDay();
  const morning = isMorning();
  const userId = req.userId!;

  const [existing] = await db.select().from(dataEntrySessionsTable)
    .where(and(
      eq(dataEntrySessionsTable.userId, userId),
      eq(dataEntrySessionsTable.date, today),
      eq(dataEntrySessionsTable.supervisorNameId, supervisorNameId),
    ));

  if (existing) {
    const lastBeat = existing.lastHeartbeatAt ? new Date(existing.lastHeartbeatAt) : null;
    const minutesSinceLast = lastBeat ? (Date.now() - lastBeat.getTime()) / 60000 : 999;
    const addMinutes = minutesSinceLast <= 5 ? HEARTBEAT_INTERVAL_MINUTES : 0;

    await db.update(dataEntrySessionsTable)
      .set({
        morningMinutes: morning ? existing.morningMinutes + addMinutes : existing.morningMinutes,
        eveningMinutes: !morning ? existing.eveningMinutes + addMinutes : existing.eveningMinutes,
        lastHeartbeatAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(dataEntrySessionsTable.id, existing.id));
  } else {
    await db.insert(dataEntrySessionsTable).values({
      userId,
      date: today,
      supervisorNameId,
      morningMinutes: morning ? HEARTBEAT_INTERVAL_MINUTES : 0,
      eveningMinutes: !morning ? HEARTBEAT_INTERVAL_MINUTES : 0,
      lastHeartbeatAt: new Date(),
    });
  }

  res.json({ ok: true });
});

/**
 * GET /api/track-supervisor/sessions/today — تقرير اليوم لكل الأسماء الفردية
 * (لكل مسارات المدرسة). الوصول: قائدة/نائبة فقط.
 */
router.get("/track-supervisor/sessions/today", authenticate, async (req, res): Promise<void> => {
  if (!["leader", "deputy"].includes(req.userRole!)) { res.status(403).json({ error: "Forbidden" }); return; }

  const today = getMakkahDay();
  const [sessions, allNames, allTracks] = await Promise.all([
    db.select().from(dataEntrySessionsTable).where(eq(dataEntrySessionsTable.date, today)),
    db.select().from(trackSupervisorNamesTable),
    db.select().from(tracksTable),
  ]);

  const nameMap = new Map(allNames.map(n => [n.id, n]));
  const trackMap = new Map(allTracks.map(t => [t.id, t.name]));

  const result = sessions
    .filter(s => s.supervisorNameId !== null)
    .map(s => {
      const nameRow = nameMap.get(s.supervisorNameId!);
      return {
        supervisorNameId: s.supervisorNameId,
        name: nameRow?.name ?? "—",
        track: nameRow ? trackMap.get(nameRow.trackId) ?? null : null,
        morningMinutes: Math.round(s.morningMinutes * 10) / 10,
        eveningMinutes: Math.round(s.eveningMinutes * 10) / 10,
        totalMinutes: Math.round((s.morningMinutes + s.eveningMinutes) * 10) / 10,
        lastHeartbeatAt: s.lastHeartbeatAt ? s.lastHeartbeatAt.toISOString() : null,
      };
    })
    .sort((a, b) => b.totalMinutes - a.totalMinutes);

  res.json(result);
});

/**
 * GET /api/track-supervisor/sessions/range?dateFrom=&dateTo= — نفس فكرة تقرير
 * المدى الزمني لجلسات data_entry، لكن مجمّعة بالاسم الفردي. الوصول: قائدة/نائبة.
 */
router.get("/track-supervisor/sessions/range", authenticate, async (req, res): Promise<void> => {
  if (!["leader", "deputy"].includes(req.userRole!)) { res.status(403).json({ error: "Forbidden" }); return; }

  const { dateFrom, dateTo } = req.query as Record<string, string>;
  const today = getMakkahDay();
  const from = dateFrom ?? today;
  const to = dateTo ?? today;

  const [sessions, allNames, allTracks] = await Promise.all([
    db.select().from(dataEntrySessionsTable).where(gte(dataEntrySessionsTable.date, from))
      .then(rows => rows.filter(s => s.date <= to && s.supervisorNameId !== null)),
    db.select().from(trackSupervisorNamesTable),
    db.select().from(tracksTable),
  ]);

  const trackMap = new Map(allTracks.map(t => [t.id, t.name]));

  const result = allNames.map(nameRow => {
    const mySessions = sessions.filter(s => s.supervisorNameId === nameRow.id);
    const totalMorning = mySessions.reduce((sum, s) => sum + s.morningMinutes, 0);
    const totalEvening = mySessions.reduce((sum, s) => sum + s.eveningMinutes, 0);
    return {
      supervisorNameId: nameRow.id,
      name: nameRow.name,
      track: trackMap.get(nameRow.trackId) ?? null,
      morningMinutes: Math.round(totalMorning * 10) / 10,
      eveningMinutes: Math.round(totalEvening * 10) / 10,
      totalMinutes: Math.round((totalMorning + totalEvening) * 10) / 10,
      activeDays: mySessions.filter(s => s.morningMinutes + s.eveningMinutes > 0).length,
      byDay: mySessions.map(s => ({
        date: s.date,
        morningMinutes: Math.round(s.morningMinutes * 10) / 10,
        eveningMinutes: Math.round(s.eveningMinutes * 10) / 10,
      })),
    };
  }).filter(r => r.activeDays > 0)
    .sort((a, b) => b.totalMinutes - a.totalMinutes);

  res.json(result);
});

export default router;
