// الحسابات المكررة: اكتشاف نسخ الطالبة نفسها (الاسم الموحّد + الجوال نفسه، أو الاسم + الحلقة نفسها)
// ودمجها في سجل واحد. الدمج لا يحذف شيئًا: تُنقل البيانات للسجل الأساسي وتُؤرشف النسخ.
import { Router, type IRouter } from "express";
import { db, studentsTable, studentEnrollmentsTable, recordsTable, reviewPlansTable, usersTable, circlesTable } from "@workspace/db";
import { inArray, sql } from "drizzle-orm";
import { authenticate } from "../middlewares/authenticate";
import { normalizeName, phoneTail, maskEmail } from "../lib/studentIdentity";
import { logger } from "../lib/logger";

const router: IRouter = Router();
const MANAGERS = ["leader", "deputy"];

type Member = {
  id: number; fullName: string; isArchived: boolean; createdAt: string; phoneTail: string;
  circles: Array<{ id: number; name: string; active: boolean }>;
  records: number; plans: number; accounts: string[];
};
type Group = { key: string; reason: "phone" | "circle"; suggestedPrimaryId: number; members: Member[] };

async function buildGroups(): Promise<Group[]> {
  const students = await db.select({
    id: studentsTable.id, fullName: studentsTable.fullName, phone: studentsTable.phone,
    isArchived: studentsTable.isArchived, createdAt: studentsTable.createdAt,
  }).from(studentsTable);
  const enrolls = await db.select({ studentId: studentEnrollmentsTable.studentId, circleId: studentEnrollmentsTable.circleId, isArchived: studentEnrollmentsTable.isArchived })
    .from(studentEnrollmentsTable);
  const enrollBy = new Map<number, typeof enrolls>();
  for (const e of enrolls) enrollBy.set(e.studentId, [...(enrollBy.get(e.studentId) ?? []), e]);

  // تجميع: الاسم + الجوال، ثم الاسم + حلقة نشطة مشتركة (لمن بلا جوال مطابق)
  const byKey = new Map<string, { reason: Group["reason"]; ids: Set<number> }>();
  const add = (key: string, reason: Group["reason"], id: number) => {
    const g = byKey.get(key) ?? { reason, ids: new Set<number>() };
    g.ids.add(id);
    byKey.set(key, g);
  };
  for (const s of students) {
    const nm = normalizeName(s.fullName);
    if (!nm) continue;
    const ph = phoneTail(s.phone);
    if (ph) add(`${nm}|p${ph}`, "phone", s.id);
    for (const e of enrollBy.get(s.id) ?? []) if (!e.isArchived) add(`${nm}|c${e.circleId}`, "circle", s.id);
  }
  // دمج المجموعات المتداخلة (اتحاد) حتى تظهر كل نسخ الطالبة في مجموعة واحدة
  const parent = new Map<number, number>();
  const find = (x: number): number => { const p = parent.get(x) ?? x; if (p === x) return x; const r = find(p); parent.set(x, r); return r; };
  const reasonOf = new Map<number, Group["reason"]>();
  for (const g of byKey.values()) {
    if (g.ids.size < 2) continue;
    const ids = [...g.ids];
    for (const id of ids.slice(1)) parent.set(find(id), find(ids[0]!));
    for (const id of ids) if (g.reason === "phone" || !reasonOf.has(id)) reasonOf.set(id, g.reason);
  }
  const groups = new Map<number, number[]>();
  for (const id of reasonOf.keys()) {
    const r = find(id);
    groups.set(r, [...(groups.get(r) ?? []), id]);
  }
  const allIds = [...groups.values()].flat();
  if (allIds.length === 0) return [];

  const [recCounts, planCounts, accounts, circles] = await Promise.all([
    db.select({ studentId: recordsTable.studentId, n: sql<number>`count(*)::int` }).from(recordsTable)
      .where(inArray(recordsTable.studentId, allIds)).groupBy(recordsTable.studentId),
    db.select({ studentId: reviewPlansTable.studentId, n: sql<number>`count(*)::int` }).from(reviewPlansTable)
      .where(inArray(reviewPlansTable.studentId, allIds)).groupBy(reviewPlansTable.studentId),
    db.select({ studentId: usersTable.studentId, email: usersTable.email }).from(usersTable)
      .where(inArray(usersTable.studentId, allIds)),
    db.select({ id: circlesTable.id, name: circlesTable.name }).from(circlesTable),
  ]);
  const recBy = new Map(recCounts.map((r) => [r.studentId, Number(r.n)]));
  const planBy = new Map(planCounts.map((r) => [r.studentId, Number(r.n)]));
  const circleName = new Map(circles.map((c) => [c.id, c.name]));
  const byId = new Map(students.map((s) => [s.id, s]));

  const out: Group[] = [];
  for (const ids of groups.values()) {
    if (ids.length < 2) continue;
    const members: Member[] = ids.sort((a, b) => a - b).map((id) => {
      const s = byId.get(id)!;
      return {
        id, fullName: s.fullName, isArchived: s.isArchived, createdAt: s.createdAt.toISOString(), phoneTail: phoneTail(s.phone).slice(-4),
        circles: (enrollBy.get(id) ?? []).map((e) => ({ id: e.circleId, name: circleName.get(e.circleId) ?? `#${e.circleId}`, active: !e.isArchived })),
        records: recBy.get(id) ?? 0, plans: planBy.get(id) ?? 0,
        accounts: accounts.filter((a) => a.studentId === id).map((a) => maskEmail(a.email)),
      };
    });
    // الأساسي المقترح: الأكثر سجلات، ثم النشطة، ثم صاحبة خطة، ثم الأقدم
    const primary = [...members].sort((a, b) =>
      b.records - a.records || Number(a.isArchived) - Number(b.isArchived) || b.plans - a.plans || a.id - b.id)[0]!;
    const reason = ids.some((id) => reasonOf.get(id) === "phone") ? "phone" : "circle";
    out.push({ key: ids.join("-"), reason, suggestedPrimaryId: primary.id, members });
  }
  // الأكثر إلحاحًا أولًا: أكثر من نسخة نشطة
  return out.sort((a, b) => b.members.filter((m) => !m.isArchived).length - a.members.filter((m) => !m.isArchived).length || b.members.length - a.members.length);
}

