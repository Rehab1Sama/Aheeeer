// دوال تجميع إحصائيات "تقرير التوثيق" الموجّه للجهات الخارجية (مثل الجمعية).
// الهدف: أرقام مجمّعة فقط — لا أسماء ولا جوالات ولا أي بيانات تعرّف بطالبة بعينها.
// الملف نقي: لا يستورد شيئًا ولا يلمس قاعدة البيانات، حتى يسهل اختباره.

export interface Entry {
  label: string;
  count: number;
}

export const UNKNOWN = "غير مذكور";
export const OTHER = "أخرى";

// ─── تنظيف النصوص ────────────────────────────────────────────────

const INVISIBLE = /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g;
const TASHKEEL = /[\u064B-\u065F\u0670]/g;

export function cleanText(v: string | null | undefined): string | null {
  const t = (v ?? "").replace(INVISIBLE, "").replace(/\s+/g, " ").trim();
  return t || null;
}

function fold(s: string): string {
  return s
    .replace(TASHKEEL, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, " ")
    .trim();
}

function toLatinDigits(s: string): string {
  return s
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

// ─── البلد ───────────────────────────────────────────────────────

const COUNTRY_ALIAS_PAIRS: Array<[string, string]> = [
  ["المملكة العربية السعودية", "السعودية"],
  ["السعودية العربية", "السعودية"],
  ["جمهورية مصر العربية", "مصر"],
  ["الإمارات العربية المتحدة", "الإمارات"],
  ["الامارات", "الإمارات"],
  ["سلطنة عمان", "عُمان"],
  ["عمان", "عُمان"],
  ["الجمهورية اليمنية", "اليمن"],
  ["المملكة الأردنية الهاشمية", "الأردن"],
  ["الاردن", "الأردن"],
  ["بريطانيا", "المملكة المتحدة"],
  ["المانيا", "ألمانيا"],
  ["الجمهورية العربية السورية", "سوريا"],
  ["سورية", "سوريا"],
  ["تركية", "تركيا"],
];
const COUNTRY_ALIASES = new Map(COUNTRY_ALIAS_PAIRS.map(([k, v]) => [fold(k), v]));

export function normalizeCountry(v: string | null | undefined): string | null {
  const t = cleanText(v);
  if (!t) return null;
  return COUNTRY_ALIASES.get(fold(t)) ?? t;
}

// ─── الفئة العمرية ───────────────────────────────────────────────

// الصيغ تغيّرت عبر الزمن في نموذج التسجيل ("21-30" و"21 - 30" و"15 - 20" ...)
export const AGE_ORDER = ["أقل من 10 سنوات", "أقل من 15", "10-15", "16-20", "21-30", "31-40", "41-50", "51+"];

export function normalizeAge(v: string | null | undefined): string | null {
  const raw = cleanText(v);
  if (!raw) return null;
  const t = toLatinDigits(raw).replace(/\s*[-–—]\s*/g, "-");
  const f = fold(t);
  if (/^(فوق|اكثر من|اكبر من)\s*50/.test(f) || f === "51+" || f === "50+") return "51+";
  if (/^اقل من 10/.test(f)) return "أقل من 10 سنوات";
  if (/^اقل من 15/.test(f)) return "أقل من 15";
  if (t === "15-20") return "16-20";
  return t;
}

// ─── المستوى الدراسي ─────────────────────────────────────────────

export function isUniversityLevel(v: string | null | undefined): boolean {
  const f = fold(cleanText(v) ?? "");
  return f.includes("جامع") || f.includes("دراسات عليا") || f.includes("ماجستير") || f.includes("دكتورا");
}

// ─── العدّ والتجميع ──────────────────────────────────────────────

export function countBy(values: Array<string | null>): Entry[] {
  const m = new Map<string, number>();
  for (const v of values) {
    const k = v ?? UNKNOWN;
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()].map(([label, count]) => ({ label, count }));
}

/** ترتيب تنازلي، مع "غير مذكور" ثم "أخرى" في النهاية */
export function sortEntries(entries: Entry[]): Entry[] {
  const rank = (l: string) => (l === UNKNOWN ? 2 : l === OTHER ? 1 : 0);
  return [...entries].sort((a, b) => rank(a.label) - rank(b.label) || b.count - a.count || a.label.localeCompare(b.label, "ar"));
}

/**
 * يدمج الفئات الصغيرة (أقل من minCell) تحت "أخرى" حتى لا تكشف أرقام مثل ١ أو ٢
 * هوية طالبة بعينها. "غير مذكور" لا يُدمج لأنه لا يعرّف أحدًا.
 * minCell ≤ 1 يعطّل الدمج.
 */
export function suppressSmall(entries: Entry[], minCell: number): Entry[] {
  if (minCell <= 1) return sortEntries(entries);
  const merged = new Map<string, number>();
  let small = 0;
  for (const e of entries) {
    if (e.label !== UNKNOWN && e.count < minCell) small += e.count;
    else merged.set(e.label, (merged.get(e.label) ?? 0) + e.count);
  }
  if (small > 0) merged.set(OTHER, (merged.get(OTHER) ?? 0) + small);
  return sortEntries([...merged.entries()].map(([label, count]) => ({ label, count })));
}

function orderAge(entries: Entry[]): Entry[] {
  const known = AGE_ORDER.map((l) => entries.find((e) => e.label === l)).filter((e): e is Entry => !!e);
  const rest = sortEntries(entries.filter((e) => !AGE_ORDER.includes(e.label)));
  return [...known, ...rest];
}

// ─── الطالبات ────────────────────────────────────────────────────

export type StudentGroup = "girls" | "children" | "mothers";

export interface VStudent {
  group: StudentGroup;
  country: string | null;
  ageRange: string | null;
  educationLevel: string | null;
}

export interface StudentStats {
  total: number;
  byGroup: { girls: number; children: number; mothers: number };
  byCountry: Entry[];
  byAge: Entry[];
  education: {
    byLevel: Entry[];
    recorded: number;
    notRecorded: number;
    coveragePercent: number;
    universityOrHigher: number;
  };
}

export function buildStudentStats(students: VStudent[], minCell: number): StudentStats {
  const total = students.length;
  const byGroup = { girls: 0, children: 0, mothers: 0 };
  for (const s of students) byGroup[s.group]++;

  const recorded = students.filter((s) => cleanText(s.educationLevel)).length;
  return {
    total,
    byGroup,
    byCountry: suppressSmall(countBy(students.map((s) => normalizeCountry(s.country))), minCell),
    byAge: orderAge(suppressSmall(countBy(students.map((s) => normalizeAge(s.ageRange))), minCell)),
    education: {
      byLevel: suppressSmall(countBy(students.map((s) => cleanText(s.educationLevel))), minCell),
      recorded,
      notRecorded: total - recorded,
      coveragePercent: total ? Math.round((recorded / total) * 1000) / 10 : 0,
      universityOrHigher: students.filter((s) => isUniversityLevel(s.educationLevel)).length,
    },
  };
}

// ─── المتطوعات (معلمات + مشرفات + مشرفات مسارات) ────────────────

export interface VVolunteer {
  role: "teacher" | "supervisor" | "track_supervisor";
  country: string | null;
}

export interface VolunteerStats {
  total: number;
  byRole: { teachers: number; supervisors: number; trackSupervisors: number };
  byCountry: Entry[];
}

export function buildVolunteerStats(volunteers: VVolunteer[], minCell: number): VolunteerStats {
  return {
    total: volunteers.length,
    byRole: {
      teachers: volunteers.filter((v) => v.role === "teacher").length,
      supervisors: volunteers.filter((v) => v.role === "supervisor").length,
      trackSupervisors: volunteers.filter((v) => v.role === "track_supervisor").length,
    },
    byCountry: suppressSmall(countBy(volunteers.map((v) => normalizeCountry(v.country))), minCell),
  };
}

// ─── نشاط الفترة ─────────────────────────────────────────────────

export interface VRecord {
  studentId: number;
  date: string;
  isAbsent: boolean;
  memorizePages: number | null;
  reviewNearPages: number | null;
  reviewFarPages: number | null;
  reviewFar2Pages: number | null;
  reviewPages: number | null;
  recitationPages: number | null;
}

export interface Activity {
  memorizePages: number;
  reviewPages: number;
  reviewNearPages: number;
  reviewFarPages: number;
  reviewOtherPages: number;
  recitationPages: number;
  records: number;
  absences: number;
  attendancePercent: number;
  entryDays: number;
  studentsWithActivity: number;
}

const round05 = (x: number) => Math.round(x * 2) / 2;

export function summarizeRecords(records: VRecord[]): Activity {
  let mem = 0, near = 0, far = 0, other = 0, rec = 0, absences = 0;
  const days = new Set<string>();
  const active = new Set<number>();
  for (const r of records) {
    days.add(r.date);
    if (r.isAbsent) { absences++; continue; }
    active.add(r.studentId);
    mem += r.memorizePages ?? 0;
    near += r.reviewNearPages ?? 0;
    far += (r.reviewFarPages ?? 0) + (r.reviewFar2Pages ?? 0);
    other += r.reviewPages ?? 0;
    rec += r.recitationPages ?? 0;
  }
  const n = records.length;
  return {
    memorizePages: round05(mem),
    reviewPages: round05(near + far + other),
    reviewNearPages: round05(near),
    reviewFarPages: round05(far),
    reviewOtherPages: round05(other),
    recitationPages: round05(rec),
    records: n,
    absences,
    attendancePercent: n ? Math.round(((n - absences) / n) * 1000) / 10 : 0,
    entryDays: days.size,
    studentsWithActivity: active.size,
  };
}

// ─── الشهر ───────────────────────────────────────────────────────

export const MONTH_NAMES = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];

export function isValidMonth(m: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(m);
}

export function previousMonth(m: string): string {
  const [y, mo] = m.split("-").map(Number) as [number, number];
  return mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, "0")}`;
}

export function monthLabel(m: string): string {
  const [y, mo] = m.split("-").map(Number) as [number, number];
  return `${MONTH_NAMES[mo - 1]} ${y}`;
}
