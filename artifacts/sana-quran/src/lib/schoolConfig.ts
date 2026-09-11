const parse = <T>(val: string | undefined, fallback: T): T => {
  if (!val) return fallback;
  try { return JSON.parse(val) as T; } catch { return fallback; }
};

export const DEFAULT_ROLE_NAMES: Record<string, string> = {
  teacher: "معلمة",
  supervisor: "مشرفة",
  data_entry: "مدخلة بيانات",
  leader: "المشرفة العامة",
  deputy: "النائبة",
  student: "طالبة",
  track_supervisor: "مشرفة المسار",
  volunteer: "متطوعة",
  exam_supervisor: "مشرفة الاختبار",
};

const env = (import.meta as any).env as Record<string, string | undefined>;

export const ALL_FEATURE_KEYS = [
  "stats_general", "stats_weekly", "stats_monthly", "stats_stumbling",
  "shortcomings", "exam", "teacher_rotation",
  "messages", "calendar", "registration", "leaves", "deputy_tasks",
  "badges", "audio", "store",
] as const;

export type FeatureKey = typeof ALL_FEATURE_KEYS[number];

export const schoolConfig = {
  schoolName: env.VITE_SCHOOL_NAME ?? null as string | null,
  schoolTagline: env.VITE_SCHOOL_TAGLINE ?? null as string | null,
  logoUrl: env.VITE_LOGO_URL ?? null as string | null,
  dataEntryRoles: parse<string[]>(env.VITE_DATA_ENTRY_ROLES, ["teacher", "supervisor", "data_entry", "leader"]),
  roleNames: { ...DEFAULT_ROLE_NAMES, ...parse<Record<string, string>>(env.VITE_ROLE_NAMES, {}) },
  defaultTrackTypes: parse<{ name: string; dataEntryType: string; category?: string; inputFields?: string[] }[]>(env.VITE_DEFAULT_TRACK_TYPES, []),
  enabledFeatures: parse<string[]>(env.VITE_ENABLED_FEATURES, [...ALL_FEATURE_KEYS]),
  circleGenders: parse<string[]>(env.CIRCLE_GENDERS, ["girls"]),
};

export type ResolvedTrackType =
  | "girls" | "girls_near" | "girls_far" | "girls_no_review"
  | "simple" | "mishkah" | "fixation" | "mothers";

export function resolveTrackType(
  dataEntryType?: string | null,
): ResolvedTrackType {
  if (dataEntryType === "recitation") return "mishkah";
  if (dataEntryType === "simple_review") return "simple";
  if (dataEntryType === "children") return "simple";
  if (dataEntryType === "mothers") return "mothers";
  if (dataEntryType === "fixation") return "fixation";
  if (dataEntryType === "girls_near") return "girls_near";
  if (dataEntryType === "girls_far") return "girls_far";
  if (dataEntryType === "girls_no_review") return "girls_no_review";
  return "girls";
}

// قائمة حقول الإدخال الفعلية لمسار معيّن — نفس المرجع المستخدم في شاشة إدخال
// البيانات (data-entry.tsx)، حتى تُظهر باقي الشاشات (مثل "حلقتي") فقط الحقول
// التي تُدخلها معلمة هذا المسار فعليًا.
export function getInputFields(dataEntryType?: string | null): string[] {
  const configured = (schoolConfig.defaultTrackTypes as any[]).find(
    (t) => t.dataEntryType === dataEntryType || t.name === dataEntryType,
  );
  if (configured?.inputFields?.length) return configured.inputFields as string[];
  const trackType = resolveTrackType(dataEntryType);
  if (trackType === "girls") return ["memorize", "review_near", "review_far", "listen"];
  if (trackType === "girls_near") return ["memorize", "review_near", "listen"];
  if (trackType === "girls_far") return ["memorize", "review_far", "listen"];
  if (trackType === "girls_no_review") return ["memorize", "listen"];
  if (trackType === "simple") return ["memorize", "review"];
  if (trackType === "mishkah") return ["recitation", "listen"];
  if (trackType === "fixation") return ["memorize", "repetitions", "review", "listen"];
  if (trackType === "mothers") return ["memorize", "review"];
  return ["memorize", "review_near", "review_far", "listen"];
}

export function getRoleName(role: string): string {
  return schoolConfig.roleNames[role] ?? DEFAULT_ROLE_NAMES[role] ?? role;
}

export function canEnterData(role: string): boolean {
  return role === "leader" || role === "teacher" || role === "supervisor" || schoolConfig.dataEntryRoles.includes(role);
}

export function isFeatureEnabled(key: string): boolean {
  if (!env.VITE_ENABLED_FEATURES) return true;
  return schoolConfig.enabledFeatures.includes(key);
}

export const FIELD_LABELS: Record<string, string> = {
  memorize:    "الحفظ",
  review_near: "المراجعة القريبة",
  review_far:  "المراجعة البعيدة",
  review:      "المراجعة العامة",
  recitation:  "التلاوة",
  listen:      "السماع للقارئ",
  repetitions: "عدد التكرار",
  tafsir:      "التفسير",
};

export function getFieldLabel(key: string): string {
  return FIELD_LABELS[key] ?? key;
}

const NO_SHORTCOMINGS_CATEGORIES = new Set(["أطفال", "أمهات"]);
const NO_SHORTCOMINGS_DATATYPES  = new Set(["children", "mothers"]);
const LEGACY_NO_SHORTCOMINGS_TRACKS = ["ألق", "سراج", "مهج"];

export function shouldHideReviewPlans(
  _trackName: string | null | undefined,
  _dataEntryType?: string | null,
): boolean {
  return false;
}

export function shouldHideShortcomings(
  trackName: string | null | undefined,
  dataEntryType?: string | null,
): boolean {
  if (dataEntryType && NO_SHORTCOMINGS_DATATYPES.has(dataEntryType)) return true;
  if (!trackName) return false;
  const cfg = schoolConfig.defaultTrackTypes.find(t => t.name === trackName);
  if (cfg) {
    if (cfg.category && NO_SHORTCOMINGS_CATEGORIES.has(cfg.category)) return true;
    if (NO_SHORTCOMINGS_DATATYPES.has(cfg.dataEntryType))             return true;
  }
  return LEGACY_NO_SHORTCOMINGS_TRACKS.includes(trackName);
}

