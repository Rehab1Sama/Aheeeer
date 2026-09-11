import { Router, type IRouter } from "express";
import { db, recordsTable, studentsTable, studentEnrollmentsTable, studentMemorizationsTable, circlesTable, usersTable, teacherAbsencesTable, tracksTable, dailyCircleTasksTable, examRecordsTable } from "@workspace/db";
import { eq, and, gte, lte, sql } from "drizzle-orm";
import { authenticate } from "../middlewares/authenticate";
import { getMakkahDay, getMakkahDaysAgo, getMakkahWeekStart, getMakkahLastWeekStart, getMakkahLastWeekEnd } from "../lib/date";

const router: IRouter = Router();

type StatsStudent = {
  id: number;
  fullName: string;
  circleId: number | null;
  ageRange: string | null;
  isArchived: boolean;
};

// استخدم الأعمدة التي تحتاجها الإحصائيات فقط. هذا يمنع تعطل الإحصائيات
// إذا كان مخطط Supabase يحتوي على أعمدة إضافية أو ترحيلًا جاريًا.
async function loadStatsStudents(): Promise<StatsStudent[]> {
  const result = await db.execute(sql`
    SELECT id, full_name, circle_id, age_range, is_archived
    FROM students
  `);
  return (result as any).rows.map((row: any) => ({
    id: Number(row.id),
    fullName: row.full_name,
    circleId: row.circle_id === null ? null : Number(row.circle_id),
    ageRange: row.age_range ?? null,
    isArchived: row.is_archived === true,
  }));
}

function getDateRange(dateFrom?: string, dateTo?: string): { from: string; to: string; label: string } {
  const today = getMakkahDay();
  if (dateFrom && dateTo) {
    return { from: dateFrom, to: dateTo, label: `${dateFrom} إلى ${dateTo}` };
  }
  const yearStart = getMakkahDaysAgo(365);
  return { from: yearStart, to: today, label: "آخر 365 يومًا" };
}

