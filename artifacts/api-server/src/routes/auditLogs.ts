// عرض سجل التدقيق للقائدة: من عدّل/حذف ماذا ومتى.
import { Router, type IRouter } from "express";
import { db, auditLogsTable } from "@workspace/db";
import { and, desc, eq, gte, ilike, lte, type SQL } from "drizzle-orm";
import { authenticate } from "../middlewares/authenticate";

const router: IRouter = Router();

router.get("/audit-logs", authenticate, async (req, res): Promise<void> => {
  if (req.userRole !== "leader") { res.status(403).json({ error: "هذه الصفحة للقائدة فقط" }); return; }
  const conds: SQL[] = [];
  if (typeof req.query.userId === "string" && req.query.userId) conds.push(eq(auditLogsTable.userId, Number(req.query.userId)));
  if (typeof req.query.q === "string" && req.query.q.trim()) conds.push(ilike(auditLogsTable.path, `%${req.query.q.trim()}%`));
  if (typeof req.query.method === "string" && ["POST", "PUT", "PATCH", "DELETE"].includes(req.query.method)) conds.push(eq(auditLogsTable.method, req.query.method));
  if (typeof req.query.from === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.from)) conds.push(gte(auditLogsTable.createdAt, new Date(`${req.query.from}T00:00:00+03:00`)));
  if (typeof req.query.to === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.to)) conds.push(lte(auditLogsTable.createdAt, new Date(`${req.query.to}T23:59:59+03:00`)));
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 100));
  const offset = Math.max(0, Number(req.query.offset) || 0);
  const rows = await db.select().from(auditLogsTable)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(auditLogsTable.createdAt)).limit(limit).offset(offset);
  res.json(rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })));
});

export default router;