router.get("/admin/duplicate-students", authenticate, async (req, res): Promise<void> => {
  if (!MANAGERS.includes(req.userRole!)) { res.status(403).json({ error: "للقائدة والنائبة فقط" }); return; }
  const groups = await buildGroups();
  res.json({ groups, totalGroups: groups.length, totalCopies: groups.reduce((n, g) => n + g.members.length - 1, 0) });
});

/** دمج نسخ في سجل أساسي واحد (داخل معاملة واحدة). */
async function mergeInto(primaryId: number, duplicateIds: number[]): Promise<void> {
  const dups = duplicateIds.filter((id) => id !== primaryId);
  if (dups.length === 0) return;
  await db.transaction(async (tx) => {
    for (const dup of dups) {
      // السجلات اليومية: تُنقل إلا يومًا للأساسي فيه سجل في الحلقة نفسها (يبقى سجل الأساسي)
      await tx.execute(sql`UPDATE records r SET student_id = ${primaryId}
        WHERE r.student_id = ${dup}
          AND NOT EXISTS (SELECT 1 FROM records p WHERE p.student_id = ${primaryId} AND p.circle_id = r.circle_id AND p.date = r.date)`);
      // التسجيلات في الحلقات: تُنقل، وإن وُجدت للأساسي الحلقة نفسها تُنشَّط إن كانت نسخة الدمج نشطة
      await tx.execute(sql`UPDATE student_enrollments p SET is_archived = false, archived_at = NULL
        FROM student_enrollments d
        WHERE d.student_id = ${dup} AND d.is_archived = false AND p.student_id = ${primaryId} AND p.circle_id = d.circle_id`);
      await tx.execute(sql`UPDATE student_enrollments d SET student_id = ${primaryId}
        WHERE d.student_id = ${dup}
          AND NOT EXISTS (SELECT 1 FROM student_enrollments p WHERE p.student_id = ${primaryId} AND p.circle_id = d.circle_id)`);
      await tx.execute(sql`UPDATE student_enrollments SET is_archived = true, archived_at = now() WHERE student_id = ${dup} AND is_archived = false`);
      // روابط الحسابات
      await tx.execute(sql`UPDATE user_student_links l SET student_id = ${primaryId}
        WHERE l.student_id = ${dup} AND NOT EXISTS (SELECT 1 FROM user_student_links p WHERE p.user_id = l.user_id AND p.student_id = ${primaryId})`);
      await tx.execute(sql`UPDATE users SET student_id = ${primaryId} WHERE student_id = ${dup}`);
      // المحفوظ القديم: سجل واحد فقط بلا منشئ لكل طالبة
      await tx.execute(sql`UPDATE student_memorizations m SET student_id = ${primaryId}
        WHERE m.student_id = ${dup} AND (m.created_by_id IS NOT NULL
          OR NOT EXISTS (SELECT 1 FROM student_memorizations p WHERE p.student_id = ${primaryId} AND p.created_by_id IS NULL))`);
      // بقية الجداول بلا قيود تفرد
      for (const table of ["review_plans", "exam_records", "student_notes", "student_goals", "student_leave_history",
        "student_transfers", "student_archive_events", "low_memorization_alerts", "plan_notifications"]) {
        await tx.execute(sql`UPDATE ${sql.identifier(table)} SET student_id = ${primaryId} WHERE student_id = ${dup}`);
      }
      await tx.execute(sql`UPDATE certificate_scores c SET student_id = ${primaryId}
        WHERE c.student_id = ${dup} AND NOT EXISTS (SELECT 1 FROM certificate_scores p
          WHERE p.student_id = ${primaryId} AND p.term_id = c.term_id AND p.circle_id IS NOT DISTINCT FROM c.circle_id)`);
      await tx.execute(sql`UPDATE certificate_import_candidates SET matched_student_id = ${primaryId} WHERE matched_student_id = ${dup}`);
      // النسخة نفسها: تُؤرشف (لا تُحذف)
      await tx.execute(sql`UPDATE students SET is_archived = true WHERE id = ${dup}`);
    }
    // الأساسي: نشط إن بقي له تسجيل نشط، وحلقته الأساسية إحدى حلقاته النشطة
    await tx.execute(sql`UPDATE students s SET is_archived = false,
        circle_id = COALESCE((SELECT e.circle_id FROM student_enrollments e WHERE e.student_id = s.id AND e.is_archived = false
          ORDER BY (e.circle_id = s.circle_id) DESC, e.id DESC LIMIT 1), s.circle_id)
      WHERE s.id = ${primaryId} AND EXISTS (SELECT 1 FROM student_enrollments e WHERE e.student_id = s.id AND e.is_archived = false)`);
  });
}