router.get("/stats/summary", authenticate, async (req, res): Promise<void> => {
  const { dateFrom, dateTo, circleId: circleIdParam } = req.query as Record<string, string | undefined>;
  const range = getDateRange(dateFrom, dateTo);
  const userRole = req.userRole;
  const userId = req.userId;

  let allRecords = await db.select().from(recordsTable)
    .where(and(gte(recordsTable.date, range.from), lte(recordsTable.date, range.to)));

  const circles = await db.select().from(circlesTable);
  const allTracks = await db.select().from(tracksTable);
  const registrationCircleIds = new Set(circles.filter(c => c.trackType === "registration").map(c => c.id));
  const activeEnrollments = await db.select({
    studentId: studentEnrollmentsTable.studentId,
    circleId: studentEnrollmentsTable.circleId,
  }).from(studentEnrollmentsTable)
    .where(eq(studentEnrollmentsTable.isArchived, false));
  const activeCircleIdsByStudent = new Map<number, Set<number>>();
  for (const enrollment of activeEnrollments) {
    if (!activeCircleIdsByStudent.has(enrollment.studentId)) {
      activeCircleIdsByStudent.set(enrollment.studentId, new Set());
    }
    activeCircleIdsByStudent.get(enrollment.studentId)!.add(enrollment.circleId);
  }
  const allStudents = (await loadStatsStudents())
    .filter(s => s.isArchived !== true)
    .filter(s => {
      const circleIds = activeCircleIdsByStudent.get(s.id);
      return (!s.circleId || !registrationCircleIds.has(s.circleId)) ||
        [...(circleIds ?? [])].some(circleId => !registrationCircleIds.has(circleId));
    });
  const allUsers = (await db.select().from(usersTable)).filter(u => u.isArchived !== true);
  const allMemorizations = await db.select({
    studentId: studentMemorizationsTable.studentId,
    pages: studentMemorizationsTable.pages,
  }).from(studentMemorizationsTable);

  let records = allRecords;
  let students = allStudents;

  if (userRole === "track_supervisor" || userRole === "data_entry") {
    const userRecord = allUsers.find(u => u.id === userId);
    const trackCircles = circles.filter(c => c.track === userRecord?.track).map(c => c.id);
    records = allRecords.filter(r => trackCircles.includes(r.circleId));
    students = allStudents.filter(s =>
      (s.circleId != null && trackCircles.includes(s.circleId)) ||
      [...(activeCircleIdsByStudent.get(s.id) ?? [])].some(cid => trackCircles.includes(cid)),
    );
  } else if (userRole === "teacher" || userRole === "supervisor") {
    const userRecord = allUsers.find(u => u.id === userId);
    const circleId = userRecord?.circleId;
    if (circleId) {
      records = allRecords.filter(r => r.circleId === circleId);
      students = allStudents.filter(s =>
        s.circleId === circleId || activeCircleIdsByStudent.get(s.id)?.has(circleId),
      );
    }
  } else if (userRole === "student") {
    const studentId = req.userStudentId;
    const circleId = req.userCircleId;
    records = allRecords.filter(r => r.studentId === studentId && (!circleId || r.circleId === circleId));
    students = students.filter(s => s.id === studentId);
  }

  // فلترة صارمة بـ circleId من الرابط — يتجاوز الفلترة بالدور ويعزل بيانات الحلقة تماماً
  if (circleIdParam) {
    const cid = parseInt(circleIdParam, 10);
    records = records.filter(r => r.circleId === cid);
    students = students.filter(s => s.circleId === cid || activeCircleIdsByStudent.get(s.id)?.has(cid));
  }

  const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);

  // لا نعتمد على اسم المسار في التصنيف؛ الاسم قابل للتغيير (مثل إضافة/إزالة "مسار").
  // نوع المسار هو المصدر الثابت حتى لا تظهر بطاقات الأعداد بصفر رغم وجود الطالبات.
  const trackTypeByCircleId = new Map(
    circles.map(c => [
      c.id,
      c.trackId
        ? (allTracks.find(t => t.id === c.trackId)?.dataEntryType ?? c.trackType ?? "girls")
        : (c.trackType ?? "girls"),
    ]),
  );
  const trackNameByCircleId = new Map(
    circles.map(c => [
      c.id,
      c.trackId
        ? (allTracks.find(t => t.id === c.trackId)?.name ?? c.track)
        : c.track,
    ]),
  );
  // بعض المسارات القديمة محفوظة بنوع simple_review، لذلك نستخدم اسمها
  // الموحّد لتمييز الأطفال والأمهات بدل الاعتماد على نوع غير موجود في البيانات.
  const childrenTrackNames = new Set(["سراج", "ألق"]);
  const mothersTrackNames = new Set(["مهج"]);
  const isChild = (student: typeof students[number]) =>
    [...(activeCircleIdsByStudent.get(student.id) ?? (student.circleId ? new Set([student.circleId]) : new Set()))]
      .some(circleId =>
        trackTypeByCircleId.get(circleId) === "children" ||
        childrenTrackNames.has(trackNameByCircleId.get(circleId) ?? ""),
      );
  const isMother = (student: typeof students[number]) =>
    [...(activeCircleIdsByStudent.get(student.id) ?? (student.circleId ? new Set([student.circleId]) : new Set()))]
      .some(circleId =>
        trackTypeByCircleId.get(circleId) === "mothers" ||
        mothersTrackNames.has(trackNameByCircleId.get(circleId) ?? ""),
      );
  const totalChildren = students.filter(isChild).length;
  const totalMothers = students.filter(isMother).length;
  const totalGirls = students.filter(s => !isChild(s) && !isMother(s)).length;

  const selectedStudentIds = new Set(students.map(student => student.id));
  const historicalMemorizePages = allMemorizations
    .filter(memorization => selectedStudentIds.has(memorization.studentId))
    .reduce((total, memorization) => total + (memorization.pages ?? 0), 0);
  const totalMemorizePages = Math.round((sum(records.map(r => r.memorizePages ?? 0)) + historicalMemorizePages) * 2) / 2;
  const totalReviewNearPages = Math.round(sum(records.map(r => r.reviewNearPages ?? 0)) * 2) / 2;
  const totalReviewFarPages = Math.round(sum(records.map(r => (r.reviewFarPages ?? 0) + (r.reviewFar2Pages ?? 0))) * 2) / 2;
  const totalReviewPages = Math.round(sum(records.map(r => r.reviewPages ?? 0)) * 2) / 2;
  const totalRecitationPages = Math.round(sum(records.map(r => r.recitationPages ?? 0)) * 2) / 2;
  const circleTrackTypeMap: Record<number, string> = {};
  for (const c of circles) {
    if (c.trackId) {
      const t = allTracks.find(t => t.id === c.trackId);
      circleTrackTypeMap[c.id] = t ? t.dataEntryType : (c.trackType ?? "girls");
    } else {
      circleTrackTypeMap[c.id] = c.trackType ?? "girls";
    }
  }

  const totalAbsences = records.filter(r => r.isAbsent).length;
  const totalDeficiencies = records.filter(r => {
    if (r.isAbsent) return false;
    if (r.shortcomingOverride !== null && r.shortcomingOverride !== undefined) return r.shortcomingOverride;
    const trackType = circleTrackTypeMap[r.circleId] ?? "girls";
    if (trackType === "children" || trackType === "mothers" || trackType === "recitation") return false;
    const noReview =
      (r.reviewNearPages ?? 0) === 0 && (r.reviewFarPages ?? 0) === 0 && (r.reviewPages ?? 0) === 0;
    const notListened = r.listenedToReciter === false;
    return noReview || notListened;
  }).length;

  const circlePageMap: Record<number, number> = {};
  const circleAbsenceMap: Record<number, number> = {};
  const circleMemorizeMap: Record<number, number> = {};
  const circleReviewMap: Record<number, number> = {};
  const circleRecitationMap: Record<number, number> = {};

  for (const r of records) {
    circleAbsenceMap[r.circleId] = (circleAbsenceMap[r.circleId] ?? 0) + (r.isAbsent ? 1 : 0);
    if (!r.isAbsent) {
      circlePageMap[r.circleId] = (circlePageMap[r.circleId] ?? 0) +
      (r.memorizePages ?? 0) + (r.reviewNearPages ?? 0) + (r.reviewFarPages ?? 0) + (r.reviewFar2Pages ?? 0) +
        (r.reviewPages ?? 0) + (r.recitationPages ?? 0);
      circleMemorizeMap[r.circleId] = (circleMemorizeMap[r.circleId] ?? 0) + (r.memorizePages ?? 0);
      circleReviewMap[r.circleId] = (circleReviewMap[r.circleId] ?? 0) +
        (r.reviewNearPages ?? 0) + (r.reviewFarPages ?? 0) + (r.reviewFar2Pages ?? 0) + (r.reviewPages ?? 0);
      circleRecitationMap[r.circleId] = (circleRecitationMap[r.circleId] ?? 0) + (r.recitationPages ?? 0);
    }
  }

  let topCircle: string | null = null;
  let topCirclePages: number | null = null;
  const topCircleId = Object.entries(circlePageMap).sort((a, b) => b[1] - a[1])[0]?.[0];
  if (topCircleId) {
    const c = circles.find(c => c.id === parseInt(topCircleId, 10));
    if (c) {
      topCircle = c.name;
      topCirclePages = Math.round((circlePageMap[parseInt(topCircleId, 10)] ?? 0) * 2) / 2;
    }
  }

  // Least absent circle (among circles that have students)
  const circlesWithStudents = circles.filter(c => allStudents.some(s =>
    s.circleId === c.id || activeCircleIdsByStudent.get(s.id)?.has(c.id),
  ));
  let leastAbsentCircle: string | null = null;
  let leastAbsentCircleAbsences: number | null = null;
  const sortedByAbsence = circlesWithStudents
    .filter(c => circleAbsenceMap[c.id] !== undefined || true)
    .sort((a, b) => (circleAbsenceMap[a.id] ?? 0) - (circleAbsenceMap[b.id] ?? 0));
  if (sortedByAbsence.length > 0) {
    leastAbsentCircle = sortedByAbsence[0].name;
    leastAbsentCircleAbsences = circleAbsenceMap[sortedByAbsence[0].id] ?? 0;
  }

  // مشكاة نور specific stats
  const moshkahCircles = circles.filter(c => c.track === "مشكاة نور");
  const getMoshkahTop = (map: Record<number, number>): { name: string | null; pages: number | null } => {
    const top = moshkahCircles
      .filter(c => (map[c.id] ?? 0) > 0)
      .sort((a, b) => (map[b.id] ?? 0) - (map[a.id] ?? 0))[0];
    if (!top) return { name: null, pages: null };
    return { name: top.name, pages: Math.round((map[top.id] ?? 0) * 2) / 2 };
  };

  const moshkahMemorize = getMoshkahTop(circleMemorizeMap);
  const moshkahReview = getMoshkahTop(circleReviewMap);
  const moshkahRecitation = getMoshkahTop(circleRecitationMap);

  const teacherCount = allUsers.filter(u => u.role === "teacher" && !u.isArchived).length;
  const supervisorCount = allUsers.filter(u => u.role === "supervisor" && !u.isArchived).length;
  const trackSupervisorCount = allUsers.filter(u => u.role === "track_supervisor" && !u.isArchived).length;
  const studentCount = students.length;

  const ageRanges = ["أقل من 10 سنوات", "10-15", "16-20", "21-30", "31-40", "41-50", "51+"];
  const ageDistribution = ageRanges.map(age => ({
    age,
    count: students.filter(s => s.ageRange === age).length,
  })).filter(a => a.count > 0);

  // إحصائيات التثبيت الجديد لمسار سُنى (fixation track type)
  const fixationCircleIds = circles.filter(c => {
    const trackType = circleTrackTypeMap[c.id];
    return trackType === "fixation";
  }).map(c => c.id);
  const totalFixationPages = Math.round(
    records.filter(r => fixationCircleIds.includes(r.circleId) && !r.isAbsent)
      .reduce((s, r) => s + (r.memorizePages ?? 0), 0) * 2
  ) / 2;

  res.json({
    totalMemorizePages,
    totalReviewNearPages,
    totalReviewFarPages,
    totalReviewPages,
    totalRecitationPages,
    totalGirlsStudents: totalGirls,
    totalMothersStudents: totalMothers,
    totalChildrenStudents: totalChildren,
    totalAbsences,
    totalDeficiencies,
    topCircle,
    topCirclePages,
    leastAbsentCircle,
    leastAbsentCircleAbsences,
    moshkahTopMemorize: moshkahMemorize.name,
    moshkahTopMemorizePages: moshkahMemorize.pages,
    moshkahTopReview: moshkahReview.name,
    moshkahTopReviewPages: moshkahReview.pages,
    moshkahTopRecitation: moshkahRecitation.name,
    moshkahTopRecitationPages: moshkahRecitation.pages,
    periodLabel: range.label,
    teacherCount,
    supervisorCount,
    trackSupervisorCount,
    studentCount,
    ageDistribution,
    totalFixationPages,
  });
});

