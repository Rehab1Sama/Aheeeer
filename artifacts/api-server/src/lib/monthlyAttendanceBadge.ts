// ============================================================================
// إرسال وسام "حضور الفترة الكاملة" (المعروف سابقًا بحضور الشهر الكامل) —
// بخلاف أقمر الحلقة (كرون أسبوعي تلقائي)، هذا الوسام تُرسله القائدة يدويًا من
// صفحة "مستحقات الأوسمة": تحدد فترة (من/إلى) وتضغط "إرسال"، فيُحسب لحظيًا
// (lib/badgeOverview.ts) مين مستحقة، وتوصلها رسالة تهنئة عبر جدول messages
// الموجود (نفس اتفاقية targetType: "student" المستخدمة بمسارات /messages/batch).
// ما نخزّن أي وسام "رسمي" جديد هنا — فقط الإشعار + عدّاد الاستحقاقات
// (badge_award_counts) عشان تظهر "تكررت X مرة" بصفحة نظرة الحلقة لاحقًا.
// ============================================================================

import { db, messagesTable } from "@workspace/db";
import { overviewPerfectAttendanceInRange, type OverviewEntry } from "./badgeOverview";
import { recordBadgeAward } from "./badgeAwardCounts";

export interface SendPerfectAttendanceResult {
  count: number;
  students: { id: number; name: string }[];
}

/** ترسل وسام حضور الفترة [dateFrom, dateTo] لكل طالبة مستحقة، وترجّع عدد المُرسَل لهن. */
export async function sendPerfectAttendanceBadges(
  dateFrom: string,
  dateTo: string,
  senderId: number,
): Promise<SendPerfectAttendanceResult> {
  const qualifying: OverviewEntry[] = await overviewPerfectAttendanceInRange(dateFrom, dateTo);
  if (qualifying.length === 0) return { count: 0, students: [] };

  const messageRows = qualifying.map(e => ({
    senderId,
    targetType: "student",
    targetId: e.key, // key = String(studentId) — نفس القيمة المُرجَعة من overviewPerfectAttendanceInRange
    content: `${e.badge.emoji} مبروك ${e.label}! حصلتِ على وسام "${e.badge.name}" — ${e.badge.subtitle} (من ${dateFrom} إلى ${dateTo})`,
    expiresAt: null,
  }));
  await db.insert(messagesTable).values(messageRows);

  for (const e of qualifying) {
    await recordBadgeAward("student", Number(e.key), "monthly_perfect", e.badge.tier, `${dateFrom}:${dateTo}`);
  }

  return { count: qualifying.length, students: qualifying.map(e => ({ id: Number(e.key), name: e.label })) };
}
