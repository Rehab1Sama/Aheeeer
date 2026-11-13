// تقرير القائدة اليومي على تيليجرام.
//   GET /api/reports/telegram/run?key=...&date=YYYY-MM-DD&force=1&dry=1
//     يشغّله الجدول اليومي في GitHub (مفتاح سري REPORT_KEY بدل تسجيل الدخول).
//     dry=1 يرجع الرسائل دون إرسال.
//   GET /api/reports/daily-preview?date=YYYY-MM-DD   (للقائدة من داخل الموقع)
import { Router, type IRouter } from "express";
import { db, reviewPlansTable, reviewPlanDaysTable, circlesTable } from "@workspace/db";
import { and, eq, gte, inArray } from "drizzle-orm";
import { timingSafeEqual } from "crypto";
import { authenticate } from "../middlewares/authenticate";
import { buildDailyReport, sendDailyReportToTelegram } from "../lib/dailyReport";
import { logger } from "../lib/logger";
import { buildTrackStudentDigests } from "../lib/trackStudentReport";
import { runWeeklyMoonBadgeAward } from "../lib/weeklyMoonBadge";

const router: IRouter = Router();
const isDate = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

function keyMatches(given: unknown): boolean {
  const expected = process.env.REPORT_KEY;
  if (!expected || typeof given !== "string") return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

router.get("/reports/telegram/run", async (req, res): Promise<void> => {
  if (!process.env.REPORT_KEY) { res.status(503).json({ error: "REPORT_KEY غير مضبوط في إعدادات الخادم" }); return; }
  if (!keyMatches(req.query.key)) { res.status(403).json({ error: "Forbidden" }); return; }
  const date = isDate(req.query.date) ? req.query.date : undefined;
  try {
    if (req.query.dry === "1") {
      res.json(await buildDailyReport(date, { detail: req.query.detail === "1" }));
      return;
    }
    const result = await sendDailyReportToTelegram({ date, force: req.query.force === "1", detail: req.query.detail === "1" });
    logger.info(result, "Daily telegram report");
    res.json(result);
  } catch (err) {
    logger.error({ err }, "Daily telegram report failed");
    res.status(500).json({ error: err instanceof Error ? err.message : "فشل التقرير" });
  }
});

/** وسام أقمر الحلقة الأسبوعي — يستدعيه GitHub كل جمعة (مرة واحدة لكل أسبوع مهما تكرر الاستدعاء). */
router.get("/reports/weekly-badges/run", async (req, res): Promise<void> => {
  if (!process.env.REPORT_KEY) { res.status(503).json({ error: "REPORT_KEY غير مضبوط في إعدادات الخادم" }); return; }
  if (!keyMatches(req.query.key)) { res.status(403).json({ error: "Forbidden" }); return; }
  await runWeeklyMoonBadgeAward();
  res.json({ ok: true });
});

router.get("/reports/daily-preview", authenticate, async (req, res): Promise<void> => {
  if (req.userRole !== "leader") { res.status(403).json({ error: "Forbidden" }); return; }
  try {
    res.json(await buildDailyReport(isDate(req.query.date) ? req.query.date : undefined, { detail: req.query.detail === "1" }));
  } catch (err) {
    logger.error({ err }, "Daily report preview failed");
    res.status(500).json({ error: err instanceof Error ? err.message : "فشل التقرير" });
  }
});

// فحص خطط التثبيت المنشأة منذ تاريخ (للقائدة عبر GitHub بالمفتاح السري) — أعداد وأسماء حلقات فقط، بلا أسماء طالبات
router.get("/reports/fixation-plans-check", async (req, res): Promise<void> => {
  if (!process.env.REPORT_KEY) { res.status(503).json({ error: "REPORT_KEY غير مضبوط" }); return; }
  if (!keyMatches(req.query.key)) { res.status(403).json({ error: "Forbidden" }); return; }
  const since = typeof req.query.since === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.since) ? req.query.since : "2026-11-09";
  const plans = await db.select({
    id: reviewPlansTable.id, circleId: reviewPlansTable.circleId, status: reviewPlansTable.status,
    approvalStatus: reviewPlansTable.approvalStatus, startDate: reviewPlansTable.startDate, createdAt: reviewPlansTable.createdAt,
  }).from(reviewPlansTable).where(and(eq(reviewPlansTable.planType, "fixation"), gte(reviewPlansTable.createdAt, new Date(since + "T00:00:00+03:00"))));
  const ids = plans.map((p) => p.id);
  const days = ids.length ? await db.select({ planId: reviewPlanDaysTable.planId }).from(reviewPlanDaysTable).where(inArray(reviewPlanDaysTable.planId, ids)) : [];
  const circles = await db.select({ id: circlesTable.id, name: circlesTable.name }).from(circlesTable);
  const cName = new Map(circles.map((c) => [c.id, c.name]));
  const dayCount = new Map<number, number>();
  for (const d of days) dayCount.set(d.planId, (dayCount.get(d.planId) ?? 0) + 1);
  res.json({
    since, total: plans.length,
    plans: plans.map((p) => ({ id: p.id, circle: cName.get(p.circleId) ?? null, status: p.status, approval: p.approvalStatus, startDate: p.startDate, createdAt: p.createdAt, days: dayCount.get(p.id) ?? 0 })),
  });
});

// فحص خلاصة طالبات المسارات (أعداد فقط، بلا أسماء) — للتحقق من عمل التقرير
router.get("/reports/track-students/counts", async (req, res): Promise<void> => {
  if (!process.env.REPORT_KEY) { res.status(503).json({ error: "REPORT_KEY غير مضبوط" }); return; }
  if (!keyMatches(req.query.key)) { res.status(403).json({ error: "Forbidden" }); return; }
  const D = typeof req.query.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date) ? req.query.date : "2026-10-20";
  const m = await buildTrackStudentDigests(D, { weekly: true });
  let webhook: unknown = null;
  try {
    const r = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getWebhookInfo`);
    const w = (await r.json()) as { result?: { url?: string; pending_update_count?: number; last_error_message?: string } };
    webhook = { set: !!w.result?.url, pending: w.result?.pending_update_count ?? 0, lastError: w.result?.last_error_message ?? null };
  } catch { /* */ }
  res.json({ webhook, tracks: Object.fromEntries([...m.values()].map((d) => [d.track, { lazy: d.lazy.length, follow: d.follow.length, excellent: d.excellent.length, hadData: d.hadData }])) });
});

export default router;