router.get("/stats/circles", authenticate, async (req, res): Promise<void> => {
  const { dateFrom, dateTo } = req.query as Record<string, string | undefined>;
  const range = getDateRange(dateFrom, dateTo);
  const userRole = req.userRole;
  const userId = req.userId;

  const allRecords = await db.select().from(recordsTable)
    .where(and(gte(recordsTable.date, range.from), lte(recordsTable.date, range.to)));

  const teacherAbsences = await db.select().from(teacherAbsencesTable)
    .where(and(gte(teacherAbsencesTable.date, range.from), lte(teacherAbsencesTable.date, range.to)));

  let circles = await db.select().from(circlesTable);
  const allTracksCircles = await db.select().from(tracksTable);
  const students = (await loadStatsStudents()).filter(s => s.isArchived !== true);
  const allUsers = (await db.select().from(usersTable)).filter(u => u.isArchived !== true);

  if (userRole === "track_supervisor" || userRole === "data_entry") {
    const userRecord = allUsers.find(u => u.id === userId);
    circles = circles.filter(c => c.track === userRecord?.track);
  } else if (userRole === "teacher" || userRole === "supervisor") {
    const userRecord = allUsers.find(u => u.id === userId);
    const circleId = userRecord?.circleId;
    if (circleId) circles = circles.filter(c => c.id === circleId);
  }

  const resolveTrackType = (c: typeof circles[number]): string => {
    if (c.trackId) {
      const t = allTracksCircles.find(t => t.id === c.trackId);
      if (t) return t.dataEntryType;
    }
    return c.trackType ?? "girls";
  };

  const result = circles.map(c => {
    const cRecords = allRecords.filter(r => r.circleId === c.id);
    const cStudents = students.filter(s => s.circleId === c.id);
    const cTeacherAbsences = teacherAbsences.filter(a => a.circleId === c.id).length;
    const circleTrackType = resolveTrackType(c);
    return {
      circleId: c.id,
      circleName: c.name,
      track: c.track,
      trackType: circleTrackType,
      totalMemorizePages: Math.round(cRecords.reduce((a, r) => a + (r.memorizePages ?? 0), 0) * 2) / 2,
      totalReviewNearPages: Math.round(cRecords.reduce((a, r) => a + (r.reviewNearPages ?? 0), 0) * 2) / 2,
      totalReviewFarPages: Math.round(cRecords.reduce((a, r) => a + (r.reviewFarPages ?? 0) + (r.reviewFar2Pages ?? 0), 0) * 2) / 2,
      totalReviewPages: Math.round(cRecords.reduce((a, r) => a + (r.reviewNearPages ?? 0) + (r.reviewFarPages ?? 0) + (r.reviewFar2Pages ?? 0) + (r.reviewPages ?? 0), 0) * 2) / 2,
      totalRecitationPages: Math.round(cRecords.reduce((a, r) => a + (r.recitationPages ?? 0), 0) * 2) / 2,
      totalAbsences: cRecords.filter(r => r.isAbsent).length,
      teacherAbsences: cTeacherAbsences,
      studentCount: cStudents.length,
      deficiencyCount: cRecords.filter(r => {
        if (r.isAbsent) return false;
        if (r.shortcomingOverride !== null && r.shortcomingOverride !== undefined) return r.shortcomingOverride;
        if (circleTrackType === "children" || circleTrackType === "mothers" || circleTrackType === "recitation") return false;
        const noReview =
          (r.reviewNearPages ?? 0) === 0 && (r.reviewFarPages ?? 0) === 0 &&
          (r.reviewFar2Pages ?? 0) === 0 && (r.reviewPages ?? 0) === 0;
        const noListened = r.listenedToReciter === false;
        return noReview || noListened;
      }).length,
    };
  });

  res.json(result);
});

router.get("/stats/my-progress", authenticate, async (req, res): Promise<void> => {
  const userId = req.userId;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const userRecord = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  const user = userRecord[0];
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const studentId = req.userStudentId;
  const records = studentId
    ? await db.select().from(recordsTable).where(eq(recordsTable.studentId, studentId))
    : [];

  const sortedRecords = records.sort((a, b) => b.date.localeCompare(a.date));
  const latestRecord = sortedRecords.find(r => !r.isAbsent);

  const totalMemorize = Math.round(records.reduce((s, r) => s + (r.memorizePages ?? 0), 0) * 2) / 2;
  const totalReview = Math.round(records.reduce((s, r) => s + (r.reviewNearPages ?? 0) + (r.reviewFarPages ?? 0) + (r.reviewFar2Pages ?? 0) + (r.reviewPages ?? 0), 0) * 2) / 2;
  const totalRecitation = Math.round(records.reduce((s, r) => s + (r.recitationPages ?? 0), 0) * 2) / 2;
  const totalAbsences = records.filter(r => r.isAbsent).length;
  const totalSessions = records.filter(r => !r.isAbsent).length;

  const TOTAL_QURAN_PAGES = 604;
  const progressPercent = Math.min(100, Math.round((totalMemorize / TOTAL_QURAN_PAGES) * 100 * 10) / 10);

  res.json({
    userId: studentId ?? userId,
    name: user.name,
    totalMemorizePages: totalMemorize,
    totalReviewPages: totalReview,
    totalRecitationPages: totalRecitation,
    totalAbsences,
    totalSessions,
    progressPercent,
    latestMemorizeSurahStart: latestRecord?.memorizeSurahStart ?? null,
    latestMemorizeSurahEnd: latestRecord?.memorizeSurahEnd ?? null,
    latestMemorizePages: latestRecord?.memorizePages ?? 0,
    records: sortedRecords.slice(0, 30).map(r => ({
      id: r.id,
      date: r.date,
      isAbsent: r.isAbsent,
      memorizePages: r.memorizePages,
      reviewNearPages: r.reviewNearPages,
      reviewFarPages: r.reviewFarPages,
      reviewPages: r.reviewPages,
      recitationPages: r.recitationPages,
      memorizeSurahStart: r.memorizeSurahStart,
      memorizeSurahEnd: r.memorizeSurahEnd,
    })),
  });
});

