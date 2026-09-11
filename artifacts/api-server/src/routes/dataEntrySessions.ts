import { Router, type IRouter } from "express";
import { db, dataEntrySessionsTable, dataEntryCircleAssignmentsTable, recordsTable, usersTable, circlesTable, studentsTable } from "@workspace/db";
import { eq, and, gte, inArray } from "drizzle-orm";
import { authenticate } from "../middlewares/authenticate";
import { getMakkahDay } from "../lib/date";

const router: IRouter = Router();

function getMeccaTodayServer(): string {
  return getMakkahDay();
}

// هل الوقت الحالي (بتوقيت مكة) صباح أم مساء؟
// الصباح: 06:00 - 13:59 (بتوقيت مكة = UTC+3)
// المساء: 14:00 - 23:59
function isMorning(): boolean {
  const meccaHour = (new Date().getUTCHours() + 3) % 24;
  return meccaHour >= 6 && meccaHour < 14;
}

const HEARTBEAT_INTERVAL_MINUTES = 2; // كل ضربة قلب = دقيقتان من العمل الفعلي

// POST /api/data-entry/session/heartbeat — تحديث وقت الجلسة النشطة
router.post("/data-entry/session/heartbeat", authenticate, async (req, res): Promise<void> => {
  if (req.userRole !== "data_entry") {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  const today = getMeccaTodayServer();
  const morning = isMorning();
  const userId = req.userId!;

  const [existing] = await db.select().from(dataEntrySessionsTable)
    .where(and(
      eq(dataEntrySessionsTable.userId, userId),
      eq(dataEntrySessionsTable.date, today),
    ));

  if (existing) {
    // تحقق من أن آخر ضربة قلب كانت مؤخرًا (في آخر 5 دقائق) لتجنب احتساب فترات الخمول
    const lastBeat = existing.lastHeartbeatAt ? new Date(existing.lastHeartbeatAt) : null;
    const minutesSinceLast = lastBeat
      ? (Date.now() - lastBeat.getTime()) / 60000
      : 999;

    const shouldAddMinutes = minutesSinceLast <= 5; // لا تحتسب إذا كانت آخر ضربة منذ أكثر من 5 دقائق

    const addMinutes = shouldAddMinutes ? HEARTBEAT_INTERVAL_MINUTES : 0;

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
      morningMinutes: morning ? HEARTBEAT_INTERVAL_MINUTES : 0,
      eveningMinutes: !morning ? HEARTBEAT_INTERVAL_MINUTES : 0,
      lastHeartbeatAt: new Date(),
    });
  }

  res.json({ ok: true });
});

// GET /api/data-entry/sessions/today — إحصائيات اليوم لجميع المدخلات (للقائدة والنائبة)
// يحسب وقت الشغل الفعلي من توقيتات السجلات المُدخلة، لا من heartbeat
router.get("/data-entry/sessions/today", authenticate, async (req, res): Promise<void> => {
  if (!["leader", "deputy"].includes(req.userRole!)) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  const today = getMeccaTodayServer();

  // جلب كل السجلات المُدخلة اليوم (enteredById + createdAt)
  const todayRecords = await db
    .select({ enteredById: recordsTable.enteredById, createdAt: recordsTable.createdAt })
    .from(recordsTable)
    .where(eq(recordsTable.date, today));

  const allDataEntryUsers = await db.select().from(usersTable)
    .where(and(eq(usersTable.role, "data_entry"), eq(usersTable.isArchived, false)));

  // إذا مرّ أكثر من 15 دقيقة بين سجلين متتاليين → جلسة جديدة (لا نحتسب وقت الراحة)
  const SESSION_GAP_MS = 15 * 60 * 1000;
  // إضافة دقيقتين buffer لحساب وقت إدخال السجل الأخير في كل جلسة
  const RECORD_BUFFER_MS = 2 * 60 * 1000;

  // صباح: 6:00–13:59 بتوقيت مكة (UTC+3)
  function isMorningTS(ts: Date): boolean {
    const meccaHour = (ts.getUTCHours() + 3) % 24;
    return meccaHour >= 6 && meccaHour < 14;
  }

  const result = allDataEntryUsers.map(user => {
    const recs = todayRecords
      .filter(r => r.enteredById === user.id)
      .map(r => new Date(r.createdAt))
      .sort((a, b) => a.getTime() - b.getTime());

    if (recs.length === 0) {
      return { userId: user.id, userName: user.name, morningMinutes: 0, eveningMinutes: 0, totalMinutes: 0, lastActive: null };
    }

    // تجميع السجلات في جلسات عمل بناءً على الفجوة الزمنية
    type WorkSession = { stamps: Date[]; morning: boolean };
    const sessions: WorkSession[] = [];
    let cur: WorkSession = { stamps: [recs[0]], morning: isMorningTS(recs[0]) };

    for (let i = 1; i < recs.length; i++) {
      const gap = recs[i].getTime() - recs[i - 1].getTime();
      if (gap > SESSION_GAP_MS) {
        sessions.push(cur);
        cur = { stamps: [recs[i]], morning: isMorningTS(recs[i]) };
      } else {
        cur.stamps.push(recs[i]);
      }
    }
    sessions.push(cur);

    let morningMinutes = 0;
    let eveningMinutes = 0;

    for (const s of sessions) {
      const first = s.stamps[0];
      const last = s.stamps[s.stamps.length - 1];
      const durationMin = ((last.getTime() - first.getTime()) + RECORD_BUFFER_MS) / 60000;
      if (s.morning) morningMinutes += durationMin;
      else eveningMinutes += durationMin;
    }

    const lastActive = recs[recs.length - 1];

    return {
      userId: user.id,
      userName: user.name,
      morningMinutes: Math.round(morningMinutes * 10) / 10,
      eveningMinutes: Math.round(eveningMinutes * 10) / 10,
      totalMinutes: Math.round((morningMinutes + eveningMinutes) * 10) / 10,
      lastActive: lastActive.toISOString(),
    };
  });

  res.json(result);
});

