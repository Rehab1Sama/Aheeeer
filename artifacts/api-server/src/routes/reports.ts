import { Router, type IRouter } from "express";
import { db, recordsTable, circlesTable, studentsTable, tracksTable } from "@workspace/db";
import { eq, and, gte, lte, inArray } from "drizzle-orm";
import { authenticate } from "../middlewares/authenticate";

const router: IRouter = Router();

router.get("/reports/weekly", authenticate, async (req, res): Promise<void> => {
  const role = req.userRole!;
  if (!["leader", "deputy", "track_supervisor", "teacher", "supervisor"].includes(role)) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  const { from, to } = req.query as { from?: string; to?: string };

  const today = new Date();
  const defaultFrom = new Date(today);
  defaultFrom.setDate(today.getDate() - 6);
  const fromStr = from ?? defaultFrom.toISOString().slice(0, 10);
  const toStr = to ?? today.toISOString().slice(0, 10);

  let [allRecords, allCircles, allTracks] = await Promise.all([
    db.select().from(recordsTable).where(
      and(gte(recordsTable.date, fromStr), lte(recordsTable.date, toStr))
    ),
    db.select().from(circlesTable).where(eq(circlesTable.isArchived, false)),
    db.select().from(tracksTable),
  ]);

  const trackMap = new Map(allTracks.map(t => [t.id, t]));
  const circleMap = new Map(allCircles.map(c => [c.id, c]));
  if (role === "teacher" || role === "supervisor") {
    allRecords = allRecords.filter(r => r.circleId === req.userCircleId);
  } else if (role === "track_supervisor") {
    const permitted = new Set(allCircles.filter(c => c.track === req.userTrack).map(c => c.id));
    allRecords = allRecords.filter(r => permitted.has(r.circleId));
  }

  const getEffectiveTrackName = (circleId: number) => {
    const c = circleMap.get(circleId);
    if (!c) return "غير محدد";
    if (c.trackId) return trackMap.get(c.trackId)?.name ?? c.track;
    return c.track;
  };

  const trackGroups: Record<string, {
    records: typeof allRecords;
    studentIds: Set<number>;
  }> = {};

  for (const r of allRecords) {
    const trackName = getEffectiveTrackName(r.circleId);
    if (!trackGroups[trackName]) {
      trackGroups[trackName] = { records: [], studentIds: new Set() };
    }
    trackGroups[trackName].records.push(r);
    trackGroups[trackName].studentIds.add(r.studentId);
  }

  const computeStats = (records: typeof allRecords) => {
    const total = records.length;
    if (total === 0) return {
      totalRecords: 0, presentCount: 0, attendanceRate: 0,
      avgMemorizePages: 0, avgReviewNearPages: 0, avgReviewFarPages: 0,
      avgReviewPages: 0, avgTotalReviewPages: 0, uniqueStudents: 0,
    };
    const present = records.filter(r => !r.isAbsent);
    const presentCount = present.length;

    const avg = (arr: (number | null)[]) => {
      const vals = arr.filter((v): v is number => v != null && v > 0);
      return vals.length > 0 ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : 0;
    };

    const avgMemorizePages = avg(present.map(r => r.memorizePages));
    const avgReviewNearPages = avg(present.map(r => r.reviewNearPages));
    const avgReviewFarPages = avg(present.map(r => (r.reviewFarPages ?? 0) + (r.reviewFar2Pages ?? 0)));
    const avgReviewPages = avg(present.map(r => r.reviewPages));
    const avgTotalReviewPages = Math.round(
      ((present.reduce((s, r) =>
        s + (r.reviewNearPages ?? 0) + (r.reviewFarPages ?? 0) + (r.reviewFar2Pages ?? 0) + (r.reviewPages ?? 0), 0)
        / (presentCount || 1)) * 10) / 10
    );

    return {
      totalRecords: total,
      presentCount,
      attendanceRate: Math.round((presentCount / total) * 100),
      avgMemorizePages,
      avgReviewNearPages,
      avgReviewFarPages,
      avgReviewPages,
      avgTotalReviewPages,
    };
  };

  const tracks = Object.entries(trackGroups).map(([trackName, group]) => ({
    trackName,
    uniqueStudents: group.studentIds.size,
    ...computeStats(group.records),
  })).sort((a, b) => b.totalRecords - a.totalRecords);

  const overall = computeStats(allRecords);
  overall.uniqueStudents = new Set(allRecords.map(r => r.studentId)).size;

  res.json({ dateRange: { from: fromStr, to: toStr }, tracks, overall });
});

export default router;