router.get("/stats/monthly-comparison", authenticate, async (req, res): Promise<void> => {
  const { circleId: circleIdParam } = req.query as Record<string, string | undefined>;
  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 10);
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().slice(0, 10);
  const todayStr = getMakkahDay();

  let thisMonthRecords = await db.select().from(recordsTable)
    .where(and(gte(recordsTable.date, thisMonthStart), lte(recordsTable.date, todayStr)));
  let lastMonthRecords = await db.select().from(recordsTable)
    .where(and(gte(recordsTable.date, lastMonthStart), lte(recordsTable.date, lastMonthEnd)));

  if (circleIdParam) {
    const cid = parseInt(circleIdParam, 10);
    thisMonthRecords = thisMonthRecords.filter(r => r.circleId === cid);
    lastMonthRecords = lastMonthRecords.filter(r => r.circleId === cid);
  }

  const calcStats = (records: typeof thisMonthRecords) => {
    const absences = records.filter(r => r.isAbsent).length;
    const total = records.length;
    const present = total - absences;
    const pages = records.reduce((s, r) =>
      s + (r.memorizePages ?? 0) + (r.reviewNearPages ?? 0) + (r.reviewFarPages ?? 0) + (r.reviewFar2Pages ?? 0) +
      (r.reviewPages ?? 0) + (r.recitationPages ?? 0), 0);
    const attendanceRate = total > 0 ? Math.round((present / total) * 100) : null;
    return { total, absences, present, pages: Math.round(pages * 2) / 2, attendanceRate };
  };

  const thisMonth = calcStats(thisMonthRecords);
  const lastMonth = calcStats(lastMonthRecords);

  const trend = (curr: number | null, prev: number | null): "up" | "down" | "same" => {
    if (curr == null || prev == null) return "same";
    if (curr > prev) return "up";
    if (curr < prev) return "down";
    return "same";
  };

  res.json({
    thisMonth,
    lastMonth,
    trends: {
      absences: trend(thisMonth.absences, lastMonth.absences),
      pages: trend(thisMonth.pages, lastMonth.pages),
      attendanceRate: trend(thisMonth.attendanceRate, lastMonth.attendanceRate),
    },
  });
});

router.get("/stats/today-banner", async (_req, res): Promise<void> => {
  const today = getMakkahDay();
  const records = await db.select().from(recordsTable).where(eq(recordsTable.date, today));
  const circles = await db.select().from(circlesTable).where(eq(circlesTable.isArchived, false));
  const students = await db.select().from(studentsTable).where(eq(studentsTable.isArchived, false));

  const circleMap: Record<number, { total: number; present: number; absences: number }> = {};
  for (const r of records) {
    if (!circleMap[r.circleId]) circleMap[r.circleId] = { total: 0, present: 0, absences: 0 };
    if (r.isAbsent) {
      circleMap[r.circleId].absences++;
    } else {
      circleMap[r.circleId].total += (r.memorizePages ?? 0) + (r.reviewNearPages ?? 0) +
        (r.reviewFarPages ?? 0) + (r.reviewFar2Pages ?? 0) + (r.reviewPages ?? 0) + (r.recitationPages ?? 0);
      circleMap[r.circleId].present++;
    }
  }

  const circlesWithStudents = circles.filter(c => students.some(s => s.circleId === c.id));

  const achievement = circlesWithStudents
    .filter(c => circleMap[c.id] && circleMap[c.id].total > 0)
    .sort((a, b) => (circleMap[b.id]?.total ?? 0) - (circleMap[a.id]?.total ?? 0))
    .slice(0, 5)
    .map(c => ({
      circleName: c.name,
      track: c.track,
      totalPages: Math.round((circleMap[c.id]?.total ?? 0) * 2) / 2,
      presentCount: circleMap[c.id]?.present ?? 0,
      absences: circleMap[c.id]?.absences ?? 0,
    }));

  // Circles where ALL students are present today (zero absences)
  const studentCountByCircle: Record<number, number> = {};
  for (const s of students) {
    if (s.circleId) {
      studentCountByCircle[s.circleId] = (studentCountByCircle[s.circleId] ?? 0) + 1;
    }
  }

  const fullAttendance = circlesWithStudents
    .filter(c => {
      const data = circleMap[c.id];
      if (!data) return false;
      const totalStudents = studentCountByCircle[c.id] ?? 0;
      return data.absences === 0 && data.present >= totalStudents && totalStudents > 0;
    })
    .map(c => ({
      circleName: c.name,
      track: c.track,
      totalPages: Math.round((circleMap[c.id]?.total ?? 0) * 2) / 2,
      presentCount: circleMap[c.id]?.present ?? 0,
      absences: 0,
    }));

  res.json({ achievement, leastAbsent: fullAttendance });
});

router.get("/stats/monthly-report", authenticate, async (req, res): Promise<void> => {
  if (!["leader", "track_supervisor"].includes(req.userRole!)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const monthParam = req.query.month as string | undefined;
  const weekStartParam = req.query.weekStart as string | undefined;
  let fromDate: string;
  let toDate: string;
  if (weekStartParam && /^\d{4}-\d{2}-\d{2}$/.test(weekStartParam)) {
    fromDate = weekStartParam;
    const end = new Date(weekStartParam);
    end.setDate(end.getDate() + 6);
    toDate = end.toISOString().slice(0, 10);
  } else if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
    fromDate = `${monthParam}-01`;
    const [y, m] = monthParam.split("-").map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    toDate = `${monthParam}-${String(lastDay).padStart(2, "0")}`;
  } else {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth() + 1;
    fromDate = `${y}-${String(m).padStart(2, "0")}-01`;
    const lastDay = new Date(y, m, 0).getDate();
    toDate = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  }

  const allCircles = await db.select().from(circlesTable).where(eq(circlesTable.isArchived, false));
  const allStudents = await db.select().from(studentsTable).where(eq(studentsTable.isArchived, false));

  // Filter by track for track_supervisor
  let circles = allCircles;
  if (req.userRole === "track_supervisor") {
    const [u] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!));
    circles = allCircles.filter(c => c.track === u?.track);
  }

  const records = await db.select().from(recordsTable)
    .where(and(gte(recordsTable.date, fromDate), lte(recordsTable.date, toDate)));

  const result = circles.map(circle => {
    const circleStudents = allStudents.filter(s => s.circleId === circle.id);
    const circleRecords = records.filter(r => r.circleId === circle.id);

    const students = circleStudents.map(s => {
      const sRecords = circleRecords.filter(r => r.studentId === s.id);
      const sessions = sRecords.length;
      const absences = sRecords.filter(r => r.isAbsent).length;
      const attendanceRate = sessions > 0 ? Math.round(((sessions - absences) / sessions) * 100) : null;
      return { studentId: s.id, studentName: s.fullName, sessions, absences, attendanceRate };
    });

    const totalSessions = students.reduce((sum, s) => sum + s.sessions, 0);
    const totalAbsences = students.reduce((sum, s) => sum + s.absences, 0);
    const attendanceRate = totalSessions > 0 ? Math.round(((totalSessions - totalAbsences) / totalSessions) * 100) : null;

    return {
      circleId: circle.id,
      circleName: circle.name,
      track: circle.track,
      totalStudents: circleStudents.length,
      totalSessions,
      totalAbsences,
      attendanceRate,
      students,
    };
  });

  res.json(result);
});

