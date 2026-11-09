// نقل طالبة من حلقة إلى أخرى — نفس خطوات النقل في PATCH /students/:id:
// تسجيل النقل، أرشفة تسجيل الحلقة المصدر فقط، نقل سجلاتها، تسجيلها في الهدف، وتحديث حسابها.
import { db, studentsTable, studentEnrollmentsTable, studentTransfersTable, recordsTable, usersTable } from "@workspace/db";
import { and, eq, isNull } from "drizzle-orm";

export async function performTransfer(opts: { studentId: number; fromCircleId: number | null; toCircleId: number; byUserId: number }): Promise<void> {
  const { studentId, toCircleId, byUserId } = opts;
  await db.transaction(async (tx) => {
    const [before] = await tx.select().from(studentsTable).where(eq(studentsTable.id, studentId));
    if (!before) throw new Error("الطالبة غير موجودة");
    const active = await tx.select({ circleId: studentEnrollmentsTable.circleId }).from(studentEnrollmentsTable)
      .where(and(eq(studentEnrollmentsTable.studentId, studentId), eq(studentEnrollmentsTable.isArchived, false)));
    const source = opts.fromCircleId ?? before.circleId ?? active[0]?.circleId ?? null;
    const sourceActive = source != null && active.some((e) => e.circleId === source);

    // الحلقة الأساسية في جدول الطالبات تتغير فقط إن كان النقل من حلقتها الأساسية
    if (source == null || source === before.circleId) {
      await tx.update(studentsTable).set({ circleId: toCircleId, isArchived: false }).where(eq(studentsTable.id, studentId));
    }
    await tx.insert(studentTransfersTable).values({ studentId, fromCircleId: source ?? undefined, toCircleId, transferredById: byUserId });
    if (sourceActive) {
      await tx.update(studentEnrollmentsTable).set({ isArchived: true, archivedAt: new Date() })
        .where(and(eq(studentEnrollmentsTable.studentId, studentId), eq(studentEnrollmentsTable.circleId, source!), eq(studentEnrollmentsTable.isArchived, false)));
      await tx.update(recordsTable).set({ circleId: toCircleId })
        .where(and(eq(recordsTable.studentId, studentId), eq(recordsTable.circleId, source!)));
    }
    await tx.insert(studentEnrollmentsTable).values({ studentId, circleId: toCircleId, isArchived: false })
      .onConflictDoUpdate({ target: [studentEnrollmentsTable.studentId, studentEnrollmentsTable.circleId], set: { isArchived: false, archivedAt: null } });
    // حساب الطالبة: المرتبط بها في الحلقة المصدر، ثم غير المرتبط بالاسم في الحلقة المصدر
    if (source != null) {
      await tx.update(usersTable).set({ circleId: toCircleId })
        .where(and(eq(usersTable.studentId, studentId), eq(usersTable.role, "student"), eq(usersTable.circleId, source)));
      await tx.update(usersTable).set({ circleId: toCircleId })
        .where(and(eq(usersTable.role, "student"), isNull(usersTable.studentId), eq(usersTable.name, before.fullName), eq(usersTable.circleId, source)));
    } else {
      await tx.update(usersTable).set({ circleId: toCircleId })
        .where(and(eq(usersTable.studentId, studentId), eq(usersTable.role, "student")));
    }
  });
}
