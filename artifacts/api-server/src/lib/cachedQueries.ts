// قوائم مشتركة تُطلب كثيرًا، محفوظة مؤقتًا (انظري readCache.ts: تُفرَّغ مع أي تعديل)
import { db, studentsTable, usersTable, recordsTable } from "@workspace/db";
import { eq, and, gte, lte } from "drizzle-orm";
import { cachedList } from "./readCache";

/** كل الطالبات بحالة الأرشفة المطلوبة (الصف كاملًا) */
export function studentsByArchived(archived: boolean) {
  return cachedList(`students:archived=${archived}`, 60_000, () =>
    db.select().from(studentsTable).where(eq(studentsTable.isArchived, archived)));
}

/** كل الطالبات (المؤرشفات وغيرهن) — للبحث بالرقم في صفحات تعرض أسماء */
export function allStudents() {
  return cachedList("students:all", 60_000, () => db.select().from(studentsTable));
}

/** أرقام الحسابات وأسماؤها وأدوارها فقط (لعرض اسم معلمة أو مختبِرة) — بلا كلمات مرور ولا بيانات أخرى */
export function userNames() {
  return cachedList("users:names", 60_000, () =>
    db.select({ id: usersTable.id, name: usersTable.name, role: usersTable.role, isArchived: usersTable.isArchived }).from(usersTable));
}

/** سجلات فترة: تُطلب بنفس الفترة مرات كثيرة متتالية (لوحات الإحصاءات والأوسمة) */
export function recordsInRange(from: string, to: string) {
  return cachedList(`records:${from}:${to}`, 60_000, () =>
    db.select().from(recordsTable).where(and(gte(recordsTable.date, from), lte(recordsTable.date, to))));
}