router.get("/stats/daily-snapshot", authenticate, async (req, res): Promise<void> => {
  const today = getMakkahDay();
  const weekAgo = getMakkahDaysAgo(7);
  const weekFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const allStudents = await db.select().from(studentsTable)
    .leftJoin(circlesTable, eq(studentsTable.circleId, circlesTable.id))
    .where(eq(studentsTable.isArchived, false));

  const activeCircles = await db.select().from(circlesTable).where(eq(circlesTable.isArchived, false));

  // Students currently on active leave
  const onLeave = allStudents.filter(s =>
    s.students.leaveStart && s.students.leaveEnd &&
    s.students.leaveStart <= today && today <= s.students.leaveEnd
  );

  // Students whose leave expires in next 7 days (including today)
  const leavingThisWeek = allStudents.filter(s =>
    s.students.leaveEnd &&
    s.students.leaveEnd >= today &&
    s.students.leaveEnd <= weekFromNow &&
    s.students.leaveStart && s.students.leaveStart <= today
  ).map(s => ({
    studentId: s.students.id,
    studentName: s.students.fullName,
    leaveEnd: s.students.leaveEnd!,
    circleName: s.circles?.name ?? "—",
    track: s.circles?.track ?? "—",
  }));

  // Circles recorded today
  const todayRecords = await db.select({ circleId: recordsTable.circleId })
    .from(recordsTable)
    .where(eq(recordsTable.date, today));
  const circlesRecordedTodaySet = new Set(todayRecords.map(r => r.circleId));

  // Circles with students but no records in the past 7 days
  const weekRecords = await db.select({ circleId: recordsTable.circleId, date: recordsTable.date })
    .from(recordsTable)
    .where(and(gte(recordsTable.date, weekAgo), lte(recordsTable.date, today)));
  const lastRecordByCircle: Record<number, string> = {};
  for (const r of weekRecords) {
    if (!lastRecordByCircle[r.circleId] || r.date > lastRecordByCircle[r.circleId]) {
      lastRecordByCircle[r.circleId] = r.date;
    }
  }

  // Circles that have active students but no records in the last 7 days
  const studentCountByCircle: Record<number, number> = {};
  for (const s of allStudents) {
    if (s.students.circleId && !s.students.leaveStart) {
      studentCountByCircle[s.students.circleId] = (studentCountByCircle[s.students.circleId] ?? 0) + 1;
    }
  }

  const circlesNotRecordedInWeek = activeCircles
    .filter(c => (studentCountByCircle[c.id] ?? 0) > 0 && !lastRecordByCircle[c.id])
    .map(c => ({
      circleId: c.id,
      circleName: c.name,
      track: c.track,
      daysSinceLastRecord: null as number | null,
    }));

  // Circles with students but last record was 7+ days ago
  const circlesRecordedLongAgo = activeCircles
    .filter(c => (studentCountByCircle[c.id] ?? 0) > 0 && lastRecordByCircle[c.id])
    .map(c => {
      const last = lastRecordByCircle[c.id];
      const days = Math.floor((Date.now() - new Date(last).getTime()) / (24 * 60 * 60 * 1000));
      return { circleId: c.id, circleName: c.name, track: c.track, daysSinceLastRecord: days };
    })
    .filter(c => c.daysSinceLastRecord >= 7)
    .sort((a, b) => (b.daysSinceLastRecord ?? 0) - (a.daysSinceLastRecord ?? 0));

  res.json({
    today,
    studentsOnLeave: onLeave.length,
    leavingThisWeek,
    circlesRecordedToday: circlesRecordedTodaySet.size,
    totalActiveCircles: activeCircles.filter(c => (studentCountByCircle[c.id] ?? 0) > 0).length,
    circlesNotRecordedInWeek: [...circlesNotRecordedInWeek, ...circlesRecordedLongAgo],
  });
});

router.get("/stats/attendance-by-date", authenticate, async (req, res): Promise<void> => {
  const date = req.query.date as string;
  if (!date) { res.status(400).json({ error: "date required" }); return; }

  const records = await db
    .select({
      studentId: recordsTable.studentId,
      isAbsent: recordsTable.isAbsent,
    })
    .from(recordsTable)
    .where(eq(recordsTable.date, date));

  const presentIds = new Set(records.filter(r => !r.isAbsent).map(r => r.studentId));
  const absentIds = new Set(records.filter(r => r.isAbsent).map(r => r.studentId));

  const allStudents = await db
    .select({
      id: studentsTable.id,
      fullName: studentsTable.fullName,
      circleId: studentsTable.circleId,
      track: circlesTable.track,
      circleName: circlesTable.name,
    })
    .from(studentsTable)
    .leftJoin(circlesTable, eq(studentsTable.circleId, circlesTable.id))
    .where(eq(studentsTable.isArchived, false));

  const toRow = (s: typeof allStudents[0]) => ({
    studentId: s.id,
    studentName: s.fullName,
    circleId: s.circleId ?? null,
    circleName: s.circleName ?? null,
    track: s.track ?? null,
  });

  res.json({
    date,
    absent: allStudents.filter(s => absentIds.has(s.id)).map(toRow),
    present: allStudents.filter(s => presentIds.has(s.id)).map(toRow),
  });
});

