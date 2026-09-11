// ============================================================================
// إرسال الأوسمة اللحظية الثلاثة الباقية يدويًا — "إنهاء خطة المراجعة"،
// "مسارنا الأحب"، و"فخر الأسبوع (مسؤولة المسار)". نفس فكرة
// monthlyAttendanceBadge.ts بالضبط: القائدة/النائبة تحدد تاريخ من صفحة
// "مستحقات الأوسمة" وتضغط "إرسال"، فيُحسب لحظيًا (lib/badgeOverview.ts) مين
// مستحقة، وتوصل رسالة تهنئة عبر جدول messages الموجود. ما نخزّن أي وسام
// "رسمي" جديد هنا — فقط الإشعار + عدّاد الاستحقاقات (badge_award_counts).
//
// قبل هذا الملف، هذي الأوسمة الثلاثة كانت تُعرض فقط (لحظيًا، بدون أي زر
// إرسال) بينما الصفحات الأخرى (حلقتي/مسار الطالبة..) تجيبها لحظيًا بتاريخ
// افتراضي (آخر أسبوع مكتمل) — فكانت تبين "قديمة" لأنه ما فيه أي تحكم
// بالتاريخ ولا إشعار فعلي يوصل. الآن صار فيها نفس زر "إرسال الوسام الآن"
// اللي عند "حضور الفترة الكاملة" بالضبط.
// ============================================================================

import { db, messagesTable, tracksTable } from "@workspace/db";
import {
  overviewReviewPlanCompletion,
  overviewTrackNoShortcoming,
  overviewSupervisorWeeklyCommitment,
  type OverviewEntry,
} from "./badgeOverview";
import { recordBadgeAward } from "./badgeAwardCounts";

export interface SendBadgeResult {
  count: number;
  recipients: { id: string; name: string }[];
}

/** ترسل وسام "إنهاء خطة المراجعة" لكل طالبة مستحقة حتى تاريخ asOf. */
export async function sendReviewPlanCompletionBadges(asOf: string, senderId: number): Promise<SendBadgeResult> {
  const qualifying: OverviewEntry[] = await overviewReviewPlanCompletion(asOf);
  if (qualifying.length === 0) return { count: 0, recipients: [] };

  const messageRows = qualifying.map(e => ({
    senderId,
    targetType: "student",
    targetId: e.key, // key = String(studentId)
    content: `${e.badge.emoji} مبروك ${e.label}! حصلتِ على وسام "${e.badge.name}" — ${e.badge.subtitle}`,
    expiresAt: null,
  }));
  await db.insert(messagesTable).values(messageRows);

  for (const e of qualifying) {
    await recordBadgeAward("student", Number(e.key), "review_plan_completion", e.badge.tier, asOf);
  }

  return { count: qualifying.length, recipients: qualifying.map(e => ({ id: e.key, name: e.label })) };
}

/** ترسل وسام "مسارنا الأحب" لكل مسار مستحق خلال الأسبوع weekStart. */
export async function sendTrackNoShortcomingBadges(weekStart: string, senderId: number): Promise<SendBadgeResult> {
  const qualifying: OverviewEntry[] = await overviewTrackNoShortcoming(weekStart);
  if (qualifying.length === 0) return { count: 0, recipients: [] };

  const messageRows = qualifying.map(e => ({
    senderId,
    targetType: "track",
    targetId: e.key, // key = اسم المسار
    content: `${e.badge.emoji} مبروك مسار "${e.label}"! حصلتوا على وسام "${e.badge.name}" — ${e.badge.subtitle}`,
    expiresAt: null,
  }));
  await db.insert(messagesTable).values(messageRows);

  const allTracks = await db.select({ id: tracksTable.id, name: tracksTable.name }).from(tracksTable);
  const trackIdByName = new Map(allTracks.map(t => [t.name, t.id]));
  for (const e of qualifying) {
    const trackId = trackIdByName.get(e.key);
    if (trackId != null) await recordBadgeAward("track", trackId, "track_no_shortcoming", e.badge.tier, weekStart);
  }

  return { count: qualifying.length, recipients: qualifying.map(e => ({ id: e.key, name: e.label })) };
}

/** ترسل وسام "فخر الأسبوع" لكل مسؤولة مسار مستحقة خلال الأسبوع weekStart — تصل كإشعار لمسارها. */
export async function sendSupervisorWeeklyCommitmentBadges(weekStart: string, senderId: number): Promise<SendBadgeResult> {
  const qualifying: OverviewEntry[] = await overviewSupervisorWeeklyCommitment(weekStart);
  if (qualifying.length === 0) return { count: 0, recipients: [] };

  const messageRows = qualifying
    .filter(e => e.meta) // بدون مسار معروف ما نقدر نوجّه الإشعار
    .map(e => ({
      senderId,
      targetType: "track",
      targetId: e.meta as string, // اسم المسار
      content: `${e.badge.emoji} مبروك ${e.label}! حصلتِ على وسام "${e.badge.name}" — ${e.badge.subtitle}`,
      expiresAt: null,
    }));
  if (messageRows.length > 0) await db.insert(messagesTable).values(messageRows);

  for (const e of qualifying) {
    await recordBadgeAward("track_supervisor_name", Number(e.key), "supervisor_weekly_commitment", e.badge.tier, weekStart);
  }

  return { count: qualifying.length, recipients: qualifying.map(e => ({ id: e.key, name: e.label })) };
}