router.post("/admin/duplicate-students/merge", authenticate, async (req, res): Promise<void> => {
  if (!MANAGERS.includes(req.userRole!)) { res.status(403).json({ error: "للقائدة والنائبة فقط" }); return; }
  const primaryId = Number(req.body?.primaryId);
  const duplicateIds: number[] = Array.isArray(req.body?.duplicateIds) ? req.body.duplicateIds.map(Number).filter(Number.isFinite) : [];
  if (!Number.isFinite(primaryId) || duplicateIds.length === 0) { res.status(400).json({ error: "حدّدي السجل الأساسي والنسخ" }); return; }
  // أمان: لا يُدمج إلا ما يقع فعلًا في مجموعة نسخ واحدة مع الأساسي
  const groups = await buildGroups();
  const group = groups.find((g) => g.members.some((m) => m.id === primaryId));
  if (!group || !duplicateIds.every((id) => group.members.some((m) => m.id === id))) {
    res.status(400).json({ error: "هذه السجلات ليست نسخًا لطالبة واحدة" });
    return;
  }
  await mergeInto(primaryId, duplicateIds);
  res.json({ merged: duplicateIds.filter((id) => id !== primaryId).length });
});

/** دمج كل المجموعات المطابقة بالاسم والجوال معًا (الأوثق)، بالأساسي المقترح. */
router.post("/admin/duplicate-students/merge-all", authenticate, async (req, res): Promise<void> => {
  if (req.userRole !== "leader") { res.status(403).json({ error: "للقائدة فقط" }); return; }
  const groups = (await buildGroups()).filter((g) => g.reason === "phone");
  let merged = 0;
  let failed = 0;
  for (const g of groups) {
    try {
      const dups = g.members.map((m) => m.id).filter((id) => id !== g.suggestedPrimaryId);
      await mergeInto(g.suggestedPrimaryId, dups);
      merged += dups.length;
    } catch (err) {
      failed++;
      logger.warn({ err, group: g.key }, "duplicate merge failed");
    }
  }
  res.json({ groups: groups.length, merged, failed });
});

export default router;