router.get("/stats/teacher-records", authenticate, async (req, res): Promise<void> => {
  const allowed = ["leader", "track_supervisor"];
  if (!allowed.includes(req.userRole!)) { res.status(403).json({ error: "Forbidden" }); return; }

  const { days } = req.query as { days?: string };
  const periodDays = days ? parseInt(days) : 30;
  const now = new Date();
  const fromDate = new Date(now.getTime() - periodDays * 24 * 60 * 60 * 1000);
  const fromStr = fromDate.toISOString().split("T")[0];
  const toStr = now.toISOString().split("T")[0];

  const allTeachers = await db.select().from(usersTable)
    .where(and(eq(usersTable.role, "teacher"), eq(usersTable.isArchived, false)));
  const allCircles = await db.select().from(circlesTable);
  const circleMap: Record<number, { name: string; track: string }> = {};
  allCircles.forEach(c => { circleMap[c.id] = { name: c.name, track: c.track ?? "" }; });

  const absences = await db.select().from(teacherAbsencesTable)
    .where(and(gte(teacherAbsencesTable.date, fromStr), lte(teacherAbsencesTable.date, toStr)));
  const absencesByCircle: Record<number, number> = {};
  absences.forEach(a => { absencesByCircle[a.circleId] = (absencesByCircle[a.circleId] ?? 0) + 1; });

  const dailyTasks = await db.select().from(dailyCircleTasksTable)
    .where(and(gte(dailyCircleTasksTable.date, fromStr), lte(dailyCircleTasksTable.date, toStr)));
  const tardyByCircle: Record<number, number> = {};
  const prepIssuesByCircle: Record<number, number> = {};
  dailyTasks.forEach(t => {
    if (t.teacherAttendance && t.teacherAttendance.includes("متأخر")) {
      tardyByCircle[t.circleId] = (tardyByCircle[t.circleId] ?? 0) + 1;
    }
    if (t.prepStatus && !t.prepStatus.includes("جيد") && !t.prepStatus.includes("ممتاز") && !t.prepStatus.includes("حاضر")) {
      prepIssuesByCircle[t.circleId] = (prepIssuesByCircle[t.circleId] ?? 0) + 1;
    }
  });

  const result = allTeachers
    .filter(t => t.circleId)
    .map(t => {
      const circle = circleMap[t.circleId!];
      return {
        teacherId: t.id,
        teacherName: t.name,
        circleId: t.circleId,
        circleName: circle?.name ?? "غير معروف",
        track: circle?.track ?? "",
        absenceCount: absencesByCircle[t.circleId!] ?? 0,
        tardyCount: tardyByCircle[t.circleId!] ?? 0,
        prepIssueCount: prepIssuesByCircle[t.circleId!] ?? 0,
      };
    })
    .sort((a, b) => b.absenceCount - a.absenceCount);

  res.json(result);
});

router.get("/stats/juz-stats", authenticate, async (req, res): Promise<void> => {
  const userRole = req.userRole;
  const userId = req.userId;

  const allCircles = await db.select().from(circlesTable);
  const allUsers = await db.select().from(usersTable).where(eq(usersTable.isArchived, false));
  let students = await db.select().from(studentsTable).where(eq(studentsTable.isArchived, false));

  if (userRole === "track_supervisor" || userRole === "data_entry") {
    const userRecord = allUsers.find(u => u.id === userId);
    const trackCircles = allCircles.filter(c => c.track === userRecord?.track).map(c => c.id);
    students = students.filter(s => s.circleId && trackCircles.includes(s.circleId));
  } else if (userRole === "teacher" || userRole === "supervisor") {
    const userRecord = allUsers.find(u => u.id === userId);
    const circleId = userRecord?.circleId;
    if (circleId) students = students.filter(s => s.circleId === circleId);
  }

  const studentIds = students.map(s => s.id);
  if (studentIds.length === 0) {
    res.json({ examsByJuz: [], nearingJuzCompletion: 0, completedJuzNotTested: 0 });
    return;
  }

  const allStudentRecords = await db.select({
    studentId: recordsTable.studentId,
    memorizePages: recordsTable.memorizePages,
    isAbsent: recordsTable.isAbsent,
  }).from(recordsTable);

  const memorizeByStudent: Record<number, number> = {};
  for (const r of allStudentRecords) {
    if (!studentIds.includes(r.studentId)) continue;
    if (r.isAbsent) continue;
    memorizeByStudent[r.studentId] = (memorizeByStudent[r.studentId] ?? 0) + (r.memorizePages ?? 0);
  }

  const PAGES_PER_JUZ = 20;

  let nearingJuzCompletion = 0;
  const completedJuzByStudent: Record<number, number> = {};

  for (const studentId of studentIds) {
    const total = Math.round((memorizeByStudent[studentId] ?? 0) * 2) / 2;
    if (total <= 0) continue;

    const position = Math.round((total % PAGES_PER_JUZ) * 2) / 2;

    if (position === 0) {
      const completedJuz = Math.round(total / PAGES_PER_JUZ);
      if (completedJuz > 0 && completedJuz <= 30) {
        completedJuzByStudent[studentId] = completedJuz;
      }
    } else if (position >= PAGES_PER_JUZ - 2) {
      nearingJuzCompletion++;
    }
  }

  const allExamRecords = await db.select().from(examRecordsTable);
  const studentExamRecords = allExamRecords.filter(e => studentIds.includes(e.studentId));

  let completedJuzNotTested = 0;
  for (const [studentIdStr, juzNum] of Object.entries(completedJuzByStudent)) {
    const studentId = parseInt(studentIdStr);
    const hasExam = studentExamRecords.some(e => e.studentId === studentId && e.juzNumber === juzNum);
    if (!hasExam) completedJuzNotTested++;
  }

  const examsByJuzMap: Record<number, Set<number>> = {};
  for (const e of studentExamRecords) {
    if (e.juzNumber == null) continue;
    if (!examsByJuzMap[e.juzNumber]) examsByJuzMap[e.juzNumber] = new Set();
    examsByJuzMap[e.juzNumber].add(e.studentId);
  }

  const examsByJuz = Object.entries(examsByJuzMap)
    .map(([juz, studs]) => ({ juzNumber: parseInt(juz), count: studs.size }))
    .sort((a, b) => a.juzNumber - b.juzNumber);

  res.json({
    examsByJuz,
    nearingJuzCompletion,
    completedJuzNotTested,
  });
});