// GET /api/data-entry/sessions/range — إحصائيات نطاق تاريخي (للقائدة والنائبة)
// يرجع لكل مُدخِلة: إجمالي الأسبوع + تفصيل يومي
router.get("/data-entry/sessions/range", authenticate, async (req, res): Promise<void> => {
  if (!["leader", "deputy"].includes(req.userRole!)) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  const { dateFrom, dateTo } = req.query as Record<string, string>;
  const today = getMeccaTodayServer();
  const from = dateFrom ?? today;
  const to = dateTo ?? today;

  const [sessions, allDataEntryUsers] = await Promise.all([
    db.select().from(dataEntrySessionsTable)
      .where(gte(dataEntrySessionsTable.date, from))
      .then(rows => rows.filter(s => s.date <= to)),
    db.select().from(usersTable)
      .where(and(eq(usersTable.role, "data_entry"), eq(usersTable.isArchived, false))),
  ]);

  // Build sorted list of dates in range
  const dates: string[] = [];
  const cur = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (cur <= end) {
    dates.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }

  const result = allDataEntryUsers.map(user => {
    const userSessions = sessions.filter(s => s.userId === user.id);
    const totalMorning = userSessions.reduce((sum, s) => sum + s.morningMinutes, 0);
    const totalEvening = userSessions.reduce((sum, s) => sum + s.eveningMinutes, 0);

    // Per-day breakdown
    const byDay = dates.map(date => {
      const day = userSessions.find(s => s.date === date);
      return {
        date,
        morningMinutes: Math.round((day?.morningMinutes ?? 0) * 10) / 10,
        eveningMinutes: Math.round((day?.eveningMinutes ?? 0) * 10) / 10,
        totalMinutes: Math.round(((day?.morningMinutes ?? 0) + (day?.eveningMinutes ?? 0)) * 10) / 10,
      };
    });

    return {
      userId: user.id,
      userName: user.name,
      morningMinutes: Math.round(totalMorning * 10) / 10,
      eveningMinutes: Math.round(totalEvening * 10) / 10,
      totalMinutes: Math.round((totalMorning + totalEvening) * 10) / 10,
      activeDays: userSessions.length,
      byDay,
    };
  });

  res.json(result);
});

