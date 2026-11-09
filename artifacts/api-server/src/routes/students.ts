import { Router, type IRouter } from "express";
import { db, studentsTable, circlesTable, studentTransfersTable, studentNotesTable, studentMemorizationsTable, messagesTable, recordsTable, usersTable, studentArchiveEventsTable, studentLeaveHistoryTable, studentEnrollmentsTable, dataEntryCircleAssignmentsTable } from "@workspace/db";
import { eq, and, gte, desc, sql, ne, isNull, inArray } from "drizzle-orm";
import { isShortcomingRecord } from "../lib/shortcoming";
import { authenticate } from "../middlewares/authenticate";
import { canAccessStudent, canAccessCircle, accessibleCircleIds } from "../lib/access";
import { CreateStudentBody, UpdateStudentBody } from "@workspace/api-zod";
import { getMakkahDay, getMakkahDaysAgo } from "../lib/date";

const router: IRouter = Router();

function parseId(raw: string | string[]): number {
  return parseInt(Array.isArray(raw) ? raw[0] : raw, 10);
}

const STAFF_ROLES = ["leader", "deputy", "track_supervisor", "teacher", "supervisor"];

// الطالبة ترى زميلاتها بالاسم فقط: لا جوال ولا بيانات شخصية لغيرها (كانت تصلها في رد الخادم).
const STUDENT_PRIVATE_FIELDS = ["phone", "country", "ageRange", "educationLevel", "extraData", "memorizeFrom", "withdrawalPeriod", "withdrawalReason", "withdrawalNotes"];
function hidePrivateForStudent<T extends { id: number }>(req: Express.Request, rows: T[]): T[] {
  if (req.userRole !== "student") return rows;
  return rows.map((row) => {
    if (req.userStudentId != null && row.id === req.userStudentId) return row;
    const copy: Record<string, unknown> = { ...row };
    for (const f of STUDENT_PRIVATE_FIELDS) delete copy[f];
    return copy as T;
  });
}
const SCOPED_ROLES = ["teacher", "supervisor", "data_entry"];
const sortArabicNames = <T extends { fullName: string }>(rows: T[]): T[] =>
  [...rows].sort((a, b) => a.fullName.localeCompare(b.fullName, "ar", { numeric: true, sensitivity: "base" }));

// Cumulative wajhs at the end of each juz in Mushaf Madinah. Historical
// memorization is entered as exact complete juzs when possible, so the server
// owns the credit calculation instead of trusting a number sent by the client.
const JUZ_CUMULATIVE = [
  21, 41, 61, 81.5, 101, 120.5, 141, 161, 181, 200.5,
  221, 241, 261, 281, 301, 321, 341, 361, 381, 401,
  421, 441, 461, 481, 501.5, 521, 541, 561, 581, 603.5,
];

function normalizeDigits(value: string): string {
  return value.replace(/[٠-٩]/g, digit => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));
}

function normalizeJuzNumbers(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(Number).filter(n => Number.isInteger(n) && n >= 1 && n <= 30))]
    .sort((a, b) => a - b);
}

function pagesForJuzNumbers(juzNumbers: number[]): number {
  return Math.round(juzNumbers.reduce((total, juz) => {
    const end = JUZ_CUMULATIVE[juz - 1];
    const start = juz === 1 ? 0 : JUZ_CUMULATIVE[juz - 2];
    return total + end - start;
  }, 0) * 2) / 2;
}

function parseLegacyJuzNumbers(value: string): number[] {
  const match = normalizeDigits(value).match(/أجزاء?\s*:\s*([0-9\s،,]+)/);
  if (!match) return [];
  return [...new Set((match[1].match(/\d+/g) ?? []).map(Number).filter(n => n >= 1 && n <= 30))]
    .sort((a, b) => a - b);
}

