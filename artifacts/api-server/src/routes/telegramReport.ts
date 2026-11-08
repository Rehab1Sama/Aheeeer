// تقرير القائدة اليومي على تيليجرام.
//   GET /api/reports/telegram/run?key=...&date=YYYY-MM-DD&force=1&dry=1
//     يشغّله الجدول اليومي في GitHub (مفتاح سري REPORT_KEY بدل تسجيل الدخول).
//     dry=1 يرجع الرسائل دون إرسال.
//   GET /api/reports/daily-preview?date=YYYY-MM-DD   (للقائدة من داخل الموقع)
import { Router, type IRouter } from "express";
import { timingSafeEqual } from "crypto";
import { authenticate } from "../middlewares/authenticate";
import { buildDailyReport, sendDailyReportToTelegram } from "../lib/dailyReport";
import { logger } from "../lib/logger";

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
      res.json(await buildDailyReport(date));
      return;
    }
    const result = await sendDailyReportToTelegram({ date, force: req.query.force === "1" });
    logger.info(result, "Daily telegram report");
    res.json(result);
  } catch (err) {
    logger.error({ err }, "Daily telegram report failed");
    res.status(500).json({ error: err instanceof Error ? err.message : "فشل التقرير" });
  }
});

router.get("/reports/daily-preview", authenticate, async (req, res): Promise<void> => {
  if (req.userRole !== "leader") { res.status(403).json({ error: "Forbidden" }); return; }
  try {
    res.json(await buildDailyReport(isDate(req.query.date) ? req.query.date : undefined));
  } catch (err) {
    logger.error({ err }, "Daily report preview failed");
    res.status(500).json({ error: err instanceof Error ? err.message : "فشل التقرير" });
  }
});

export default router;