// GET /api/data-entry/daily-log?date=YYYY-MM-DD
// لكل مدخلة بيانات: مدة الجلسة + تفصيل كل حلقة (عبّأت/ما عبّأت، مكتملة/ناقصة)
router.get("/data-entry/daily-log", authenticate, async (req, res): Promise<void> => {
  if (!["leader", "deputy"].includes(req.userRole!)) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  const today = getMeccaTodayServer();
  const date = (typeof req.query.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date))
    ? req.query.date : today;

  const SESSION_GAP_MS = 15 * 60 * 1000;
  const RECORD_BUFFER_MS = 2 * 60 * 1000;

  function isMorningTS(ts: Date): boolean {
    const meccaHour = (ts.getUTCHours() + 3) % 24;
    return meccaHour >= 6 && meccaHour < 14;
  }

  const [allDataEntryUsers, allAssignments, allCircles, dayRecords, allStudents] = await Promise.all([
    db.select({ id: usersTable.id, name: usersTable.name })
      .from(usersTable)
      .where(and(eq(usersTable.role, "data_entry"), eq(usersTable.isArchived, false))),
    db.select().from(dataEntryCircleAssignmentsTable),
    db.select({ id: circlesTable.id, name: circlesTable.name, track: circlesTable.track })
      .from(circlesTable)
      .where(eq(circlesTable.isArchived, false)),
    db.select({
      studentId: recordsTable.studentId,
      circleId: recordsTable.circleId,
      enteredById: recordsTable.enteredById,
      createdAt: recordsTable.createdAt,
    }).from(recordsTable).where(eq(recordsTable.date, date)),
    db.select({ id: studentsTable.id, circleId: studentsTable.circleId })
      .from(studentsTable)
      .where(eq(studentsTable.isArchived, false)),
  ]);

  type DEUser    = { id: number; name: string };
  type DECircle  = { id: number; name: string; track: string };
  type DERecord  = { studentId: number; circleId: number; enteredById: number | null; createdAt: Date };
  type DEStudent = { id: number; circleId: number };
  type DEAssign  = typeof dataEntryCircleAssignmentsTable.$inferSelect;

  const result = (allDataEntryUsers as DEUser[]).map((user: DEUser) => {
    // حلقاتها المُسندة — إذا ما فيه إسناد تعتبر مسؤولة عن كل الحلقات
    const assignedIds = (allAssignments as DEAssign[])
      .filter((a: DEAssign) => a.dataEntryUserId === user.id)
      .map((a: DEAssign) => a.circleId);
    const userCircles = assignedIds.length > 0
      ? (allCircles as DECircle[]).filter((c: DECircle) => assignedIds.includes(c.id))
      : (allCircles as DECircle[]);

    // مدة الجلسة من توقيتات إنشاء السجلات (نفس خوارزمية sessions/today)
    const stamps = (dayRecords as DERecord[])
      .filter((r: DERecord) => r.enteredById === user.id)
      .map((r: DERecord) => new Date(r.createdAt))
      .sort((a: Date, b: Date) => a.getTime() - b.getTime());

    let morningMinutes = 0;
    let eveningMinutes = 0;

    if (stamps.length > 0) {
      type WorkSeg = { stamps: Date[]; morning: boolean };
      const segs: WorkSeg[] = [];
      let cur: WorkSeg = { stamps: [stamps[0]!], morning: isMorningTS(stamps[0]!) };
      for (let i = 1; i < stamps.length; i++) {
        if (stamps[i]!.getTime() - stamps[i - 1]!.getTime() > SESSION_GAP_MS) {
          segs.push(cur);
          cur = { stamps: [stamps[i]!], morning: isMorningTS(stamps[i]!) };
        } else {
          cur.stamps.push(stamps[i]!);
        }
      }
      segs.push(cur);
      for (const s of segs) {
        const dur = (s.stamps[s.stamps.length - 1]!.getTime() - s.stamps[0]!.getTime() + RECORD_BUFFER_MS) / 60000;
        if (s.morning) morningMinutes += dur; else eveningMinutes += dur;
      }
    }

    // إحصائيات كل حلقة
    const circles = userCircles.map((circle: DECircle) => {
      const totalStudents = (allStudents as DEStudent[]).filter((s: DEStudent) => s.circleId === circle.id).length;
      const circleRecords = (dayRecords as DERecord[]).filter((r: DERecord) => r.circleId === circle.id);
      const enteredStudentIds = new Set(circleRecords.map((r: DERecord) => r.studentId));
      const enteredCount = enteredStudentIds.size;
      const missingCount = totalStudents - enteredCount;
      const enteredByUser = circleRecords.some((r: DERecord) => r.enteredById === user.id);
      return {
        circleId: circle.id,
        circleName: circle.name,
        track: circle.track,
        totalStudents,
        enteredCount,
        missingCount,
        completed: totalStudents > 0 && missingCount === 0,
        enteredByUser,
      };
    });

    return {
      userId: user.id,
      userName: user.name,
      morningMinutes: Math.round(morningMinutes * 10) / 10,
      eveningMinutes: Math.round(eveningMinutes * 10) / 10,
      totalMinutes: Math.round((morningMinutes + eveningMinutes) * 10) / 10,
      enteredAny: circles.some((c: { enteredByUser: boolean }) => c.enteredByUser),
      allCompleted: circles.length > 0 && circles.every((c: { completed: boolean }) => c.completed),
      circles,
    };
  });

  res.json({ date, users: result });
});

export default router;
