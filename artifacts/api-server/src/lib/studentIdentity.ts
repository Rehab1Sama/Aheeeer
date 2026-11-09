// هوية الطالبة: مطابقة الاسم بلا حساسية للهمزات والتشكيل والمسافات، ومطابقة الجوال بآخر ٩ أرقام.
// تُستخدم لمنع إنشاء نسخ مكررة عند التسجيل، ولاكتشاف النسخ الموجودة ودمجها.
import { db, studentsTable, studentEnrollmentsTable, usersTable } from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
import { normalizeName, phoneTail } from "./nameMatch";
export { normalizeName, phoneTail, maskEmail } from "./nameMatch";

export type ExistingStudent = { id: number; isArchived: boolean; circleId: number | null };

/**
 * يبحث عن سجل الطالبة نفسها: الاسم الموحّد مطابق، ومعه دليل ثانٍ —
 * الجوال نفسه، أو تسجيل في الحلقة المختارة. (الاسم وحده لا يكفي: قد تتشابه أسماء طالبتين.)
 * الأفضلية: النشطة المسجلة في الحلقة، ثم النشطة، ثم الأحدث أرشفةً.
 */
export async function findExistingStudent(opts: { fullName: string; phone?: string | null; circleId?: number | null }): Promise<ExistingStudent | null> {
  const target = normalizeName(opts.fullName);
  if (!target) return null;
  const tail = phoneTail(opts.phone);
  const rows = await db.select({ id: studentsTable.id, fullName: studentsTable.fullName, phone: studentsTable.phone, isArchived: studentsTable.isArchived, circleId: studentsTable.circleId })
    .from(studentsTable);
  const candidates = rows.filter((r) => normalizeName(r.fullName) === target);
  if (candidates.length === 0) return null;
  const enrolls = await db.select({ studentId: studentEnrollmentsTable.studentId, circleId: studentEnrollmentsTable.circleId, isArchived: studentEnrollmentsTable.isArchived })
    .from(studentEnrollmentsTable)
    .where(inArray(studentEnrollmentsTable.studentId, candidates.map((c) => c.id)));
  const scored = candidates.map((c) => {
    const samePhone = tail !== "" && phoneTail(c.phone) === tail;
    const inCircle = opts.circleId != null && enrolls.some((e) => e.studentId === c.id && e.circleId === opts.circleId && !e.isArchived);
    const activeAnywhere = !c.isArchived && enrolls.some((e) => e.studentId === c.id && !e.isArchived);
    return { c, ok: samePhone || inCircle, score: (inCircle ? 8 : 0) + (samePhone ? 4 : 0) + (activeAnywhere ? 2 : 0) + (c.isArchived ? 0 : 1) };
  }).filter((x) => x.ok).sort((a, b) => b.score - a.score || b.c.id - a.c.id);
  const best = scored[0]?.c;
  return best ? { id: best.id, isArchived: best.isArchived, circleId: best.circleId } : null;
}

/** حساب طالبة موجود لهذه الطالبة في الحلقة نفسها؟ */
export async function existingAccountInCircle(studentId: number, circleId: number | null | undefined) {
  if (circleId == null) return null;
  const [u] = await db.select({ id: usersTable.id, email: usersTable.email }).from(usersTable)
    .where(and(eq(usersTable.studentId, studentId), eq(usersTable.circleId, circleId), eq(usersTable.role, "student"), eq(usersTable.isArchived, false)))
    .limit(1);
  return u ?? null;
}

