// قوائم مشتركة تُطلب كثيرًا، محفوظة مؤقتًا (انظري readCache.ts: تُفرَّغ مع أي تعديل)
import { db, studentsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { cachedList } from "./readCache";

/** كل الطالبات بحالة الأرشفة المطلوبة (الصف كاملًا) */
export function studentsByArchived(archived: boolean) {
  return cachedList(`students:archived=${archived}`, 60_000, () =>
    db.select().from(studentsTable).where(eq(studentsTable.isArchived, archived)));
}
