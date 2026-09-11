// ============================================================================
// تعريف الأوسمة المركزي — بالكود، مو بقاعدة البيانات
// ============================================================================
// كل وسام من الأوسمة الثمانية معرّف هنا: الاسم لكل درجة، النص التوضيحي الثابت
// لكل درجة، إيموجي مؤقت، ولون. الاستحقاق يُحسب لحظيًا (شوفي badgeEngine.ts)
// ولا يُخزَّن أي صف جديد بقاعدة البيانات عند منح وسام أسبوعي/دوري.
//
// عند توفر صور مصمَّمة لاحقًا: استبدلي قيمة `emoji` بمسار الصورة (`image`) لكل
// درجة هنا فقط — بدون أي تعديل على منطق الحساب في badgeEngine.ts أو الراوتات.
// ============================================================================

export type BadgeId =
  | "circle_weekly_moon"      // ١. حضور الحلقة الأسبوعي (٤ درجات)
  | "review_plan_completion"  // ٢. إنهاء خطة المراجعة (درجتين)
  | "monthly_perfect"         // ٣. حضور الشهر الكامل
  | "improvement"             // ٤. التطور
  | "track_no_shortcoming"    // ٥. مسارنا الأحب
  | "track_supervisor_pride"; // ٦. فخر الأسبوع (مسؤولة المسار)

export interface BadgeTierDefinition {
  tier: number; // 0 = أعلى درجة
  name: string;
  subtitle: string;
  emoji: string;
  /** لاستخدامها لاحقًا بدل الإيموجي — سطر واحد يُعدَّل هنا فقط */
  image?: string | null;
  thumb?: string | null;
  color: string;
}

export interface BadgeDefinition {
  id: BadgeId;
  /** entityType الذي يستحق هذا الوسام: circle | student | track */
  entityType: "circle" | "student" | "track";
  tiers: BadgeTierDefinition[];
}

export const BADGE_DEFINITIONS: Record<BadgeId, BadgeDefinition> = {
  // ── ١. حضور الحلقة الأسبوعي (٤ درجات) ────────────────────────────────────
  circle_weekly_moon: {
    id: "circle_weekly_moon",
    entityType: "circle",
    tiers: [
      { tier: 0, name: "أقمر حلقة", subtitle: "دون أي غياب خلال الأسبوع", emoji: "🌕", image: "badges/circle_weekly_moon_tier0.png", thumb: "badges/circle_weekly_moon_tier0_thumb.png", color: "#6366f1" },
      { tier: 1, name: "ثاني أقمر حلقة", subtitle: "غياب واحد طوال الأسبوع", emoji: "🌗", image: "badges/circle_weekly_moon_tier1.png", thumb: "badges/circle_weekly_moon_tier1_thumb.png", color: "#818cf8" },
      { tier: 2, name: "ثالث أقمر حلقة", subtitle: "غيابين طوال الأسبوع", emoji: "🌘", image: "badges/circle_weekly_moon_tier2.png", thumb: "badges/circle_weekly_moon_tier2_thumb.png", color: "#a5b4fc" },
      { tier: 3, name: "رابع أقمر حلقة", subtitle: "ثلاثة غيابات طوال الأسبوع", emoji: "🌑", image: "badges/circle_weekly_moon_tier3.png", thumb: "badges/circle_weekly_moon_tier3_thumb.png", color: "#c7d2fe" },
    ],
  },

  // ── ٢. إنهاء خطة المراجعة (درجتين) ───────────────────────────────────────
  // يُحسب لحظيًا من دورة المراجعة الفعلية (بداية/نهاية الدورة + تراكم الصفحات) —
  // شوفي computeReviewPlanCompletion بـ badgeEngine.ts للتفاصيل والتبسيطات المعتمدة.
  // ⚠️ الدرجة الثالثة ("وسام يذكرك إنك ما راجعتِ") أُلغيت بقرار من المستخدمة —
  // الطالبة اللي ما لحقت تخلّص خطتها ببساطة ما تاخذ وسام، بدون رسالة تذكير سلبية.
  review_plan_completion: {
    id: "review_plan_completion",
    entityType: "student",
    tiers: [
      { tier: 0, name: "قمرتنا أنهت خطتها!", subtitle: "انتهيتِ من الخطة في وقتها!", emoji: "🌙", image: "badges/review_plan_completion_tier0.png", thumb: "badges/review_plan_completion_tier0_thumb.png", color: "#10b981" },
      { tier: 1, name: "ما بغيتِ بس وصلتِ", subtitle: "تأخرتِ بس وصلتِ", emoji: "⭐", image: "badges/review_plan_completion_tier1.png", thumb: "badges/review_plan_completion_tier1_thumb.png", color: "#f59e0b" },
    ],
  },

  // ── ٣. حضور الشهر الكامل ──────────────────────────────────────────────────
  monthly_perfect: {
    id: "monthly_perfect",
    entityType: "student",
    tiers: [
      { tier: 0, name: "يا فخر سنا إنتِ!", subtitle: "دون أي غياب طوال الشهر", emoji: "🏆", image: "badges/monthly_perfect_tier0.png", thumb: "badges/monthly_perfect_tier0_thumb.png", color: "#eab308" },
    ],
  },

  // ── ٤. التطور ─────────────────────────────────────────────────────────────
  improvement: {
    id: "improvement",
    entityType: "student",
    tiers: [
      { tier: 0, name: "رجع نورك يشع!", subtitle: "تحسَّن حضوركِ..", emoji: "✨", image: "badges/improvement_tier0.png", thumb: "badges/improvement_tier0_thumb.png", color: "#ec4899" },
    ],
  },

  // ── ٥. مسارنا الأحب ───────────────────────────────────────────────────────
  track_no_shortcoming: {
    id: "track_no_shortcoming",
    entityType: "track",
    tiers: [
      { tier: 0, name: "مسارنا الأحب!", subtitle: "لا تقصير طوال الأسبوع", emoji: "💚", image: "badges/track_no_shortcoming_tier0.png", thumb: "badges/track_no_shortcoming_tier0_thumb.png", color: "#22c55e" },
    ],
  },

  // ── ٦. فخر الأسبوع (مسؤولة المسار) ───────────────────────────────────────
  // يُحسب من سجل ساعات العمل (data_entry_sessions.supervisorNameId) — التزام
  // يومي بكل أيام الأسبوع. نطاقه حاليًا: مسؤولات المسار فقط.
  track_supervisor_pride: {
    id: "track_supervisor_pride",
    entityType: "track",
    tiers: [
      { tier: 0, name: "فَخر الأسبوع!", subtitle: "نُحب إلتزامكِ", emoji: "👑", image: "badges/track_supervisor_pride_tier0.png", thumb: "badges/track_supervisor_pride_tier0_thumb.png", color: "#f97316" },
    ],
  },
};

export function getBadgeTier(badgeId: BadgeId, tier: number): BadgeTierDefinition | null {
  return BADGE_DEFINITIONS[badgeId]?.tiers.find(t => t.tier === tier) ?? null;
}
