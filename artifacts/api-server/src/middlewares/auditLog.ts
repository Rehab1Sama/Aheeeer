// يسجّل كل تعديل/حذف ناجح (POST/PUT/PATCH/DELETE) بعد انتهاء الطلب، دون إبطاء الرد.
// لا يُحفظ أي حقل حساس (كلمات السر والرموز)، والنصوص الطويلة تُختصر.
import type { Request, Response, NextFunction } from "express";
import { db, auditLogsTable, usersTable } from "@workspace/db";
import { eq, lt } from "drizzle-orm";
import { logger } from "../lib/logger";

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const SENSITIVE = /pass|token|secret|otp|code|key|hash/i;
// مسارات لا فائدة من تسجيلها (تسجيل الدخول، والقراءة الثقيلة، وتقارير آلية)
const SKIP = [/^\/auth\/(login|logout|refresh|switch)/, /^\/verification/, /^\/reports\/telegram/];
const KEEP_DAYS = 180;

function sanitize(value: unknown, depth = 0): unknown {
  if (value == null || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return value.length > 200 ? `${value.slice(0, 200)}…` : value;
  if (depth > 3) return "…";
  if (Array.isArray(value)) {
    const items = value.slice(0, 30).map((v) => sanitize(v, depth + 1));
    return value.length > 30 ? [...items, `… و${value.length - 30} أخرى`] : items;
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE.test(k) ? "[مخفي]" : sanitize(v, depth + 1);
    }
    return out;
  }
  return String(value);
}

const nameCache = new Map<number, string>();
let lastCleanup = 0;

export function auditLog(req: Request, res: Response, next: NextFunction): void {
  if (!MUTATING.has(req.method)) { next(); return; }
  const path = (req.originalUrl ?? req.url).replace(/^\/api/, "").split("?")[0] ?? "";
  if (SKIP.some((r) => r.test(path))) { next(); return; }
  const body = req.body;
  res.on("finish", () => {
    if (!req.userId || res.statusCode >= 400) return;
    void (async () => {
      try {
        let userName = nameCache.get(req.userId!);
        if (!userName) {
          const [u] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, req.userId!));
          userName = u?.name ?? "";
          nameCache.set(req.userId!, userName);
        }
        await db.insert(auditLogsTable).values({
          userId: req.userId!, userName, role: req.userRole ?? null,
          method: req.method, path: path.slice(0, 300), status: res.statusCode,
          body: body && typeof body === "object" && Object.keys(body).length ? sanitize(body) : null,
        });
        // تنظيف ما مضى عليه أكثر من ٦ أشهر (مرة كل يوم على الأكثر)
        if (Date.now() - lastCleanup > 86_400_000) {
          lastCleanup = Date.now();
          await db.delete(auditLogsTable).where(lt(auditLogsTable.createdAt, new Date(Date.now() - KEEP_DAYS * 86_400_000)));
        }
      } catch (err) {
        logger.warn({ err, path }, "audit log write failed");
      }
    })();
  });
  next();
}