// مقارنة الأسبوع الحالي بالأسبوع الماضي
router.get("/stats/weekly-comparison", authenticate, async (req, res): Promise<void> => {
  const todayStr = getMakkahDay();

  // الأسبوع الحالي: من الأحد حتى اليوم
  const thisWeekStart = getMakkahWeekStart();
  // الأسبوع الماضي: الأحد السابق حتى السبت
  const lastWeekStart = getMakkahLastWeekStart();
  const lastWeekEnd   = getMakkahLastWeekEnd();

  const userRole = req.userRole;
  const userId   = req.userId;

  const { circleId: circleIdParam } = req.query as Record<string, string | undefined>;
  const allCircles  = await db.select().from(circlesTable);
  const allUsers    = await db.select().from(usersTable).where(eq(usersTable.isArchived, false));

  let circleIds: number[] | null = null;
  if (userRole === "track_supervisor" || userRole === "data_entry") {
    const u = allUsers.find(u => u.id === userId);
    circleIds = allCircles.filter(c => c.track === u?.track).map(c => c.id);
  } else if (userRole === "teacher" || userRole === "supervisor") {
    const u = allUsers.find(u => u.id === userId);
    circleIds = u?.circleId ? [u.circleId] : [];
  }
  // فلترة صارمة بـ circleId من الرابط — تتجاوز الفلترة بالدور
  if (circleIdParam) {
    circleIds = [parseInt(circleIdParam, 10)];
  }

  const thisRecs = await db.select().from(recordsTable)
    .where(and(gte(recordsTable.date, thisWeekStart), lte(recordsTable.date, todayStr)));
  const lastRecs = await db.select().from(recordsTable)
    .where(and(gte(recordsTable.date, lastWeekStart), lte(recordsTable.date, lastWeekEnd)));

  const filterByCircles = (recs: typeof thisRecs) =>
    circleIds ? recs.filter(r => circleIds!.includes(r.circleId)) : recs;

  const thisFiltered = filterByCircles(thisRecs);
  const lastFiltered = filterByCircles(lastRecs);

  const allStudentsWC = await db.select().from(studentsTable).where(eq(studentsTable.isArchived, false));

  const calcWeek = (recs: typeof thisRecs) => {
    const present  = recs.filter(r => !r.isAbsent);
    const absences = recs.filter(r => r.isAbsent).length;
    const total    = recs.length;
    const memorize = Math.round(present.reduce((s, r) => s + (r.memorizePages ?? 0), 0) * 2) / 2;
    const reviewNear = Math.round(present.reduce((s, r) => s + (r.reviewNearPages ?? 0), 0) * 2) / 2;
    const reviewFar  = Math.round(present.reduce((s, r) => s + (r.reviewFarPages ?? 0), 0) * 2) / 2;
    const review     = Math.round(present.reduce((s, r) => s + (r.reviewPages ?? 0), 0) * 2) / 2;
    const totalPages = Math.round((memorize + reviewNear + reviewFar + review) * 2) / 2;
    const attendanceRate = total > 0 ? Math.round(((total - absences) / total) * 100) : null;

    // أفضل 3 طالبات (أعلى حفظ)
    const byStudent: Record<number, number> = {};
    for (const r of present) {
      byStudent[r.studentId] = (byStudent[r.studentId] ?? 0) + (r.memorizePages ?? 0);
    }
    const topStudents = Object.entries(byStudent)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([id, pages]) => ({
        name: allStudentsWC.find(s => s.id === parseInt(id))?.fullName ?? `#${id}`,
        pages: Math.round(pages * 2) / 2,
      }));

    // أفضل حلقة (أعلى إجمالي)
    const byCircle: Record<number, number> = {};
    for (const r of present) {
      byCircle[r.circleId] = (byCircle[r.circleId] ?? 0) +
        (r.memorizePages ?? 0) + (r.reviewNearPages ?? 0) + (r.reviewFarPages ?? 0) + (r.reviewPages ?? 0);
    }
    const topCircleId = Object.entries(byCircle).sort((a, b) => b[1] - a[1])[0]?.[0];
    const topCircleName = topCircleId ? allCircles.find(c => c.id === parseInt(topCircleId))?.name : null;
    const topCirclePages = topCircleId ? Math.round(byCircle[parseInt(topCircleId)] * 2) / 2 : 0;

    return { memorize, reviewNear, reviewFar, review, totalPages, absences, total, attendanceRate,
             topStudents, topCircleName, topCirclePages };
  };

  const trend = (curr: number | null, prev: number | null): "up" | "down" | "same" => {
    if (curr == null || prev == null || prev === 0) return curr && curr > 0 ? "up" : "same";
    if (curr > prev) return "up";
    if (curr < prev) return "down";
    return "same";
  };
  const pct = (curr: number | null, prev: number | null): number | null => {
    if (curr == null || prev == null || prev === 0) return null;
    return Math.round(((curr - prev) / prev) * 100);
  };

  const thisWeek = await calcWeek(thisFiltered);
  const lastWeek = await calcWeek(lastFiltered);

  res.json({
    thisWeek,
    lastWeek,
    trends: {
      memorize:      trend(thisWeek.memorize, lastWeek.memorize),
      reviewNear:    trend(thisWeek.reviewNear, lastWeek.reviewNear),
      reviewFar:     trend(thisWeek.reviewFar, lastWeek.reviewFar),
      totalPages:    trend(thisWeek.totalPages, lastWeek.totalPages),
      absences:      trend(thisWeek.absences, lastWeek.absences),
      attendanceRate:trend(thisWeek.attendanceRate, lastWeek.attendanceRate),
    },
    changes: {
      memorize:      pct(thisWeek.memorize, lastWeek.memorize),
      reviewNear:    pct(thisWeek.reviewNear, lastWeek.reviewNear),
      reviewFar:     pct(thisWeek.reviewFar, lastWeek.reviewFar),
      totalPages:    pct(thisWeek.totalPages, lastWeek.totalPages),
      absences:      pct(thisWeek.absences, lastWeek.absences),
      attendanceRate:pct(thisWeek.attendanceRate, lastWeek.attendanceRate),
    },
  });
});

// ── تقرير أداء المعلمات ────────────────────────────────────────────────────
router.get("/stats/teacher-performance", authenticate, async (req, res): Promise<void> => {
  const role = req.userRole!;
  if (!["leader", "track_supervisor"].includes(role)) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  const userId = req.userId;

  const { dateFrom, dateTo } = req.query as Record<string, string | undefined>;
  const today = getMakkahDay();
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
  const from = dateFrom ?? monthStart;
  const to   = dateTo   ?? today;

  const allCircles  = await db.select().from(circlesTable);
  const allUsers    = await db.select().from(usersTable).where(eq(usersTable.isArchived, false));
  const allStudents = await db.select().from(studentsTable).where(eq(studentsTable.isArchived, false));
  const allTracks   = await db.select().from(tracksTable);

  // فلترة المسار للمسؤولة
  let visibleCircleIds: number[] | null = null;
  if (role === "track_supervisor") {
    const me = allUsers.find(u => u.id === userId);
    visibleCircleIds = allCircles.filter(c => c.track === me?.track).map(c => c.id);
  }

  // جلب السجلات وغيابات المعلمات
  const records = await db.select().from(recordsTable)
    .where(and(gte(recordsTable.date, from), lte(recordsTable.date, to)));
  const teacherAbsences = await db.select().from(teacherAbsencesTable)
    .where(and(gte(teacherAbsencesTable.date, from), lte(teacherAbsencesTable.date, to)));

  // خريطة نوع المسار
  const circleTrackTypeMap: Record<number, string> = {};
  for (const c of allCircles) {
    if (c.trackId) {
      const t = allTracks.find(t => t.id === c.trackId);
      circleTrackTypeMap[c.id] = t ? t.dataEntryType : (c.trackType ?? "girls");
    } else {
      circleTrackTypeMap[c.id] = c.trackType ?? "girls";
    }
  }

  // حساب التقصير لسجل واحد
  const isShortcoming = (r: typeof recordsTable.$inferSelect): boolean => {
    if (r.isAbsent) return false;
    if (r.shortcomingOverride !== null && r.shortcomingOverride !== undefined) return r.shortcomingOverride;
    const trackType = circleTrackTypeMap[r.circleId];
    if (trackType === "children" || trackType === "mothers" || trackType === "recitation") return false;
    const noReview =
      (r.reviewNearPages ?? 0) === 0 && (r.reviewFarPages ?? 0) === 0 &&
      (r.reviewFar2Pages ?? 0) === 0 && (r.reviewPages ?? 0) === 0;
    const notListened = r.listenedToReciter === false;
    return noReview || notListened;
  };

  // بناء تقرير لكل معلمة/مشرفة
  const teachers = allUsers.filter(u =>
    (u.role === "teacher" || u.role === "supervisor") &&
    u.circleId &&
    (visibleCircleIds ? visibleCircleIds.includes(u.circleId) : true)
  );

  const result = teachers.map(teacher => {
    const circle = allCircles.find(c => c.id === teacher.circleId);
    if (!circle) return null;

    const circleRecords = records.filter(r => r.circleId === teacher.circleId);
    const studentIds = allStudents.filter(s => s.circleId === teacher.circleId).map(s => s.id);

    const totalSessions   = circleRecords.length;
    const absenceCount    = circleRecords.filter(r => r.isAbsent).length;
    const presentRecords  = circleRecords.filter(r => !r.isAbsent);
    const attendanceRate  = totalSessions > 0 ? Math.round(((totalSessions - absenceCount) / totalSessions) * 100) : null;
    const deficiencyCount = circleRecords.filter(isShortcoming).length;
    const memorizePages   = Math.round(presentRecords.reduce((s, r) => s + (r.memorizePages ?? 0), 0) * 2) / 2;
    const reviewPages     = Math.round(presentRecords.reduce((s, r) =>
      s + (r.reviewNearPages ?? 0) + (r.reviewFarPages ?? 0) + (r.reviewFar2Pages ?? 0) + (r.reviewPages ?? 0), 0) * 2) / 2;

    const teacherAbsCount = teacherAbsences.filter(ta => ta.circleId === teacher.circleId).length;
    const studentCount    = studentIds.length;

    // نقاط الأداء: حضور الطالبات (40%) + حفظ لكل طالبة (40%) - تقصير (20%)
    const avgMemorizePerStudent = studentCount > 0 ? memorizePages / studentCount : 0;
    const deficiencyRate = totalSessions > 0 ? (deficiencyCount / totalSessions) * 100 : 0;
    const performanceScore = Math.round(
      (attendanceRate ?? 0) * 0.4 +
      Math.min(avgMemorizePerStudent * 10, 40) -
      deficiencyRate * 0.2 -
      teacherAbsCount * 3
    );

    return {
      teacherId: teacher.id,
      teacherName: teacher.name,
      circleId: circle.id,
      circleName: circle.name,
      track: circle.track,
      teacherAbsences: teacherAbsCount,
      studentCount,
      totalSessions,
      absenceCount,
      attendanceRate,
      deficiencyCount,
      memorizePages,
      reviewPages,
      performanceScore: Math.max(0, performanceScore),
    };
  }).filter(Boolean);

  // ترتيب بنقاط الأداء (الأعلى أولاً)
  result.sort((a: any, b: any) => b.performanceScore - a.performanceScore);

  res.json(result);
});

