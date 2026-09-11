import { Router, type IRouter } from "express";
import {
  db, usersTable, circlesTable, studentsTable, recordsTable,
  teacherAbsencesTable, dailyCircleTasksTable, trackSupervisorNamesTable, tracksTable,
  deputyTasksTable, reviewPlansTable, reviewPlanDaysTable,
} from "@workspace/db";
import { eq, and, gte, lte, desc, inArray } from "drizzle-orm";
import { authenticate } from "../middlewares/authenticate";
import { getMakkahDay, getMakkahDaysAgo } from "../lib/date";

/** Returns all non-Friday dates from startDate up to totalDays count */
function getCycleDates(startDate: string, totalDays: number): string[] {
  const dates: string[] = [];
  const cur = new Date(startDate + "T12:00:00Z");
  if (cur.getUTCDay() !== 5) dates.push(cur.toISOString().slice(0, 10));
  while (dates.length < totalDays) {
    cur.setDate(cur.getDate() + 1);
    if (cur.getUTCDay() !== 5) dates.push(cur.toISOString().slice(0, 10));
  }
  return dates;
}

const router: IRouter = Router();

router.get("/stats/stumbling", authenticate, async (req, res): Promise<void> => {
  if (!["leader", "deputy", "track_supervisor"].includes(req.userRole!)) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  const today = getMakkahDay();
  const thirtyDaysAgo = getMakkahDaysAgo(30);
  const twoDaysAgo = getMakkahDaysAgo(2);

  const [allUsers, allCircles, allStudents, allTracks] = await Promise.all([
    db.select().from(usersTable),
    db.select().from(circlesTable).where(eq(circlesTable.isArchived, false)),
    db.select().from(studentsTable).where(eq(studentsTable.isArchived, false)),
    db.select().from(tracksTable),
  ]);

  let filteredCircles = allCircles;
  if (req.userRole === "track_supervisor") {
    const currentUser = allUsers.find(u => u.id === req.userId);
    filteredCircles = allCircles.filter(c => c.track === currentUser?.track);
  }
  const filteredCircleIds = new Set(filteredCircles.map(c => c.id));

  const circleTrackTypeMap: Record<number, string> = {};
  for (const c of allCircles) {
    if (c.trackId) {
      const t = allTracks.find(t => t.id === c.trackId);
      circleTrackTypeMap[c.id] = t ? t.dataEntryType : (c.trackType ?? "girls");
    } else {
      circleTrackTypeMap[c.id] = c.trackType ?? "girls";
    }
  }

  function getLastNWorkingDays(n: number, from: string): string[] {
    const days: string[] = [];
    const cur = new Date(from);
    cur.setDate(cur.getDate() - 1);
    while (days.length < n) {
      if (cur.getDay() !== 5) days.push(cur.toISOString().slice(0, 10));
      cur.setDate(cur.getDate() - 1);
    }
    return days;
  }
  const lastTwoWorkingDays = getLastNWorkingDays(2, today);
  const oldestWorkingDay = lastTwoWorkingDays[lastTwoWorkingDays.length - 1]!;

  const [recentRecords, teacherAbsences, circleTasks] = await Promise.all([
    db.select().from(recordsTable).where(and(gte(recordsTable.date, thirtyDaysAgo), lte(recordsTable.date, today))),
    db.select().from(teacherAbsencesTable).where(and(gte(teacherAbsencesTable.date, twoDaysAgo), lte(teacherAbsencesTable.date, today))),
    db.select().from(dailyCircleTasksTable).where(and(gte(dailyCircleTasksTable.date, oldestWorkingDay), lte(dailyCircleTasksTable.date, today))),
  ]);

  const circleMap: Record<number, typeof allCircles[number]> = {};
  for (const c of allCircles) circleMap[c.id] = c;
  const studentMap: Record<number, typeof allStudents[number]> = {};
  for (const s of allStudents) studentMap[s.id] = s;
  const userMap: Record<number, typeof allUsers[number]> = {};
  for (const u of allUsers) userMap[u.id] = u;

  // ── Data Entry Alerts ──
  const dataEntryAlerts: any[] = [];
  if (req.userRole === "leader") {
    const dataEntryUsers = allUsers.filter(u => u.role === "data_entry" && !u.isArchived);
    for (const u of dataEntryUsers) {
      const userCircles = filteredCircles.filter(c => c.track === u.track);
      const issues: string[] = [];
      for (const circle of userCircles) {
        const circleStudents = allStudents.filter(s => s.circleId === circle.id);
        for (const wd of lastTwoWorkingDays) {
          const recorded = recentRecords.filter(r => r.circleId === circle.id && r.date === wd).map(r => r.studentId);
          const missing = circleStudents.filter(s => !recorded.includes(s.id));
          if (missing.length > 0) {
            issues.push(`${wd}: ${circle.name} — ${missing.length} طالبة`);
          }
        }
      }
      if (issues.length > 0) {
        dataEntryAlerts.push({ userId: u.id, name: u.name, track: u.track ?? "", issue: "missing_data", issueLabel: "بيانات ناقصة", details: issues });
      }
    }
  }

  // ── Track Supervisor Alerts ──
  const supervisorAlerts: any[] = [];
  if (req.userRole === "leader") {
    const trackSupervisors = allUsers.filter(u => u.role === "track_supervisor" && !u.isArchived);
    for (const u of trackSupervisors) {
      const trackCircles = filteredCircles.filter(c => c.track === u.track);
      const trackCircleIds = new Set(trackCircles.map(c => c.id));
      const hasTasks = circleTasks.some(t => trackCircleIds.has(t.circleId));
      const lastLoginDays = u.lastLoginAt ? Math.floor((Date.now() - new Date(u.lastLoginAt).getTime()) / 86400000) : null;
      if (lastLoginDays !== null && lastLoginDays >= 3) {
        supervisorAlerts.push({ type: "login", name: u.name, track: u.track ?? "", issueLabel: `لم تدخل منذ ${lastLoginDays} أيام` });
      }
    }
  }

  // ── Teacher Alerts ──
  const teacherAlerts: any[] = [];
  const teacherUsers = allUsers.filter(u => u.role === "teacher" && !u.isArchived);
  for (const u of teacherUsers) {
    if (!u.circleId || !filteredCircleIds.has(u.circleId)) continue;
    const circle = circleMap[u.circleId];
    if (!circle) continue;
    const absences = teacherAbsences.filter(a => a.circleId === u.circleId);
    const lateRecords = recentRecords.filter(r => r.circleId === u.circleId && r.date >= thirtyDaysAgo && (r as any).isLate);
    if (absences.length >= 2 || lateRecords.length >= 3) {
      teacherAlerts.push({ userId: u.id, name: u.name, circleName: circle.name, track: circle.track ?? "", absenceCount: absences.length, lateCount: lateRecords.length });
    }
  }

  // ── Supervisor Stumbling ──
  const supervisorStumbling: any[] = [];
  const supervisorUsers = allUsers.filter(u => u.role === "supervisor" && !u.isArchived);
  for (const u of supervisorUsers) {
    if (!u.circleId || !filteredCircleIds.has(u.circleId)) continue;
    const circle = circleMap[u.circleId];
    if (!circle) continue;
    const absences = teacherAbsences.filter(a => a.circleId === u.circleId);
    const lateRecords = recentRecords.filter(r => r.circleId === u.circleId && r.date >= thirtyDaysAgo && (r as any).isLate);
    if (absences.length >= 2 || lateRecords.length >= 3) {
      supervisorStumbling.push({ userId: u.id, name: u.name, circleName: circle.name, track: circle.track ?? "", absenceCount: absences.length, lateCount: lateRecords.length });
    }
  }

  // ── Student Alerts ──
  // Fetch active girls_review plans and their days for students in filtered circles
  const filteredStudentIds = allStudents.filter(s => s.circleId && filteredCircleIds.has(s.circleId)).map(s => s.id);
  let activePlans: { id: number; studentId: number; circleId: number; startDate: string }[] = [];
  let allPlanDays: { planId: number; dayNumber: number; pages: number }[] = [];
  if (filteredStudentIds.length > 0) {
    const plansRaw = await db.select({
      id: reviewPlansTable.id,
      studentId: reviewPlansTable.studentId,
      circleId: reviewPlansTable.circleId,
      startDate: reviewPlansTable.startDate,
    }).from(reviewPlansTable).where(and(
      eq(reviewPlansTable.status, "active"),
      eq(reviewPlansTable.planType, "girls_review"),
      inArray(reviewPlansTable.studentId, filteredStudentIds),
    ));
    activePlans = plansRaw;

    if (plansRaw.length > 0) {
      const planIds = plansRaw.map(p => p.id);
      const daysRaw = await db.select({
        planId: reviewPlanDaysTable.planId,
        dayNumber: reviewPlanDaysTable.dayNumber,
        pages: reviewPlanDaysTable.pages,
      }).from(reviewPlanDaysTable).where(inArray(reviewPlanDaysTable.planId, planIds));
       allPlanDays = daysRaw.map(d => ({ ...d, pages: d.pages ?? 0 }));
    }
  }

  // Build plan records index: studentId:circleId -> date -> { reviewFarPages, isAbsent }
  const planStudentIds = activePlans.map(p => p.studentId);
  const planDatesSet = new Set<string>();
  const planDatesMap = new Map<number, string[]>(); // planId -> cycle dates
  for (const plan of activePlans) {
    const dates = getCycleDates(plan.startDate, 21);
    planDatesMap.set(plan.id, dates);
    dates.forEach(d => planDatesSet.add(d));
  }
  const planRecordsByStudentCircle = new Map<string, Record<string, { reviewFarPages: number | null; isAbsent: boolean }>>();
  if (planStudentIds.length > 0 && planDatesSet.size > 0) {
    const planRecsRaw = await db.select({
      studentId: recordsTable.studentId,
      circleId: recordsTable.circleId,
      date: recordsTable.date,
      reviewFarPages: recordsTable.reviewFarPages,
      isAbsent: recordsTable.isAbsent,
    }).from(recordsTable).where(and(
      inArray(recordsTable.studentId, planStudentIds),
      inArray(recordsTable.date, [...planDatesSet]),
    )).orderBy(recordsTable.studentId, recordsTable.date, desc(recordsTable.updatedAt));
    for (const r of planRecsRaw) {
      const key = `${r.studentId}:${r.circleId}`;
      let m = planRecordsByStudentCircle.get(key);
      if (!m) { m = {}; planRecordsByStudentCircle.set(key, m); }
      if (!m[r.date]) m[r.date] = { reviewFarPages: r.reviewFarPages, isAbsent: r.isAbsent };
    }
  }

  /**
   * Counts unresolved missed plan days for a student using a cumulative catch-up rule:
   * the last day the student fully completed their quota permanently forgives all prior misses.
   * Only days AFTER that last catch-up point are counted as genuine delays.
   */
  function computePlanMissedDays(studentId: number, circleId: number): number {
    const plan = activePlans.find(p => p.studentId === studentId && p.circleId === circleId);
    if (!plan) return 0;
    const cycleDates = planDatesMap.get(plan.id);
    if (!cycleDates) return 0;
    const planDays = allPlanDays.filter(d => d.planId === plan.id);
    const dayRecords = planRecordsByStudentCircle.get(`${studentId}:${circleId}`) ?? {};

    const dayIdx = cycleDates.indexOf(today);
    const currentDay = dayIdx >= 0 ? dayIdx + 1 : today < cycleDates[0]! ? 0 : 22;
    if (currentDay <= 0) return 0;

    // Pass 1: find the last day the student completed their quota (catch-up checkpoint).
    // Scans all days up to and including today so today's entry also counts as a catch-up.
    let lastCompletedDay = 0;
    for (let d = 1; d <= currentDay; d++) {
      const dateStr = cycleDates[d - 1];
      const rec = dateStr ? dayRecords[dateStr] : undefined;
      if (!rec || rec.isAbsent || rec.reviewFarPages == null) continue;
      const day = planDays.find(pd => pd.dayNumber === d);
      const quota = day?.pages ?? 0;
      const done = rec.reviewFarPages;
      if (quota <= 0 || done >= quota) lastCompletedDay = d;
    }

    // Pass 2: count missed days only AFTER the last catch-up (genuinely unresolved).
    let missed = 0;
    for (let d = lastCompletedDay + 1; d < currentDay; d++) {
      const day = planDays.find(pd => pd.dayNumber === d);
      const dateStr = cycleDates[d - 1];
      const rec = dateStr ? dayRecords[dateStr] : undefined;
      // Saturday: no data entry at the Maqra'a — skip if no record exists
      if (!rec && dateStr && new Date(dateStr + "T12:00:00Z").getUTCDay() === 6) continue;
      if (rec?.isAbsent) { missed++; continue; }
      const quota = day?.pages ?? 0;
      if (quota <= 0) continue;
      const done = rec?.reviewFarPages ?? null;
      if (done == null || done < quota) missed++;
    }
    return missed;
  }

  const studentAlerts: any[] = [];

  for (const s of allStudents) {
    if (!s.circleId || !filteredCircleIds.has(s.circleId)) continue;
    const circle = circleMap[s.circleId];
    if (!circle) continue;

    const studentRecs = recentRecords.filter(r => r.studentId === s.id);
    const absenceCount = studentRecs.filter(r => r.isAbsent).length;
    const shortcomingRecs = studentRecs.filter(r => !r.isAbsent && r.reviewFarPages === 0 && r.memorizePages === 0);
    const shortcomingCount = shortcomingRecs.length;
    const planMissedDays = computePlanMissedDays(s.id, s.circleId);

    if (absenceCount >= 3 || shortcomingCount >= 3 || planMissedDays >= 3) {
      studentAlerts.push({
        studentId: s.id, studentName: s.fullName, circleName: circle.name, track: circle.track ?? "",
        absenceCount, shortcomingCount, planMissedDays, issueLabel: undefined, isLongStumbling: false,
      });
    }
  }

  // ── Deputy alert (leader only) ──────────────────────────────────────────
  let deputyAlert: {
    hasDeputy: boolean; name?: string; inactive: boolean;
    neverLoggedIn: boolean; daysSinceLogin: number | null;
    pendingTasksCount: number; unansweredQaCount: number;
  } = { hasDeputy: false, inactive: false, neverLoggedIn: false, daysSinceLogin: null, pendingTasksCount: 0, unansweredQaCount: 0 };

  if (req.userRole === "leader") {
    const deputies = allUsers.filter(u => u.role === "deputy" && !u.isArchived);
    if (deputies.length > 0) {
      const deputy = deputies[0]!;
      const lastLogin = deputy.lastLoginAt;
      const daysSinceLogin = lastLogin
        ? Math.floor((Date.now() - new Date(lastLogin).getTime()) / 86400000)
        : null;
      const allDeputyTasks = await db.select().from(deputyTasksTable);
      const pendingTasksCount = allDeputyTasks.filter(t => !t.isCompleted).length;
      const unansweredQaCount = allDeputyTasks.filter(t =>
        t.taskType === "qa" && !t.response &&
        Math.floor((Date.now() - new Date(t.createdAt).getTime()) / 86400000) >= 3
      ).length;
      deputyAlert = {
        hasDeputy: true,
        name: deputy.name,
        inactive: daysSinceLogin !== null && daysSinceLogin >= 3,
        neverLoggedIn: lastLogin === null,
        daysSinceLogin,
        pendingTasksCount,
        unansweredQaCount,
      };
    }
  }

  res.json({
    dataEntry: dataEntryAlerts,
    trackSupervisors: supervisorAlerts,
    teachers: teacherAlerts,
    supervisors: supervisorStumbling,
    students: studentAlerts,
    cycleCompleted: [],
    deputyAlert,
    planNotifications: [],
  });
});

export default router;
