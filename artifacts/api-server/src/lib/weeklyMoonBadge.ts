import { badgeMessageExpiry } from "./badgeMessages";
import { db, circlesTable, usersTable, messagesTable, globalSettingsTable } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { logger } from "./logger";
import { getLastCompletedWeekStart, addDaysStr } from "./date";
import { computeAllCirclesWeeklyMoonBadges } from "./badgeEngine";
import { recordBadgeAward } from "./badgeAwardCounts";

const LAST_RUN_SETTINGS_KEY = "weekly_moon_badge_last_run_week";

/**
 * تُشتغّل أسبوعيًا (الجمعة صباحًا) — تُعلن وسام "أقمر الحلقة" (٤ درجات) لكل
 * حلقة مؤهلة خلال آخر أسبوع عمل مكتمل (الأحد-الخميس).
 *
 * ⚠️ القرار المعماري الجديد: الوسام يُحسب لحظيًا من lib/badgeEngine.ts —
 * ما يُخزَّن أي صف بجدول badge_events/badge_assignments هنا بعد الآن (تفاديًا
 * لتضخم القاعدة بتكرار أسبوعي). هذه الدالة فقط ترسل إشعارات (جدول messages
 * الموجود، وفيه expiresAt فما يتراكم) لكل حلقة مؤهلة وللمسار التابع لها.
 * صفحات العرض (my-circle.tsx، الحلقة الموحّدة لاحقًا) تجيب الوسام مباشرة من
 * GET /api/live-badges/circle/:id — هذا الملف فقط للإشعار الأسبوعي.
 */
export async function runWeeklyMoonBadgeAward(): Promise<void> {
  try {
    const weekStart = getLastCompletedWeekStart();
    const weekEnd = addDaysStr(weekStart, 4);
    const qualifying = await computeAllCirclesWeeklyMoonBadges(weekStart);
    if (qualifying.size === 0) {
      logger.info({ weekStart, weekEnd }, "أقمر الحلقة: لا توجد حلقات مؤهلة هذا الأسبوع");
      return;
    }

    const circleIds = [...qualifying.keys()];
    const circles = await db.select().from(circlesTable).where(inArray(circlesTable.id, circleIds));

    // مُصدر الإشعار: أول حساب قائدة نشِط (نفس منطق الإصدار السابق)
    const [leaderAccount] = await db.select({ id: usersTable.id })
      .from(usersTable).where(and(eq(usersTable.role, "leader"), eq(usersTable.isArchived, false)));
    if (!leaderAccount) {
      logger.warn("أقمر الحلقة: لا يوجد حساب قائدة لإرسال الإشعار منه");
      return;
    }

    const messageRows = circles.flatMap(c => {
      const badge = qualifying.get(c.id);
      if (!badge) return [];
      return [
        {
          senderId: leaderAccount.id,
          targetType: "circle",
          targetId: String(c.id),
          content: `${badge.emoji} مبروك! حلقة "${c.name}" حصلت على وسام "${badge.name}" — ${badge.subtitle}`,
          expiresAt: badgeMessageExpiry(),
        },
        {
          senderId: leaderAccount.id,
          targetType: "track",
          targetId: c.track,
          content: `${badge.emoji} حلقة "${c.name}" حصلت على وسام "${badge.name}" (${badge.subtitle}) خلال الأسبوع من ${weekStart} إلى ${weekEnd}.`,
          expiresAt: badgeMessageExpiry(),
        },
      ];
    });

    if (messageRows.length > 0) {
      await db.insert(messagesTable).values(messageRows);
    }

    // عدّاد "كم مرة" لكل حلقة استحقت أقمر الحلقة (بأي درجة) — رقم بس، بدون سجل تفصيلي
    for (const c of circles) {
      const badge = qualifying.get(c.id);
      if (!badge) continue;
      await recordBadgeAward("circle", c.id, "circle_weekly_moon", badge.tier, weekStart);
      // الوسام للمعلمة والمشرفة بعينهما أيضًا: ينتقل معهما إن انتقلتا لحلقة أخرى
      if (c.teacherId) await recordBadgeAward("teacher", c.teacherId, "circle_weekly_moon", badge.tier, weekStart);
      if (c.supervisorId) await recordBadgeAward("supervisor", c.supervisorId, "circle_weekly_moon", badge.tier, weekStart);
    }

    logger.info({ weekStart, weekEnd, count: qualifying.size }, "أقمر الحلقة: تم إرسال إشعارات الاستحقاق الأسبوعية");
  } catch (err) {
    logger.error({ err }, "أقمر الحلقة: فشل التشغيل التلقائي");
  }
}

/**
 * "تعويض" النوم — الخطة المجانية على Render تُطفئ السيرفر بعد خمول، فلو صادف
 * إن هذا كان وقت الكرون الأسبوعي (الجمعة ٣ فجرًا) والسيرفر نايم، الإشعار
 * يضيع كليًا لأن الكرون نفسه ما يشتغل أصلًا (السيرفر مو شغّال ليشغّله).
 * الحل: أي طلب حقيقي يوصل للسيرفر (أول ما يصحى من النوم) يتحقق: هل أرسلنا
 * إشعار هذا الأسبوع؟ لو لا، يرسله الآن بدل ما ينتظر جمعة الجاية.
 * تُستدعى من مسارات "مستحقات الأوسمة" و"صفحة الحلقة" (أكثر الصفحات زيارة).
 */
export async function ensureWeeklyMoonBadgeRan(): Promise<void> {
  try {
    const weekStart = getLastCompletedWeekStart();
    const [setting] = await db.select().from(globalSettingsTable).where(eq(globalSettingsTable.key, LAST_RUN_SETTINGS_KEY));
    if (setting?.value === weekStart) return; // سبق أُرسل هذا الأسبوع، ما نكرر

    await runWeeklyMoonBadgeAward();

    await db.insert(globalSettingsTable).values({ key: LAST_RUN_SETTINGS_KEY, value: weekStart })
      .onConflictDoUpdate({ target: globalSettingsTable.key, set: { value: weekStart } });
  } catch (err) {
    logger.error({ err }, "أقمر الحلقة: فشل فحص التعويض");
  }
}
