// قوائم مشتركة تُطلب كثيرًا، محفوظة مؤقتًا (انظري readCache.ts: تُفرَّغ مع أي تعديل)
import { db, usersTable, studentEnrollmentsTable, studentsTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { cachedList } from "./readCache";
import { mirroredStudents, mirroredRecordsInRange, fingerprinted } from "./tableMirror";

/** تسجيلات الحلقات النشطة مع اسم الطالبة وجوالها (من الذاكرة ما لم تتغيَّر) */
export function activeEnrollmentsWithNames() {
  return fingerprinted("enrollments:active-with-names", sql`select md5(string_agg(concat_ws('|', e.id, e.student_id, e.circle_id, s.full_name, s.phone), ',' order by e.id)) as h
      from student_enrollments e join students s on s.id = e.student_id where e.is_archived = false and s.is_archived = false`, () => db.select({
    studentId: studentEnrollmentsTable.studentId,
    circleId: studentEnrollmentsTable.circleId,
    fullName: studentsTable.fullName,
    phone: studentsTable.phone,
  })
    .from(studentEnrollmentsTable)
    .innerJoin(studentsTable, eq(studentsTable.id, studentEnrollmentsTable.studentId))
    .where(and(eq(studentEnrollmentsTable.isArchived, false), eq(studentsTable.isArchived, false))));
}

/** كل الطالبات بحالة الأرشفة المطلوبة (الصف كاملًا) */
export async function studentsByArchived(archived: boolean) {
  return (await mirroredStudents()).filter((s) => s.isArchived === archived);
}

/** كل الطالبات (المؤرشفات وغيرهن) — للبحث بالرقم في صفحات تعرض أسماء */
export function allStudents() {
  return mirroredStudents();
}

/** أرقام الحسابات وأسماؤها وأدوارها فقط (لعرض اسم معلمة أو مختبِرة) — بلا كلمات مرور ولا بيانات أخرى */
export function userNames() {
  return cachedList("users:names", 60_000, () =>
    db.select({ id: usersTable.id, name: usersTable.name, role: usersTable.role, isArchived: usersTable.isArchived }).from(usersTable));
}

/** سجلات فترة: تُطلب بنفس الفترة مرات كثيرة متتالية (لوحات الإحصاءات والأوسمة) */
export function recordsInRange(from: string, to: string) {
  return mirroredRecordsInRange(from, to);
}
