import { Router, type IRouter } from "express";
import { db, recordsTable, studentsTable, circlesTable } from "@workspace/db";
import { eq, and, gte, lte, inArray } from "drizzle-orm";
import { authenticate } from "../middlewares/authenticate";
import { getMakkahWeekStart, normalizeToSunday, addDaysStr } from "../lib/date";

const router: IRouter = Router();

// يجمع عدد الغيابات لكل حلقة (id) خلال [from, to] من جدول السجلات، لمجموعة circleIds مُعطاة
async function countAbsencesByCircle(circleIds: number[], from: string, to: string): Promise<Map<number, number>> {
  const countByCircle = new Map<number, number>();
  if (circleIds.length === 0) return countByCircle;
  const absenceRecords = await db.select({ circleId: recordsTable.circleId }).from(recordsTable).where(
    and(
      eq(recordsTable.isAbsent, true),
      gte(recordsTable.date, from),
      lte(recordsTable.date, to),
      inArray(recordsTable.circleId, circleIds),
    )
  );
  for (const r of absenceRecords) {
    countByCircle.set(r.circleId, (countByCircle.get(r.circleId) ?? 0) + 1);
  }
  return countByCircle;
}

// يرجّع مجموعة الحلقات (id) اللي عندها إدخال بيانات فعلي (أي سجل، حاضر أو غايب)
// خلال [from, to] — نستخدمها عشان نميّز "صفر غياب فعلي" عن "ما فيه إدخال بيانات أصلًا"
async function circlesWithAnyRecord(circleIds: number[], from: string, to: string): Promise<Set<number>> {
  const result = new Set<number>();
  if (circleIds.length === 0) return result;
  const rows = await db.select({ circleId: recordsTable.circleId }).from(recordsTable).where(
    and(gte(recordsTable.date, from), lte(recordsTable.date, to), inArray(recordsTable.circleId, circleIds))
  );
  for (const r of rows) result.add(r.circleId);
  return result;
}

router.get("/attendance/today", authenticate, async (req, res): Promise<void> => {
  const today = new Date().toISOString().slice(0, 10);
  const trackFilter = req.query.track as string | undefined;

  const records = await db.select().from(recordsTable).where(
    and(eq(recordsTable.date, today), eq(recordsTable.isAbsent, true))
  );

  const students = await db.select().from(studentsTable);
  const circles = await db.select().from(circlesTable);

  let absentStudents = records.map(r => {
    const student = students.find(s => s.id === r.studentId);
    const circle = circles.find(c => c.id === r.circleId);
    return {
      studentId: r.studentId,
      studentName: student?.fullName ?? "غير معروف",
      circleName: circle?.name ?? "غير معروف",
      track: circle?.track ?? "",
      phone: student?.phone ?? null,
    };
  });

  // الطالبة: ترجع غياباتها فقط
  if (req.userRole === "student") {
    const sId = req.userStudentId;
    if (!sId) { res.json({ date: today, totalAbsent: 0, absentStudents: [], circlesWithNoData: [] }); return; }
    const mine = absentStudents.filter(a => a.studentId === sId);
    res.json({ date: today, totalAbsent: mine.length, absentStudents: mine, circlesWithNoData: [] });
    return;
  }

  if (trackFilter) {
    absentStudents = absentStudents.filter(a => a.track.startsWith(trackFilter));
  }
  if (req.userRole === "track_supervisor" && req.userTrack) {
    absentStudents = absentStudents.filter(a => a.track.startsWith(req.userTrack!));
  }

  // Find circles with no data today
  const circlesWithData = new Set(
    (await db.select().from(recordsTable).where(eq(recordsTable.date, today))).map(r => r.circleId)
  );
  let allCircles = circles.filter(c => !c.isArchived && c.trackType !== "archive" && c.trackType !== "registration");
  if (req.userRole === "track_supervisor" && req.userTrack) {
    allCircles = allCircles.filter(c => c.track.startsWith(req.userTrack!));
  }
  const circlesWithNoData = allCircles.filter(c => !circlesWithData.has(c.id)).map(c => c.name);

  res.json({ date: today, totalAbsent: absentStudents.length, absentStudents, circlesWithNoData });
});

