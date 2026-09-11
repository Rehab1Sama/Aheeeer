import { Router, type IRouter } from "express";
import { db, circlesTable, studentsTable, trackSupervisorNamesTable, tracksTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { authenticate } from "../middlewares/authenticate";
import {
  computeCircleWeeklyMoonBadge,
  computeStudentMonthlyPerfectAttendance,
  computeStudentImprovement,
  computeTrackNoShortcoming,
  computeSupervisorWeeklyCommitment,
  computeReviewPlanCompletion,
  type EarnedBadge,
} from "../lib/badgeEngine";

const router: IRouter = Router();

/**
 * الأوسمة اللحظية (بالكود، بدون تخزين قاعدة بيانات) لحلقة واحدة.
 * الوصول: نفس صلاحيات عرض الحلقة (المعلمة/المشرفة/الطالبة تشوف حلقتها،
 * مسؤولة المسار حلقات مسارها، القائدة/النائبة أي حلقة).
 */
router.get("/live-badges/circle/:id", authenticate, async (req, res): Promise<void> => {
  const circleId = parseInt(req.params.id as string);
  if (isNaN(circleId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [circle] = await db.select().from(circlesTable).where(eq(circlesTable.id, circleId));
  if (!circle) { res.status(404).json({ error: "Circle not found" }); return; }

  const role = req.userRole!;
  if (role === "teacher" || role === "supervisor" || role === "student") {
    if (req.userCircleId !== circleId) { res.status(403).json({ error: "Forbidden" }); return; }
  } else if (role === "track_supervisor") {
    if (circle.track !== req.userTrack) { res.status(403).json({ error: "Forbidden" }); return; }
  } else if (role !== "leader" && role !== "deputy") {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  const badges: EarnedBadge[] = [];
  const moon = await computeCircleWeeklyMoonBadge(circleId);
  if (moon) badges.push(moon);

  res.json(badges);
});

/**
 * الأوسمة اللحظية لطالبة واحدة (حضور الشهر + التطور).
 * الوصول: الطالبة نفسها، أو معلمة/مشرفة حلقتها، أو مسؤولة مسارها، أو القائدة/النائبة.
 */
router.get("/live-badges/student/:id", authenticate, async (req, res): Promise<void> => {
  const studentId = parseInt(req.params.id as string);
  if (isNaN(studentId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [student] = await db.select().from(studentsTable).where(eq(studentsTable.id, studentId));
  if (!student) { res.status(404).json({ error: "Student not found" }); return; }

  const role = req.userRole!;
  if (role === "student") {
    if (req.userStudentId !== studentId) { res.status(403).json({ error: "Forbidden" }); return; }
  } else if (role === "teacher" || role === "supervisor") {
    if (student.circleId !== req.userCircleId) { res.status(403).json({ error: "Forbidden" }); return; }
  } else if (role === "track_supervisor") {
    const [circle] = student.circleId ? await db.select().from(circlesTable).where(eq(circlesTable.id, student.circleId)) : [];
    if (!circle || circle.track !== req.userTrack) { res.status(403).json({ error: "Forbidden" }); return; }
  } else if (role !== "leader" && role !== "deputy") {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  const badges: EarnedBadge[] = [];
  const [monthly, improvement, planCompletion] = await Promise.all([
    computeStudentMonthlyPerfectAttendance(studentId),
    computeStudentImprovement(studentId),
    computeReviewPlanCompletion(studentId),
  ]);
  if (monthly) badges.push(monthly);
  if (improvement) badges.push(improvement);
  if (planCompletion) badges.push(planCompletion);

  res.json(badges);
});

/**
 * الأوسمة اللحظية لمسار كامل (مسارنا الأحب).
 * الوصول: مسؤولة المسار لمسارها فقط، أو القائدة/النائبة لأي مسار.
 */
router.get("/live-badges/track/:trackName", authenticate, async (req, res): Promise<void> => {
  const trackName = decodeURIComponent(req.params.trackName as string);
  const role = req.userRole!;
  if (role === "track_supervisor") {
    if (trackName !== req.userTrack) { res.status(403).json({ error: "Forbidden" }); return; }
  } else if (role !== "leader" && role !== "deputy") {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  const badges: EarnedBadge[] = [];
  const noShortcoming = await computeTrackNoShortcoming(trackName);
  if (noShortcoming) badges.push(noShortcoming);

  res.json(badges);
});

const stripPrefix = (s: string) => s.replace(/^مسار\s+/, "").trim();

/**
 * الأوسمة اللحظية لاسم فردي (مسؤولة مسار) — فخر الأسبوع.
 * الوصول: مسؤولة المسار لاسم يتبع مسارها فقط، أو القائدة/النائبة لأي اسم.
 */
router.get("/live-badges/track-supervisor/:supervisorNameId", authenticate, async (req, res): Promise<void> => {
  const supervisorNameId = parseInt(req.params.supervisorNameId as string);
  if (isNaN(supervisorNameId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [nameRow] = await db.select().from(trackSupervisorNamesTable).where(eq(trackSupervisorNamesTable.id, supervisorNameId));
  if (!nameRow) { res.status(404).json({ error: "Not found" }); return; }

  const role = req.userRole!;
  if (role === "track_supervisor") {
    const [track] = await db.select().from(tracksTable).where(eq(tracksTable.id, nameRow.trackId));
    if (!track || stripPrefix(track.name) !== stripPrefix(req.userTrack ?? "")) { res.status(403).json({ error: "Forbidden" }); return; }
  } else if (role !== "leader" && role !== "deputy") {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  const badges: EarnedBadge[] = [];
  const pride = await computeSupervisorWeeklyCommitment(supervisorNameId);
  if (pride) badges.push(pride);

  res.json(badges);
});

export default router;
