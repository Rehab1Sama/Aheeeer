// قوائم مشتركة تُطلب كثيرًا، محفوظة مؤقتًا (انظري readCache.ts: تُفرَّغ مع أي تعديل)
import { db, usersTable } from "@workspace/db";
import { cachedList } from "./readCache";
import { mirroredStudents, mirroredRecordsInRange } from "./tableMirror";

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
