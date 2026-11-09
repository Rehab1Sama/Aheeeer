// ============================================================================
// راوت "المتميزات" — لمسؤولة المسار فقط: قسم أسبوعي وقسم شهري، يعرض كل طالبة
// بمسارها ما غابت طوال الفترة المختارة. لو عندها تقصير (من نظام التقصير
// التلقائي الموجود أصلاً بـ shortcomings.ts) بأي يوم من الفترة، تظهر معه ملاحظة
// تلقائية بدل استبعادها من القائمة.
// ============================================================================

import { Router, type IRouter } from "express";
import { db, recordsTable, studentsTable, circlesTable } from "@workspace/db";
import { eq, and, gte, lte, inArray } from "drizzle-orm";
import { authenticate } from "../middlewares/authenticate";
import { getMakkahDay, addDaysStr } from "../lib/date";
import { computeShortcoming } from "./shortcomings";

const router: IRouter = Router();

interface MeritStudent {
  studentId: number;
  studentName: string;
  circleId: number;
  circleName: string;
  note: string | null;
}

async function getMyTrackCircles(userTrack: string) {
  const circles = await db.select({
    id: circlesTable.id,
    name: circlesTable.name,
    track: circlesTable.track,
    trackType: circlesTable.trackType,
  }).from(circlesTable).where(and(eq(circlesTable.track, userTrack), eq(circlesTable.isArchived, false)));
  return circles;
}

async function buildMerits(
  circles: { id: number; name: string; trackType: string | null }[],
  dateFrom: string,
  dateTo: string,
): Promise<MeritStudent[]> {
  const circleIds = circles.map(c => c.id);
  if (circleIds.length === 0) return [];
  const circleById = new Map(circles.map(c => [c.id, c]));

  const records = await db.select().from(recordsTable).where(and(
    gte(recordsTable.date, dateFrom),
    lte(recordsTable.date, dateTo),
    inArray(recordsTable.circleId, circleIds),
  ));
  if (records.length === 0) return [];

  const studentIds = [...new Set(records.map(r => r.studentId))];
  const students = await db.select({
    id: studentsTable.id,
    fullName: studentsTable.fullName,
    isNewcomer: studentsTable.isNewcomer,
    createdAt: studentsTable.createdAt,
    isArchived: studentsTable.isArchived,
  }).from(studentsTable).where(inArray(studentsTable.id, studentIds));
  const studentMap = new Map(students.map(s => [s.id, s]));

  const byStudent = new Map<number, typeof records>();
  for (const r of records) {
    if (!byStudent.has(r.studentId)) byStudent.set(r.studentId, []);
    byStudent.get(r.studentId)!.push(r);
  }

  const result: MeritStudent[] = [];
  for (const [studentId, recs] of byStudent) {
    const student = studentMap.get(studentId);
    if (!student || student.isArchived) continue; // طالبة مؤرشفة لا تظهر بالمتميزات

    const hasAbsence = recs.some(r => r.isAbsent);
    if (hasAbsence) continue; // مو من المتميزات هذي الفترة — عندها غياب

    const shortcomingDates: string[] = [];
    for (const r of recs) {
      const circle = circleById.get(r.circleId);
      const { isShortcoming } = computeShortcoming(
        r, circle?.trackType, student.isNewcomer ?? false, student.createdAt ?? null,
      );
      if (isShortcoming) shortcomingDates.push(r.date);
    }

    const lastRecord = recs[recs.length - 1];
    const circle = circleById.get(lastRecord.circleId);

    result.push({
      studentId,
      studentName: student.fullName,
      circleId: lastRecord.circleId,
      circleName: circle?.name ?? "—",
      note: shortcomingDates.length > 0
        ? `لديها تقصير بتاريخ: ${shortcomingDates.sort().join("، ")}`
        : null,
    });
  }

  return result.sort((a, b) => a.studentName.localeCompare(b.studentName, "ar", { numeric: true }));
}

function assertAccess(role?: string): boolean {
  return role === "track_supervisor";
}

// GET /distinguished-students/weekly?date=YYYY-MM-DD
// أي تاريخ ضمن الأسبوع المطلوب — يُحسب أحد ذاك الأسبوع تلقائيًا (الأسبوع = الأحد للخميس).
router.get("/distinguished-students/weekly", authenticate, async (req, res): Promise<void> => {
  if (!assertAccess(req.userRole)) { res.status(403).json({ error: "Forbidden" }); return; }
  if (!req.userTrack) { res.json({ weekStart: null, weekEnd: null, students: [] }); return; }

  const { date } = req.query as { date?: string };
  const refStr = date ?? getMakkahDay();
  const ref = new Date(refStr + "T12:00:00Z");
  const dow = ref.getUTCDay(); // الأحد=0 ... السبت=6
  const sunday = new Date(ref);
  sunday.setUTCDate(ref.getUTCDate() - dow);
  const weekStart = sunday.toISOString().slice(0, 10);
  const weekEnd = addDaysStr(weekStart, 4);

  const circles = await getMyTrackCircles(req.userTrack);
  const students = await buildMerits(circles, weekStart, weekEnd);
  res.json({ weekStart, weekEnd, students });
});

// GET /distinguished-students/monthly?month=YYYY-MM
router.get("/distinguished-students/monthly", authenticate, async (req, res): Promise<void> => {
  if (!assertAccess(req.userRole)) { res.status(403).json({ error: "Forbidden" }); return; }
  if (!req.userTrack) { res.json({ month: null, monthStart: null, monthEnd: null, students: [] }); return; }

  const { month } = req.query as { month?: string }; // "YYYY-MM"
  const ref = month && /^\d{4}-\d{2}$/.test(month) ? month : getMakkahDay().slice(0, 7);
  const [y, m] = ref.split("-").map(Number);
  const monthStart = `${ref}-01`;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate(); // آخر يوم بالشهر
  const monthEnd = `${ref}-${String(lastDay).padStart(2, "0")}`;

  const circles = await getMyTrackCircles(req.userTrack);
  const students = await buildMerits(circles, monthStart, monthEnd);
  res.json({ month: ref, monthStart, monthEnd, students });
});

export default router;
