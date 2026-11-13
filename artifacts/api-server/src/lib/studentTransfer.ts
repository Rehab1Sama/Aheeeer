// نقل طالبة من حلقة إلى أخرى (مصدر واحد للنقل في كل الموقع):
// تسجيل النقل في سجل النقل، حذف عضويتها في الحلقة المصدر (لا تبقى نسخة فيها ولا في أرشيفها)،
// نقل سجلاتها، تسجيلها في الهدف، ونقل حساب دخولها (أو إيقافه إن كان لها حساب في الهدف).
import { db, studentsTable, studentEnrollmentsTable, studentTransfersTable, recordsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { moveStudentAccounts } from "./studentAccounts";

export async function performTransfer(opts: { studentId: number; fromCircleId: number | null; toCircleId: number; byUserId: number; primaryAlreadySet?: boolean }): Promise<void> {
  const { studentId, toCircleId, byUserId } = opts;
  await db.transaction(async (tx) => {
    const [before] = await tx.select().from(studentsTable).where(eq(studentsTable.id, studentId));
    if (!before) throw new Error("الطالبة غير موجودة");
    const active = await tx.select({ circleId: studentEnrollmentsTable.circleId }).from(studentEnrollmentsTable)
      .where(and(eq(studentEnrollmentsTable.studentId, studentId), eq(studentEnrollmentsTable.isArchived, false)));
    const source = opts.fromCircleId ?? before.circleId ?? active[0]?.circleId ?? null;
    const sourceActive = source != null && active.some((e) => e.circleId === source);

    // الحلقة الأساسية في جدول الطالبات تتغير فقط إن كان النقل من حلقتها الأساسية
    if (!opts.primaryAlreadySet && (source == null || source === before.circleId)) {
      await tx.update(studentsTable).set({ circleId: toCircleId, isArchived: false }).where(eq(studentsTable.id, studentId));
    }
    await tx.insert(studentTransfersTable).values({ studentId, fromCircleId: source ?? undefined, toCircleId, transferredById: byUserId });
    if (source != null && source !== toCircleId) {
      // تُحذف عضوية المصدر (نشطة أو مؤرشفة) — سجل النقل يحفظ التاريخ، والسجلات تنتقل معها
      await tx.delete(studentEnrollmentsTable)
        .where(and(eq(studentEnrollmentsTable.studentId, studentId), eq(studentEnrollmentsTable.circleId, source)));
      await tx.update(recordsTable).set({ circleId: toCircleId })
        .where(and(eq(recordsTable.studentId, studentId), eq(recordsTable.circleId, source)));
    }
    void sourceActive;
    await tx.insert(studentEnrollmentsTable).values({ studentId, circleId: toCircleId, isArchived: false })
      .onConflictDoUpdate({ target: [studentEnrollmentsTable.studentId, studentEnrollmentsTable.circleId], set: { isArchived: false, archivedAt: null } });
    await moveStudentAccounts(tx, { studentId, fullName: before.fullName, fromCircleId: source, toCircleId });
  });
}
