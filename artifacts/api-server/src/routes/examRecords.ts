import { Router, type IRouter } from "express";
import { db, examRecordsTable, studentsTable, studentMemorizationsTable, studentEnrollmentsTable, usersTable, recordsTable, circlesTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { authenticate } from "../middlewares/authenticate";

const router: IRouter = Router();

// Cumulative memorize-pages (wajhs) at the END of each of the 30 juzs
// Derived from actual mushaf al-Madinah page boundaries, NOT simple multiples of 20
// Juz starts (surah:ayah → wajh): 1:1→1, 2:142→22, 2:253→42, 3:93→62, 4:25→82.5,
//   4:148→102, 5:82→121.5, 6:111→142, 7:88→162, 8:41→182, 9:93→201.5, 11:7→222,
//   12:53→242, 15:1→262, 17:1→282, 18:75→302, 21:1→322, 23:1→342, 25:21→362,
//   27:56→382, 29:46→402, 33:31→422, 36:28→442, 39:32→462, 41:47→482, 46:1→502.5,
//   51:31→522, 58:1→542, 67:1→562, 78:1→582. End of mushaf = wajh 604.
// Formula: cumulativePages[N] = JUZ_START[N+1] - 1   (for N=1..29), last = 603.5
const JUZ_CUMULATIVE = [
  21, 41, 61, 81.5, 101, 120.5, 141, 161, 181, 200.5,
  221, 241, 261, 281, 301, 321, 341, 361, 381, 401,
  421, 441, 461, 481, 501.5, 521, 541, 561, 581, 603.5,
];

function getJuzStats(totalPages: number): { juzCompleted: number; nearCompletion: boolean; atJuzBoundary: boolean } {
  let juzCompleted = 0;
  for (let i = 0; i < JUZ_CUMULATIVE.length; i++) {
    if (totalPages >= JUZ_CUMULATIVE[i]) juzCompleted = i + 1;
    else break;
  }
  const nextTarget = juzCompleted < 30 ? JUZ_CUMULATIVE[juzCompleted] : null;
  const nearCompletion = nextTarget !== null && (nextTarget - totalPages) <= 3 && totalPages < nextTarget;
  const lastTarget = juzCompleted > 0 ? JUZ_CUMULATIVE[juzCompleted - 1] : null;
  const atJuzBoundary = lastTarget !== null && (totalPages - lastTarget) <= 2;
  return { juzCompleted, nearCompletion, atJuzBoundary };
}

async function getTrackStudentIds(req: Express.Request): Promise<Set<number> | null> {
  if (req.userRole !== "track_supervisor") return null;
  if (!req.userTrack) return new Set();
  const rows = await db.select({ studentId: studentEnrollmentsTable.studentId })
    .from(studentEnrollmentsTable)
    .innerJoin(circlesTable, eq(circlesTable.id, studentEnrollmentsTable.circleId))
    .where(and(
      eq(studentEnrollmentsTable.isArchived, false),
      eq(circlesTable.track, req.userTrack),
    ));
  return new Set(rows.map(row => row.studentId));
}

async function canAccessExamStudent(req: Express.Request, studentId: number): Promise<boolean> {
  const allowedIds = await getTrackStudentIds(req);
  return allowedIds === null || allowedIds.has(studentId);
}

router.get("/exam-records", authenticate, async (req, res): Promise<void> => {
  const allowed = ["leader", "track_supervisor", "volunteer", "exam_supervisor"];
  if (!allowed.includes(req.userRole!)) { res.status(403).json({ error: "Forbidden" }); return; }
  const { studentId } = req.query as { studentId?: string };

  const allStudents = await db.select().from(studentsTable);
  const allUsers = await db.select().from(usersTable);
  const allowedStudentIds = await getTrackStudentIds(req);
  const studentMap: Record<number, string> = {};
  allStudents.forEach(s => { studentMap[s.id] = s.fullName; });
  const userMap: Record<number, string> = {};
  allUsers.forEach(u => { userMap[u.id] = u.name; });

  let records = await db.select().from(examRecordsTable).orderBy(desc(examRecordsTable.date));
  if (studentId) records = records.filter(r => r.studentId === parseInt(studentId));
  if (allowedStudentIds !== null) records = records.filter(record => allowedStudentIds.has(record.studentId));

  res.json(records.map(r => ({
    ...r,
    studentName: studentMap[r.studentId] ?? "غير معروف",
    examinerName: userMap[r.examinerId] ?? "غير معروف",
    createdAt: r.createdAt.toISOString(),
  })));
});

router.post("/exam-records", authenticate, async (req, res): Promise<void> => {
  if (!["volunteer", "exam_supervisor", "leader", "track_supervisor"].includes(req.userRole!)) { res.status(403).json({ error: "Forbidden" }); return; }
  const { studentId, date, juzNumber, responded, grade, notes } = req.body;
  if (!studentId || !date) { res.status(400).json({ error: "studentId, date required" }); return; }
  if (!(await canAccessExamStudent(req, studentId))) {
    res.status(403).json({ error: "الطالبة خارج نطاق المسار" }); return;
  }
  const [row] = await db.insert(examRecordsTable).values({
    studentId, examinerId: req.userId!, date, juzNumber: juzNumber ?? null,
    responded: responded ?? false, grade: grade ?? null, notes: notes ?? null,
  }).returning();
  const student = await db.select().from(studentsTable).where(eq(studentsTable.id, studentId));
  const examiner = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!));
  res.status(201).json({
    ...row, createdAt: row.createdAt.toISOString(),
    studentName: student[0]?.fullName ?? "غير معروف",
    examinerName: examiner[0]?.name ?? "غير معروف",
  });
});

