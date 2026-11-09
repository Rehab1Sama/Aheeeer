// طلبات نقل الطالبات: ترسلها المعلمة أو المشرفة أو مسؤولة المسار، وتوافق عليها القائدة أو النائبة.
import { Router, type IRouter } from "express";
import { db, transferRequestsTable, studentsTable, circlesTable, usersTable } from "@workspace/db";
import { and, desc, eq, inArray } from "drizzle-orm";
import { authenticate } from "../middlewares/authenticate";
import { canAccessStudent } from "../lib/access";
import { performTransfer } from "../lib/studentTransfer";

const router: IRouter = Router();
const DECIDERS = ["leader", "deputy"];
const REQUESTERS = ["leader", "deputy", "track_supervisor", "teacher", "supervisor", "data_entry"];

router.post("/transfer-requests", authenticate, async (req, res): Promise<void> => {
  if (!REQUESTERS.includes(req.userRole!)) { res.status(403).json({ error: "غير مسموح" }); return; }
  const studentId = Number(req.body?.studentId);
  const toCircleId = Number(req.body?.toCircleId);
  const fromCircleId = req.body?.fromCircleId != null ? Number(req.body.fromCircleId) : null;
  const note = typeof req.body?.note === "string" ? req.body.note.slice(0, 500) : null;
  if (!Number.isFinite(studentId) || !Number.isFinite(toCircleId)) { res.status(400).json({ error: "حدّدي الطالبة والحلقة" }); return; }
  // مسؤولة المسار ترسل طلبًا لأي طالبة (فقد تكون خارج مسارها)، والبقية لطالبات نطاقهن
  if (req.userRole !== "track_supervisor" && !DECIDERS.includes(req.userRole!) && !(await canAccessStudent(req, studentId))) {
    res.status(403).json({ error: "الطالبة ليست ضمن نطاقكِ" }); return;
  }
  const [target] = await db.select({ id: circlesTable.id, isArchived: circlesTable.isArchived }).from(circlesTable).where(eq(circlesTable.id, toCircleId));
  if (!target || target.isArchived) { res.status(400).json({ error: "الحلقة الهدف غير متاحة" }); return; }
  const [dup] = await db.select({ id: transferRequestsTable.id }).from(transferRequestsTable).where(and(
    eq(transferRequestsTable.studentId, studentId), eq(transferRequestsTable.toCircleId, toCircleId), eq(transferRequestsTable.status, "pending"),
  ));
  if (dup) { res.status(409).json({ error: "يوجد طلب نقل مماثل بانتظار الموافقة" }); return; }
  const [row] = await db.insert(transferRequestsTable).values({ studentId, fromCircleId, toCircleId, requestedById: req.userId!, note }).returning();
  res.status(201).json(row);
});

router.get("/transfer-requests", authenticate, async (req, res): Promise<void> => {
  const status = typeof req.query.status === "string" ? req.query.status : "pending";
  const isDecider = DECIDERS.includes(req.userRole!);
  const rows = await db.select().from(transferRequestsTable).where(and(
    ...(status === "all" ? [] : [eq(transferRequestsTable.status, status)]),
    ...(isDecider ? [] : [eq(transferRequestsTable.requestedById, req.userId!)]),
  )).orderBy(desc(transferRequestsTable.createdAt)).limit(200);
  if (rows.length === 0) { res.json([]); return; }
  const sIds = [...new Set(rows.map((r) => r.studentId))];
  const cIds = [...new Set(rows.flatMap((r) => [r.fromCircleId, r.toCircleId]).filter((x): x is number => x != null))];
  const uIds = [...new Set(rows.flatMap((r) => [r.requestedById, r.decidedById]).filter((x): x is number => x != null))];
  const [students, circles, users] = await Promise.all([
    db.select({ id: studentsTable.id, name: studentsTable.fullName }).from(studentsTable).where(inArray(studentsTable.id, sIds)),
    db.select({ id: circlesTable.id, name: circlesTable.name }).from(circlesTable).where(inArray(circlesTable.id, cIds.length ? cIds : [-1])),
    db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(inArray(usersTable.id, uIds.length ? uIds : [-1])),
  ]);
  const nm = <T extends { id: number; name: string }>(list: T[], id: number | null) => (id == null ? null : list.find((x) => x.id === id)?.name ?? null);
  res.json(rows.map((r) => ({
    ...r,
    studentName: nm(students, r.studentId), fromCircleName: nm(circles, r.fromCircleId), toCircleName: nm(circles, r.toCircleId),
    requestedByName: nm(users, r.requestedById), decidedByName: nm(users, r.decidedById),
    createdAt: r.createdAt.toISOString(), decidedAt: r.decidedAt?.toISOString() ?? null,
  })));
});

router.post("/transfer-requests/:id/decide", authenticate, async (req, res): Promise<void> => {
  if (!DECIDERS.includes(req.userRole!)) { res.status(403).json({ error: "للقائدة والنائبة فقط" }); return; }
  const id = Number(req.params.id);
  const approve = req.body?.approve === true;
  const decisionNote = typeof req.body?.note === "string" ? req.body.note.slice(0, 500) : null;
  const [r] = await db.select().from(transferRequestsTable).where(eq(transferRequestsTable.id, id));
  if (!r) { res.status(404).json({ error: "الطلب غير موجود" }); return; }
  if (r.status !== "pending") { res.status(409).json({ error: "تم البت في هذا الطلب مسبقًا" }); return; }
  if (approve) {
    await performTransfer({ studentId: r.studentId, fromCircleId: r.fromCircleId, toCircleId: r.toCircleId, byUserId: req.userId! });
  }
  await db.update(transferRequestsTable).set({
    status: approve ? "approved" : "rejected", decidedById: req.userId!, decisionNote, decidedAt: new Date(),
  }).where(eq(transferRequestsTable.id, id));
  res.json({ ok: true });
});

export default router;
