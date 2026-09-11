import { Router, type IRouter } from "express";
import { spawn } from "child_process";
import path from "path";
import { authenticate, requireRole } from "../middlewares/authenticate";
import { db, usersTable, studentsTable, circlesTable, studentEnrollmentsTable } from "@workspace/db";
import { eq, and, isNull, isNotNull, sql } from "drizzle-orm";

const router: IRouter = Router();

router.post("/admin/schema-push", authenticate, requireRole("leader"), async (req, res): Promise<void> => {
  // This runs `drizzle push --force` directly against the production
  // database from an HTTP request. Even restricted to the leader role, a
  // single accidental click can force-alter/drop production schema with no
  // undo. Require it to be explicitly enabled per-deployment and require an
  // explicit confirmation phrase in the request body, so it can't be
  // triggered by mistake (e.g. a stray button click or a replayed request).
  if (process.env.ALLOW_SCHEMA_PUSH !== "true") {
    res.status(403).json({
      error: "هذه الميزة معطّلة. لتفعيلها مؤقتًا اضبطي متغير البيئة ALLOW_SCHEMA_PUSH=true على السيرفر.",
    });
    return;
  }
  if ((req.body as { confirm?: string })?.confirm !== "PUSH SCHEMA") {
    res.status(400).json({
      error: 'أرسلي { "confirm": "PUSH SCHEMA" } في نص الطلب لتأكيد هذا الإجراء الخطير.',
    });
    return;
  }

  const dbDir = path.resolve(process.cwd(), "../../lib/db");
  const connectionString = process.env.SUPABASE_DB_URL || process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL || "";

  const env = {
    ...process.env,
    SUPABASE_DATABASE_URL: connectionString,
    DATABASE_URL: connectionString,
  };

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Transfer-Encoding", "chunked");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const child = spawn(
    "pnpm",
    ["run", "push-force"],
    { cwd: dbDir, env, shell: true }
  );

  child.stdout.on("data", (chunk: Buffer) => {
    res.write(chunk.toString());
  });

  child.stderr.on("data", (chunk: Buffer) => {
    res.write(chunk.toString());
  });

  child.on("close", (code) => {
    if (code === 0) {
      res.write("\n✅ تمت المزامنة بنجاح");
    } else {
      res.write(`\n❌ فشلت المزامنة (exit code ${code})`);
    }
    res.end();
  });

  child.on("error", (err) => {
    res.write(`\n❌ خطأ: ${err.message}`);
    res.end();
  });
});

// ── مزامنة البيانات: ربط الطالبات بسجلات التسجيل + ربط المعلمات/المشرفات بالحلقات ──
router.post("/admin/sync-data", authenticate, requireRole("leader"), async (_req, res): Promise<void> => {
  const results = { enrollmentsCreated: 0, circlesUpdated: 0 };

  // 1. إنشاء سجلات تسجيل مفقودة للطالبات اللواتي لديهن circleId مباشرة
  const studentsWithCircle = await db
    .select({ id: studentsTable.id, circleId: studentsTable.circleId })
    .from(studentsTable)
    .where(and(eq(studentsTable.isArchived, false), isNotNull(studentsTable.circleId)));

  for (const student of studentsWithCircle) {
    if (!student.circleId) continue;
    const existing = await db
      .select({ id: studentEnrollmentsTable.id })
      .from(studentEnrollmentsTable)
      .where(and(
        eq(studentEnrollmentsTable.studentId, student.id),
        eq(studentEnrollmentsTable.circleId, student.circleId),
      ))
      .limit(1);
    if (existing.length === 0) {
      await db.insert(studentEnrollmentsTable)
        .values({ studentId: student.id, circleId: student.circleId, isArchived: false })
        .onConflictDoNothing();
      results.enrollmentsCreated++;
    }
  }

  // 2. ربط المعلمات والمشرفات بحلقاتهن
  const staffWithCircle = await db
    .select({ id: usersTable.id, role: usersTable.role, circleId: usersTable.circleId })
    .from(usersTable)
    .where(and(
      eq(usersTable.isArchived, false),
      isNotNull(usersTable.circleId),
    ));

  for (const staff of staffWithCircle) {
    if (!staff.circleId) continue;
    if (staff.role === "teacher") {
      await db.update(circlesTable)
        .set({ teacherId: staff.id })
        .where(and(eq(circlesTable.id, staff.circleId), isNull(circlesTable.teacherId)));
      results.circlesUpdated++;
    } else if (staff.role === "supervisor") {
      await db.update(circlesTable)
        .set({ supervisorId: staff.id })
        .where(and(eq(circlesTable.id, staff.circleId), isNull(circlesTable.supervisorId)));
      results.circlesUpdated++;
    }
  }

  res.json({ success: true, ...results, message: `تم إنشاء ${results.enrollmentsCreated} سجل تسجيل مفقود، وتحديث ${results.circlesUpdated} حلقة` });
});

// ── قبول جميع طلبات التسجيل المعلّقة دفعةً واحدة ──
router.post("/admin/approve-pending", authenticate, requireRole("leader"), async (_req, res): Promise<void> => {
  const result = await db.execute(
    sql`UPDATE users SET registration_status = 'approved' WHERE registration_status = 'pending'`
  );
  const count = (result as any).rowCount ?? 0;
  res.json({ success: true, count, message: `تم قبول ${count} طلب معلّق` });
});

export default router;