router.patch("/exam-records/:id", authenticate, async (req, res): Promise<void> => {
  if (!["volunteer", "exam_supervisor", "leader", "track_supervisor"].includes(req.userRole!)) { res.status(403).json({ error: "Forbidden" }); return; }
  const id = parseInt(req.params.id as string);
  const [existing] = await db.select().from(examRecordsTable).where(eq(examRecordsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Exam record not found" }); return; }
  if (!(await canAccessExamStudent(req, existing.studentId))) {
    res.status(403).json({ error: "الطالبة خارج نطاق المسار" }); return;
  }
  const { juzNumber, responded, grade, notes } = req.body;
  const [row] = await db.update(examRecordsTable).set({ juzNumber, responded, grade, notes }).where(eq(examRecordsTable.id, id)).returning();
  res.json({ ...row, createdAt: row.createdAt.toISOString() });
});

router.delete("/exam-records/:id", authenticate, async (req, res): Promise<void> => {
  if (!["volunteer", "exam_supervisor", "leader"].includes(req.userRole!)) { res.status(403).json({ error: "Forbidden" }); return; }
  await db.delete(examRecordsTable).where(eq(examRecordsTable.id, parseInt(req.params.id as string)));
  res.status(204).send();
});

router.get("/volunteer/near-completion", authenticate, async (req, res): Promise<void> => {
  const allowed = ["leader", "track_supervisor", "volunteer", "exam_supervisor", "teacher", "student"];
  if (!allowed.includes(req.userRole!)) { res.status(403).json({ error: "Forbidden" }); return; }

  const role = req.userRole!;

  // For student: look up their own record by phone number
  if (role === "student") {
    const [currentUser] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!));
    if (!currentUser?.phone) { res.json([]); return; }

    const [student] = await db.select().from(studentsTable)
      .where(and(eq(studentsTable.phone, currentUser.phone), eq(studentsTable.isArchived, false)));
    if (!student) { res.json([]); return; }

    const allCircles = await db.select().from(circlesTable);
    const circleMap: Record<number, string> = {};
    allCircles.forEach(c => { circleMap[c.id] = c.name; });

    const sRecords = await db.select().from(recordsTable)
      .where(and(eq(recordsTable.studentId, student.id), eq(recordsTable.isAbsent, false)));
    const historical = await db.select({ pages: studentMemorizationsTable.pages }).from(studentMemorizationsTable)
      .where(eq(studentMemorizationsTable.studentId, student.id));
    const totalPages = Math.round((sRecords.reduce((a, r) => a + (r.memorizePages ?? 0), 0)
      + historical.reduce((a, r) => a + (r.pages ?? 0), 0)) * 2) / 2;
    const { juzCompleted, nearCompletion, atJuzBoundary } = getJuzStats(totalPages);
    const hasExamRecord = (await db.select().from(examRecordsTable).where(eq(examRecordsTable.studentId, student.id))).length > 0;

    res.json([{
      studentId: student.id,
      studentName: student.fullName,
      phone: student.phone,
      circleName: student.circleId ? (circleMap[student.circleId] ?? "غير معروف") : "غير معروف",
      totalMemorizePages: totalPages,
      juzCompleted,
      nearCompletion,
      atJuzBoundary,
      hasExamRecord,
    }]);
    return;
  }

  // فلترة بـ circleId من الرابط إن وُجد، وإلا فلترة بالدور
  const circleIdParam = req.query.circleId as string | undefined;
  let allStudents;
  if (circleIdParam) {
    const cid = parseInt(circleIdParam, 10);
    if (role === "track_supervisor") {
      const [circle] = await db.select({ track: circlesTable.track }).from(circlesTable).where(eq(circlesTable.id, cid));
      if (!circle || circle.track !== req.userTrack) {
        res.status(403).json({ error: "الحلقة خارج نطاق المسار" }); return;
      }
    }
    allStudents = await db.select().from(studentsTable)
      .where(and(eq(studentsTable.isArchived, false), eq(studentsTable.circleId, cid)));
  } else if (role === "teacher" && req.userCircleId) {
    allStudents = await db.select().from(studentsTable)
      .where(and(eq(studentsTable.isArchived, false), eq(studentsTable.circleId, req.userCircleId)));
  } else {
    allStudents = await db.select().from(studentsTable).where(eq(studentsTable.isArchived, false));
  }
  const allowedStudentIds = await getTrackStudentIds(req);
  if (allowedStudentIds !== null) {
    allStudents = allStudents.filter(student => allowedStudentIds.has(student.id));
  }

  const allRecords = await db.select().from(recordsTable);
  const allMemorizations = await db.select().from(studentMemorizationsTable);
  const allCircles = await db.select().from(circlesTable);
  const allExams = await db.select().from(examRecordsTable);
  const circleMap: Record<number, string> = {};
  allCircles.forEach(c => { circleMap[c.id] = c.name; });

  const result = allStudents
    .filter(s => s.circleId != null)
    .map(s => {
      const sRecords = allRecords.filter(r => r.studentId === s.id && !r.isAbsent);
      const totalPages = Math.round((
        sRecords.reduce((a, r) => a + (r.memorizePages ?? 0), 0)
        + allMemorizations.filter(m => m.studentId === s.id).reduce((a, m) => a + (m.pages ?? 0), 0)
      ) * 2) / 2;
      const { juzCompleted, nearCompletion, atJuzBoundary } = getJuzStats(totalPages);
      const hasExamRecord = allExams.some(e => e.studentId === s.id);
      return {
        studentId: s.id,
        studentName: s.fullName,
        phone: s.phone,
        circleName: circleMap[s.circleId!] ?? "غير معروف",
        totalMemorizePages: totalPages,
        juzCompleted,
        nearCompletion,
        atJuzBoundary,
        hasExamRecord,
      };
    })
    .filter(s => s.nearCompletion || s.atJuzBoundary || s.hasExamRecord)
    .sort((a, b) => b.totalMemorizePages - a.totalMemorizePages);

  res.json(result);
});

export default router;
