// نقل طالبة من حلقة إلى أخرى (مصدر واحد للنقل في كل الموقع):
// تسجيل النقل في سجل النقل، حذف عضويتها في الحلقة المصدر (لا تبقى نسخة فيها ولا في أرشيفها)،
// نقل سجلاتها، تسجيلها في الهدف، ونقل حساب دخولها (أو إيقافه إن كان لها حساب في الهدف).
import { db, studentsTable, studentEnrollmentsTable, studentTransfersTable, recordsTable, reviewPlansTable, circlesTable } from "@workspace/db";
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
    // خطتها النشطة في الحلقة المصدر: تنتقل معها إن كانت الحلقة الهدف من نفس نوع المسار (ولا خطة لها هناك)،
    // وإلا تُغلق (transferred) — فلا تبقى خطة معلَّقة في حلقة لم تعد فيها (ولا تظهر لمعلمة/مشرفة الحلقة الجديدة ناقصة)
    if (source != null && source !== toCircleId) {
      const [src] = await tx.select({ t: circlesTable.trackType }).from(circlesTable).where(eq(circlesTable.id, source));
      const [dst] = await tx.select({ t: circlesTable.trackType }).from(circlesTable).where(eq(circlesTable.id, toCircleId));
      const plans = await tx.select({ id: reviewPlansTable.id, planType: reviewPlansTable.planType }).from(reviewPlansTable)
        .where(and(eq(reviewPlansTable.studentId, studentId), eq(reviewPlansTable.circleId, source), eq(reviewPlansTable.status, "active")));
      for (const p of plans) {
        const [already] = await tx.select({ id: reviewPlansTable.id }).from(reviewPlansTable).where(and(
          eq(reviewPlansTable.studentId, studentId), eq(reviewPlansTable.circleId, toCircleId),
          eq(reviewPlansTable.status, "active"), eq(reviewPlansTable.planType, p.planType),
        ));
        if (src?.t && src.t === dst?.t && !already) {
          await tx.update(reviewPlansTable).set({ circleId: toCircleId }).where(eq(reviewPlansTable.id, p.id));
        } else {
          await tx.update(reviewPlansTable).set({ status: "transferred" }).where(eq(reviewPlansTable.id, p.id)); // حالة مستقلة: لا تُحسب منتهية ولا ملغاة
        }
      }
    }
    await tx.insert(studentEnrollmentsTable).values({ studentId, circleId: toCircleId, isArchived: false })
      .onConflictDoUpdate({ target: [studentEnrollmentsTable.studentId, studentEnrollmentsTable.circleId], set: { isArchived: false, archivedAt: null } });
    await moveStudentAccounts(tx, { studentId, fullName: before.fullName, fromCircleId: source, toCircleId });
  });
}