function parseExtraData(raw: string | null): Record<string, unknown> {
  try {
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

async function ensureLegacyMemorization(student: typeof studentsTable.$inferSelect): Promise<void> {
  const extra = parseExtraData(student.extraData);
  if (extra.__memorizationMigrated === true) return;

  const legacyValue = typeof extra["المحفوظات"] === "string" ? extra["المحفوظات"].trim() : "";
  if (!legacyValue) return;

  const juzNumbers = parseLegacyJuzNumbers(legacyValue);
  await db.insert(studentMemorizationsTable).values({
    studentId: student.id,
    label: legacyValue,
    juzNumbers: juzNumbers.length ? JSON.stringify(juzNumbers) : null,
    pages: juzNumbers.length ? pagesForJuzNumbers(juzNumbers) : 0,
  }).onConflictDoNothing();

  extra.__memorizationMigrated = true;
  await db.update(studentsTable)
    .set({ extraData: JSON.stringify(extra) })
    .where(eq(studentsTable.id, student.id));
}

async function canAccessStudentMemorization(req: Express.Request, studentId: number): Promise<boolean> {
  if (SCOPED_ROLES.includes(req.userRole!)) return canAccessStudent(req, studentId);
  if (req.userRole !== "track_supervisor") return true;
  if (!req.userTrack) return false;
  const [allowed] = await db
    .select({ id: studentEnrollmentsTable.id })
    .from(studentEnrollmentsTable)
    .innerJoin(circlesTable, eq(circlesTable.id, studentEnrollmentsTable.circleId))
    .where(and(
      eq(studentEnrollmentsTable.studentId, studentId),
      eq(studentEnrollmentsTable.isArchived, false),
      eq(circlesTable.track, req.userTrack),
    ))
    .limit(1);
  if (allowed) return true;
  // طالبة في قائمة التسجيل المشتركة (أو بلا حلقة): أي مسؤولة مسار تراها لتسحبها لمسارها —
  // نفس قاعدة النقل من قائمة التسجيل. كانت تظهر لها «لم يتم العثور على الطالبة».
  const active = await db
    .select({ trackType: circlesTable.trackType })
    .from(studentEnrollmentsTable)
    .innerJoin(circlesTable, eq(circlesTable.id, studentEnrollmentsTable.circleId))
    .where(and(eq(studentEnrollmentsTable.studentId, studentId), eq(studentEnrollmentsTable.isArchived, false)));
  return active.length === 0 || active.every((e) => e.trackType === "registration");
}

function serializeMemorization(row: typeof studentMemorizationsTable.$inferSelect) {
  let juzNumbers: number[] = [];
  try { juzNumbers = normalizeJuzNumbers(row.juzNumbers ? JSON.parse(row.juzNumbers) : []); } catch { /* legacy malformed value */ }
  return {
    id: row.id,
    studentId: row.studentId,
    label: row.label,
    juzNumbers,
    pages: row.pages,
    createdById: row.createdById,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function getMemorizationCreditError(
  rows: Array<typeof studentMemorizationsTable.$inferSelect>,
  juzNumbers: number[],
  pages: number,
  exceptMemorizationId?: number,
): string | null {
  const otherRows = rows.filter(row => row.id !== exceptMemorizationId);
  const usedJuzNumbers = new Set<number>();
  for (const row of otherRows) {
    try {
      for (const juz of normalizeJuzNumbers(row.juzNumbers ? JSON.parse(row.juzNumbers) : [])) usedJuzNumbers.add(juz);
    } catch { /* malformed historical value does not block corrections */ }
  }
  if (juzNumbers.some(juz => usedJuzNumbers.has(juz))) {
    return "لا يمكن احتساب الجزء نفسه أكثر من مرة";
  }
  const total = otherRows.reduce((sum, row) => sum + (row.pages ?? 0), 0) + pages;
  return total > 604 ? "إجمالي رصيد المحفوظات لا يمكن أن يتجاوز 604 صفحات" : null;
}

// ── List students ──────────────────────────────────────────────────────────────
router.get("/students", authenticate, async (req, res): Promise<void> => {
  const circleIdRaw = req.query.circleId;
  const isArchivedRaw = req.query.isArchived;
  const q = (req.query.q as string | undefined)?.trim().toLowerCase();

  // When filtering by circleId: use enrollments as the source of truth
  if (circleIdRaw) {
    const circleId = parseInt(circleIdRaw as string, 10);
    // الطالبة لا يحق لها رؤية طالبات حلقة غير حلقتها
    if (req.userRole === "student" && circleId !== req.userCircleId) {
      res.json([]);
      return;
    }
    // المعلمة والمشرفة ومُدخلة البيانات: طالبات حلقاتهن فقط
    if (SCOPED_ROLES.includes(req.userRole!) && !await canAccessCircle(req, circleId)) {
      res.json([]);
      return;
    }
    // isArchived=true → show enrollment-archived in this circle; otherwise show active
    const wantEnrollmentArchived = isArchivedRaw === "true";
    const enrollments = await db
      .select({
        id: studentsTable.id,
        fullName: studentsTable.fullName,
        circleId: studentEnrollmentsTable.circleId,
        phone: studentsTable.phone,
        country: studentsTable.country,
        ageRange: studentsTable.ageRange,
        educationLevel: studentsTable.educationLevel,
        memorizeFrom: studentsTable.memorizeFrom,
        extraData: studentsTable.extraData,
        isArchived: studentsTable.isArchived,
        isNewcomer: studentsTable.isNewcomer,
        archivedAt: studentsTable.archivedAt,
        leaveStart: studentEnrollmentsTable.leaveStart,
        leaveEnd: studentEnrollmentsTable.leaveEnd,
        createdAt: studentsTable.createdAt,
        updatedAt: studentsTable.updatedAt,
        enrollmentId: studentEnrollmentsTable.id,
        enrollmentIsArchived: studentEnrollmentsTable.isArchived,
      })
      .from(studentsTable)
      .innerJoin(
        studentEnrollmentsTable,
        and(
          eq(studentEnrollmentsTable.studentId, studentsTable.id),
          eq(studentEnrollmentsTable.circleId, circleId),
        ),
      )
      .where(eq(studentEnrollmentsTable.isArchived, wantEnrollmentArchived));

    let result = sortArabicNames(enrollments);
    if (q) result = result.filter(s => s.fullName.toLowerCase().includes(q));
    res.json(hidePrivateForStudent(req, result));
    return;
  }

  let students = await db.select().from(studentsTable);

  if (isArchivedRaw !== undefined) {
    const archived = isArchivedRaw === "true";
    students = students.filter(s => s.isArchived === archived);
  } else {
    students = students.filter(s => !s.isArchived);
  }

  if (req.userRole === "student") {
    students = students.filter(s => s.circleId === req.userCircleId);
  } else if (SCOPED_ROLES.includes(req.userRole!)) {
    // المعلمة والمشرفة ومُدخلة البيانات: طالبات حلقاتهن فقط (بالحلقة الأساسية أو بالتسجيل)
    const scope = await accessibleCircleIds(req);
    if (scope !== "all") {
      const scopeSet = new Set(scope);
      const enrolled = scope.length
        ? await db.select({ studentId: studentEnrollmentsTable.studentId }).from(studentEnrollmentsTable)
            .where(inArray(studentEnrollmentsTable.circleId, scope))
        : [];
      const enrolledIds = new Set(enrolled.map(e => e.studentId));
      students = students.filter(s => (s.circleId != null && scopeSet.has(s.circleId)) || enrolledIds.has(s.id));
    }
  }

  if (q) {
    students = students.filter(s => s.fullName.toLowerCase().includes(q));
  }

  res.json(hidePrivateForStudent(req, sortArabicNames(students)));
});

// ── Search unassigned students (registration circle or no circle) ─────────────
// GET /students/unassigned-search?q=name
// data_entry can search by name (min 2 chars). Returns active students who are
// either in a registration/holding circle or have no circle assignment at all.
router.get("/students/unassigned-search", authenticate, async (req, res): Promise<void> => {
  if (!["leader", "deputy", "track_supervisor", "data_entry"].includes(req.userRole!)) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  const q = ((req.query.q as string) ?? "").trim();
  if (!q || q.length < 2) { res.json([]); return; }

  // Find the registration/holding circle (trackType = 'registration')
  const [regCircle] = await db.select({ id: circlesTable.id, name: circlesTable.name })
    .from(circlesTable).where(eq(circlesTable.trackType, "registration"));

  const nameFilter = sql`lower(${studentsTable.fullName}) like ${`%${q.toLowerCase()}%`}`;

  // Students in the registration circle matching the name,
  // but ONLY if they have no active non-registration enrollment
  const inReg = regCircle ? await db
    .select({
      studentId: studentsTable.id,
      fullName: studentsTable.fullName,
      phone: studentsTable.phone,
      source: sql<string>`'registration'`,
      circleName: sql<string>`${regCircle.name}`,
    })
    .from(studentsTable)
    .innerJoin(studentEnrollmentsTable, and(
      eq(studentEnrollmentsTable.studentId, studentsTable.id),
      eq(studentEnrollmentsTable.circleId, regCircle.id),
      eq(studentEnrollmentsTable.isArchived, false),
    ))
    .where(and(
      eq(studentsTable.isArchived, false),
      nameFilter,
      // Exclude students who already have an active non-registration enrollment
      sql`NOT EXISTS (
        SELECT 1 FROM ${studentEnrollmentsTable} se2
        WHERE se2.student_id = ${studentsTable.id}
          AND se2.circle_id != ${regCircle.id}
          AND se2.is_archived = false
      )`,
    )) : [];

  // Students with no circle at all matching the name,
  // and no active enrollment anywhere
  const noCircle = await db
    .select({
      studentId: studentsTable.id,
      fullName: studentsTable.fullName,
      phone: studentsTable.phone,
      source: sql<string>`'no_circle'`,
      circleName: sql<string | null>`null`,
    })
    .from(studentsTable)
    .where(and(
      isNull(studentsTable.circleId),
      eq(studentsTable.isArchived, false),
      nameFilter,
      sql`NOT EXISTS (
        SELECT 1 FROM ${studentEnrollmentsTable} se
        WHERE se.student_id = ${studentsTable.id}
          AND se.is_archived = false
      )`,
    ));

  // Deduplicate
  const regIds = new Set(inReg.map(s => s.studentId));
  const combined = [...inReg, ...noCircle.filter(s => !regIds.has(s.studentId))];
  res.json(combined);
});

// ── Global archived search (any role with data_entry access) ──────────────────
// GET /students/archived-search?q=name
// Returns archived students (globally or enrollment-archived) matching the name query.
// data_entry: name search only, min 2 chars, no bulk listing.
router.get("/students/archived-search", authenticate, async (req, res): Promise<void> => {
  if (!["leader", "deputy", "track_supervisor", "data_entry"].includes(req.userRole!)) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  const q = ((req.query.q as string) ?? "").trim();
  if (!q || q.length < 2) { res.json([]); return; }

  // Globally archived students matching the name
  const globalArchived = await db
    .select({
      studentId: studentsTable.id,
      fullName: studentsTable.fullName,
      phone: studentsTable.phone,
      isGlobalArchive: sql<boolean>`true`,
      circleId: studentsTable.circleId,
      circleName: sql<string | null>`null`,
      archivedAt: studentsTable.archivedAt,
    })
    .from(studentsTable)
    .where(and(eq(studentsTable.isArchived, true), sql`lower(${studentsTable.fullName}) like ${`%${q.toLowerCase()}%`}`));

  // Enrollment-archived students matching the name (not globally archived)
  const enrollmentArchived = await db
    .select({
      studentId: studentsTable.id,
      fullName: studentsTable.fullName,
      phone: studentsTable.phone,
      isGlobalArchive: sql<boolean>`false`,
      circleId: studentEnrollmentsTable.circleId,
      circleName: circlesTable.name,
      archivedAt: studentEnrollmentsTable.archivedAt,
      withdrawalPeriod: studentEnrollmentsTable.withdrawalPeriod,
      withdrawalReason: studentEnrollmentsTable.withdrawalReason,
      withdrawalNotes: studentEnrollmentsTable.withdrawalNotes,
    })
    .from(studentEnrollmentsTable)
    .innerJoin(studentsTable, eq(studentsTable.id, studentEnrollmentsTable.studentId))
    .innerJoin(circlesTable, eq(circlesTable.id, studentEnrollmentsTable.circleId))
    .where(and(
      eq(studentEnrollmentsTable.isArchived, true),
      eq(studentsTable.isArchived, false),
      sql`lower(${studentsTable.fullName}) like ${`%${q.toLowerCase()}%`}`,
    ));

  // Deduplicate: prefer global archive record if student appears in both
  const globalIds = new Set(globalArchived.map(s => s.studentId));
  const combined = [
    ...globalArchived,
    ...enrollmentArchived.filter(s => !globalIds.has(s.studentId)),
  ];

  res.json(combined);
});

// ── All enrollment-archived students (across all circles) ──────────────────────
router.get("/students/enrollment-archived", authenticate, async (req, res): Promise<void> => {
  if (!["leader", "deputy", "track_supervisor", "data_entry"].includes(req.userRole!)) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  const rows = await db
    .select({
      studentId: studentsTable.id,
      fullName: studentsTable.fullName,
      phone: studentsTable.phone,
      country: studentsTable.country,
      isArchived: studentsTable.isArchived,
      enrollmentId: studentEnrollmentsTable.id,
      circleId: studentEnrollmentsTable.circleId,
      archivedAt: studentEnrollmentsTable.archivedAt,
      withdrawalPeriod: studentEnrollmentsTable.withdrawalPeriod,
      withdrawalReason: studentEnrollmentsTable.withdrawalReason,
      withdrawalNotes: studentEnrollmentsTable.withdrawalNotes,
      circleName: circlesTable.name,
      circleTrack: circlesTable.track,
    })
    .from(studentEnrollmentsTable)
    .innerJoin(studentsTable, eq(studentsTable.id, studentEnrollmentsTable.studentId))
    .innerJoin(circlesTable, eq(circlesTable.id, studentEnrollmentsTable.circleId))
    .where(eq(studentEnrollmentsTable.isArchived, true))
    .orderBy(desc(studentEnrollmentsTable.archivedAt));

  // track_supervisor: filter to own track only
  if (req.userRole === "track_supervisor") {
    const [me] = await db.select({ track: usersTable.track }).from(usersTable).where(eq(usersTable.id, req.userId!));
    const myTrack = me?.track;
    res.json(myTrack ? rows.filter(r => r.circleTrack === myTrack) : []);
    return;
  }

  // data_entry: filter to their assigned circles only (deny-by-default if no assignments)
  if (req.userRole === "data_entry") {
    const assignments = await db
      .select({ circleId: dataEntryCircleAssignmentsTable.circleId })
      .from(dataEntryCircleAssignmentsTable)
      .where(eq(dataEntryCircleAssignmentsTable.dataEntryUserId, req.userId!));
    if (assignments.length === 0) { res.json([]); return; }
    const assignedIds = new Set(assignments.map(a => a.circleId));
    res.json(rows.filter(r => assignedIds.has(r.circleId)));
    return;
  }

  res.json(rows);
});

// ── Create student ─────────────────────────────────────────────────────────────
router.post("/students", authenticate, async (req, res): Promise<void> => {
  if (!["leader", "track_supervisor", "data_entry"].includes(req.userRole!)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const parsed = CreateStudentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [student] = await db.insert(studentsTable).values(parsed.data).returning();

  // Auto-create enrollment if circleId provided
  if (parsed.data.circleId) {
    await db.insert(studentEnrollmentsTable)
      .values({ studentId: student.id, circleId: parsed.data.circleId, isArchived: false })
      .onConflictDoNothing();
  }

  res.status(201).json(student);
});

// ── Get single student ─────────────────────────────────────────────────────────
router.get("/students/:id", authenticate, async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  // كان أي حساب يقرأ صف أي طالبة كاملًا (جوالها وبياناتها) بتغيير الرقم.
  if (!await canAccessStudent(req, id)) { res.status(403).json({ error: "غير مسموح" }); return; }
  const [student] = await db.select().from(studentsTable).where(eq(studentsTable.id, id));
  if (!student) { res.status(404).json({ error: "Student not found" }); return; }
  res.json(student);
});

// ── Update student ─────────────────────────────────────────────────────────────
router.patch("/students/:id", authenticate, async (req, res): Promise<void> => {
  if (!["leader", "deputy", "track_supervisor"].includes(req.userRole!)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const id = parseId(req.params.id);
  const parsed = UpdateStudentBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const requestedFromCircleId = typeof req.body?.fromCircleId === "number"
    ? req.body.fromCircleId
    : undefined;

  const [before] = await db.select().from(studentsTable).where(eq(studentsTable.id, id));
  if (!before) { res.status(404).json({ error: "Student not found" }); return; }
  // مسؤولة المسار: تنقل طالبات مسارها (من حلقة في مسارها) إلى أي حلقة في أي مسار بالمقرأة،
  // وتسحب طالبة من قائمة التسجيل (أو بلا حلقة) إلى حلقة في مسارها هي فقط.
  // تعديل بيانات الطالبة نفسها (الاسم، الجوال…) لطالبات مسارها فقط.
  let claimingFromRegistrationPool = false;
  if (req.userRole === "track_supervisor") {
    const active = await db
      .select({ circleId: studentEnrollmentsTable.circleId, track: circlesTable.track, trackType: circlesTable.trackType })
      .from(studentEnrollmentsTable)
      .innerJoin(circlesTable, eq(circlesTable.id, studentEnrollmentsTable.circleId))
      .where(and(eq(studentEnrollmentsTable.studentId, id), eq(studentEnrollmentsTable.isArchived, false)));
    const mine = active.filter(e => e.track === req.userTrack);
    if (mine.length === 0) {
      const onlyInRegistrationOrNone = active.length === 0 || active.every(e => e.trackType === "registration");
      if (!onlyInRegistrationOrNone || Object.keys(parsed.data).some(k => k !== "circleId")) {
        res.status(403).json({ error: "الطالبة خارج مسارك: النقل لطالبات مسارك فقط" });
        return;
      }
      claimingFromRegistrationPool = true;
    } else if (parsed.data.circleId !== undefined) {
      // تُنقل من حلقة في مسارها، لا من حلقة لها في مسار آخر
      const source = requestedFromCircleId ?? (mine.some(e => e.circleId === before.circleId) ? before.circleId : mine[0]!.circleId);
      if (!mine.some(e => e.circleId === source)) {
        res.status(403).json({ error: "تنقلين الطالبة من حلقة في مسارك فقط" });
        return;
      }
    }
  }

  const requestedCircleId = parsed.data.circleId;
  if (typeof requestedCircleId === "number") {
    const [targetCircle] = await db
      .select({ id: circlesTable.id, track: circlesTable.track, isArchived: circlesTable.isArchived })
      .from(circlesTable)
      .where(eq(circlesTable.id, requestedCircleId));
    if (!targetCircle || targetCircle.isArchived) {
      res.status(400).json({ error: "الحلقة الهدف غير متاحة" });
      return;
    }
    if (claimingFromRegistrationPool && targetCircle.track !== req.userTrack) {
      res.status(403).json({ error: "لا يمكن نقل طالبة من قائمة التسجيل إلا إلى حلقة ضمن مسارك" });
      return;
    }
  }

  const studentUpdate = { ...parsed.data };
  // A transfer from a non-primary membership must not overwrite the legacy
  // primary circle pointer used by the other account/enrollment.
  if (
    requestedFromCircleId !== undefined &&
    requestedFromCircleId !== before.circleId
  ) {
    delete (studentUpdate as Partial<typeof parsed.data>).circleId;
  }
  const [student] = await db.update(studentsTable).set(studentUpdate).where(eq(studentsTable.id, id)).returning();
  if (!student) { res.status(404).json({ error: "Student not found" }); return; }

  // Explicit transfer moves only the selected membership. Other active
  // memberships (and their accounts/records) must remain untouched.
  if (
    parsed.data.circleId !== undefined &&
    parsed.data.circleId !== (requestedFromCircleId ?? before.circleId)
  ) {
    const activeEnrollments = await db.select({ circleId: studentEnrollmentsTable.circleId })
      .from(studentEnrollmentsTable)
      .where(and(
        eq(studentEnrollmentsTable.studentId, id),
        eq(studentEnrollmentsTable.isArchived, false),
      ));
    const sourceCircleId = requestedFromCircleId ?? before.circleId ?? activeEnrollments[0]?.circleId;
    const sourceIsActive = sourceCircleId != null &&
      activeEnrollments.some(enrollment => enrollment.circleId === sourceCircleId);
    const affectedCircleIds = sourceIsActive ? [sourceCircleId!] : [];
    await db.insert(studentTransfersTable).values({
      studentId: id,
      fromCircleId: sourceCircleId ?? undefined,
      toCircleId: parsed.data.circleId!,
      transferredById: req.userId!,
    });
    // Keep history, but close only the selected source membership.
    if (affectedCircleIds.length > 0) {
      await db.update(studentEnrollmentsTable)
        .set({ isArchived: true, archivedAt: new Date() })
        .where(
          and(
            eq(studentEnrollmentsTable.studentId, id),
            eq(studentEnrollmentsTable.circleId, affectedCircleIds[0]),
            eq(studentEnrollmentsTable.isArchived, false),
          )
        );
    }
    // Move only records belonging to the selected source circle.
    if (parsed.data.circleId) {
      if (affectedCircleIds.length > 0) {
        await db.update(recordsTable)
          .set({ circleId: parsed.data.circleId })
          .where(and(
            eq(recordsTable.studentId, id),
            eq(recordsTable.circleId, affectedCircleIds[0]),
          ));
      }
      await db.insert(studentEnrollmentsTable)
        .values({ studentId: id, circleId: parsed.data.circleId, isArchived: false })
        .onConflictDoUpdate({
          target: [studentEnrollmentsTable.studentId, studentEnrollmentsTable.circleId],
          set: { isArchived: false, archivedAt: null },
        });
    }
    // Sync the student's user account circleId to match the new circle
    // أولاً: بالرابط المباشر student_id (أدق وأأمن)
    if (sourceCircleId != null) {
      await db.update(usersTable)
        .set({ circleId: parsed.data.circleId ?? null })
        .where(and(
          eq(usersTable.studentId, id),
          eq(usersTable.role, "student"),
          eq(usersTable.circleId, sourceCircleId),
        ));
    } else {
      await db.update(usersTable)
        .set({ circleId: parsed.data.circleId ?? null })
        .where(and(eq(usersTable.studentId, id), eq(usersTable.role, "student")));
    }
    // ثانياً: بالاسم + الحلقة القديمة فقط للحسابات غير المربوطة (لتجنب تحديث طالبات بنفس الاسم في حلقات أخرى)
    if (sourceCircleId != null) {
      await db.update(usersTable)
        .set({ circleId: parsed.data.circleId ?? null })
        .where(and(
          eq(usersTable.role, "student"),
          isNull(usersTable.studentId),
          eq(usersTable.name, before.fullName),
          eq(usersTable.circleId, sourceCircleId),
        ));
    }
  }

  res.json(student);
});

// ── Legacy delete endpoint ─────────────────────────────────────────────────────
// Student withdrawal must always go through the archive endpoint so a withdrawal
// card, circle scope, and archive event are recorded together.
router.delete("/students/:id", authenticate, async (req, res): Promise<void> => {
  res.status(405).json({ error: "أرشفة الطالبة تتم عبر بطاقة الانسحاب في الحلقة" });
});

// ── Archive student (per-circle or global) ─────────────────────────────────────
// Body: { circleId?: number, withdrawalPeriod?: string, withdrawalReason?: string, withdrawalNotes?: string }
// If circleId → archive only that enrollment
// If no circleId → global archive (leader only): archive student + all enrollments
router.patch("/students/:id/archive", authenticate, async (req, res): Promise<void> => {
  const { circleId, withdrawalPeriod, withdrawalReason, withdrawalNotes } = req.body as {
    circleId?: number; withdrawalPeriod?: string; withdrawalReason?: string; withdrawalNotes?: string;
  };
  const hasCircleId = circleId !== undefined && circleId !== null;
  if (hasCircleId && (!Number.isInteger(circleId) || circleId <= 0)) {
    res.status(400).json({ error: "معرّف الحلقة غير صالح" });
    return;
  }
  // Per-circle archive: leader + track_supervisor + data_entry (own circles only)
  // Global archive (no circleId): leader only
  const canPerCircle = ["leader", "deputy", "track_supervisor", "data_entry"].includes(req.userRole!);
  const canGlobal = req.userRole === "leader";
  if ((hasCircleId && !canPerCircle) || (!hasCircleId && !canGlobal)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const id = parseId(req.params.id);
  const [before] = await db.select().from(studentsTable).where(eq(studentsTable.id, id));
  if (!before) { res.status(404).json({ error: "Student not found" }); return; }
  if (before.isArchived) {
    res.status(409).json({ error: "الطالبة مؤرشفة بالفعل" });
    return;
  }

  if (hasCircleId) {
    const [circle] = await db.select({
      id: circlesTable.id,
      track: circlesTable.track,
      isArchived: circlesTable.isArchived,
    }).from(circlesTable).where(eq(circlesTable.id, circleId));
    if (!circle || circle.isArchived) {
      res.status(400).json({ error: "الحلقة المحددة غير متاحة" });
      return;
    }
    if (req.userRole === "track_supervisor") {
      if (circle.track !== req.userTrack) {
        res.status(403).json({ error: "الحلقة خارج نطاق المسار" }); return;
      }
    }
    if (req.userRole === "data_entry") {
      const [assignment] = await db
        .select({ circleId: dataEntryCircleAssignmentsTable.circleId })
        .from(dataEntryCircleAssignmentsTable)
        .where(and(
          eq(dataEntryCircleAssignmentsTable.dataEntryUserId, req.userId!),
          eq(dataEntryCircleAssignmentsTable.circleId, circleId),
        ));
      if (!assignment) { res.status(403).json({ error: "لا تملكين صلاحية هذه الحلقة" }); return; }
    }
    if (!withdrawalPeriod || !withdrawalReason?.trim()) {
      res.status(400).json({ error: "يجب اختيار فترة الانسحاب وكتابة السبب" }); return;
    }
    // Verify an active enrollment exists before archiving
    const [enrollment] = await db.select()
      .from(studentEnrollmentsTable)
      .where(and(
        eq(studentEnrollmentsTable.studentId, id),
        eq(studentEnrollmentsTable.circleId, circleId),
        eq(studentEnrollmentsTable.isArchived, false),
      ))
      .limit(1);
    if (!enrollment) {
      res.status(404).json({ error: "No active enrollment found for this student in this circle" });
      return;
    }

    const updated = await db.transaction(async (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => {
      await tx.update(studentEnrollmentsTable)
        .set({
          isArchived: true,
          archivedAt: new Date(),
          withdrawalPeriod: withdrawalPeriod.trim(),
          withdrawalReason: withdrawalReason.trim(),
          withdrawalNotes: withdrawalNotes?.trim() || null,
        })
        .where(and(
          eq(studentEnrollmentsTable.studentId, id),
          eq(studentEnrollmentsTable.circleId, circleId),
          eq(studentEnrollmentsTable.isArchived, false),
        ));

      // هل تبقى للطالبة أي تسجيلات نشطة بحلقات أخرى بعد أرشفة هذا التسجيل؟
      const [remainingEnrollment] = await tx.select({ circleId: studentEnrollmentsTable.circleId })
        .from(studentEnrollmentsTable)
        .where(and(
          eq(studentEnrollmentsTable.studentId, id),
          eq(studentEnrollmentsTable.isArchived, false),
          ne(studentEnrollmentsTable.circleId, circleId),
        ))
        .limit(1);
      const newCircleId = remainingEnrollment?.circleId ?? null;

      if (before.circleId === circleId) {
        await tx.update(studentsTable).set({ circleId: newCircleId }).where(eq(studentsTable.id, id));
        await tx.update(usersTable)
          .set({ circleId: newCircleId })
          .where(and(eq(usersTable.studentId, id), eq(usersTable.role, "student")));
      }

      // لا تسجيلات نشطة متبقية أبدًا لهذه الطالبة → أرشفة السجل بالكامل وتعطيل
      // حسابها (users.isArchived) حتى تظهر لها شاشة "تم تعطيل حسابك" بدلاً من
      // بقاء الحساب نشطًا بلا حلقة وبلا بيانات.
      if (!remainingEnrollment) {
        await tx.update(studentsTable)
          .set({
            isArchived: true,
            circleId: null,
            archivedAt: new Date(),
            withdrawalPeriod: withdrawalPeriod.trim(),
            withdrawalReason: withdrawalReason.trim(),
            withdrawalNotes: withdrawalNotes?.trim() || null,
          })
          .where(eq(studentsTable.id, id));
        await tx.update(usersTable)
          .set({ isArchived: true, circleId: null })
          .where(and(eq(usersTable.studentId, id), eq(usersTable.role, "student")));
      }

      await tx.insert(studentArchiveEventsTable).values({
        studentId: id, eventType: "archived", circleIdAtTime: circleId, performedById: req.userId ?? null,
      });
      const [student] = await tx.select().from(studentsTable).where(eq(studentsTable.id, id));
      return student;
    });
    res.json(updated);
  } else {
    // Global archive (leader-only)
    if (!withdrawalPeriod || !withdrawalReason?.trim()) {
      res.status(400).json({ error: "يجب اختيار فترة الانسحاب وكتابة السبب" });
      return;
    }
    const student = await db.transaction(async (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => {
      const [updated] = await tx.update(studentsTable)
        .set({
          isArchived: true,
          circleId: null,
          archivedAt: new Date(),
          withdrawalPeriod: withdrawalPeriod.trim(),
          withdrawalReason: withdrawalReason.trim(),
          withdrawalNotes: withdrawalNotes?.trim() || null,
        })
        .where(and(eq(studentsTable.id, id), eq(studentsTable.isArchived, false)))
        .returning();
      if (!updated) throw new Error("ARCHIVE_CONFLICT");

      await tx.update(studentEnrollmentsTable)
        .set({
          isArchived: true,
          archivedAt: new Date(),
          withdrawalPeriod: withdrawalPeriod.trim(),
          withdrawalReason: withdrawalReason.trim(),
          withdrawalNotes: withdrawalNotes?.trim() || null,
        })
        .where(and(eq(studentEnrollmentsTable.studentId, id), eq(studentEnrollmentsTable.isArchived, false)));
      await tx.update(usersTable)
        .set({ isArchived: true, circleId: null })
        .where(and(eq(usersTable.studentId, id), eq(usersTable.role, "student")));
      await tx.insert(studentArchiveEventsTable).values({
        studentId: id, eventType: "archived", circleIdAtTime: before.circleId ?? null, performedById: req.userId ?? null,
      });
      return updated;
    });
    res.json(student);
  }
});

// ── Restore student ────────────────────────────────────────────────────────────
// Body: { circleId?: number }
// If circleId → restore/upsert enrollment + make student active
// If no circleId → restore globally (no circle assignment)
router.patch("/students/:id/restore", authenticate, async (req, res): Promise<void> => {
  if (!["leader", "deputy", "track_supervisor", "data_entry"].includes(req.userRole!)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const id = parseId(req.params.id);
  const { circleId } = req.body as { circleId?: number | null };
  const [before] = await db.select().from(studentsTable).where(eq(studentsTable.id, id));
  if (!before) { res.status(404).json({ error: "Student not found" }); return; }
  if (circleId === undefined || circleId === null) {
    if (req.userRole !== "leader" || !before.isArchived) {
      res.status(403).json({ error: "حددي حلقة نشطة للاستعادة" });
      return;
    }
    const student = await db.transaction(async (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => {
      const [updated] = await tx.update(studentsTable)
        .set({ isArchived: false, archivedAt: null, circleId: null })
        .where(eq(studentsTable.id, id)).returning();
      await tx.update(usersTable)
        .set({ isArchived: false, circleId: null })
        .where(and(eq(usersTable.studentId, id), eq(usersTable.role, "student")));
      await tx.insert(studentArchiveEventsTable).values({
        studentId: id, eventType: "restored", circleIdAtTime: null, performedById: req.userId ?? null,
      });
      return updated;
    });
    res.json(student);
    return;
  }
  if (!Number.isInteger(circleId) || circleId <= 0) {
    res.status(400).json({ error: "معرّف الحلقة غير صالح" });
    return;
  }
  const [circle] = await db.select({
    id: circlesTable.id,
    track: circlesTable.track,
    isArchived: circlesTable.isArchived,
  }).from(circlesTable).where(eq(circlesTable.id, circleId));
  if (!circle || circle.isArchived) {
    res.status(400).json({ error: "الحلقة المختارة غير متاحة" });
    return;
  }
  if (req.userRole === "track_supervisor" && circle.track !== req.userTrack) {
    res.status(403).json({ error: "الحلقة خارج نطاق المسار" });
    return;
  }
  if (req.userRole === "data_entry") {
    const [assignment] = await db.select({ circleId: dataEntryCircleAssignmentsTable.circleId })
      .from(dataEntryCircleAssignmentsTable)
      .where(and(
        eq(dataEntryCircleAssignmentsTable.dataEntryUserId, req.userId!),
        eq(dataEntryCircleAssignmentsTable.circleId, circleId),
      ));
    if (!assignment) { res.status(403).json({ error: "لا تملكين صلاحية هذه الحلقة" }); return; }
  }
  const [archivedEnrollment] = await db.select({ id: studentEnrollmentsTable.id })
    .from(studentEnrollmentsTable)
    .where(and(
      eq(studentEnrollmentsTable.studentId, id),
      eq(studentEnrollmentsTable.circleId, circleId),
      eq(studentEnrollmentsTable.isArchived, true),
    ))
    .limit(1);
  if (!archivedEnrollment) {
    res.status(409).json({ error: "لا يوجد تسجيل مؤرشف للطالبة في الحلقة المختارة" });
    return;
  }

  const student = await db.transaction(async (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => {
    await tx.update(studentEnrollmentsTable)
      .set({ isArchived: false, archivedAt: null })
      .where(eq(studentEnrollmentsTable.id, archivedEnrollment.id));
    const shouldSetPrimaryCircle = before.circleId === null;
    const [updated] = await tx.update(studentsTable)
      .set({
        isArchived: false,
        archivedAt: null,
        ...(shouldSetPrimaryCircle ? { circleId } : {}),
      })
      .where(eq(studentsTable.id, id)).returning();
    if (before.isArchived || shouldSetPrimaryCircle) {
      await tx.update(usersTable)
        .set({ isArchived: false, ...(shouldSetPrimaryCircle ? { circleId } : {}) })
        .where(and(eq(usersTable.studentId, id), eq(usersTable.role, "student")));
    }
    await tx.insert(studentArchiveEventsTable).values({
      studentId: id, eventType: "restored", circleIdAtTime: circleId, performedById: req.userId ?? null,
    });
    return updated;
  });
  res.json(student);
});

// ── Students on leave ──────────────────────────────────────────────────────────
router.get("/students/on-leave", authenticate, async (req, res): Promise<void> => {
  if (!req.userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const today = getMakkahDay();

  // Get all active enrollments that have a current leave
  const enrollments = await db
    .select({
      id: studentsTable.id,
      fullName: studentsTable.fullName,
      phone: studentsTable.phone,
      circleId: studentEnrollmentsTable.circleId,
      leaveStart: studentEnrollmentsTable.leaveStart,
      leaveEnd: studentEnrollmentsTable.leaveEnd,
      enrollmentId: studentEnrollmentsTable.id,
    })
    .from(studentEnrollmentsTable)
    .innerJoin(studentsTable, eq(studentsTable.id, studentEnrollmentsTable.studentId))
    .where(
      and(
        eq(studentEnrollmentsTable.isArchived, false),
        eq(studentsTable.isArchived, false),
      ),
    );

  const onLeaveEnrollments = enrollments.filter(e => {
    if (!e.leaveStart || !e.leaveEnd) return false;
    return e.leaveStart <= today && today <= e.leaveEnd;
  });

  if (!onLeaveEnrollments.length) { res.json([]); return; }

  const circles = await db.select().from(circlesTable);
  const circleMap: Record<number, typeof circles[0]> = {};
  for (const c of circles) circleMap[c.id] = c;

  function getWorkingDaysBetween(start: string, end: string): string[] {
    const days: string[] = [];
    const cur = new Date(start + "T12:00:00Z");
    const endD = new Date(end + "T12:00:00Z");
    while (cur <= endD) {
      const dow = cur.getUTCDay();
      if (dow !== 5) days.push(cur.toISOString().slice(0, 10));
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
    return days;
  }

  const result = await Promise.all(onLeaveEnrollments.map(async enr => {
    const circle = circleMap[enr.circleId];
    const leaveStart = enr.leaveStart!;
    const leaveEnd = enr.leaveEnd!;
    const leaveDays = getWorkingDaysBetween(leaveStart, today);
    const trackType = circle?.trackType ?? "girls";
    let enteredDays = 0;
    let enteredToday = false;

    if (leaveDays.length > 0) {
      const records = await db.select().from(recordsTable)
        .where(and(
          eq(recordsTable.studentId, enr.id),
          eq(recordsTable.circleId, enr.circleId),
          gte(recordsTable.date, leaveStart),
        ));
      for (const day of leaveDays) {
        const rec = records.find(r => r.date === day && !r.isAbsent);
        if (rec) { enteredDays++; if (day === today) enteredToday = true; }
      }
    }

    return {
      id: enr.id,
      fullName: enr.fullName,
      circleId: enr.circleId,
      circleName: circle?.name ?? null,
      track: circle?.track ?? null,
      trackType,
      leaveStart,
      leaveEnd,
      hasPlan: false,
      leaveDaysCount: leaveDays.length,
      enteredDays,
      enteredToday,
      todayStatus: null,
    };
  }));

  res.json(result);
});

// ── Grant / cancel leave (per-circle) ─────────────────────────────────────────
// Body: { leaveStart, leaveEnd, circleId? }
// If circleId → update enrollment's leave dates
// If no circleId → update student's leave dates (backward compat)
router.patch("/students/:id/leave", authenticate, async (req, res): Promise<void> => {
  if (!["leader", "deputy", "track_supervisor"].includes(req.userRole!)) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  const id = parseId(req.params.id);
  const { leaveStart, leaveEnd, circleId, reason } = req.body as {
    leaveStart?: string | null;
    leaveEnd?: string | null;
    circleId?: number;
    reason?: string | null;
  };

  if (circleId) {
    // Update enrollment leave dates
    await db.update(studentEnrollmentsTable)
      .set({ leaveStart: leaveStart ?? null, leaveEnd: leaveEnd ?? null })
      .where(
        and(
          eq(studentEnrollmentsTable.studentId, id),
          eq(studentEnrollmentsTable.circleId, circleId),
        ),
      );
  } else {
    // Backward compat: also update students table + primary enrollment
    await db.update(studentsTable)
      .set({ leaveStart: leaveStart ?? null, leaveEnd: leaveEnd ?? null })
      .where(eq(studentsTable.id, id));

    // Update all active enrollments of the student
    await db.update(studentEnrollmentsTable)
      .set({ leaveStart: leaveStart ?? null, leaveEnd: leaveEnd ?? null })
      .where(
        and(
          eq(studentEnrollmentsTable.studentId, id),
          eq(studentEnrollmentsTable.isArchived, false),
        ),
      );
  }

  const [student] = await db.select().from(studentsTable).where(eq(studentsTable.id, id));
  if (!student) { res.status(404).json({ error: "Student not found" }); return; }

  if (leaveStart && leaveEnd) {
    await db.insert(studentLeaveHistoryTable).values({
      studentId: id, leaveStart, leaveEnd, reason: reason ?? null, grantedById: req.userId ?? null,
    });
    // Insert leave notification for leader/deputy
    const enrollmentForNotif = circleId
      ? await db.select({ cid: studentEnrollmentsTable.circleId }).from(studentEnrollmentsTable)
          .where(and(eq(studentEnrollmentsTable.studentId, id), eq(studentEnrollmentsTable.circleId, circleId))).limit(1)
      : await db.select({ cid: studentEnrollmentsTable.circleId }).from(studentEnrollmentsTable)
          .where(and(eq(studentEnrollmentsTable.studentId, id), eq(studentEnrollmentsTable.isArchived, false))).limit(1);
    const notifCircleId = enrollmentForNotif[0]?.cid ?? null;
    if (notifCircleId) {
      const [notifCircle] = await db.select().from(circlesTable).where(eq(circlesTable.id, notifCircleId));
      if (notifCircle) {
        const noteText = [
          `من: ${leaveStart} إلى: ${leaveEnd}`,
          reason ? `السبب: ${reason}` : null,
        ].filter(Boolean).join(" · ");
        // Leave notification recording removed (plan notifications removed)
      }
    }
  } else if (!leaveStart && !leaveEnd) {
    const [lastLeave] = await db.select().from(studentLeaveHistoryTable)
      .where(and(
        eq(studentLeaveHistoryTable.studentId, id),
        sql`${studentLeaveHistoryTable.cancelledAt} IS NULL`,
      ))
      .orderBy(desc(studentLeaveHistoryTable.grantedAt))
      .limit(1);
    if (lastLeave) {
      await db.update(studentLeaveHistoryTable)
        .set({ cancelledAt: new Date(), cancelledById: req.userId ?? null })
        .where(eq(studentLeaveHistoryTable.id, lastLeave.id));
    }
  }

  res.json(student);
});

// ── Enroll student in a new circle ────────────────────────────────────────────
// POST /students/:id/enroll
// Body: { circleId: number }
router.post("/students/:id/enroll", authenticate, async (req, res): Promise<void> => {
  if (!["leader", "track_supervisor", "data_entry"].includes(req.userRole!)) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  const id = parseId(req.params.id);
  const { circleId } = req.body as { circleId: number };
  if (!circleId) { res.status(400).json({ error: "circleId required" }); return; }

  // data_entry: target circle must be one of their assigned circles,
  // and student must be unassigned (no real circle or in registration) or archived
  if (req.userRole === "data_entry") {
    const [assignment] = await db
      .select({ circleId: dataEntryCircleAssignmentsTable.circleId })
      .from(dataEntryCircleAssignmentsTable)
      .where(and(
        eq(dataEntryCircleAssignmentsTable.dataEntryUserId, req.userId!),
        eq(dataEntryCircleAssignmentsTable.circleId, circleId),
      ));
    if (!assignment) { res.status(403).json({ error: "Forbidden: not assigned to this circle" }); return; }

    // Student must have no active non-registration enrollment (use enrollments as source of truth)
    const [regCircle] = await db.select({ id: circlesTable.id })
      .from(circlesTable).where(eq(circlesTable.trackType, "registration"));
    const [st] = await db.select({ isArchived: studentsTable.isArchived })
      .from(studentsTable).where(eq(studentsTable.id, id));
    if (!st) { res.status(404).json({ error: "Student not found" }); return; }

    if (!st.isArchived) {
      // Check active enrollments excluding the registration circle
      const activeEnrollments = await db
        .select({ circleId: studentEnrollmentsTable.circleId })
        .from(studentEnrollmentsTable)
        .where(and(
          eq(studentEnrollmentsTable.studentId, id),
          eq(studentEnrollmentsTable.isArchived, false),
          ...(regCircle ? [ne(studentEnrollmentsTable.circleId, regCircle.id)] : []),
        ));
      if (activeEnrollments.length > 0) {
        res.status(403).json({ error: "Forbidden: student is already enrolled in a circle" }); return;
      }
    }
  }

  const [student] = await db.select().from(studentsTable).where(eq(studentsTable.id, id));
  if (!student) { res.status(404).json({ error: "Student not found" }); return; }

  // Find and archive any registration-circle enrollment before adding to real circle
  const [regCircleForEnroll] = await db.select({ id: circlesTable.id })
    .from(circlesTable).where(eq(circlesTable.trackType, "registration"));
  if (regCircleForEnroll) {
    await db.update(studentEnrollmentsTable)
      .set({ isArchived: true, archivedAt: new Date() })
      .where(and(
        eq(studentEnrollmentsTable.studentId, id),
        eq(studentEnrollmentsTable.circleId, regCircleForEnroll.id),
        eq(studentEnrollmentsTable.isArchived, false),
      ));
  }

  const [enrollment] = await db.insert(studentEnrollmentsTable)
    .values({ studentId: id, circleId, isArchived: false })
    .onConflictDoUpdate({
      target: [studentEnrollmentsTable.studentId, studentEnrollmentsTable.circleId],
      set: { isArchived: false, archivedAt: null },
    })
    .returning();

  // Always update primary circle to the new real circle
  await db.update(studentsTable).set({ circleId }).where(eq(studentsTable.id, id));
  // Sync user account
  await db.update(usersTable).set({ circleId })
    .where(and(eq(usersTable.name, student.fullName), eq(usersTable.role, "student")));

  res.status(201).json(enrollment);
});

// ── List enrollments for a student ────────────────────────────────────────────
// GET /students/:id/enrollments
router.get("/students/:id/enrollments", authenticate, async (req, res): Promise<void> => {
  if (!STAFF_ROLES.includes(req.userRole!)) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  const id = parseId(req.params.id);

  const enrollments = await db
    .select({
      id: studentEnrollmentsTable.id,
      studentId: studentEnrollmentsTable.studentId,
      circleId: studentEnrollmentsTable.circleId,
      isArchived: studentEnrollmentsTable.isArchived,
      archivedAt: studentEnrollmentsTable.archivedAt,
      leaveStart: studentEnrollmentsTable.leaveStart,
      leaveEnd: studentEnrollmentsTable.leaveEnd,
      circleName: circlesTable.name,
      circleTrack: circlesTable.track,
    })
    .from(studentEnrollmentsTable)
    .innerJoin(circlesTable, eq(circlesTable.id, studentEnrollmentsTable.circleId))
    .where(eq(studentEnrollmentsTable.studentId, id))
    .orderBy(studentEnrollmentsTable.createdAt);

  res.json(enrollments);
});

// ── Student notes ──────────────────────────────────────────────────────────────
router.get("/students/:id/notes", authenticate, async (req, res): Promise<void> => {
  if (!STAFF_ROLES.includes(req.userRole!)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const id = parseId(req.params.id);
  if (!await canAccessStudent(req, id)) { res.status(403).json({ error: "الطالبة خارج نطاقك" }); return; }
  const notes = await db.select().from(studentNotesTable)
    .where(eq(studentNotesTable.studentId, id))
    .orderBy(desc(studentNotesTable.createdAt));

  const authorIds = [...new Set(notes.map(n => n.authorId))];
  const authors = authorIds.length
    ? await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable)
        .where(sql`${usersTable.id} = ANY(ARRAY[${sql.join(authorIds.map(id => sql`${id}`), sql`, `)}]::int[])`)
    : [];
  const authorMap: Record<number, string> = {};
  for (const a of authors) authorMap[a.id] = a.name;

  res.json(notes.map(n => ({
    id: n.id,
    studentId: n.studentId,
    authorId: n.authorId,
    authorName: authorMap[n.authorId] ?? "غير معروف",
    content: n.content,
    createdAt: n.createdAt.toISOString(),
  })));
});

router.post("/students/:id/notes", authenticate, async (req, res): Promise<void> => {
  if (!STAFF_ROLES.includes(req.userRole!)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const id = parseId(req.params.id);
  if (!await canAccessStudent(req, id)) { res.status(403).json({ error: "الطالبة خارج نطاقك" }); return; }
  const { content } = req.body as { content: string };
  if (!content?.trim()) { res.status(400).json({ error: "Content required" }); return; }

  const [note] = await db.insert(studentNotesTable).values({
    studentId: id,
    authorId: req.userId!,
    content: content.trim(),
  }).returning();

  const [author] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, req.userId!));

  res.status(201).json({
    id: note.id,
    studentId: note.studentId,
    authorId: note.authorId,
    authorName: author?.name ?? "غير معروف",
    content: note.content,
    createdAt: note.createdAt.toISOString(),
  });
});

router.delete("/students/:id/notes/:noteId", authenticate, async (req, res): Promise<void> => {
  if (!["leader", "track_supervisor"].includes(req.userRole!) && req.userRole !== "teacher" && req.userRole !== "supervisor") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const noteId = parseId(req.params.noteId);
  await db.delete(studentNotesTable).where(
    and(eq(studentNotesTable.id, noteId), eq(studentNotesTable.authorId, req.userId!))
  );
  res.sendStatus(204);
});

// ── Students without a real circle (in registration/holding circle or no circle) ──
router.get("/students/without-circle", authenticate, async (req, res): Promise<void> => {
  if (!["leader", "deputy"].includes(req.userRole!)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const [regCircle] = await db.select({ id: circlesTable.id, name: circlesTable.name })
    .from(circlesTable).where(eq(circlesTable.trackType, "registration"));

  const allCircles = await db.select({ id: circlesTable.id, name: circlesTable.name, track: circlesTable.track })
    .from(circlesTable)
    .where(and(eq(circlesTable.isArchived, false), sql`${circlesTable.trackType} != 'registration'`));

  let students: any[] = [];

  if (regCircle) {
    // Students enrolled in the registration holding circle
    const inReg = await db
      .select({
        id: studentsTable.id,
        fullName: studentsTable.fullName,
        phone: studentsTable.phone,
        country: studentsTable.country,
        extraData: studentsTable.extraData,
        isArchived: studentsTable.isArchived,
        createdAt: studentsTable.createdAt,
      })
      .from(studentsTable)
      .innerJoin(
        studentEnrollmentsTable,
        and(
          eq(studentEnrollmentsTable.studentId, studentsTable.id),
          eq(studentEnrollmentsTable.circleId, regCircle.id),
          eq(studentEnrollmentsTable.isArchived, false),
        ),
      )
      .where(eq(studentsTable.isArchived, false))
      .orderBy(studentsTable.createdAt);
    students = inReg;
  }

  // Also include students with no circle at all and no enrollment
  const noCircleStudents = await db
    .select({
      id: studentsTable.id,
      fullName: studentsTable.fullName,
      phone: studentsTable.phone,
      country: studentsTable.country,
      extraData: studentsTable.extraData,
      isArchived: studentsTable.isArchived,
      createdAt: studentsTable.createdAt,
    })
    .from(studentsTable)
    .where(and(isNull(studentsTable.circleId), eq(studentsTable.isArchived, false)));

  const regIds = new Set(students.map(s => s.id));
  for (const s of noCircleStudents) {
    if (!regIds.has(s.id)) students.push(s);
  }

  // Parse extraData to expose email and preferred circle
  const enriched = students.map(s => {
    let parsed: Record<string, unknown> = {};
    try { if (s.extraData) parsed = JSON.parse(s.extraData); } catch { /* ignore */ }
    return {
      ...s,
      extraData: undefined,
      email: (parsed["__email"] as string | undefined) ?? null,
      preferredCircleName: (parsed["__preferredCircleName"] as string | undefined) ?? null,
      preferredCircleId: (parsed["__preferredCircleId"] as number | undefined) ?? null,
    };
  });

  res.json({ students: enriched, regCircleId: regCircle?.id ?? null, circles: allCircles });
});

// ── Student profile ────────────────────────────────────────────────────────────
router.get("/students/:id/profile", authenticate, async (req, res): Promise<void> => {
  if (!STAFF_ROLES.includes(req.userRole!)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const id = parseId(req.params.id);

  const [student] = await db.select().from(studentsTable).where(eq(studentsTable.id, id));
  if (!student) { res.status(404).json({ error: "Student not found" }); return; }
  if (!(await canAccessStudentMemorization(req, id))) {
    // نخبرها في أي مسار/حلقة الطالبة (بلا أي بيانات أخرى) لتعرف لمن تتوجه
    const where = await db.select({ circle: circlesTable.name, track: circlesTable.track })
      .from(studentEnrollmentsTable)
      .innerJoin(circlesTable, eq(circlesTable.id, studentEnrollmentsTable.circleId))
      .where(and(eq(studentEnrollmentsTable.studentId, id), eq(studentEnrollmentsTable.isArchived, false)));
    const place = where.map((w) => `مسار ${w.track ?? "—"} (${w.circle})`).join("، ");
    res.status(403).json({ error: place ? `الطالبة مسجّلة في ${place}، وليست ضمن مسارك` : "الطالبة خارج نطاق المسار" });
    return;
  }

  await ensureLegacyMemorization(student);
  const [currentStudent] = await db.select().from(studentsTable).where(eq(studentsTable.id, id));
  if (!currentStudent) { res.status(404).json({ error: "Student not found" }); return; }
  const studentMemorizations = await db.select().from(studentMemorizationsTable)
    .where(eq(studentMemorizationsTable.studentId, id))
    .orderBy(desc(studentMemorizationsTable.createdAt));

  const [circle] = student.circleId
    ? await db.select().from(circlesTable).where(eq(circlesTable.id, student.circleId))
    : [];

  // All enrollments for this student
  const enrollments = await db
    .select({
      id: studentEnrollmentsTable.id,
      circleId: studentEnrollmentsTable.circleId,
      isArchived: studentEnrollmentsTable.isArchived,
      archivedAt: studentEnrollmentsTable.archivedAt,
      leaveStart: studentEnrollmentsTable.leaveStart,
      leaveEnd: studentEnrollmentsTable.leaveEnd,
      circleName: circlesTable.name,
      circleTrack: circlesTable.track,
      circleTrackType: circlesTable.trackType,
    })
    .from(studentEnrollmentsTable)
    .innerJoin(circlesTable, eq(circlesTable.id, studentEnrollmentsTable.circleId))
    .where(eq(studentEnrollmentsTable.studentId, id))
    .orderBy(studentEnrollmentsTable.createdAt);

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const allRecords = await db.select().from(recordsTable).where(eq(recordsTable.studentId, id));
  const recentAbsences = allRecords
    .filter(r => r.isAbsent && r.date >= thirtyDaysAgo)
    .map(r => r.date)
    .sort((a, b) => b.localeCompare(a));

  const totalSessions = allRecords.length;
  const totalAbsences = allRecords.filter(r => r.isAbsent).length;
  const attendanceRate = totalSessions > 0 ? Math.round(((totalSessions - totalAbsences) / totalSessions) * 100) : null;

  const monthlyMap: Record<string, { sessions: number; absences: number }> = {};
  for (const r of allRecords) {
    const month = r.date.slice(0, 7);
    if (!monthlyMap[month]) monthlyMap[month] = { sessions: 0, absences: 0 };
    monthlyMap[month].sessions++;
    if (r.isAbsent) monthlyMap[month].absences++;
  }
  const now = new Date();
  const monthlyTrend = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const data = monthlyMap[month] ?? { sessions: 0, absences: 0 };
    return {
      month,
      sessions: data.sessions,
      absences: data.absences,
      attendanceRate: data.sessions > 0 ? Math.round(((data.sessions - data.absences) / data.sessions) * 100) : null,
    };
  }).reverse();

  const transfers = await db.select().from(studentTransfersTable)
    .where(eq(studentTransfersTable.studentId, id))
    .orderBy(desc(studentTransfersTable.transferredAt));

  const circleIds = [...new Set(transfers.flatMap(t => [t.fromCircleId, t.toCircleId].filter(Boolean) as number[]))];
  const circles = circleIds.length
    ? await db.select().from(circlesTable).where(sql`${circlesTable.id} = ANY(ARRAY[${sql.join(circleIds.map(cid => sql`${cid}`), sql`, `)}]::int[])`)
    : [];
  const circleNameMap: Record<number, string> = {};
  for (const c of circles) circleNameMap[c.id] = `${c.name} (${c.track})`;

  const transfersByUser = await Promise.all(
    transfers.map(async t => {
      const [user] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, t.transferredById));
      return {
        id: t.id,
        fromCircle: t.fromCircleId ? (circleNameMap[t.fromCircleId] ?? "غير معروف") : null,
        toCircle: circleNameMap[t.toCircleId] ?? "غير معروف",
        transferredBy: user?.name ?? "غير معروف",
        transferredAt: t.transferredAt.toISOString(),
      };
    })
  );

  const rawNotes = await db.select().from(studentNotesTable)
    .where(eq(studentNotesTable.studentId, id))
    .orderBy(desc(studentNotesTable.createdAt));
  const authorIds = [...new Set(rawNotes.map(n => n.authorId))];
  const noteAuthors = authorIds.length
    ? await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable)
        .where(sql`${usersTable.id} = ANY(ARRAY[${sql.join(authorIds.map(aid => sql`${aid}`), sql`, `)}]::int[])`)
    : [];
  const noteAuthorMap: Record<number, string> = {};
  for (const a of noteAuthors) noteAuthorMap[a.id] = a.name;
  const notes = rawNotes.map(n => ({
    id: n.id,
    studentId: n.studentId,
    authorId: n.authorId,
    authorName: noteAuthorMap[n.authorId] ?? "غير معروف",
    content: n.content,
    createdAt: n.createdAt.toISOString(),
  }));

  const allMessages = await db.select().from(messagesTable).orderBy(desc(messagesTable.createdAt));
  const nowForMessages = new Date();
  const relevantMessages = allMessages.filter(m => {
    if (m.expiresAt && m.expiresAt < nowForMessages) return false; // منتهية (رسائل الأوسمة تُعرض ٢٤ ساعة فقط)
    if (m.targetType === "student") return m.targetId === String(student.id);
    if (m.targetType === "circle") return student.circleId && m.targetId === String(student.circleId);
    if (m.targetType === "track") return circle && m.targetId === circle.track;
    return false;
  });

  const senderIds = [...new Set(relevantMessages.map(m => m.senderId))];
  const senders = senderIds.length
    ? await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable)
        .where(sql`${usersTable.id} = ANY(ARRAY[${sql.join(senderIds.map(sid => sql`${sid}`), sql`, `)}]::int[])`)
    : [];
  const senderMap: Record<number, string> = {};
  for (const s of senders) senderMap[s.id] = s.name;

  const messages = relevantMessages.map(m => {
    let targetLabel = m.targetId;
    if (m.targetType === "student") targetLabel = student.fullName;
    else if (m.targetType === "circle") targetLabel = circle?.name ?? m.targetId;
    else if (m.targetType === "track") targetLabel = m.targetId;
    return {
      id: m.id,
      senderId: m.senderId,
      senderName: senderMap[m.senderId] ?? "غير معروف",
      targetType: m.targetType,
      targetId: m.targetId,
      targetLabel,
      content: m.content,
      createdAt: m.createdAt.toISOString(),
    };
  });

  const presentRecords = allRecords.filter(r => !r.isAbsent);
  const recordedMemorizePages = presentRecords.reduce((s, r) => s + (r.memorizePages ?? 0), 0);
  const memorizationCreditPages = studentMemorizations.reduce((sum, row) => sum + (row.pages ?? 0), 0);
  const totalMemorizePages = Math.round((recordedMemorizePages + memorizationCreditPages) * 2) / 2;
  const totalReviewPages = presentRecords.reduce((s, r) => s + (r.reviewPages ?? 0) + (r.reviewNearPages ?? 0) + (r.reviewFarPages ?? 0), 0);
  const totalRecitationPages = presentRecords.reduce((s, r) => s + (r.recitationPages ?? 0), 0);

  const isRecitationTrack = circle?.trackType === "recitation";
  void isRecitationTrack;
  const totalShortcomings = presentRecords.filter(r => isShortcomingRecord(r, circle?.trackType ?? "girls")).length;

  const leaveHistoryRaw = await db.select().from(studentLeaveHistoryTable)
    .where(eq(studentLeaveHistoryTable.studentId, id))
    .orderBy(desc(studentLeaveHistoryTable.grantedAt));

  const lhUserIds = [...new Set([
    ...leaveHistoryRaw.map(l => l.grantedById).filter((x): x is number => x !== null),
    ...leaveHistoryRaw.map(l => l.cancelledById).filter((x): x is number => x !== null),
  ])];
  const lhUsers = lhUserIds.length
    ? await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable)
        .where(sql`${usersTable.id} = ANY(ARRAY[${sql.join(lhUserIds.map(uid => sql`${uid}`), sql`, `)}]::int[])`)
    : [];
  const lhUserMap: Record<number, string> = {};
  for (const u of lhUsers) lhUserMap[u.id] = u.name;

  const leaveHistory = leaveHistoryRaw.map(l => ({
    id: l.id,
    leaveStart: l.leaveStart,
    leaveEnd: l.leaveEnd,
    grantedAt: l.grantedAt.toISOString(),
    grantedBy: l.grantedById ? (lhUserMap[l.grantedById] ?? "غير معروف") : null,
    cancelledAt: l.cancelledAt?.toISOString() ?? null,
    cancelledBy: l.cancelledById ? (lhUserMap[l.cancelledById] ?? "غير معروف") : null,
  }));

  const cutoffStr = getMakkahDaysAgo(179);
  const heatmapData = allRecords
    .filter(r => r.date >= cutoffStr)
    .map(r => {
      const totalPages =
        (r.memorizePages ?? 0) + (r.reviewNearPages ?? 0) +
        (r.reviewFarPages ?? 0) + (r.reviewPages ?? 0) + (r.recitationPages ?? 0);
      return {
        date: r.date,
        status: r.isAbsent
          ? "absent"
          : totalPages >= 2 ? "present" : totalPages > 0 ? "low" : "attended",
      };
    });

  const recentRecords = [...allRecords]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 20)
    .map(r => ({
      id: r.id,
      date: r.date,
      isAbsent: r.isAbsent,
      memorizePages: r.memorizePages ?? null,
      memorizeSurahStart: r.memorizeSurahStart ?? null,
      memorizeSurahEnd: r.memorizeSurahEnd ?? null,
      memorizeAyahStart: r.memorizeAyahStart ?? null,
      memorizeAyahEnd: r.memorizeAyahEnd ?? null,
      reviewNearPages: r.reviewNearPages ?? null,
      reviewNearSurahStart: r.reviewNearSurahStart ?? null,
      reviewNearSurahEnd: r.reviewNearSurahEnd ?? null,
      reviewFarPages: r.reviewFarPages ?? null,
      reviewFarSurahStart: r.reviewFarSurahStart ?? null,
      reviewFarSurahEnd: r.reviewFarSurahEnd ?? null,
      reviewPages: r.reviewPages ?? null,
      reviewSurahStart: r.reviewSurahStart ?? null,
      reviewSurahEnd: r.reviewSurahEnd ?? null,
      recitationPages: r.recitationPages ?? null,
      recitationSurahStart: r.recitationSurahStart ?? null,
      recitationSurahEnd: r.recitationSurahEnd ?? null,
      listenedToReciter: r.listenedToReciter ?? null,
      shortcomingOverride: r.shortcomingOverride ?? null,
    }));

  res.json({
    id: currentStudent.id,
    fullName: currentStudent.fullName,
    phone: currentStudent.phone,
    country: currentStudent.country,
    ageRange: currentStudent.ageRange,
    educationLevel: currentStudent.educationLevel,
    memorizeFrom: currentStudent.memorizeFrom,
    isArchived: currentStudent.isArchived,
    leaveStart: currentStudent.leaveStart,
    leaveEnd: currentStudent.leaveEnd,
    createdAt: currentStudent.createdAt.toISOString(),
    extraData: currentStudent.extraData ?? null,
    circle: circle ? { id: circle.id, name: circle.name, track: circle.track, trackType: circle.trackType } : null,
    enrollments,
    recentAbsences,
    // Nested attendanceSummary for frontend compatibility
    attendanceSummary: { totalSessions, totalAbsences, attendanceRate },
    totalSessions,
    totalAbsences,
    attendanceRate,
    monthlyTrend,
    transfers: transfersByUser,
    notes,
    messages,
    totalMemorizePages,
    recordedMemorizePages,
    memorizationCreditPages,
    memorizations: studentMemorizations.map(serializeMemorization),
    totalReviewPages,
    totalRecitationPages,
    totalShortcomings,
    leaveHistory,
    heatmapData,
    recentRecords,
  });
});

// ── Historical memorization ────────────────────────────────────────────────────
// These rows are separate from daily entries and are never used to rewrite
// attendance, data-entry records, or historical exam records.
router.post("/students/:id/memorizations", authenticate, async (req, res): Promise<void> => {
  if (!["leader", "deputy", "track_supervisor"].includes(req.userRole!)) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  const studentId = parseId(req.params.id);
  const [student] = await db.select().from(studentsTable).where(eq(studentsTable.id, studentId));
  if (!student) { res.status(404).json({ error: "Student not found" }); return; }
  if (!(await canAccessStudentMemorization(req, studentId))) {
    res.status(403).json({ error: "الطالبة خارج نطاق المسار" }); return;
  }
  await ensureLegacyMemorization(student);

  const juzNumbers = normalizeJuzNumbers(req.body?.juzNumbers);
  const labelFromBody = typeof req.body?.label === "string" ? req.body.label.trim().slice(0, 180) : "";
  const label = labelFromBody || (juzNumbers.length ? `أجزاء: ${juzNumbers.join("، ")}` : "");
  const rawPages = Number(req.body?.pages);
  const pages = juzNumbers.length ? pagesForJuzNumbers(juzNumbers) : Math.round(rawPages * 2) / 2;
  if (!label || !Number.isFinite(pages) || pages < 0 || pages > 604) {
    res.status(400).json({ error: "أدخلي وصف المحفوظة ورصيد صفحات صحيحًا" }); return;
  }
  const result = await db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${studentId})`);
    const rows = await tx.select().from(studentMemorizationsTable)
      .where(eq(studentMemorizationsTable.studentId, studentId));
    const creditError = getMemorizationCreditError(rows, juzNumbers, pages);
    if (creditError) return { creditError };
    const [row] = await tx.insert(studentMemorizationsTable).values({
      studentId,
      label,
      juzNumbers: juzNumbers.length ? JSON.stringify(juzNumbers) : null,
      pages,
      createdById: req.userId!,
    }).returning();
    return { row };
  });
  if ("creditError" in result) { res.status(400).json({ error: result.creditError }); return; }
  res.status(201).json(serializeMemorization(result.row));
});

router.patch("/students/:id/memorizations/:memorizationId", authenticate, async (req, res): Promise<void> => {
  if (!["leader", "deputy", "track_supervisor"].includes(req.userRole!)) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  const studentId = parseId(req.params.id);
  const memorizationId = parseId(req.params.memorizationId);
  const [student] = await db.select().from(studentsTable).where(eq(studentsTable.id, studentId));
  if (!student) { res.status(404).json({ error: "Student not found" }); return; }
  if (!(await canAccessStudentMemorization(req, studentId))) {
    res.status(403).json({ error: "الطالبة خارج نطاق المسار" }); return;
  }
  await ensureLegacyMemorization(student);

  const juzNumbers = normalizeJuzNumbers(req.body?.juzNumbers);
  const labelFromBody = typeof req.body?.label === "string" ? req.body.label.trim().slice(0, 180) : "";
  const rawPages = Number(req.body?.pages);
  const pages = juzNumbers.length ? pagesForJuzNumbers(juzNumbers) : Math.round(rawPages * 2) / 2;
  if (!Number.isFinite(pages) || pages < 0 || pages > 604) {
    res.status(400).json({ error: "أدخلي وصف المحفوظة ورصيد صفحات صحيحًا" }); return;
  }
  const result = await db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${studentId})`);
    const [existing] = await tx.select().from(studentMemorizationsTable).where(and(
      eq(studentMemorizationsTable.id, memorizationId),
      eq(studentMemorizationsTable.studentId, studentId),
    ));
    if (!existing) return { notFound: true };
    const label = labelFromBody || (juzNumbers.length ? `أجزاء: ${juzNumbers.join("، ")}` : existing.label);
    if (!label) return { invalid: true };
    const rows = await tx.select().from(studentMemorizationsTable)
      .where(eq(studentMemorizationsTable.studentId, studentId));
    const creditError = getMemorizationCreditError(rows, juzNumbers, pages, memorizationId);
    if (creditError) return { creditError };
    const [row] = await tx.update(studentMemorizationsTable).set({
      label,
      juzNumbers: juzNumbers.length ? JSON.stringify(juzNumbers) : null,
      pages,
    }).where(and(
      eq(studentMemorizationsTable.id, memorizationId),
      eq(studentMemorizationsTable.studentId, studentId),
    )).returning();
    return { row };
  });
  if ("notFound" in result) { res.status(404).json({ error: "المحفوظة غير موجودة" }); return; }
  if ("invalid" in result) { res.status(400).json({ error: "أدخلي وصف المحفوظة ورصيد صفحات صحيحًا" }); return; }
  if ("creditError" in result) { res.status(400).json({ error: result.creditError }); return; }
  res.json(serializeMemorization(result.row));
});

router.delete("/students/:id/memorizations/:memorizationId", authenticate, async (req, res): Promise<void> => {
  if (!["leader", "deputy", "track_supervisor"].includes(req.userRole!)) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  const studentId = parseId(req.params.id);
  const memorizationId = parseId(req.params.memorizationId);
  const [student] = await db.select().from(studentsTable).where(eq(studentsTable.id, studentId));
  if (!student) { res.status(404).json({ error: "Student not found" }); return; }
  if (!(await canAccessStudentMemorization(req, studentId))) {
    res.status(403).json({ error: "الطالبة خارج نطاق المسار" }); return;
  }
  const [row] = await db.delete(studentMemorizationsTable).where(and(
    eq(studentMemorizationsTable.id, memorizationId),
    eq(studentMemorizationsTable.studentId, studentId),
  )).returning();
  if (!row) { res.status(404).json({ error: "المحفوظة غير موجودة" }); return; }
  res.status(204).send();
});

export default router;
