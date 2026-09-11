import { Router, type IRouter } from "express";

const router: IRouter = Router();

const parse = <T>(val: string | undefined, fallback: T): T => {
  if (!val) return fallback;
  try { return JSON.parse(val) as T; } catch { return fallback; }
};

const DEFAULT_ROLE_NAMES: Record<string, string> = {
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

router.get("/school-config", (_req, res) => {
  const e = process.env;
  const roleNamesOverride = parse<Record<string, string>>(e.CUSTOM_ROLE_NAMES, {});
  const roleNames = { ...DEFAULT_ROLE_NAMES, ...roleNamesOverride };

  res.json({
    schoolName: e.VITE_SCHOOL_NAME ?? null,
    schoolTagline: e.VITE_SCHOOL_TAGLINE ?? null,
    logoUrl: e.VITE_LOGO_URL ?? null,
    primaryHsl: e.VITE_PRIMARY_HSL ?? null,
    secondaryHsl: e.VITE_SECONDARY_HSL ?? null,
    sidebarHsl: e.VITE_SIDEBAR_HSL ?? null,
    dataEntryRoles: parse<string[]>(e.ALLOWED_DATA_ENTRY_ROLES, ["teacher", "supervisor", "data_entry"]),
    roleNames,
    defaultTrackTypes: parse<{ name: string; dataEntryType: string }[]>(e.DEFAULT_TRACK_TYPES, []),
    enabledFeatures: parse<string[]>(e.VITE_ENABLED_FEATURES, [
      "badges", "store", "audio", "teacher_rotation",
      "shortcomings", "exam", "messages", "calendar", "deputy_tasks",
      "registration", "leaves",
    ]),
    circleGenders: parse<string[]>(e.CIRCLE_GENDERS, ["girls"]),
  });
});

export default router;
