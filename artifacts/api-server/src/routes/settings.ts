import { Router, type IRouter } from "express";
import { db, globalSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { authenticate } from "../middlewares/authenticate";

const router: IRouter = Router();

router.get("/settings", authenticate, async (req, res): Promise<void> => {
  const rows = await db.select().from(globalSettingsTable);
  const result: Record<string, string> = {};
  for (const row of rows) result[row.key] = row.value;
  res.json(result);
});

router.patch("/settings", authenticate, async (req, res): Promise<void> => {
  const allowed = ["leader", "deputy"];
  if (!allowed.includes(req.userRole!)) { res.status(403).json({ error: "Forbidden" }); return; }

  const { key, value } = req.body as { key: string; value: string };
  if (!key || value === undefined) { res.status(400).json({ error: "key و value مطلوبان" }); return; }
  if (key === "student_record_archive_periods") {
    try {
      const periods = JSON.parse(value);
      if (!Array.isArray(periods) || periods.some((p: any) => !p?.from || !p?.to || p.from > p.to)) {
        res.status(400).json({ error: "فترات الأرشفة غير صحيحة" }); return;
      }
    } catch { res.status(400).json({ error: "قيمة الأرشفة يجب أن تكون JSON صحيحًا" }); return; }
  }
  if (key === "leaderboard_window") {
    try {
      const w = JSON.parse(value) as { from?: string; to?: string };
      if (!w?.from || !w?.to || w.from > w.to) {
        res.status(400).json({ error: "نافذة ظهور لوحة الصدارة غير صحيحة (تأكدي إن تاريخ البداية قبل النهاية)" }); return;
      }
    } catch { res.status(400).json({ error: "قيمة نافذة لوحة الصدارة يجب أن تكون JSON صحيحًا" }); return; }
  }

  await db
    .insert(globalSettingsTable)
    .values({ key, value })
    .onConflictDoUpdate({ target: globalSettingsTable.key, set: { value } });

  res.json({ ok: true });
});

export default router;
