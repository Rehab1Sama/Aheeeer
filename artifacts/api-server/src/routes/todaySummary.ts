// «المطلوب اليوم»: سطر أو أكثر أعلى الصفحة الرئيسية لكل دور، يقول ما الناقص اليوم.
// خفيف عمدًا: سجلات اليوم فقط لحلقات نطاق المستخدمة، وخطط المراجعة لنطاق الحلقة/المسار فقط.
import { Router, type IRouter } from "express";
import {
  db, circlesTable, tracksTable, studentEnrollmentsTable, studentsTable, recordsTable,
  dailyCircleTasksTable, reviewPlansTable, transferRequestsTable,
} from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
import { authenticate } from "../middlewares/authenticate";
import { accessibleCircleIds } from "../lib/access";
import { isEntryExpectedOn } from "../lib/dataEntrySchedule";
import { getMakkahDay } from "../lib/date";
import { loadGirlsCoverage } from "./reviewPlans";

const router: IRouter = Router();
const AR = (n: number) => n.toLocaleString("ar-EG");
/** تمييز العدد: ٣–١٠ بالجمع، وغيره بالمفرد */
const count = (n: number, one: string, many: string) => `${AR(n)} ${n >= 3 && n <= 10 ? many : one}`;

type Item = { tone: "ok" | "warn"; text: string; href?: string };

router.get("/today-summary", authenticate, async (req, res): Promise<void> => {
  const role = req.userRole ?? "";
  if (!["leader", "deputy", "track_supervisor", "teacher", "supervisor", "data_entry"].includes(role)) {
    res.json({ items: [] });
    return;
  }
  const D = getMakkahDay();
  const scope = await accessibleCircleIds(req);
  const [allCircles, tracks] = await Promise.all([
    db.select().from(circlesTable).where(eq(circlesTable.isArchived, false)),
    db.select({ id: tracksTable.id, dataEntryType: tracksTable.dataEntryType }).from(tracksTable),
  ]);
  const typeById = new Map(tracks.map((t) => [t.id, t.dataEntryType]));
  const circles = allCircles
    .filter((c) => scope === "all" || scope.includes(c.id))
    .filter((c) => isEntryExpectedOn((c.trackId ? typeById.get(c.trackId) : null) ?? c.trackType ?? "girls", c.name, D));
  // المعلمة لا تُدخل بيانات حلقات الفتيات (تُدخلها المشرفة)، فلا تُحسب عليها
  if (role === "teacher") {
    for (let k = circles.length - 1; k >= 0; k--) {
      const c = circles[k]!;
      if (((c.trackId ? typeById.get(c.trackId) : null) ?? c.trackType ?? "girls") === "girls") circles.splice(k, 1);
    }
  }
  if (circles.length === 0) {
    res.json({ items: [] });
    return;
  }
  const ids = circles.map((c) => c.id);
  const [enrolls, recs, tasks] = await Promise.all([
    db.select({
      studentId: studentEnrollmentsTable.studentId, circleId: studentEnrollmentsTable.circleId,
      leaveStart: studentEnrollmentsTable.leaveStart, leaveEnd: studentEnrollmentsTable.leaveEnd,
    }).from(studentEnrollmentsTable)
      .innerJoin(studentsTable, eq(studentsTable.id, studentEnrollmentsTable.studentId))
      .where(and(eq(studentEnrollmentsTable.isArchived, false), eq(studentsTable.isArchived, false), inArray(studentEnrollmentsTable.circleId, ids))),
    db.select({ studentId: recordsTable.studentId, circleId: recordsTable.circleId })
      .from(recordsTable).where(and(eq(recordsTable.date, D), inArray(recordsTable.circleId, ids))),
    role === "track_supervisor"
      ? db.select({ circleId: dailyCircleTasksTable.circleId }).from(dailyCircleTasksTable)
        .where(and(eq(dailyCircleTasksTable.date, D), inArray(dailyCircleTasksTable.circleId, ids)))
      : Promise.resolve([] as Array<{ circleId: number }>),
  ]);

  const entered = new Set(recs.map((r) => `${r.studentId}:${r.circleId}`));
  let missing = 0;
  let withRoster = 0;
  let complete = 0;
  for (const c of circles) {
    const roster = enrolls.filter((e) => e.circleId === c.id && !(e.leaveStart && e.leaveEnd && e.leaveStart <= D && D <= e.leaveEnd));
    if (roster.length === 0) continue;
    withRoster++;
    const m = roster.filter((e) => !entered.has(`${e.studentId}:${c.id}`)).length;
    missing += m;
    if (m === 0) complete++;
  }

  const items: Item[] = [];
  if (role === "leader" || role === "deputy") {
    items.push(missing === 0
      ? { tone: "ok", text: `اكتمل إدخال اليوم في كل الحلقات (${AR(withRoster)})`, href: "/data-entry-status" }
      : { tone: "warn", text: `الحلقات المكتملة اليوم: ${AR(complete)} من ${AR(withRoster)} · باقي ${count(missing, "طالبة", "طالبات")} بلا إدخال`, href: "/data-entry-status" });
  } else if (role === "track_supervisor") {
    items.push(missing === 0
      ? { tone: "ok", text: `اكتمل إدخال اليوم في كل حلقات مسارك (${AR(withRoster)})`, href: "/track-entry-status" }
      : { tone: "warn", text: `حلقات مسارك المكتملة اليوم: ${AR(complete)} من ${AR(withRoster)} · باقي ${count(missing, "طالبة", "طالبات")}`, href: "/track-entry-status" });
    const filled = new Set(tasks.map((t) => t.circleId)).size;
    if (filled < circles.length) items.push({ tone: "warn", text: `مهام اليوم: عُبّئت لـ${AR(filled)} من ${count(circles.length, "حلقة", "حلقات")}`, href: "/daily-tasks" });
  } else {
    items.push(missing === 0
      ? { tone: "ok", text: "اكتمل إدخال اليوم، بارك الله فيكِ", href: "/data-entry" }
      : { tone: "warn", text: `باقي ${count(missing, "طالبة", "طالبات")} بلا إدخال اليوم`, href: "/data-entry" });
  }

  // طلبات النقل بانتظار القرار
  if (role === "leader" || role === "deputy") {
    const pending = await db.select({ id: transferRequestsTable.id }).from(transferRequestsTable).where(eq(transferRequestsTable.status, "pending"));
    if (pending.length > 0) items.push({ tone: "warn", text: `طلبات نقل بانتظاركِ: ${AR(pending.length)}`, href: "/transfer-requests" });
  }

  // خطط المراجعة المتأخرة (لنطاق الحلقة/المسار فقط — القائدة تراها في صفحة الخطط)
  if (role !== "leader" && role !== "deputy" && role !== "data_entry") {
    const plans = await db.select().from(reviewPlansTable).where(and(
      eq(reviewPlansTable.status, "active"), eq(reviewPlansTable.planType, "girls_review"), inArray(reviewPlansTable.circleId, ids),
    ));
    if (plans.length) {
      const cov = await loadGirlsCoverage(plans);
      const behind = plans.filter((p) => cov.get(p.id)?.status === "behind").length;
      if (behind > 0) items.push({ tone: "warn", text: `خطط مراجعة متأخرة: ${AR(behind)}`, href: "/review-plans-overview" });
    }
  }

  res.json({ date: D, items, missing, circles: withRoster });
});

export default router;