// ── لوحة التكريم الشهري — بلا غياب ولا تقصير ─────────────────────────────
router.get("/stats/monthly-honor", authenticate, async (req, res): Promise<void> => {
  const role = req.userRole!;
  if (!["leader", "track_supervisor", "teacher", "supervisor"].includes(role)) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  const userId = req.userId;

  const { month } = req.query as Record<string, string | undefined>;
  const now = new Date();
  const targetYear  = month ? parseInt(month.split("-")[0]) : now.getFullYear();
  const targetMonth = month ? parseInt(month.split("-")[1]) - 1 : now.getMonth();

  const monthStart = new Date(targetYear, targetMonth, 1).toISOString().slice(0, 10);
  const monthEnd   = new Date(targetYear, targetMonth + 1, 0).toISOString().slice(0, 10);
  const todayStr   = now.toISOString().slice(0, 10);
  const effectiveEnd = monthEnd < todayStr ? monthEnd : todayStr;

  const allCircles  = await db.select().from(circlesTable);
  const allUsers    = await db.select().from(usersTable).where(eq(usersTable.isArchived, false));
  const allStudents = await db.select().from(studentsTable).where(eq(studentsTable.isArchived, false));
  const allTracks   = await db.select().from(tracksTable);

  // فلترة حسب الصلاحية
  let visibleCircleIds: number[] | null = null;
  if (role === "track_supervisor") {
    const me = allUsers.find(u => u.id === userId);
    visibleCircleIds = allCircles.filter(c => c.track === me?.track).map(c => c.id);
  } else if (role === "teacher" || role === "supervisor") {
    const me = allUsers.find(u => u.id === userId);
    visibleCircleIds = me?.circleId ? [me.circleId] : [];
  }

  const circleTrackTypeMap: Record<number, string> = {};
  for (const c of allCircles) {
    if (c.trackId) {
      const t = allTracks.find(t => t.id === c.trackId);
      circleTrackTypeMap[c.id] = t ? t.dataEntryType : (c.trackType ?? "girls");
    } else {
      circleTrackTypeMap[c.id] = c.trackType ?? "girls";
    }
  }

  const records = await db.select().from(recordsTable)
    .where(and(gte(recordsTable.date, monthStart), lte(recordsTable.date, effectiveEnd)));

  const filteredRecords = visibleCircleIds
    ? records.filter(r => visibleCircleIds!.includes(r.circleId))
    : records;

  const isShortcoming = (r: typeof recordsTable.$inferSelect): boolean => {
    if (r.isAbsent) return false;
    if (r.shortcomingOverride !== null && r.shortcomingOverride !== undefined) return r.shortcomingOverride;
    const trackType = circleTrackTypeMap[r.circleId];
    if (trackType === "children" || trackType === "mothers" || trackType === "recitation") return false;
    const noReview =
      (r.reviewNearPages ?? 0) === 0 && (r.reviewFarPages ?? 0) === 0 &&
      (r.reviewFar2Pages ?? 0) === 0 && (r.reviewPages ?? 0) === 0;
    const notListened = r.listenedToReciter === false;
    return noReview || notListened;
  };

  // تجميع السجلات بالطالبة
  const byStudent: Record<number, typeof filteredRecords> = {};
  for (const r of filteredRecords) {
    if (!byStudent[r.studentId]) byStudent[r.studentId] = [];
    byStudent[r.studentId].push(r);
  }

  const honored: {
    studentId: number; studentName: string; circleName: string; track: string;
    memorizePages: number; sessions: number;
  }[] = [];

  for (const [sidStr, recs] of Object.entries(byStudent)) {
    const sid = parseInt(sidStr);
    if (recs.length === 0) continue;
    const hasAbsence     = recs.some(r => r.isAbsent);
    const hasShortcoming = recs.some(r => isShortcoming(r));
    if (hasAbsence || hasShortcoming) continue;

    const student = allStudents.find(s => s.id === sid);
    if (!student) continue;
    const circle  = allCircles.find(c => c.id === recs[0].circleId);

    honored.push({
      studentId: sid,
      studentName: student.fullName,
      circleName: circle?.name ?? "—",
      track: circle?.track ?? "—",
      memorizePages: Math.round(recs.reduce((s, r) => s + (r.memorizePages ?? 0), 0) * 2) / 2,
      sessions: recs.length,
    });
  }

  honored.sort((a, b) => b.memorizePages - a.memorizePages);

  res.json({
    month: `${targetYear}-${String(targetMonth + 1).padStart(2, "0")}`,
    monthLabel: new Date(targetYear, targetMonth, 1).toLocaleDateString("ar-SA", { month: "long", year: "numeric" }),
    honoredCount: honored.length,
    honored,
  });
});

export default router;