router.get("/attendance/repeated-absences", authenticate, async (req, res): Promise<void> => {
  const { minAbsences = "3", dateFrom, dateTo } = req.query as Record<string, string | undefined>;
  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const fromDate = dateFrom ?? weekAgo;
  const toDate = dateTo ?? today;

  const records = await db.select().from(recordsTable).where(
    and(
      eq(recordsTable.isAbsent, true),
      gte(recordsTable.date, fromDate),
      lte(recordsTable.date, toDate)
    )
  );

  const students = await db.select().from(studentsTable);
  const circles = await db.select().from(circlesTable);

  const countMap: Record<number, number> = {};
  for (const r of records) {
    countMap[r.studentId] = (countMap[r.studentId] ?? 0) + 1;
  }

  const threshold = parseInt(minAbsences, 10);
  const result = Object.entries(countMap)
    .filter(([, count]) => count >= threshold)
    .map(([studentId, count]) => {
      const student = students.find(s => s.id === parseInt(studentId, 10));
      const circle = student?.circleId ? circles.find(c => c.id === student.circleId) : null;
      return {
        studentId: parseInt(studentId, 10),
        studentName: student?.fullName ?? "غير معروف",
        circleName: circle?.name ?? "غير معروف",
        track: circle?.track ?? "",
        absenceCount: count,
        phone: student?.phone ?? null,
      };
    })
    .sort((a, b) => b.absenceCount - a.absenceCount);

  let filtered = result;
  if (req.userRole === "student") {
    const sId = req.userStudentId;
    if (!sId) { res.json([]); return; }
    filtered = result.filter(r => r.studentId === sId);
  } else if (req.userRole === "track_supervisor" && req.userTrack) {
    filtered = result.filter(r => r.track.startsWith(req.userTrack!));
  }

  // فلترة صارمة بـ circleId من الرابط
  const circleIdParam = req.query.circleId as string | undefined;
  if (circleIdParam) {
    const cid = parseInt(circleIdParam, 10);
    filtered = filtered.filter(r => {
      const student = students.find(s => s.id === r.studentId);
      return student?.circleId === cid;
    });
  }

  res.json(filtered);
});

// GET /api/attendance/weekly-circle-groups?weekStart=YYYY-MM-DD&track=اسم المسار
// يرجّع الحلقات مقسّمة حسب عدد الغيابات خلال الأسبوع (الأحد للخميس)، مع مقارنة بالأسبوع السابق:
// { weekStart, weekEnd, availableTracks: [...], groups: { "0": [...], "1": [...], ... "5+": [...] } }
// كل عنصر حلقة: { id, name, track, absenceCount, prevAbsenceCount, trend: "improved" | "worse" | "same" }
router.get("/attendance/weekly-circle-groups", authenticate, async (req, res): Promise<void> => {
  const allowedRoles = ["leader", "deputy"];
  if (!allowedRoles.includes(req.userRole ?? "")) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const weekStartParam = req.query.weekStart as string | undefined;
  const weekStart = normalizeToSunday(
    weekStartParam && /^\d{4}-\d{2}-\d{2}$/.test(weekStartParam) ? weekStartParam : getMakkahWeekStart()
  );
  const weekEnd = addDaysStr(weekStart, 4); // الخميس
  const prevWeekStart = addDaysStr(weekStart, -7);
  const prevWeekEnd = addDaysStr(weekStart, -3); // خميس الأسبوع السابق

  let circles = await db.select({
    id: circlesTable.id,
    name: circlesTable.name,
    track: circlesTable.track,
    trackType: circlesTable.trackType,
  }).from(circlesTable).where(eq(circlesTable.isArchived, false));

  circles = circles.filter(c => c.trackType !== "archive" && c.trackType !== "registration");

  if (req.userRole === "track_supervisor" && req.userTrack) {
    circles = circles.filter(c => c.track.startsWith(req.userTrack!));
  }

  // قائمة المسارات المتاحة للفلترة (قبل تطبيق فلتر track نفسه، عشان القائمة ما تفضى)
  const availableTracks = Array.from(new Set(circles.map(c => c.track))).sort((a, b) => a.localeCompare(b, "ar"));

  const trackFilter = req.query.track as string | undefined;
  if (trackFilter) {
    circles = circles.filter(c => c.track === trackFilter);
  }

  const circleIds = circles.map(c => c.id);
  const [countByCircle, prevCountByCircle, hasDataThisWeek] = await Promise.all([
    countAbsencesByCircle(circleIds, weekStart, weekEnd),
    countAbsencesByCircle(circleIds, prevWeekStart, prevWeekEnd),
    circlesWithAnyRecord(circleIds, weekStart, weekEnd),
  ]);

  const groups: Record<string, { id: number; name: string; track: string; absenceCount: number; prevAbsenceCount: number; trend: "improved" | "worse" | "same" }[]> = {
    "0": [], "1": [], "2": [], "3": [], "4": [], "5+": [],
  };
  // حلقات بدون أي إدخال بيانات فعلي هالأسبوع — لا تدخل أي مجموعة (خصوصًا "صفر غياب"،
  // اللي كانت تُحسب افتراضيًا = 0 غياب حتى لو ما فيه أي إدخال أصلًا)
  const noData: { id: number; name: string; track: string }[] = [];
  for (const c of circles) {
    if (!hasDataThisWeek.has(c.id)) { noData.push({ id: c.id, name: c.name, track: c.track }); continue; }
    const count = countByCircle.get(c.id) ?? 0;
    const prevCount = prevCountByCircle.get(c.id) ?? 0;
    const trend: "improved" | "worse" | "same" = count < prevCount ? "improved" : count > prevCount ? "worse" : "same";
    const key = count >= 5 ? "5+" : String(count);
    groups[key].push({ id: c.id, name: c.name, track: c.track, absenceCount: count, prevAbsenceCount: prevCount, trend });
  }
  for (const key of Object.keys(groups)) {
    groups[key].sort((a, b) => a.name.localeCompare(b.name, "ar"));
  }
  noData.sort((a, b) => a.name.localeCompare(b.name, "ar"));

  res.json({ weekStart, weekEnd, availableTracks, groups, noData });
});

export default router;
