import { Router, type IRouter } from "express";
import {
  db,
  reviewPlansTable,
  reviewPlanDaysTable,
  studentsTable,
  circlesTable,
  usersTable,
  globalSettingsTable,
  recordsTable,
  studentMemorizationsTable,
  studentEnrollmentsTable,
} from "@workspace/db";
import { eq, and, desc, inArray, isNotNull, gt, gte, lte, sql } from "drizzle-orm";
import { authenticate } from "../middlewares/authenticate";
import { canAccessStudent, canAccessCircle } from "../lib/access";
import { QURAN_SURAHS } from "../lib/quranMetadata";
import { getWajhIndex, getPlanQuotaRanges, computeDayRanges } from "../lib/quranRanges";
import {
  computeCurrentDay, hasStudentTargets, pagesDaysReached, plannedPagesThrough,
  orderedPlanWajhs, coveredWajhSet, coverageProgress, coveredDayNumbers, wajhsToQuotaRanges,
  seedRangesFromOldPlan, isSaturdayDate, stripApprovedMemorization,
  evaluateCoverage, evaluateCompletion, farRangesOf, type CoverageResult, type CoverageDayRecord,
} from "../lib/planProgress";

const router: IRouter = Router();

const GIRLS_TRACK_TYPES = ["girls"];
const FIXATION_TRACK_TYPES = ["fixation"];

export type PlanType = "girls_review" | "fixation";

const FIXATION_QUANTITY_PAGES = {
  half: 0.5,
  full: 1,
  double: 2,
} as const;

function getFixationPagesPerDay(quantity: string | null | undefined): number {
  if (quantity === "half") return FIXATION_QUANTITY_PAGES.half;
  if (quantity === "double") return FIXATION_QUANTITY_PAGES.double;
  return FIXATION_QUANTITY_PAGES.full;
}

function isValidQuranRange(
  startSurah: unknown,
  startAyah: unknown,
  endSurah: unknown,
  endAyah: unknown,
): boolean {
  if (typeof startSurah !== "string" || typeof endSurah !== "string") return false;
  if (!Number.isInteger(startAyah) || !Number.isInteger(endAyah)) return false;
  const start = QURAN_SURAHS.find(surah => surah.name === startSurah.trim());
  const end = QURAN_SURAHS.find(surah => surah.name === endSurah.trim());
  if (!start || !end) return false;
  if ((startAyah as number) < 1 || (startAyah as number) > start.ayahs) return false;
  if ((endAyah as number) < 1 || (endAyah as number) > end.ayahs) return false;
  return start.number < end.number || (start.number === end.number && (startAyah as number) <= (endAyah as number));
}

function getPlanTypeForTrack(trackType: string): PlanType | null {
  if (GIRLS_TRACK_TYPES.includes(trackType)) return "girls_review";
  if (FIXATION_TRACK_TYPES.includes(trackType)) return "fixation";
  return null;
}

// Each plan type has its own independent cycle length and its own independent
// global-settings keys for start/end date. Girls (مراجعة) and fixation (تثبيت)
// counters must NEVER share a key — a leader setting one must not move the other.
export const PLAN_TOTAL_DAYS: Record<PlanType, number> = { girls_review: 21, fixation: 32 };
const CYCLE_SETTING_KEYS: Record<PlanType, { start: string; end: string }> = {
  girls_review: { start: "girls_cycle_start_date", end: "girls_cycle_end_date" },
  fixation: { start: "fixation_cycle_start_date", end: "fixation_cycle_end_date" },
};

function getTodayMecca(): string {
  const meccaMs = Date.now() + 3 * 60 * 60 * 1000;
  const d = new Date(meccaMs);
  // Before 5:00 AM UTC (= before 8:00 AM Mecca), treat it as still the previous Islamic day
  // so the day counter aligns with the frontend's getMeccaToday() function.
  if (d.getUTCHours() < 5) d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

// Validates a "YYYY-MM-DD" string is both well-formed AND a real calendar date
// (rejects things like "2026-02-30" that a regex alone would let through).
function isValidIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d!));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m! - 1 && date.getUTCDate() === d;
}

// Returns all non-Friday dates from startDate up to totalDays count
function getCycleDates(startDate: string, totalDays: number): string[] {
  const dates: string[] = [];
  const cur = new Date(startDate + "T12:00:00Z");
  if (cur.getUTCDay() !== 5) dates.push(cur.toISOString().slice(0, 10));
  while (dates.length < totalDays) {
    cur.setDate(cur.getDate() + 1);
    if (cur.getUTCDay() !== 5) dates.push(cur.toISOString().slice(0, 10));
  }
  return dates;
}

// Returns all Sun–Wed dates from startDate up to totalDays count (fixation cadence)
function getFixationCycleDates(startDate: string, totalDays: number): string[] {
  const dates: string[] = [];
  const cur = new Date(startDate + "T12:00:00Z");
  if (cur.getUTCDay() <= 3) dates.push(cur.toISOString().slice(0, 10));
  while (dates.length < totalDays) {
    cur.setDate(cur.getDate() + 1);
    if (cur.getUTCDay() <= 3) dates.push(cur.toISOString().slice(0, 10));
  }
  return dates;
}

// Dispatches to the correct weekly cadence for a plan type: girls_review skips only
// Friday (21 days), fixation only counts Sun–Wed (32 days). Never mix the two up.
export function getPlanCycleDates(startDate: string, planType: PlanType): string[] {
  const totalDays = PLAN_TOTAL_DAYS[planType];
  return planType === "fixation" ? getFixationCycleDates(startDate, totalDays) : getCycleDates(startDate, totalDays);
}

function getPlanEndDate(startDate: string, planType: PlanType): string {
  const dates = getPlanCycleDates(startDate, planType);
  return dates[dates.length - 1] ?? startDate;
}

function distribute(total: number, parts: number): number[] {
  const perDay = total / parts;
  const arr: number[] = [];
  let accumulated = 0;
  for (let i = 0; i < parts; i++) {
    accumulated += perDay;
    const val = Math.round(accumulated * 2) / 2 - Math.round((accumulated - perDay) * 2) / 2;
    arr.push(Math.round(val * 2) / 2);
  }
  return arr;
}

/**
 * حالة خطط المراجعة (البنات) بالنطاق الدقيق لعدة خطط دفعة واحدة — نفس منطق صفحة «خطط المراجعة»
 * لتعرضه صفحة الطالبة و«حلقتي» والتنبيهات دون اختلاف بين الحسابات.
 */
export async function loadGirlsCoverage(
  plans: ReadonlyArray<typeof reviewPlansTable.$inferSelect>,
  daysByPlan?: Map<number, Array<{ dayNumber: number; pages: number | null }>>,
  opts?: { withCompletion?: boolean },
): Promise<Map<number, CoverageResult & { completion?: { reached: boolean; onTime: boolean } }>> {
  const out = new Map<number, CoverageResult & { completion?: { reached: boolean; onTime: boolean } }>();
  const girls = plans.filter((p) => p.planType === "girls_review" && p.startDate);
  if (girls.length === 0) return out;

  let days = daysByPlan;
  if (!days) {
    days = new Map();
    const rows = await db.select({ planId: reviewPlanDaysTable.planId, dayNumber: reviewPlanDaysTable.dayNumber, pages: reviewPlanDaysTable.pages })
      .from(reviewPlanDaysTable).where(inArray(reviewPlanDaysTable.planId, girls.map((p) => p.id)));
    for (const r of rows) {
      const list = days.get(r.planId) ?? [];
      list.push({ dayNumber: r.dayNumber, pages: r.pages });
      days.set(r.planId, list);
    }
  }

  const datesByPlan = new Map<number, string[]>();
  const allDates = new Set<string>();
  for (const p of girls) {
    const dates = getPlanCycleDates(p.startDate!, "girls_review");
    datesByPlan.set(p.id, dates);
    dates.forEach((d) => allDates.add(d));
  }
  const recs = await db.select({
    studentId: recordsTable.studentId, circleId: recordsTable.circleId, date: recordsTable.date, isAbsent: recordsTable.isAbsent,
    reviewFarSurahStart: recordsTable.reviewFarSurahStart, reviewFarAyahStart: recordsTable.reviewFarAyahStart,
    reviewFarSurahEnd: recordsTable.reviewFarSurahEnd, reviewFarAyahEnd: recordsTable.reviewFarAyahEnd,
    reviewFar2SurahStart: recordsTable.reviewFar2SurahStart, reviewFar2AyahStart: recordsTable.reviewFar2AyahStart,
    reviewFar2SurahEnd: recordsTable.reviewFar2SurahEnd, reviewFar2AyahEnd: recordsTable.reviewFar2AyahEnd,
  }).from(recordsTable).where(and(
    inArray(recordsTable.studentId, [...new Set(girls.map((p) => p.studentId))]),
    inArray(recordsTable.date, [...allDates]),
  )).orderBy(recordsTable.studentId, recordsTable.date, desc(recordsTable.updatedAt));
  const recMap = new Map<string, Record<string, CoverageDayRecord>>();
  for (const r of recs) {
    const key = `${r.studentId}:${r.circleId}`;
    const m = recMap.get(key) ?? {};
    if (!m[r.date]) m[r.date] = { isAbsent: r.isAbsent, farRanges: farRangesOf(r) };
    recMap.set(key, m);
  }

  const today = getTodayMecca();
  const totalDays = PLAN_TOTAL_DAYS.girls_review;
  for (const p of girls) {
    const dates = datesByPlan.get(p.id)!;
    const currentDay = computeCurrentDay(dates, today, totalDays);
    let planDays = [...(days.get(p.id) ?? [])].sort((a, b) => a.dayNumber - b.dayNumber);
    if (planDays.some((d) => d.pages == null) && (p.totalPages ?? 0) > 0) {
      const dist = distribute(p.totalPages as number, totalDays);
      planDays = planDays.map((d) => ({ ...d, pages: d.pages ?? dist[d.dayNumber - 1] ?? 0 }));
    }
    const planWajhs = orderedPlanWajhs(getPlanQuotaRanges(p));
    const dayRecords = recMap.get(`${p.studentId}:${p.circleId}`) ?? {};
    const result = evaluateCoverage(planWajhs, planDays, dates, currentDay, dayRecords);
    if (opts?.withCompletion) {
      (result as CoverageResult & { completion?: { reached: boolean; onTime: boolean } }).completion =
        evaluateCompletion(planWajhs, planDays, dates, dayRecords);
    }
    out.set(p.id, result);
  }
  return out;
}

type GirlsReviewSourceSnapshot = {
  version: 1;
  // Date this snapshot's daily-record portion was computed through (inclusive).
  // Stored so the NEXT renewal knows exactly where to resume counting from —
  // this is what makes base+delta accumulation possible instead of a full
  // from-scratch recompute every cycle.
  throughDate: string;
  dailyRecordCount: number;
  dailyRecordPages: number;
  approvedMemorizationCount: number;
  approvedMemorizationPages: number;
  manualApprovedPages: number;
  approvedJuzNumbers: number[];
  recordRanges: Array<{
    surahStart: string;
    ayahStart: number;
    surahEnd: string;
    ayahEnd: number;
  }>;
};

type DailyMemorizationRow = {
  memorizePages: number | null;
  memorizeSurahStart: string | null;
  memorizeAyahStart: number | null;
  memorizeSurahEnd: string | null;
  memorizeAyahEnd: number | null;
  date: string;
};

type ApprovedMemorizationRow = {
  pages: number | null;
  juzNumbers: string | null;
};

function parseJuzNumbers(value: string | null): number[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((juz): juz is number => Number.isInteger(juz) && juz >= 1 && juz <= 30);
  } catch {
    return [];
  }
}

function snapshotTotalPages(snapshot: GirlsReviewSourceSnapshot): number {
  return Math.round((snapshot.dailyRecordPages + snapshot.approvedMemorizationPages) * 2) / 2;
}

// A girls review plan is a snapshot: daily memorization belongs to one circle,
// whereas approved historical memorization belongs to the student and is shared
// by every one of her girls-circle plans.
//
// sinceDate (optional, exclusive lower bound): when provided, only daily records
// dated AFTER sinceDate are read — this turns the function into a DELTA read
// (only what's new since the last snapshot) instead of a full-history recompute.
// Fresh plan creation (no prior plan to base off) omits sinceDate and reads the
// full history, exactly as before. approvedMemorization* is always read in full
// regardless of sinceDate — that source is an authoritative running tally with
// no per-cycle duplication risk, so it is never delta'd.
async function buildGirlsReviewSourceSnapshot(
  queryDb: any,
  studentId: number,
  circleId: number,
  throughDate: string,
  sinceDate?: string,
): Promise<GirlsReviewSourceSnapshot> {
  const dateFilter = sinceDate
    ? and(gt(recordsTable.date, sinceDate), lte(recordsTable.date, throughDate))
    : lte(recordsTable.date, throughDate);

  const records: DailyMemorizationRow[] = await queryDb.select({
    memorizePages: recordsTable.memorizePages,
    memorizeSurahStart: recordsTable.memorizeSurahStart,
    memorizeAyahStart: recordsTable.memorizeAyahStart,
    memorizeSurahEnd: recordsTable.memorizeSurahEnd,
    memorizeAyahEnd: recordsTable.memorizeAyahEnd,
    date: recordsTable.date,
  })
    .from(recordsTable)
    .where(and(
      eq(recordsTable.studentId, studentId),
      eq(recordsTable.circleId, circleId),
      eq(recordsTable.isAbsent, false),
      dateFilter,
      isNotNull(recordsTable.memorizePages),
    ))
    .orderBy(recordsTable.date);

  const dailyRows = records.filter(record => (record.memorizePages ?? 0) > 0);
  const recordRanges: GirlsReviewSourceSnapshot["recordRanges"] = dailyRows.flatMap(record => (
    record.memorizeSurahStart && record.memorizeAyahStart &&
    record.memorizeSurahEnd && record.memorizeAyahEnd
      ? [{
          surahStart: record.memorizeSurahStart,
          ayahStart: record.memorizeAyahStart,
          surahEnd: record.memorizeSurahEnd,
          ayahEnd: record.memorizeAyahEnd,
        }]
      : []
  ));

  const memorizationRows: ApprovedMemorizationRow[] = await queryDb.select({
    pages: studentMemorizationsTable.pages,
    juzNumbers: studentMemorizationsTable.juzNumbers,
  })
    .from(studentMemorizationsTable)
    .where(eq(studentMemorizationsTable.studentId, studentId));

  const approvedJuzNumbers: number[] = [...new Set<number>(memorizationRows
    .flatMap(row => parseJuzNumbers(row.juzNumbers)))].sort((a, b) => a - b);
  const approvedMemorizationPages = memorizationRows.reduce((total, row) => total + (row.pages ?? 0), 0);
  const juzPages = memorizationRows
    .filter(row => parseJuzNumbers(row.juzNumbers).length > 0)
    .reduce((total, row) => total + (row.pages ?? 0), 0);

  return {
    version: 1,
    throughDate,
    dailyRecordCount: dailyRows.length,
    dailyRecordPages: dailyRows.reduce((total, row) => total + (row.memorizePages ?? 0), 0),
    approvedMemorizationCount: memorizationRows.length,
    approvedMemorizationPages,
    manualApprovedPages: Math.max(0, approvedMemorizationPages - juzPages),
    approvedJuzNumbers,
    recordRanges,
  };
}

// Combines a previous cycle's BASE snapshot (its actual assigned content, whatever
// its source) with a DELTA snapshot (only records dated after the base's cutoff) so
// renewal never silently drops content that isn't reflected in recordsTable — e.g. a
// cycle a leader assigned/corrected manually. approvedMemorization* always comes from
// the delta read (which re-reads it in full) since that source is never delta'd.
function combineSnapshots(
  base: { throughDate?: string; dailyRecordPages: number; dailyRecordCount: number; recordRanges: GirlsReviewSourceSnapshot["recordRanges"] },
  delta: GirlsReviewSourceSnapshot,
): GirlsReviewSourceSnapshot {
  return {
    version: 1,
    throughDate: delta.throughDate,
    dailyRecordCount: base.dailyRecordCount + delta.dailyRecordCount,
    dailyRecordPages: Math.round((base.dailyRecordPages + delta.dailyRecordPages) * 2) / 2,
    approvedMemorizationCount: delta.approvedMemorizationCount,
    approvedMemorizationPages: delta.approvedMemorizationPages,
    manualApprovedPages: delta.manualApprovedPages,
    approvedJuzNumbers: delta.approvedJuzNumbers,
    recordRanges: [...base.recordRanges, ...delta.recordRanges],
  };
}

function dayBefore(isoDate: string): string {
  const date = new Date(`${isoDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

async function upsertSetting(key: string, value: string): Promise<void> {
  const existing = await db.select({ key: globalSettingsTable.key })
    .from(globalSettingsTable)
    .where(eq(globalSettingsTable.key, key))
    .limit(1);
  if (existing.length > 0) {
    await db.update(globalSettingsTable).set({ value }).where(eq(globalSettingsTable.key, key));
  } else {
    await db.insert(globalSettingsTable).values({ key, value });
  }
}

// planType defaults to "girls_review" so every pre-existing call site (which never
// passed a planType) keeps reading the "دورة البنات" counter exactly as before.
async function getGlobalCycleStartDate(planType: PlanType = "girls_review"): Promise<string | null> {
  const [row] = await db.select().from(globalSettingsTable)
    .where(eq(globalSettingsTable.key, CYCLE_SETTING_KEYS[planType].start));
  return row?.value ?? null;
}

// A leader-scheduled forced end date for the CURRENT cycle of this plan type (may
// fall before each plan's natural start+N end date, so the cycle can be closed on a
// fixed calendar date such as "٧ صفر" regardless of when individual plans started).
// Girls and fixation each have their own independent forced end date.
async function getGlobalCycleEndDate(planType: PlanType = "girls_review"): Promise<string | null> {
  const [row] = await db.select().from(globalSettingsTable)
    .where(eq(globalSettingsTable.key, CYCLE_SETTING_KEYS[planType].end));
  return row?.value ?? null;
}

async function getStudentCanEditPlan(): Promise<boolean> {
  const [row] = await db.select().from(globalSettingsTable)
    .where(eq(globalSettingsTable.key, "student_can_edit_plan"));
  return row?.value === "true";
}

// Effective end date for a plan: the scheduled forced cycle-end date if it applies
// to this plan (plan started on/before it, and it actually shortens the cycle),
// otherwise the plan's own natural start+21 end date.
export async function getEffectiveEndDate(plan: { startDate: string; planType: string }): Promise<string> {
  const planType = plan.planType as PlanType;
  const natural = getPlanEndDate(plan.startDate, planType);
  if (planType !== "girls_review" && planType !== "fixation") return natural;
  const forced = await getGlobalCycleEndDate(planType);
  if (forced && plan.startDate <= forced && forced < natural) return forced;
  return natural;
}

const AUTO_PLAN_EDIT_WINDOW_MS = 48 * 60 * 60 * 1000;

// Auto-generated plans (created by the cycle renewal) may be freely replaced by
// the student/staff within 48 hours of creation, even though they'd normally be
// locked for the whole cycle — this lets a student correct an auto-carried quota.
function isWithinAutoPlanEditWindow(plan: { planMode: string | null; createdAt: Date }): boolean {
  if (plan.planMode !== "auto") return false;
  return Date.now() - plan.createdAt.getTime() <= AUTO_PLAN_EDIT_WINDOW_MS;
}

// Auto-renew a plan (girls_review OR fixation) for the new cycle.
// newCycleStart: the start date of the new cycle (from that plan type's global settings).
// overrideEndDate: if provided, use this as the memorization cut-off instead of
//   the plan's natural/effective end date. Used by bulk-renew so active plans are
//   closed at newCycleStart-1 rather than their original end date.
// The two plan types are renewed very differently: girls_review recomputes its quota
// from a fresh memorization snapshot; fixation has no such snapshot source, so it
// carries its previous quota/quantity/day-pattern forward unchanged.
async function autoRenewPlan(
  oldPlan: typeof reviewPlansTable.$inferSelect,
  studentId: number,
  circleId: number,
  newCycleStart: string,
  overrideEndDate?: string
): Promise<(typeof reviewPlansTable.$inferSelect & { days: typeof reviewPlanDaysTable.$inferSelect[] }) | null> {
  const planType = oldPlan.planType as PlanType;
  return db.transaction(async (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => {
    // Serialize concurrent renewal attempts for the same student+circle+planType (e.g.
    // two overview requests racing) so only one ever creates the new-cycle plan.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`renew:${studentId}:${circleId}:${planType}`}))`);

    // Guard: check if new plan for this cycle already exists
    const [existing] = await tx.select({ id: reviewPlansTable.id })
      .from(reviewPlansTable)
      .where(and(
        eq(reviewPlansTable.studentId, studentId),
        eq(reviewPlansTable.circleId, circleId),
        eq(reviewPlansTable.planType, planType),
        eq(reviewPlansTable.startDate, newCycleStart),
        eq(reviewPlansTable.status, "active")
      ))
      .limit(1);
    if (existing) return null;

    // Re-check the old plan is still active under the lock (another concurrent
    // renewal may have already archived it while we waited for the lock).
    const [stillActive] = await tx.select({ id: reviewPlansTable.id })
      .from(reviewPlansTable)
      .where(and(eq(reviewPlansTable.id, oldPlan.id), eq(reviewPlansTable.status, "active")))
      .limit(1);
    if (!stillActive) return null;

    if (planType === "fixation") {
      // Fixation (تثبيت) has no memorization-based source snapshot — students review
      // a manually-assigned day-by-day range (quantity: full/half وجه). The new cycle
      // simply carries the previous cycle's quota fields and day pattern forward so
      // the plan isn't left empty; it's tagged "auto" so it can be corrected within
      // the normal 48h auto-plan edit window, same as a renewed girls_review plan.
      await tx.update(reviewPlansTable)
        .set({ status: "cancelled" })
        .where(eq(reviewPlansTable.id, oldPlan.id));

      const [newPlan] = await tx.insert(reviewPlansTable).values({
        studentId,
        circleId,
        planType: "fixation",
        status: "active",
        quotaType: oldPlan.quotaType,
        quotaJuz: oldPlan.quotaJuz,
        quotaSurahStart: oldPlan.quotaSurahStart ?? null,
        quotaAyahStart: oldPlan.quotaAyahStart ?? null,
        quotaSurahEnd: oldPlan.quotaSurahEnd ?? null,
        quotaAyahEnd: oldPlan.quotaAyahEnd ?? null,
        extraRanges: oldPlan.extraRanges ?? null,
        quantity: oldPlan.quantity ?? null,
        planMode: "auto",
        totalPages: oldPlan.totalPages ?? null,
        startDate: newCycleStart,
        themeColor: oldPlan.themeColor,
      }).returning();

      const oldDays = await tx.select().from(reviewPlanDaysTable)
        .where(eq(reviewPlanDaysTable.planId, oldPlan.id))
        .orderBy(reviewPlanDaysTable.dayNumber);

      let savedDays: typeof reviewPlanDaysTable.$inferSelect[] = [];
      if (oldDays.length > 0) {
        savedDays = await tx.insert(reviewPlanDaysTable).values(
          oldDays.map(d => ({
            planId: newPlan.id,
            dayNumber: d.dayNumber,
            surahStart: d.surahStart,
            ayahStart: d.ayahStart,
            surahEnd: d.surahEnd,
            ayahEnd: d.ayahEnd,
            pages: d.pages,
          }))
        ).returning();
      }

      return { ...newPlan, days: savedDays };
    }

    // ── girls_review: base + delta accumulation ────────────────────────────────
    // Rather than recomputing the whole quota from scratch every cycle (which
    // silently drops any content a leader assigned manually and that never has a
    // matching recordsTable row), each renewal takes the PREVIOUS cycle's actual
    // content as a base and adds only what's genuinely new since then. Records
    // written during the current cycle are only picked up here, not added to the
    // active plan.
    const throughDate = overrideEndDate ?? dayBefore(newCycleStart);

    // Recover the previous cycle's base: its own snapshot if it had one (whatever
    // its dailyRecordPages/recordRanges/throughDate were), or — if the old plan was
    // fully manual and never had a snapshot — treat its whole totalPages as an
    // opaque base and start the delta from the day before it began, so anything
    // recorded during its own active cycle is still picked up now rather than lost.
    let previousSnapshot: GirlsReviewSourceSnapshot | null = null;
    if (oldPlan.reviewSourceSnapshot) {
      try {
        const parsed = JSON.parse(oldPlan.reviewSourceSnapshot);
        if (parsed && parsed.version === 1) previousSnapshot = parsed as GirlsReviewSourceSnapshot;
      } catch { /* legacy/malformed snapshot — fall back to opaque base below */ }
    }
    // أول تجديد لخطة أنشأتها الطالبة بنفسها (بلا لقطة): نحمل محتواها (النصاب أو نطاقات أيامها)
    // داخل اللقطة بدل تحويله إلى رقم صفحات معتم، فلا تضيع أهدافها وترتيب مراجعتها.
    let seedRanges: GirlsReviewSourceSnapshot["recordRanges"] = [];
    if (!previousSnapshot) {
      const oldDaysForSeed = await tx.select().from(reviewPlanDaysTable)
        .where(eq(reviewPlanDaysTable.planId, oldPlan.id))
        .orderBy(reviewPlanDaysTable.dayNumber);
      seedRanges = seedRangesFromOldPlan(oldPlan, oldDaysForSeed);
    }
    const base = previousSnapshot
      ? { dailyRecordPages: previousSnapshot.dailyRecordPages, dailyRecordCount: previousSnapshot.dailyRecordCount, recordRanges: previousSnapshot.recordRanges }
      : { dailyRecordPages: oldPlan.totalPages ?? 0, dailyRecordCount: 0, recordRanges: seedRanges };
    const sinceDate = previousSnapshot?.throughDate ?? dayBefore(oldPlan.startDate);

    const deltaSnapshot = await buildGirlsReviewSourceSnapshot(
      tx, studentId, circleId, throughDate, sinceDate,
    );
    // النصاب الذي أنشأته الطالبة هو الأساس: نضيف إليه الحفظ اليومي المستجد فقط، ولا نضيف المحفوظ
    // المعتمد/اليدوي فوقه (كان يُضاف في كل أول تجديد فيتضخم الإجمالي).
    const sourceSnapshot = combineSnapshots(base, stripApprovedMemorization(deltaSnapshot));
    const total = snapshotTotalPages(sourceSnapshot);
    const hasRecordedSources = total > 0;
    const fallbackTotal = oldPlan.totalPages ?? (oldPlan.quotaJuz ?? 0) * 20;
    const effectiveTotal = hasRecordedSources ? total : fallbackTotal;

    // Archive old plan
    await tx.update(reviewPlansTable)
      .set({ status: "cancelled" })
      .where(eq(reviewPlansTable.id, oldPlan.id));

    // Create new plan
    const [newPlan] = await tx.insert(reviewPlansTable).values({
      studentId,
      circleId,
      planType: "girls_review",
      status: "active",
      // Preserve legacy user-entered quota only when there are no recorded
      // memorization sources yet. Once sources exist, they are the plan's quota.
      quotaType: hasRecordedSources ? null : oldPlan.quotaType,
      quotaJuz: hasRecordedSources ? null : oldPlan.quotaJuz,
      quotaSurahStart: hasRecordedSources ? null : oldPlan.quotaSurahStart ?? null,
      quotaAyahStart: hasRecordedSources ? null : oldPlan.quotaAyahStart ?? null,
      quotaSurahEnd: hasRecordedSources ? null : oldPlan.quotaSurahEnd ?? null,
      quotaAyahEnd: hasRecordedSources ? null : oldPlan.quotaAyahEnd ?? null,
      extraRanges: hasRecordedSources ? null : oldPlan.extraRanges ?? null,
      reviewSourceSnapshot: hasRecordedSources ? JSON.stringify(sourceSnapshot) : null,
      planMode: "auto",
      totalPages: effectiveTotal || null,
      startDate: newCycleStart,
      themeColor: oldPlan.themeColor,
    }).returning();

    let savedDays: typeof reviewPlanDaysTable.$inferSelect[] = [];
    if (effectiveTotal > 0) {
      const dist = distribute(effectiveTotal, PLAN_TOTAL_DAYS.girls_review);
      // أيام الخطة المجدَّدة بالصفحات فقط؛ محتواها (نطاقاتها) محمول في اللقطة وتعرضه الواجهة،
      // ويُقاس التقدّم بالصفحات (انظر computePlanStatus).
      const inserted = await tx.insert(reviewPlanDaysTable).values(
        dist.map((pages, i) => ({ planId: newPlan.id, dayNumber: i + 1, pages }))
      ).returning();
      savedDays = inserted;
    }

    return { ...newPlan, days: savedDays };
  });
}

// ─── GET: student's active review plan ────────────────────────────────────────
router.get("/students/:id/review-plan", authenticate, async (req, res): Promise<void> => {
  const allowed = ["leader", "deputy", "track_supervisor", "teacher", "supervisor", "student"];
  if (!allowed.includes(req.userRole!)) { res.status(403).json({ error: "Forbidden" }); return; }

  const studentId = parseInt(req.params.id as string);
  const circleId = req.query.circleId ? parseInt(req.query.circleId as string) : undefined;
  // الطالبة لخطتها فقط، والمعلمة والمشرفة لحلقاتهما، ومسؤولة المسار لمسارها.
  if (!await canAccessStudent(req, studentId, circleId)) { res.status(403).json({ error: "غير مسموح" }); return; }

  const where = circleId
    ? and(eq(reviewPlansTable.studentId, studentId), eq(reviewPlansTable.circleId, circleId), eq(reviewPlansTable.status, "active"))
    : and(eq(reviewPlansTable.studentId, studentId), eq(reviewPlansTable.status, "active"));

  const plans = await db.select().from(reviewPlansTable)
    .where(where)
    .orderBy(desc(reviewPlansTable.createdAt))
    .limit(1);

  if (!plans.length) { res.json(null); return; }
  let plan = plans[0]!;

  // Auto-renew lockable plans (girls_review AND fixation) when their own cycle ends
  // and their own type's new global cycle has been set. Each plan type checks and
  // renews strictly against its own cycle counter — a fixation plan never reads the
  // girls cycle date and vice versa.
  const isLockablePlanType = plan.planType === "girls_review" || plan.planType === "fixation";
  if (isLockablePlanType && plan.startDate && circleId) {
    const planType = plan.planType as PlanType;
    const today = getTodayMecca();
    const endDate = await getEffectiveEndDate(plan);

    if (today > endDate) {
      const newCycleStart = await getGlobalCycleStartDate(planType);
      if (newCycleStart && newCycleStart > endDate) {
        const renewed = await autoRenewPlan(plan, studentId, circleId, newCycleStart);
        if (renewed) {
          const { days, ...planData } = renewed;
          // Build cycleInfo for the newly created plan
          const renewedToday = getTodayMecca();
          const totalDays = PLAN_TOTAL_DAYS[planType];
          const renewedCycleDates = getPlanCycleDates(planData.startDate!, planType);
          const renewedCycleEndDate = renewedCycleDates[renewedCycleDates.length - 1] ?? planData.startDate!;
          const renewedDayIdx = renewedCycleDates.indexOf(renewedToday);
          const renewedCurrentDay = computeCurrentDay(renewedCycleDates, renewedToday, totalDays);
          const renewedIsCompleted = renewedToday > renewedCycleEndDate;
          const renewedCycleInfo = {
            cycleStartDate: planData.startDate!,
            cycleEndDate: renewedCycleEndDate,
            currentDay: renewedCurrentDay,
            isCompleted: renewedIsCompleted,
            isLocked: !renewedIsCompleted && renewedToday >= planData.startDate!,
          };
          res.json({
            ...planData,
            createdAt: planData.createdAt.toISOString(),
            updatedAt: planData.updatedAt?.toISOString(),
            days,
            cycleInfo: renewedCycleInfo,
            dayRecords: {},
          });
          return;
        }
      }
    }
  }

  const days = await db.select().from(reviewPlanDaysTable)
    .where(eq(reviewPlanDaysTable.planId, plan.id))
    .orderBy(reviewPlanDaysTable.dayNumber);

  // Build cycleInfo for lockable plans (girls_review AND fixation), each on its own cadence
  let cycleInfo: {
    cycleStartDate: string; cycleEndDate: string;
    currentDay: number; isCompleted: boolean; isLocked: boolean;
  } | null = null;

  if (isLockablePlanType && plan.startDate) {
    const planType = plan.planType as PlanType;
    const totalDays = PLAN_TOTAL_DAYS[planType];
    const today = getTodayMecca();
    const cycleDates = getPlanCycleDates(plan.startDate, planType);
    const cycleEndDate = cycleDates[cycleDates.length - 1] ?? plan.startDate;
    const dayIdx = cycleDates.indexOf(today);
    const currentDay = computeCurrentDay(cycleDates, today, totalDays);
    const isCompleted = today > cycleEndDate;
    cycleInfo = {
      cycleStartDate: plan.startDate,
      cycleEndDate,
      currentDay,
      isCompleted,
      isLocked: !isCompleted && today >= plan.startDate,
    };
  }

  // For lockable plans, fetch review records for per-day colour coding. تثبيت
  // compares only against التثبيت الجديد (memorizeSurahEnd/AyahEnd/Pages, the
  // same column الفتيات use for الحفظ الجديد) — المراجعة (review*) is a
  // separate, plan-untracked category for تثبيت. خطة المراجعة compares against
  // المراجعة البعيدة ١ و٢ (reviewFar* AND reviewFar2*) — both are sent since
  // either may represent her farthest point on a given day.
  // Use DISTINCT ON (date) ordered by updated_at DESC to pick the latest record per day
  let dayRecords: Record<string, {
    memorizeSurahEnd: string | null; memorizeAyahEnd: number | null; memorizePages: number | null;
    reviewFarPages: number | null; reviewFarSurahEnd: string | null; reviewFarAyahEnd: number | null;
    reviewFar2Pages: number | null; reviewFar2SurahEnd: string | null; reviewFar2AyahEnd: number | null;
    isAbsent: boolean;
  }> = {};
  if (isLockablePlanType && plan.startDate) {
    const planType = plan.planType as PlanType;
    const cycleDates = getPlanCycleDates(plan.startDate, planType);
    const recs = await db
      .select({
        date: recordsTable.date,
        memorizeSurahEnd: recordsTable.memorizeSurahEnd,
        memorizeAyahEnd: recordsTable.memorizeAyahEnd,
        memorizePages: recordsTable.memorizePages,
        reviewFarPages: recordsTable.reviewFarPages,
        reviewFarSurahEnd: recordsTable.reviewFarSurahEnd,
        reviewFarAyahEnd: recordsTable.reviewFarAyahEnd,
        reviewFar2Pages: recordsTable.reviewFar2Pages,
        reviewFar2SurahEnd: recordsTable.reviewFar2SurahEnd,
        reviewFar2AyahEnd: recordsTable.reviewFar2AyahEnd,
        isAbsent: recordsTable.isAbsent,
      })
      .from(recordsTable)
      .where(and(
        eq(recordsTable.studentId, studentId),
        eq(recordsTable.circleId, plan.circleId),
        inArray(recordsTable.date, cycleDates),
      ))
      .orderBy(recordsTable.date, desc(recordsTable.updatedAt));
    // Keep only the latest record per date (first occurrence after ordering by updatedAt desc)
    for (const r of recs) {
      if (!dayRecords[r.date]) {
        dayRecords[r.date] = {
          memorizeSurahEnd: r.memorizeSurahEnd, memorizeAyahEnd: r.memorizeAyahEnd, memorizePages: r.memorizePages,
          reviewFarPages: r.reviewFarPages, reviewFarSurahEnd: r.reviewFarSurahEnd, reviewFarAyahEnd: r.reviewFarAyahEnd,
          reviewFar2Pages: r.reviewFar2Pages, reviewFar2SurahEnd: r.reviewFar2SurahEnd, reviewFar2AyahEnd: r.reviewFar2AyahEnd,
          isAbsent: r.isAbsent,
        };
      }
    }
  }

  const coverage = plan.planType === "girls_review"
    ? (await loadGirlsCoverage([plan], new Map([[plan.id, days]]))).get(plan.id) ?? null
    : null;

  res.json({
    ...plan,
    createdAt: plan.createdAt.toISOString(),
    updatedAt: plan.updatedAt?.toISOString(),
    days,
    cycleInfo,
    dayRecords,
    coverage,
  });
});

// ─── POST: create / renew plan ─────────────────────────────────────────────────
router.post("/students/:id/review-plan", authenticate, async (req, res): Promise<void> => {
  try {
    const allowed = ["leader", "deputy", "track_supervisor", "teacher", "supervisor", "student"];
    if (!allowed.includes(req.userRole!)) { res.status(403).json({ error: "Forbidden" }); return; }

    const studentId = parseInt(req.params.id as string);
    const {
      circleId: rawCircleId,
      quotaType, quotaJuz,
      quotaSurahStart, quotaAyahStart,
      quotaSurahEnd, quotaAyahEnd,
      extraRanges, planMode,
      totalPages, quantity,
      themeColor,
      days = [],
    } = req.body ?? {};

    // Determine circleId
    let circleId: number;
    if (req.userRole === "student") {
      const [currentUser] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!));
      if (!currentUser) { res.status(403).json({ error: "غير مسموح" }); return; }
      const bodyCircleId = rawCircleId ? parseInt(rawCircleId) : null;
      const searchCircleId = bodyCircleId ?? currentUser.circleId;
      let ownStudentId: number | null = null;
      if (searchCircleId) {
        // أولاً: بحث مباشر عبر students.circle_id
        const [s] = await db.select({ id: studentsTable.id })
          .from(studentsTable)
          .where(and(
            eq(studentsTable.circleId, searchCircleId),
            eq(studentsTable.isArchived, false),
            sql`TRIM(${studentsTable.fullName}) = TRIM(${currentUser.name})`
          ))
          .limit(1);
        ownStudentId = s?.id ?? null;

        // ثانياً: بحث عبر student_enrollments (طالبات في حلقتين لهن تسجيل رئيسي في حلقة أخرى)
        if (!ownStudentId) {
          const res2 = await db.execute(
            sql`SELECT s.id FROM students s
                JOIN student_enrollments se ON se.student_id = s.id
                  AND se.circle_id = ${searchCircleId}
                  AND se.is_archived = false
                WHERE TRIM(s.full_name) = TRIM(${currentUser.name})
                  AND s.is_archived = false
                LIMIT 1`
          );
          ownStudentId = (res2 as any).rows?.[0]?.id ?? null;
        }
      }
      if (!ownStudentId || ownStudentId !== studentId) {
        res.status(403).json({ error: "يمكنك إنشاء خطة لنفسك فقط" }); return;
      }
      circleId = searchCircleId ?? rawCircleId;
    } else {
      circleId = parseInt(rawCircleId);
      // المعلمة والمشرفة لا تنشئ خطة إلا لطالبة في حلقتها، ومسؤولة المسار في مسارها.
      if (circleId && !await canAccessStudent(req, studentId, circleId)) {
        res.status(403).json({ error: "الطالبة خارج نطاقك" }); return;
      }
    }

    if (!circleId) { res.status(400).json({ error: "circleId مطلوب" }); return; }

    const circle = await db.select().from(circlesTable).where(eq(circlesTable.id, circleId)).limit(1);
    if (!circle.length) { res.status(404).json({ error: "الحلقة غير موجودة" }); return; }

    const planType = getPlanTypeForTrack(circle[0]!.trackType);
    if (!planType) { res.status(400).json({ error: "هذا المسار لا يدعم خطط المراجعة" }); return; }

    if (planType === "fixation") {
      if (planMode !== "auto" && planMode !== "manual") {
        res.status(400).json({ error: "يجب اختيار طريقة إنشاء خطة التثبيت" }); return;
      }
      if (quantity !== "half" && quantity !== "full" && quantity !== "double") {
        res.status(400).json({ error: "كمية التثبيت يجب أن تكون نصف وجه أو وجهًا أو وجهين" }); return;
      }
      if (
        quotaType !== "surah" ||
        typeof quotaSurahStart !== "string" ||
        typeof quotaAyahStart !== "number" ||
        quotaAyahStart < 1 ||
        typeof quotaSurahEnd !== "string" ||
        typeof quotaAyahEnd !== "number" ||
        quotaAyahEnd < 1
      ) {
        res.status(400).json({ error: "يجب تحديد سورة وآية بداية خطة التثبيت" }); return;
      }
      if (!isValidQuranRange(quotaSurahStart, quotaAyahStart, quotaSurahEnd, quotaAyahEnd)) {
        res.status(400).json({ error: "نطاق بداية خطة التثبيت غير صالح" }); return;
      }
      if (!Array.isArray(days) || days.length !== PLAN_TOTAL_DAYS.fixation) {
        res.status(400).json({ error: "يجب أن تحتوي خطة التثبيت على ٣٢ يومًا" }); return;
      }
      const dayNumbers = new Set<number>();
      for (const day of days) {
        if (!day || !Number.isInteger(day.dayNumber) || day.dayNumber < 1 || day.dayNumber > PLAN_TOTAL_DAYS.fixation || dayNumbers.has(day.dayNumber)) {
          res.status(400).json({ error: "أيام خطة التثبيت غير صالحة" }); return;
        }
        dayNumbers.add(day.dayNumber);
        if (typeof day.pages !== "number" || day.pages < 0) {
          res.status(400).json({ error: "قيمة صفحات اليوم غير صالحة" }); return;
        }
        const hasAnyRange = day.surahStart || day.ayahStart || day.surahEnd || day.ayahEnd;
        const hasCompleteRange = isValidQuranRange(day.surahStart, day.ayahStart, day.surahEnd, day.ayahEnd);
        if (hasAnyRange && !hasCompleteRange) {
          res.status(400).json({ error: "نطاق السورة والآيات في أحد أيام التثبيت غير مكتمل" }); return;
        }
      }
      if (dayNumbers.size !== PLAN_TOTAL_DAYS.fixation) {
        res.status(400).json({ error: "أرقام أيام خطة التثبيت يجب أن تكون من ١ إلى ٣٢ دون تكرار" }); return;
      }
    }

    // ── Lock check: prevent creating/renewing if plan is still active ──────────
    const [activePlan] = await db.select()
      .from(reviewPlansTable)
      .where(and(
        eq(reviewPlansTable.studentId, studentId),
        eq(reviewPlansTable.circleId, circleId),
        eq(reviewPlansTable.status, "active")
      ))
      .limit(1);

    if (activePlan?.startDate && !isWithinAutoPlanEditWindow(activePlan)) {
      if (activePlan.cancellationRequestedAt && activePlan.approvalStatus === "pending") {
        res.status(409).json({ error: "تم إرسال طلب إلغاء الخطة وينتظر موافقة القائدة" });
        return;
      }
      const endDate = await getEffectiveEndDate(activePlan);
      const today = getTodayMecca();
      if (today <= endDate) {
        // Non-admin students may be granted permission by the leader to edit/replace their plan
        const nonAdmin = !["leader", "deputy", "track_supervisor"].includes(req.userRole!);
        const planTypeLockable = activePlan.planType === "girls_review" || activePlan.planType === "fixation";
        if (nonAdmin && planTypeLockable) {
          const studentCanEdit = await getStudentCanEditPlan();
          if (!studentCanEdit) {
            res.status(403).json({
              error: `لا يمكن إنشاء خطة جديدة قبل انتهاء الخطة الحالية (تنتهي ${endDate})`,
              lockedUntil: endDate,
            });
            return;
          }
          // Permission granted — fall through to replace the plan
        } else if (!nonAdmin) {
          // Admin roles: always allowed, fall through
        } else {
          res.status(403).json({
            error: `لا يمكن إنشاء خطة جديدة قبل انتهاء الخطة الحالية (تنتهي ${endDate})`,
            lockedUntil: endDate,
          });
          return;
        }
      }
    }

    // ── Girls: Newcomer handling (isNewcomer = true) ─────────────────────────
    const [student] = await db.select().from(studentsTable)
      .where(eq(studentsTable.id, studentId)).limit(1);
    const isNewcomer = student?.isNewcomer ?? false;

    if (planType === "girls_review" && isNewcomer) {
      const cycleStartDate = await getGlobalCycleStartDate("girls_review");
      if (cycleStartDate) {
        const cycleDates = getPlanCycleDates(cycleStartDate, "girls_review");
        const day11Date = cycleDates[10]; // day 11 = index 10

        if (day11Date) {
          // Fetch memorization records from cycle days 1-10
          const day1to10 = cycleDates.slice(0, 10);
          const memRecords = await db.select()
            .from(recordsTable)
            .where(and(
              eq(recordsTable.studentId, studentId),
              eq(recordsTable.circleId, circleId),
              inArray(recordsTable.date, day1to10)
            ))
            .orderBy(recordsTable.date);

          // Only use newcomer path if at least one memorization record exists.
          // If no records yet (e.g. plan created on day 1), fall through to normal plan creation
          // so the student can pick her quota via the wizard.
          const hasAnyRecord = memRecords.some(r => r.memorizePages != null && r.memorizePages > 0);

          if (hasAnyRecord) {
            // Map day N → review at day N+10
            const newcomerDays = day1to10.map((date, i) => {
              const rec = memRecords.find(r => r.date === date);
              return {
                dayNumber: i + 11,
                surahStart: rec?.memorizeSurahStart ?? null,
                ayahStart: rec?.memorizeAyahStart ?? null,
                surahEnd: rec?.memorizeSurahEnd ?? null,
                ayahEnd: rec?.memorizeAyahEnd ?? null,
                pages: rec?.memorizePages ?? null,
              };
            });

            const totalNewcomerPages = newcomerDays.reduce((s, d) => s + (d.pages ?? 0), 0);

            // إصلاح: لف الإلغاء والإنشاء بمعاملة واحدة — إما الاثنين يصيرون أو
            // ولا وحدة، عشان ما تفضل الطالبة بدون خطة لو فشل الإنشاء بعد الإلغاء.
            const { plan, savedDays } = await db.transaction(async (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => {
              await tx.update(reviewPlansTable)
                .set({ status: "cancelled" })
                .where(and(
                  eq(reviewPlansTable.studentId, studentId),
                  eq(reviewPlansTable.circleId, circleId),
                  eq(reviewPlansTable.status, "active")
                ));

              const [newPlan] = await tx.insert(reviewPlansTable).values({
                studentId, circleId,
                planType: "girls_review",
                status: "active",
                quotaType: "surah",
                planMode: "manual",
                totalPages: totalNewcomerPages || null,
                startDate: cycleStartDate, // use cycle start date so UI shows القائدة's date
                themeColor: themeColor ?? "#E8D5F5",
              }).returning();

              const newSavedDays = newcomerDays.length > 0
                ? await tx.insert(reviewPlanDaysTable).values(
                    newcomerDays.map(d => ({ planId: newPlan.id!, ...d }))
                  ).returning()
                : [];

              return { plan: newPlan, savedDays: newSavedDays };
            });

            res.status(201).json({
              ...plan,
              createdAt: plan.createdAt.toISOString(),
              updatedAt: plan.updatedAt?.toISOString(),
              days: savedDays,
              isNewcomerPlan: true,
            });
            return;
          }
          // else: no records yet → fall through to normal plan creation below
        }
      }
    }

    // ── Use each plan type's OWN global cycle start date ──────────────────────
    // Girls (مراجعة) and fixation (تثبيت) each have an independent cycle counter —
    // a fixation plan must NEVER inherit the girls cycle's start date or vice versa.
    let startDate: string;
    if (planType === "girls_review" || planType === "fixation") {
      const cycleStart = await getGlobalCycleStartDate(planType);
      startDate = cycleStart ?? req.body?.startDate ?? getTodayMecca();
    } else {
      startDate = req.body?.startDate ?? getTodayMecca();
    }

    // A POST from the wizard is always a new explicit plan. Its selected quota
    // and day ranges must win, even when the student already has memorization
    // records. The previous-quota-plus-new-records rule belongs exclusively to
    // autoRenewPlan(), which is the cycle renewal path.
    const sourceSnapshot: GirlsReviewSourceSnapshot | null = null;
    const sourceTotal = sourceSnapshot ? snapshotTotalPages(sourceSnapshot) : 0;
    const hasRecordedSources = sourceTotal > 0;

    // ملاحظة: الأيام المُرسلة من الواجهة لخطة التثبيت مبنية على محاذاة السور
    // (computeSurahAlignedDays)، فقد تختلف صفحات كل يوم عن fixationDailyPages
    // الثابتة (تقريب لأعلى للسور غير القابلة للتجزئة). تم التحقق من صحتها
    // مسبقًا أعلاه (لكل من planMode "auto" و"manual")، فنثق بها كما هي ولا
    // نعيد توليدها هنا.
    const sourceDays = hasRecordedSources
      ? distribute(sourceTotal, PLAN_TOTAL_DAYS.girls_review).map((pages, index) => ({ dayNumber: index + 1, pages }))
      : days;

    const fixationTotalPages = planType === "fixation"
      ? (typeof totalPages === "number" ? totalPages : getFixationPagesPerDay(quantity) * PLAN_TOTAL_DAYS.fixation)
      : undefined;

    // إصلاح: لف إلغاء الخطة القديمة وإنشاء الجديدة بمعاملة واحدة — سابقاً
    // كانت خطوتين منفصلتين، فلو فشل الإنشاء بعد الإلغاء تفضل الطالبة بدون
    // خطة نشطة بدون أي تنبيه (هذا كان سبب حالات "سوّت خطة وما تظهر").
    const { plan, savedDays } = await db.transaction(async (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => {
      await tx.update(reviewPlansTable)
        .set({ status: "cancelled" })
        .where(and(
          eq(reviewPlansTable.studentId, studentId),
          eq(reviewPlansTable.circleId, circleId),
          eq(reviewPlansTable.status, "active")
        ));

      const [newPlan] = await tx.insert(reviewPlansTable).values({
        studentId,
        circleId,
        planType,
        status: "active",
        quotaType: hasRecordedSources ? null : quotaType ?? null,
        quotaJuz: hasRecordedSources ? null : quotaJuz ?? null,
        quotaSurahStart: hasRecordedSources ? null : quotaSurahStart ?? null,
        quotaAyahStart: hasRecordedSources ? null : quotaAyahStart ?? null,
        quotaSurahEnd: hasRecordedSources ? null : quotaSurahEnd ?? null,
        quotaAyahEnd: hasRecordedSources ? null : quotaAyahEnd ?? null,
        extraRanges: hasRecordedSources ? null : extraRanges ?? null,
        reviewSourceSnapshot: hasRecordedSources ? JSON.stringify(sourceSnapshot) : null,
        planMode: hasRecordedSources ? "auto" : planMode ?? null,
        totalPages: hasRecordedSources ? sourceTotal : (planType === "fixation" ? fixationTotalPages : totalPages ?? null),
        quantity: quantity ?? null,
        startDate,
        themeColor: themeColor ?? "#E8D5F5",
      }).returning();

      if (sourceDays.length > 0) {
        await tx.insert(reviewPlanDaysTable).values(
          sourceDays.map((d: any) => ({
            planId: newPlan.id,
            dayNumber: d.dayNumber,
            surahStart: d.surahStart ?? null,
            ayahStart: d.ayahStart ?? null,
            surahEnd: d.surahEnd ?? null,
            ayahEnd: d.ayahEnd ?? null,
            pages: d.pages ?? null,
          }))
        );
      }

      const newSavedDays = await tx.select().from(reviewPlanDaysTable)
        .where(eq(reviewPlanDaysTable.planId, newPlan.id))
        .orderBy(reviewPlanDaysTable.dayNumber);

      return { plan: newPlan, savedDays: newSavedDays };
    });

    res.status(201).json({
      ...plan,
      createdAt: plan.createdAt.toISOString(),
      updatedAt: plan.updatedAt?.toISOString(),
      days: savedDays,
    });
  } catch (err: any) {
    console.error("reviewPlan POST error:", err);
    res.status(500).json({ error: err?.message ?? "خطأ في الخادم" });
  }
});

// ─── DELETE: cancel a plan (locked if still active) ───────────────────────────
router.delete("/students/:id/review-plan/:planId", authenticate, async (req, res): Promise<void> => {
  const allowed = ["leader", "deputy", "track_supervisor", "teacher", "supervisor", "student"];
  if (!allowed.includes(req.userRole!)) { res.status(403).json({ error: "Forbidden" }); return; }

  const studentId = parseInt(req.params.id as string);
  const planId = parseInt(req.params.planId as string);

  const [planToDelete] = await db.select().from(reviewPlansTable)
    .where(and(eq(reviewPlansTable.id, planId), eq(reviewPlansTable.studentId, studentId)))
    .limit(1);
  if (planToDelete && !await canAccessStudent(req, studentId, planToDelete.circleId)) {
    res.status(403).json({ error: "غير مسموح" }); return;
  }

  const adminRoles = ["leader", "deputy", "track_supervisor"];
  const isAdminRole = adminRoles.includes(req.userRole!);
  const planTypeLockable = planToDelete?.planType === "girls_review" || planToDelete?.planType === "fixation";
  if (
    !isAdminRole &&
    planTypeLockable &&
    planToDelete?.startDate &&
    !isWithinAutoPlanEditWindow(planToDelete)
  ) {
    // Check if leader has granted students permission to edit/delete their plans
    const studentCanEdit = await getStudentCanEditPlan();
    if (!studentCanEdit) {
      const endDate = await getEffectiveEndDate(planToDelete);
      const today = getTodayMecca();
      if (today <= endDate) {
        await db.update(reviewPlansTable)
          .set({
            approvalStatus: "pending",
            cancellationRequestedAt: new Date(),
            cancellationRequestedById: req.userId,
          })
          .where(eq(reviewPlansTable.id, planId));
        res.status(202).json({
          status: "pending_approval",
          message: "تم إرسال طلب إلغاء الخطة إلى القائدة للموافقة",
          lockedUntil: endDate,
        });
        return;
      }
    }
  }

  await db.update(reviewPlansTable)
    .set({ status: "cancelled" })
    .where(and(eq(reviewPlansTable.id, planId), eq(reviewPlansTable.studentId, studentId)));

  res.status(204).send();
});

// ─── PATCH: approve or reject a cancellation request ────────────────────────
router.patch("/students/:id/review-plan/:planId/cancellation-approval", authenticate, async (req, res): Promise<void> => {
  const approverRoles = ["leader", "deputy", "track_supervisor"];
  if (!approverRoles.includes(req.userRole!)) { res.status(403).json({ error: "يجب اعتماد الطلب من القائدة أو من ينوب عنها" }); return; }

  const studentId = parseInt(req.params.id as string);
  const planId = parseInt(req.params.planId as string);
  const approved = req.body?.approved === true;
  const [plan] = await db.select().from(reviewPlansTable)
    .where(and(eq(reviewPlansTable.id, planId), eq(reviewPlansTable.studentId, studentId)))
    .limit(1);

  if (!plan || !plan.cancellationRequestedAt || plan.approvalStatus !== "pending") {
    res.status(404).json({ error: "لا يوجد طلب إلغاء معلق لهذه الخطة" });
    return;
  }
  if (!await canAccessStudent(req, studentId, plan.circleId)) {
    res.status(403).json({ error: "الطالبة خارج نطاقك" }); return;
  }

  if (approved) {
    const [cancelledPlan] = await db.update(reviewPlansTable)
      .set({ status: "cancelled", approvalStatus: "approved", approvedById: req.userId, approvedAt: new Date() })
      .where(and(eq(reviewPlansTable.id, planId), eq(reviewPlansTable.status, "active")))
      .returning();
    res.json({ status: "approved", plan: cancelledPlan });
    return;
  }

  const [rejectedPlan] = await db.update(reviewPlansTable)
    .set({ approvalStatus: "rejected", cancellationRequestedAt: null, cancellationRequestedById: null })
    .where(eq(reviewPlansTable.id, planId))
    .returning();
  res.json({ status: "rejected", plan: rejectedPlan });
});

// ─── GET: pending cancellation requests for leaders ─────────────────────────
router.get("/review-plans/cancellation-requests", authenticate, async (req, res): Promise<void> => {
  const approverRoles = ["leader", "deputy", "track_supervisor"];
  if (!approverRoles.includes(req.userRole!)) { res.status(403).json({ error: "Forbidden" }); return; }

  const requests = await db.select({
    plan: reviewPlansTable,
    studentName: studentsTable.fullName,
    circleName: circlesTable.name,
  })
    .from(reviewPlansTable)
    .innerJoin(studentsTable, eq(reviewPlansTable.studentId, studentsTable.id))
    .innerJoin(circlesTable, eq(reviewPlansTable.circleId, circlesTable.id))
    .where(and(
      eq(reviewPlansTable.status, "active"),
      eq(reviewPlansTable.approvalStatus, "pending"),
    ))
    .orderBy(desc(reviewPlansTable.cancellationRequestedAt));

  res.json(requests.map(({ plan, studentName, circleName }) => ({
    ...plan,
    studentName,
    circleName,
    createdAt: plan.createdAt.toISOString(),
    updatedAt: plan.updatedAt?.toISOString(),
    cancellationRequestedAt: plan.cancellationRequestedAt?.toISOString(),
  })));
});

// ─── GET: all plans in a circle ───────────────────────────────────────────────
router.get("/circles/:circleId/review-plans", authenticate, async (req, res): Promise<void> => {
  const allowed = ["leader", "deputy", "track_supervisor", "teacher", "supervisor"];
  if (!allowed.includes(req.userRole!)) { res.status(403).json({ error: "Forbidden" }); return; }

  const circleId = parseInt(req.params.circleId as string);
  if (!await canAccessCircle(req, circleId)) { res.status(403).json({ error: "الحلقة خارج نطاقك" }); return; }

  const plans = await db.select({
    plan: reviewPlansTable,
    studentName: studentsTable.fullName,
  })
    .from(reviewPlansTable)
    .leftJoin(studentsTable, eq(reviewPlansTable.studentId, studentsTable.id))
    .where(and(eq(reviewPlansTable.circleId, circleId), eq(reviewPlansTable.status, "active")))
    .orderBy(studentsTable.fullName);

  const daysByPlan = new Map<number, Array<typeof reviewPlanDaysTable.$inferSelect>>();
  const result = await Promise.all(plans.map(async ({ plan, studentName }) => {
    const days = await db.select().from(reviewPlanDaysTable)
      .where(eq(reviewPlanDaysTable.planId, plan.id))
      .orderBy(reviewPlanDaysTable.dayNumber);
    daysByPlan.set(plan.id, days);
    return {
      ...plan,
      studentName,
      createdAt: plan.createdAt.toISOString(),
      updatedAt: plan.updatedAt?.toISOString(),
      days,
    };
  }));
  const coverageByPlan = await loadGirlsCoverage(plans.map((p) => p.plan), daysByPlan);
  for (const r of result) (r as typeof r & { coverage: CoverageResult | null }).coverage = coverageByPlan.get(r.id) ?? null;

  res.json(result);
});

// ─── GET: review-plan settings ────────────────────────────────────────────────
router.get("/review-plans/settings", authenticate, async (_req, res): Promise<void> => {
  const [studentCanEditPlan, cycleStartDate, fixationCycleStartDate] = await Promise.all([
    getStudentCanEditPlan(),
    getGlobalCycleStartDate("girls_review"),
    getGlobalCycleStartDate("fixation"),
  ]);
  res.json({
    studentCanEditPlan,
    cycleStartDate: cycleStartDate ?? null,
    fixationCycleStartDate: fixationCycleStartDate ?? null,
  });
});

// ─── POST: update review-plan settings (leader only) ─────────────────────────
router.post("/review-plans/settings", authenticate, async (req, res): Promise<void> => {
  if (req.userRole !== "leader") { res.status(403).json({ error: "Forbidden" }); return; }
  const { studentCanEditPlan } = req.body ?? {};
  if (typeof studentCanEditPlan !== "boolean") {
    res.status(400).json({ error: "studentCanEditPlan (boolean) مطلوب" }); return;
  }
  await upsertSetting("student_can_edit_plan", studentCanEditPlan ? "true" : "false");
  res.json({ studentCanEditPlan });
});

// ─── POST: bulk renew all girls plans (leader/deputy only) ────────────────────
router.post("/review-plans/renew-all", authenticate, async (req, res): Promise<void> => {
  const allowed = ["leader", "deputy"];
  if (!allowed.includes(req.userRole!)) { res.status(403).json({ error: "Forbidden" }); return; }

  const { newCycleStart } = req.body ?? {};
  if (!isValidIsoDate(newCycleStart)) {
    res.status(400).json({ error: "newCycleStart مطلوب بصيغة YYYY-MM-DD" }); return;
  }

  // 1. Update global cycle start date
  const existing = await db.select({ key: globalSettingsTable.key })
    .from(globalSettingsTable)
    .where(eq(globalSettingsTable.key, "girls_cycle_start_date"))
    .limit(1);

  if (existing.length > 0) {
    await db.update(globalSettingsTable)
      .set({ value: newCycleStart })
      .where(eq(globalSettingsTable.key, "girls_cycle_start_date"));
  } else {
    await db.insert(globalSettingsTable).values({ key: "girls_cycle_start_date", value: newCycleStart });
  }

  // 2. Find all girls circles (not fixation)
  const girlsCircles = await db.select({ id: circlesTable.id })
    .from(circlesTable)
    .where(and(eq(circlesTable.trackType, "girls"), eq(circlesTable.isArchived, false)));

  if (!girlsCircles.length) {
    res.json({ renewed: 0, skipped: 0, newCycleStart }); return;
  }

  const circleIds = girlsCircles.map(c => c.id);

  // 3. Find all active girls_review plans
  const activePlans = await db.select()
    .from(reviewPlansTable)
    .where(and(
      inArray(reviewPlansTable.circleId, circleIds),
      eq(reviewPlansTable.planType, "girls_review"),
      eq(reviewPlansTable.status, "active")
    ));

  // Compute the day before the new cycle starts — this is the inclusive cut-off
  // for counting old-cycle memorization, so records on or before that date count
  // toward the previous cycle's carry-over quota regardless of whether the plan's
  // natural 21-day window had already elapsed.
  const dayBeforeNewCycle = (() => {
    const d = new Date(newCycleStart + "T12:00:00Z");
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  })();

  let renewed = 0;
  let skipped = 0;

  for (const plan of activePlans) {
    // Renew all active plans that haven't been moved to the new cycle yet,
    // regardless of whether their 21-day window has elapsed. Memorization is
    // counted up to dayBeforeNewCycle so the new quota is always based on the
    // correct period.
    if (plan.startDate !== newCycleStart) {
      const result = await autoRenewPlan(plan, plan.studentId, plan.circleId, newCycleStart, dayBeforeNewCycle);
      if (result) renewed++;
      else skipped++;
    } else {
      skipped++;
    }
  }

  res.json({ renewed, skipped, newCycleStart });
});

// ─── POST: set the fixation (تثبيت) cycle's start date + bulk-renew all fixation
// plans immediately (leader/deputy only). Mirrors /review-plans/renew-all but reads
// and writes ONLY the fixation_cycle_start_date key — it never touches the girls
// cycle counter, and vice versa. ──────────────────────────────────────────────
router.post("/review-plans/set-fixation-cycle-start", authenticate, async (req, res): Promise<void> => {
  const allowed = ["leader", "deputy"];
  if (!allowed.includes(req.userRole!)) { res.status(403).json({ error: "Forbidden" }); return; }

  const { newCycleStart } = req.body ?? {};
  if (!isValidIsoDate(newCycleStart)) {
    res.status(400).json({ error: "newCycleStart مطلوب بصيغة YYYY-MM-DD" }); return;
  }

  await upsertSetting(CYCLE_SETTING_KEYS.fixation.start, newCycleStart);

  // Find all fixation circles
  const fixationCircles = await db.select({ id: circlesTable.id })
    .from(circlesTable)
    .where(and(eq(circlesTable.trackType, "fixation"), eq(circlesTable.isArchived, false)));

  if (!fixationCircles.length) {
    res.json({ renewed: 0, skipped: 0, newCycleStart }); return;
  }

  const circleIds = fixationCircles.map(c => c.id);

  const activePlans = await db.select()
    .from(reviewPlansTable)
    .where(and(
      inArray(reviewPlansTable.circleId, circleIds),
      eq(reviewPlansTable.planType, "fixation"),
      eq(reviewPlansTable.status, "active")
    ));

  let renewed = 0;
  let skipped = 0;

  for (const plan of activePlans) {
    if (plan.startDate !== newCycleStart) {
      const result = await autoRenewPlan(plan, plan.studentId, plan.circleId, newCycleStart);
      if (result) renewed++;
      else skipped++;
    } else {
      skipped++;
    }
  }

  res.json({ renewed, skipped, newCycleStart });
});

// ─── POST: schedule the current GIRLS cycle's forced end date + the next cycle's
// start. Lets a leader/deputy fix a specific end date for the cycle in progress
// (e.g. "٧ صفر") even if individual plans' natural start+21 end date falls later,
// and set when the next 21-day cycle begins. The actual lock/renewal happens
// automatically, lazily, the moment that end date arrives (via the existing
// per-student and overview auto-renew checks) — no separate trigger is needed on
// the day itself. This endpoint touches ONLY the girls_cycle_* keys. ─────────────
router.post("/review-plans/schedule-cycle-end", authenticate, async (req, res): Promise<void> => {
  const allowed = ["leader", "deputy"];
  if (!allowed.includes(req.userRole!)) { res.status(403).json({ error: "Forbidden" }); return; }

  const { cycleEndDate, newCycleStart } = req.body ?? {};
  if (!isValidIsoDate(cycleEndDate)) {
    res.status(400).json({ error: "cycleEndDate مطلوب بصيغة YYYY-MM-DD" }); return;
  }
  if (!isValidIsoDate(newCycleStart)) {
    res.status(400).json({ error: "newCycleStart مطلوب بصيغة YYYY-MM-DD" }); return;
  }
  if (newCycleStart <= cycleEndDate) {
    res.status(400).json({ error: "تاريخ بداية الدورة الجديدة يجب أن يكون بعد تاريخ نهاية الدورة الحالية" }); return;
  }

  await upsertSetting(CYCLE_SETTING_KEYS.girls_review.end, cycleEndDate);
  await upsertSetting(CYCLE_SETTING_KEYS.girls_review.start, newCycleStart);

  res.json({ cycleEndDate, newCycleStart });
});

// ─── POST: schedule the current FIXATION cycle's forced end date + the next
// cycle's start. Identical semantics to schedule-cycle-end above, but reads/writes
// ONLY the fixation_cycle_* keys so it can never interfere with the girls cycle. ──
router.post("/review-plans/schedule-fixation-cycle-end", authenticate, async (req, res): Promise<void> => {
  const allowed = ["leader", "deputy"];
  if (!allowed.includes(req.userRole!)) { res.status(403).json({ error: "Forbidden" }); return; }

  const { cycleEndDate, newCycleStart } = req.body ?? {};
  if (!isValidIsoDate(cycleEndDate)) {
    res.status(400).json({ error: "cycleEndDate مطلوب بصيغة YYYY-MM-DD" }); return;
  }
  if (!isValidIsoDate(newCycleStart)) {
    res.status(400).json({ error: "newCycleStart مطلوب بصيغة YYYY-MM-DD" }); return;
  }
  if (newCycleStart <= cycleEndDate) {
    res.status(400).json({ error: "تاريخ بداية الدورة الجديدة يجب أن يكون بعد تاريخ نهاية الدورة الحالية" }); return;
  }

  await upsertSetting(CYCLE_SETTING_KEYS.fixation.end, cycleEndDate);
  await upsertSetting(CYCLE_SETTING_KEYS.fixation.start, newCycleStart);

  res.json({ cycleEndDate, newCycleStart });
});

// ─── GET: global cycle info ─────────────────────────────────────────────────────
// ?planType=girls_review (default) | fixation — each type reads its OWN cycle
// counter and cadence; omitting the param preserves the old girls-only behaviour.
router.get("/review-plans/cycle-info", authenticate, async (req, res): Promise<void> => {
  const allowed = ["leader", "deputy", "track_supervisor", "teacher", "supervisor", "student"];
  if (!allowed.includes(req.userRole!)) { res.status(403).json({ error: "Forbidden" }); return; }

  const rawPlanType = req.query.planType as string | undefined;
  const planType: PlanType = rawPlanType === "fixation" ? "fixation" : "girls_review";

  const cycleStartDate = await getGlobalCycleStartDate(planType);
  if (!cycleStartDate) { res.json(null); return; }

  const totalDays = PLAN_TOTAL_DAYS[planType];
  const cycleDates = getPlanCycleDates(cycleStartDate, planType);
  const cycleEndDate = cycleDates[cycleDates.length - 1] ?? cycleStartDate;
  const today = getTodayMecca();
  const dayIdx = cycleDates.indexOf(today);
  const currentDay = computeCurrentDay(cycleDates, today, totalDays);
  const isCompleted = today > cycleEndDate;

  res.json({
    cycleStartDate,
    cycleEndDate,
    currentDay,
    totalDays,
    isCompleted,
  });
});

// ─── Overview: all circles with students + plan status ─────────────────────────
router.get("/review-plans/overview", authenticate, async (req, res): Promise<void> => {
  const allowed = ["leader", "deputy", "track_supervisor", "teacher", "supervisor"];
  if (!allowed.includes(req.userRole!)) { res.status(403).json({ error: "Forbidden" }); return; }

  const role = req.userRole!;
  const userId = req.userId!;

  // Only circles whose track type supports review plans appear in the overview.
  // Children, mothers, recitation, archive, and registration circles never have
  // review plans, so including them would just show every student as "بدون خطة".
  const REVIEW_PLAN_TRACK_TYPES = ["girls", "fixation"];

  let circles: Array<{ id: number; name: string; track: string; trackType: string; trackId: number | null }> = [];

  if (role === "teacher") {
    circles = await db.select({
      id: circlesTable.id,
      name: circlesTable.name,
      track: circlesTable.track,
      trackType: circlesTable.trackType,
      trackId: circlesTable.trackId,
    }).from(circlesTable)
      .where(and(
        eq(circlesTable.teacherId, userId),
        eq(circlesTable.isArchived, false),
        inArray(circlesTable.trackType, REVIEW_PLAN_TRACK_TYPES),
      ));
  } else if (role === "supervisor") {
    circles = await db.select({
      id: circlesTable.id,
      name: circlesTable.name,
      track: circlesTable.track,
      trackType: circlesTable.trackType,
      trackId: circlesTable.trackId,
    }).from(circlesTable)
      .where(and(
        eq(circlesTable.supervisorId, userId),
        eq(circlesTable.isArchived, false),
        inArray(circlesTable.trackType, REVIEW_PLAN_TRACK_TYPES),
      ));
  } else if (role === "track_supervisor") {
    const [currentUser] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    if (!currentUser?.track) { res.json([]); return; }
    circles = await db.select({
      id: circlesTable.id,
      name: circlesTable.name,
      track: circlesTable.track,
      trackType: circlesTable.trackType,
      trackId: circlesTable.trackId,
    }).from(circlesTable)
      .where(and(
        eq(circlesTable.track, currentUser.track),
        eq(circlesTable.isArchived, false),
        inArray(circlesTable.trackType, REVIEW_PLAN_TRACK_TYPES),
      ));
  } else {
    circles = await db.select({
      id: circlesTable.id,
      name: circlesTable.name,
      track: circlesTable.track,
      trackType: circlesTable.trackType,
      trackId: circlesTable.trackId,
    }).from(circlesTable)
      .where(and(
        eq(circlesTable.isArchived, false),
        inArray(circlesTable.trackType, REVIEW_PLAN_TRACK_TYPES),
      ))
      .orderBy(circlesTable.track, circlesTable.name);
  }

  if (!circles.length) { res.json([]); return; }

  const circleIds = circles.map(c => c.id);

  // طالبات الحلقة بعضويتها الفعلية (لا بالحلقة الأساسية فقط): الطالبة في حلقتين تظهر في كلتيهما بخطتها
  const allStudents = await db.select({
    id: studentsTable.id,
    fullName: studentsTable.fullName,
    circleId: studentEnrollmentsTable.circleId,
    isNewcomer: studentsTable.isNewcomer,
  }).from(studentEnrollmentsTable)
    .innerJoin(studentsTable, eq(studentsTable.id, studentEnrollmentsTable.studentId))
    .where(and(
      inArray(studentEnrollmentsTable.circleId, circleIds),
      eq(studentEnrollmentsTable.isArchived, false),
      eq(studentsTable.isArchived, false)
    ))
    .orderBy(studentsTable.fullName);

  // Get active plans WITH their days for staff full-display
  let activePlans = await db.select().from(reviewPlansTable)
    .where(and(
      inArray(reviewPlansTable.circleId, circleIds),
      eq(reviewPlansTable.status, "active")
    ));

  // Eagerly auto-renew any plans whose (possibly forced) cycle end date has
  // already passed, so the overview always reflects the current cycle without
  // requiring the leader to press a separate "renew" action first. Girls and
  // fixation plans are swept independently against their own cycle counter.
  const sweepPlanTypes: PlanType[] = ["girls_review", "fixation"];
  let anyRenewed = false;
  for (const sweepPlanType of sweepPlanTypes) {
    const sweepNewCycleStart = await getGlobalCycleStartDate(sweepPlanType);
    if (!sweepNewCycleStart) continue;
    const today = getTodayMecca();
    for (const plan of activePlans) {
      if (plan.planType !== sweepPlanType || !plan.startDate || plan.startDate === sweepNewCycleStart) continue;
      const effectiveEnd = await getEffectiveEndDate(plan);
      if (today > effectiveEnd && sweepNewCycleStart > effectiveEnd) {
        const renewedPlan = await autoRenewPlan(plan, plan.studentId, plan.circleId, sweepNewCycleStart);
        if (renewedPlan) anyRenewed = true;
      }
    }
  }
  if (anyRenewed) {
    activePlans = await db.select().from(reviewPlansTable)
      .where(and(
        inArray(reviewPlansTable.circleId, circleIds),
        eq(reviewPlansTable.status, "active")
      ));
  }

  const planIds = activePlans.map((p: typeof activePlans[0]) => p.id);
  const allDays = planIds.length > 0
    ? await db.select().from(reviewPlanDaysTable)
        .where(inArray(reviewPlanDaysTable.planId, planIds))
        .orderBy(reviewPlanDaysTable.dayNumber)
    : [];

  const planByStudent = new Map<string, typeof activePlans[0]>(); // `${studentId}:${circleId}`
  for (const plan of activePlans) {
    planByStudent.set(`${plan.studentId}:${plan.circleId}`, plan);
  }

  const daysByPlan = new Map<number, typeof allDays>();
  for (const day of allDays) {
    if (!daysByPlan.has(day.planId)) daysByPlan.set(day.planId, []);
    daysByPlan.get(day.planId)!.push(day);
  }

  let cycleStartDate = await getGlobalCycleStartDate();

  // Auto-detect: if the global cycle start was never set but there are active
  // girls_review plans (e.g. migrating a database that had plans before this
  // feature was added), derive the cycle start from the most common startDate
  // among those plans and persist it so subsequent requests skip this step.
  if (!cycleStartDate) {
    const girlsCircleIds = circles.filter(c => c.trackType === "girls").map(c => c.id);
    if (girlsCircleIds.length > 0) {
      const startDateCounts = new Map<string, number>();
      for (const plan of activePlans) {
        if (plan.planType === "girls_review" && plan.startDate && girlsCircleIds.includes(plan.circleId)) {
          startDateCounts.set(plan.startDate, (startDateCounts.get(plan.startDate) ?? 0) + 1);
        }
      }
      if (startDateCounts.size > 0) {
        const detected = [...startDateCounts.entries()].sort((a, b) => b[1] - a[1])[0]![0];
        await upsertSetting("girls_cycle_start_date", detected);
        cycleStartDate = detected;
      }
    }
  }

  const forcedCycleEndDate = await getGlobalCycleEndDate();
  let cycleInfo: {
    cycleStartDate: string; cycleEndDate: string; currentDay: number; isCompleted: boolean;
    scheduledEndDate: string | null;
  } | null = null;
  if (cycleStartDate) {
    const cycleDates = getCycleDates(cycleStartDate, 21);
    const cycleEndDate = cycleDates[cycleDates.length - 1] ?? cycleStartDate;
    const today = getTodayMecca();
    const dayIdx = cycleDates.indexOf(today);
    const currentDay = computeCurrentDay(cycleDates, today, 21);
    // scheduledEndDate: a forced end date only counts as "the previous cycle is
    // being wound down" while it still lies before this (new) cycle's start.
    const scheduledEndDate = forcedCycleEndDate && forcedCycleEndDate < cycleStartDate ? forcedCycleEndDate : null;
    cycleInfo = { cycleStartDate, cycleEndDate, currentDay, isCompleted: today > cycleEndDate, scheduledEndDate };
  }

  // Compute per-student overall status (behind / ontrack / ahead) for BOTH
  // girls_review AND fixation plans — each on its own cadence (21 vs 32 days).
  const statusPlans = activePlans.filter((p: typeof activePlans[0]) =>
    (p.planType === "girls_review" || p.planType === "fixation") && p.startDate);
  const cycleDatesByPlan = new Map<number, string[]>();
  const allDatesSet = new Set<string>();
  for (const p of statusPlans) {
    const dates = getPlanCycleDates(p.startDate!, p.planType as PlanType);
    cycleDatesByPlan.set(p.id, dates);
    dates.forEach(d => allDatesSet.add(d));
  }

  const studentIdsForRecords = statusPlans.map((p: typeof activePlans[0]) => p.studentId);

  // Key by `${studentId}:${circleId}` so records from another circle (e.g. after a transfer) never leak into this plan's status.
  // Plan-status comparison field is decided by TRACK, not by summing every category
  // entered that day: تثبيت plans compare only against التثبيت الجديد (memorize*,
  // the same column الفتيات use for الحفظ الجديد) — المراجعة (review*) is a
  // separate, plan-untracked category for تثبيت and is intentionally excluded
  // here. خطة المراجعة (girls_review) compares against المراجعة البعيدة ١ و٢
  // (reviewFar* AND reviewFar2*) — both count, since a student may log two
  // separate far-review passages on the same day.
  type DayRecord = {
    memorizeSurahEnd: string | null; memorizeAyahEnd: number | null;
    reviewFarSurahEnd: string | null; reviewFarAyahEnd: number | null;
    reviewFar2SurahEnd: string | null; reviewFar2AyahEnd: number | null;
    // الصفحات المنجزة في اليوم (للحساب الاحتياطي بالصفحات): المراجعة البعيدة ١+٢ للبنات، التثبيت الجديد للتثبيت
    farPages: number; memorizePages: number;
    // نطاقات المراجعة البعيدة ١ و٢ كاملة (بداية ونهاية) للمقارنة الدقيقة مع نطاق الخطة
    farRanges: { surahStart: string; ayahStart: number; surahEnd: string; ayahEnd: number }[];
    isAbsent: boolean;
  };
  const dayRecordsByStudentCircle = new Map<string, Record<string, DayRecord>>();
  if (studentIdsForRecords.length > 0 && allDatesSet.size > 0) {
    const recordsRaw = await db
      .select({
        studentId: recordsTable.studentId,
        circleId: recordsTable.circleId,
        date: recordsTable.date,
        memorizeSurahEnd: recordsTable.memorizeSurahEnd,
        memorizeAyahEnd: recordsTable.memorizeAyahEnd,
        reviewFarSurahEnd: recordsTable.reviewFarSurahEnd,
        reviewFarAyahEnd: recordsTable.reviewFarAyahEnd,
        reviewFar2SurahEnd: recordsTable.reviewFar2SurahEnd,
        reviewFar2AyahEnd: recordsTable.reviewFar2AyahEnd,
        reviewFarSurahStart: recordsTable.reviewFarSurahStart,
        reviewFarAyahStart: recordsTable.reviewFarAyahStart,
        reviewFar2SurahStart: recordsTable.reviewFar2SurahStart,
        reviewFar2AyahStart: recordsTable.reviewFar2AyahStart,
        reviewFarPages: recordsTable.reviewFarPages,
        reviewFar2Pages: recordsTable.reviewFar2Pages,
        memorizePages: recordsTable.memorizePages,
        isAbsent: recordsTable.isAbsent,
      })
      .from(recordsTable)
      .where(and(
        inArray(recordsTable.studentId, studentIdsForRecords),
        inArray(recordsTable.date, [...allDatesSet]),
      ))
      .orderBy(recordsTable.studentId, recordsTable.date, desc(recordsTable.updatedAt));
    for (const r of recordsRaw) {
      const key = `${r.studentId}:${r.circleId}`;
      let m = dayRecordsByStudentCircle.get(key);
      if (!m) { m = {}; dayRecordsByStudentCircle.set(key, m); }
      if (!m[r.date]) m[r.date] = {
        memorizeSurahEnd: r.memorizeSurahEnd, memorizeAyahEnd: r.memorizeAyahEnd,
        reviewFarSurahEnd: r.reviewFarSurahEnd, reviewFarAyahEnd: r.reviewFarAyahEnd,
        reviewFar2SurahEnd: r.reviewFar2SurahEnd, reviewFar2AyahEnd: r.reviewFar2AyahEnd,
        farPages: (r.reviewFarPages ?? 0) + (r.reviewFar2Pages ?? 0), memorizePages: r.memorizePages ?? 0,
        farRanges: [
          ...(r.reviewFarSurahStart && r.reviewFarAyahStart != null && r.reviewFarSurahEnd && r.reviewFarAyahEnd != null
            ? [{ surahStart: r.reviewFarSurahStart, ayahStart: r.reviewFarAyahStart, surahEnd: r.reviewFarSurahEnd, ayahEnd: r.reviewFarAyahEnd }] : []),
          ...(r.reviewFar2SurahStart && r.reviewFar2AyahStart != null && r.reviewFar2SurahEnd && r.reviewFar2AyahEnd != null
            ? [{ surahStart: r.reviewFar2SurahStart, ayahStart: r.reviewFar2AyahStart, surahEnd: r.reviewFar2SurahEnd, ayahEnd: r.reviewFar2AyahEnd }] : []),
        ],
        isAbsent: r.isAbsent,
      };
    }
  }


  type PlanStatus = "behind" | "ontrack" | "ahead" | null;

  // How far (as a linear mushaf position, NOT a page-count sum) the student had
  // reached as of a given day's record. تثبيت compares only against التثبيت
  // الجديد (memorizeSurahEnd/AyahEnd) — المراجعة (review*) is untracked for plan
  // status. خطة المراجعة compares against المراجعة البعيدة ١ و٢ (reviewFar* AND
  // reviewFar2*) — both are returned as candidates since either may represent
  // her farthest point that day. Comparing by ayah range means a catch-up entry
  // spanning several days' worth of ayahs is recognized immediately, with no
  // half-page rounding drift from summing "pages" values.
  function getEndPositions(rec: DayRecord | undefined, planType: PlanType): number[] {
    if (!rec) return [];
    if (planType === "fixation") {
      if (rec.memorizeSurahEnd && rec.memorizeAyahEnd != null) return [getWajhIndex(rec.memorizeSurahEnd, rec.memorizeAyahEnd)];
      return [];
    }
    const out: number[] = [];
    if (rec.reviewFarSurahEnd && rec.reviewFarAyahEnd != null) out.push(getWajhIndex(rec.reviewFarSurahEnd, rec.reviewFarAyahEnd));
    if (rec.reviewFar2SurahEnd && rec.reviewFar2AyahEnd != null) out.push(getWajhIndex(rec.reviewFar2SurahEnd, rec.reviewFar2AyahEnd));
    return out;
  }

  // The plan's cumulative target position by the END of a given day number —
  // reviewPlanDaysTable.surahEnd/ayahEnd is already the cumulative end-of-range
  // for that day (each day's range continues where the previous one left off),
  // so no summing is needed here either. Rest days with no assigned range
  // (pages <= 0) fall back to the nearest earlier day that has one.
  function getDayTargetIdx(dayNumber: number, planDays: typeof allDays): number | null {
    for (let d = dayNumber; d >= 1; d--) {
      const day = planDays.find((pd: typeof allDays[0]) => pd.dayNumber === d);
      if (day?.surahEnd && day.ayahEnd != null) return getWajhIndex(day.surahEnd, day.ayahEnd);
    }
    return null;
  }

  // Most plans move forward through the mushaf (day 1 near the start of the
  // assigned range, the last day near its end). But some far-review plans are
  // deliberately reversed — e.g. a plan scoped "العنكبوت → الناس" where the
  // student actually STARTS at الناس and works backward toward العنكبوت (a
  // common pattern since students often memorize the short surahs at the end
  // of the mushaf first). The overall quotaSurahStart/quotaSurahEnd fields only
  // describe the scope's boundaries, not which end the student starts from, so
  // direction has to be read off the per-day targets themselves: if day 1's
  // target sits at a HIGHER mushaf position than the last day's target, the
  // whole plan is running backward, and "progress" means the position going
  // DOWN, not up.
  function getPlanDirection(planDays: typeof allDays): "asc" | "desc" {
    const withTargets = planDays
      .filter((d: typeof allDays[0]) => d.surahEnd && d.ayahEnd != null)
      .sort((a: typeof allDays[0], b: typeof allDays[0]) => a.dayNumber - b.dayNumber);
    if (withTargets.length < 2) return "asc"; // can't detect direction from a single day — default forward
    const firstIdx = getWajhIndex(withTargets[0]!.surahEnd!, withTargets[0]!.ayahEnd!);
    const lastIdx = getWajhIndex(withTargets[withTargets.length - 1]!.surahEnd!, withTargets[withTargets.length - 1]!.ayahEnd!);
    return firstIdx <= lastIdx ? "asc" : "desc";
  }

  // Returns both the overall status AND the count of genuine unresolved delay days
  // (how many plan-days' cumulative targets she hasn't reached yet) — used for
  // the "٣ تأخيرات بدون تدارك" alert.
  function computePlanStatus(plan: typeof activePlans[0], planDays: typeof allDays): { status: PlanStatus; unresolvedDelayDays: number; missingSupervisorDates: string[]; reversed?: boolean; coveredDays?: number[]; dayRanges?: { surahStart: string; ayahStart: number; surahEnd: string; ayahEnd: number }[][] } {
    const planType = plan.planType as PlanType;
    const cycleDates = cycleDatesByPlan.get(plan.id);
    if (!cycleDates) return { status: null, unresolvedDelayDays: 0, missingSupervisorDates: [] };
    const today = getTodayMecca();
    const totalDays = PLAN_TOTAL_DAYS[planType];
    const dayIdx = cycleDates.indexOf(today);
    const currentDay = computeCurrentDay(cycleDates, today, totalDays);
    if (currentDay <= 0) return { status: null, unresolvedDelayDays: 0, missingSupervisorDates: [] }; // plan hasn't started yet

    const dayRecords = dayRecordsByStudentCircle.get(`${plan.studentId}:${plan.circleId}`) ?? {};

    // القياس الموضعي (سورة/آية) للخطط التي حدّدت الطالبة نطاق كل يوم فيها فقط. وما عداها
    // (الخطط المجدَّدة تلقائيًا وغيرها) يُقاس بالصفحات: أهداف مواضعها المحسوبة من اللقطة لا
    // تطابق ما تراجعه الطالبة فعلًا، فكانت تُنتج «متقدمة» و«متأخرة» خاطئتين.
    // قرار الإدارة: خطة الطالبة وخطة الإدارة تُقاسان بالطريقة نفسها: مقارنة نطاق المراجعة
    // البعيدة المُدخل (سورة/آية) بنطاق الخطة وجهًا وجهًا. بدأت من آخر النطاق ← الخطة عكسية.
    // أيام بلا صفحات (خطط الطالبة القديمة) نُكمّلها بتوزيع إجمالي صفحات الخطة على الأيام.
    if (planType === "girls_review") {
      const needsFill = planDays.some((d) => d.pages == null);
      const filled = needsFill && (plan.totalPages ?? 0) > 0
        ? (() => {
            const dist = distribute(plan.totalPages as number, totalDays);
            return planDays.map((d) => ({ ...d, pages: d.pages ?? dist[d.dayNumber - 1] ?? 0 }));
          })()
        : planDays;
      const planWajhs = orderedPlanWajhs(getPlanQuotaRanges(plan));
      if (planWajhs.length === 0) {
        return computePagesStatus(plan, filled, cycleDates, currentDay, dayRecords, planType);
      }
      return computeCoverageStatus(plan, filled, planWajhs, cycleDates, currentDay, dayRecords);
    }
    if (!hasStudentTargets(planDays)) {
      return computePagesStatus(plan, planDays, cycleDates, currentDay, dayRecords, planType);
    }
    const targetDays = planDays;

    const direction = getPlanDirection(targetDays);

    // Farthest position reached so far — a MAX for a forward plan, a MIN for a
    // reversed one (moving further from day 1's starting point either way).
    // This already looks across ALL entered records up to today, so a later
    // day's catch-up entry naturally covers earlier days too (الخطة متسلسلة):
    // this is never a sum, an entry's end-point already represents total
    // progress up to that point, whether from normal pace or a catch-up.
    let farthestIdx: number | null = null;
    for (let d = 1; d <= currentDay; d++) {
      const dateStr = cycleDates[d - 1];
      const rec = dateStr ? dayRecords[dateStr] : undefined;
      if (!rec || rec.isAbsent) continue;
      for (const idx of getEndPositions(rec, planType)) {
        if (farthestIdx == null) farthestIdx = idx;
        else if (direction === "asc" && idx > farthestIdx) farthestIdx = idx;
        else if (direction === "desc" && idx < farthestIdx) farthestIdx = idx;
      }
    }

    if (farthestIdx == null) return { status: null, unresolvedDelayDays: 0, missingSupervisorDates: [] };

    // How many of the plan's days (by their own cumulative target) has she
    // actually reached — targets move monotonically in `direction`, so the
    // furthest day whose target she's cleared is well-defined either way.
    // A day counts as "reached" once farthestIdx clears its target, REGARDLESS
    // of whether that specific day has its own record — a later day's entry
    // resolves every earlier day it covers, since the plan is sequential.
    let daysReached = 0;
    for (let d = 1; d <= currentDay; d++) {
      const targetIdx = getDayTargetIdx(d, targetDays);
      if (targetIdx == null) continue;
      const reached = direction === "asc" ? farthestIdx >= targetIdx : farthestIdx <= targetIdx;
      if (reached) daysReached = d;
    }

    // أيام لسا "معلّقة": ما فيها سجل مباشر لهذا اليوم بالذات، ولا وصلت
    // الطالبة مستهدفها حتى بأحدث نقطة معروفة (farthestIdx) — هذي فقط تُلوَّن
    // كـ"لم تُدخل المشرفة الأنصبة"، ولا تُحسب تأخيراً على الطالبة (ما لها
    // ذنب). يوم وصل مستهدفه (ولو عبر سجل يوم لاحق، لأن الخطة متسلسلة) ما
    // يُعتبر معلّقاً بعد الآن حتى لو ما فيه سجل خاص فيه هو نفسه.
    // missingAll: كل يوم بلا سجل ولم تصله (يدخل في حساب التأخير كأنه معلّق لا تأخير).
    // missingSupervisorDates: ما يُعرض ويُنبَّه عليه — بدون السبت (لا إدخال فيه أصلًا).
    const missingAll: string[] = [];
    for (let d = 1; d <= currentDay; d++) {
      const dateStr = cycleDates[d - 1];
      if (!dateStr) continue;
      const rec = dayRecords[dateStr];
      const targetIdx = getDayTargetIdx(d, targetDays);
      const reached = targetIdx != null && (direction === "asc" ? farthestIdx >= targetIdx : farthestIdx <= targetIdx);
      if (!rec && !reached) missingAll.push(dateStr);
    }
    const missingSupervisorDates = missingAll.filter((ds) => !isSaturdayDate(ds));

    // التأخير الحقيقي المحسوب على الطالبة = أيام بعد آخر نقطة وصلتها، لكن
    // فقط الأيام اللي فيها فعلاً سجل مُدخل يثبت قصوراً حقيقياً — أيام بدون
    // أي سجل (missingSupervisorDates) تُستثنى من هذا العدّ تماماً.
    const unresolvedDelayDays = Math.max(0, (currentDay - daysReached) - missingAll.length);
    const todayTargetIdx = getDayTargetIdx(currentDay, targetDays);
    const isAhead = todayTargetIdx != null && (direction === "asc" ? farthestIdx > todayTargetIdx : farthestIdx < todayTargetIdx);
    const status: PlanStatus = unresolvedDelayDays > 0 ? "behind" : isAhead ? "ahead" : "ontrack";
    return { status, unresolvedDelayDays, missingSupervisorDates };
  }

  // حالة خطة المراجعة بالنطاق الدقيق: كل وجه من الخطة مغطّى بنطاق مُدخل أو لا (انظر coverageProgress).
  function computeCoverageStatus(
    plan: typeof activePlans[0],
    planDays: typeof allDays,
    planWajhs: number[],
    cycleDates: string[],
    currentDay: number,
    dayRecords: Record<string, DayRecord>,
  ): { status: PlanStatus; unresolvedDelayDays: number; missingSupervisorDates: string[]; reversed: boolean; coveredDays: number[]; dayRanges?: { surahStart: string; ayahStart: number; surahEnd: string; ayahEnd: number }[][] } {
    void plan;
    const r = evaluateCoverage(planWajhs, planDays, cycleDates, currentDay, dayRecords);
    return { status: r.status, unresolvedDelayDays: r.unresolvedDelayDays, missingSupervisorDates: r.missingSupervisorDates, reversed: r.reversed, coveredDays: r.coveredDays, dayRanges: r.dayRanges };
  }

  // حالة الخطة بالصفحات (احتياطي): النصيب التراكمي المخطط مقابل صفحات المراجعة البعيدة
  // المنجزة تراكميًا (التثبيت: التثبيت الجديد). نفس دلالات الحالة الموضعية: اليوم «وصلته»
  // الطالبة إذا غطّت صفحاتها نصيبه التراكمي؛ ويوم بلا سجل ولم تصله «معلّق» لا تأخير.
  function computePagesStatus(
    plan: typeof activePlans[0],
    planDays: typeof allDays,
    cycleDates: string[],
    currentDay: number,
    dayRecords: Record<string, DayRecord>,
    planType: PlanType,
  ): { status: PlanStatus; unresolvedDelayDays: number; missingSupervisorDates: string[] } {
    void plan;
    let done = 0;
    let anyRecord = false;
    for (let d = 1; d <= currentDay; d++) {
      const dateStr = cycleDates[d - 1];
      const rec = dateStr ? dayRecords[dateStr] : undefined;
      if (!rec || rec.isAbsent) continue;
      anyRecord = true;
      done += planType === "fixation" ? rec.memorizePages : rec.farPages;
    }
    if (!anyRecord) return { status: null, unresolvedDelayDays: 0, missingSupervisorDates: [] };

    const { daysReached } = pagesDaysReached(planDays, currentDay, done);
    const missingAll: string[] = [];
    for (let d = 1; d <= currentDay; d++) {
      const dateStr = cycleDates[d - 1];
      if (!dateStr || dayRecords[dateStr]) continue;
      if (d > daysReached) missingAll.push(dateStr);
    }
    const missingSupervisorDates = missingAll.filter((ds) => !isSaturdayDate(ds));
    const unresolvedDelayDays = Math.max(0, (currentDay - daysReached) - missingAll.length);
    const isAhead = done > plannedPagesThrough(planDays, currentDay) + 0.5;
    const status: PlanStatus = unresolvedDelayDays > 0 ? "behind" : isAhead ? "ahead" : "ontrack";
    return { status, unresolvedDelayDays, missingSupervisorDates };
  }

  // Whether the student's attendance record for TODAY (within this plan's own
  // cadence) is marked absent — used for a quick "غائبة اليوم" filter, separate
  // from the overall behind/ontrack/ahead status.
  function isAbsentToday(plan: typeof activePlans[0]): boolean {
    const cycleDates = cycleDatesByPlan.get(plan.id);
    if (!cycleDates) return false;
    const today = getTodayMecca();
    if (!cycleDates.includes(today)) return false;
    const dayRecords = dayRecordsByStudentCircle.get(`${plan.studentId}:${plan.circleId}`) ?? {};
    return dayRecords[today]?.isAbsent === true;
  }

  // "٣ تأخيرات بدون تدارك" alert list — visible only to leader/deputy/track_supervisor.
  const DELAY_ALERT_THRESHOLD = 3;
  // تنبيه منفصل: المشرفة ما دخّلت بيانات أنصبة هذي الطالبة من أسبوع (٧ أيام
  // متتالية بدون أي سجل) — هذا قصور تسجيل من المشرفة، مو تأخير حفظ من
  // الطالبة، فما يدخل حساب unresolvedDelayDays أعلاه، لكن لازم يوصل للقيادة
  // بشكل منفصل عشان ما يختفي كلياً وراء "الطالبة ما لها ذنب".
  const SUPERVISOR_GAP_ALERT_THRESHOLD = 7;
  const circleById = new Map(circles.map(c => [c.id, c]));
  const delayAlerts: Array<{
    studentId: number; studentName: string; circleId: number; circleName: string;
    planType: PlanType; unresolvedDelayDays: number;
  }> = [];
  const supervisorGapAlerts: Array<{
    studentId: number; studentName: string; circleId: number; circleName: string;
    planType: PlanType; gapDays: number;
  }> = [];

  // آخر N يوم متتالية (من اليوم الحالي رجوعاً) بدون أي سجل مُدخل إطلاقاً —
  // يُحتسب فقط لو كانت متتالية من اليوم نفسه، عشان يعكس "توقف حالي مستمر"
  // لا فجوة قديمة انحلّت لاحقاً (تلك مغطاة أصلاً بمنطق missingSupervisorDates).
  function trailingGapDays(missingDates: string[], cycleDates: string[], currentDay: number): number {
    const missingSet = new Set(missingDates);
    let gap = 0;
    for (let d = currentDay; d >= 1; d--) {
      const dateStr = cycleDates[d - 1];
      if (dateStr && isSaturdayDate(dateStr)) continue; // لا إدخال في السبت: لا يُعدّ ولا يقطع التتابع
      if (dateStr && missingSet.has(dateStr)) gap++;
      else break;
    }
    return gap;
  }

  const result = circles.map(circle => {
    const students = allStudents.filter(s => s.circleId === circle.id);
    return {
      circleId: circle.id,
      circleName: circle.name,
      trackName: circle.track,
      trackType: circle.trackType,
      students: students.map(s => {
        const plan = planByStudent.get(`${s.id}:${circle.id}`);
        const planDays = plan ? (daysByPlan.get(plan.id) ?? []) : [];
        const statusResult = plan ? computePlanStatus(plan, planDays) : null;
        if (plan && statusResult && statusResult.unresolvedDelayDays >= DELAY_ALERT_THRESHOLD) {
          const c = circleById.get(plan.circleId);
          delayAlerts.push({
            studentId: s.id,
            studentName: s.fullName,
            circleId: plan.circleId,
            circleName: c?.name ?? circle.name,
            planType: plan.planType as PlanType,
            unresolvedDelayDays: statusResult.unresolvedDelayDays,
          });
        }
        if (plan && statusResult) {
          const cycleDates = cycleDatesByPlan.get(plan.id) ?? [];
          const today = getTodayMecca();
          const totalDays = PLAN_TOTAL_DAYS[plan.planType as PlanType];
          const dayIdx = cycleDates.indexOf(today);
          const currentDay = computeCurrentDay(cycleDates, today, totalDays);
          const gap = trailingGapDays(statusResult.missingSupervisorDates, cycleDates, currentDay);
          if (gap >= SUPERVISOR_GAP_ALERT_THRESHOLD) {
            const c = circleById.get(plan.circleId);
            supervisorGapAlerts.push({
              studentId: s.id,
              studentName: s.fullName,
              circleId: plan.circleId,
              circleName: c?.name ?? circle.name,
              planType: plan.planType as PlanType,
              gapDays: gap,
            });
          }
        }
        return {
          studentId: s.id,
          studentName: s.fullName,
          isNewcomer: s.isNewcomer,
          hasPlan: !!plan,
          plan: plan ? {
            id: plan.id,
            planType: plan.planType,
            startDate: plan.startDate,
            themeColor: plan.themeColor,
            totalPages: plan.totalPages,
            quotaType: plan.quotaType,
            quotaJuz: plan.quotaJuz,
            quotaSurahStart: plan.quotaSurahStart,
            quotaAyahStart: plan.quotaAyahStart,
            quotaSurahEnd: plan.quotaSurahEnd,
            quotaAyahEnd: plan.quotaAyahEnd,
            extraRanges: plan.extraRanges,
            planMode: plan.planMode,
            createdAt: plan.createdAt.toISOString(),
            days: planDays,
            status: statusResult?.status ?? null,
            missingSupervisorDates: statusResult?.missingSupervisorDates ?? [],
            reversed: statusResult?.reversed ?? false,
            coveredDays: statusResult?.coveredDays,
            dayRanges: statusResult?.dayRanges,
            isAbsentToday: isAbsentToday(plan),
          } : null,
        };
      }),
    };
  });

  const canSeeDelayAlerts = ["leader", "deputy", "track_supervisor"].includes(role);
  res.json({
    circles: result,
    cycleInfo,
    ...(canSeeDelayAlerts ? { delayAlerts, supervisorGapAlerts } : {}),
  });
});

// GET /api/review-plans/circle-day-quota?circleId=X&date=Y
// Returns plan day quota (pages) per student for a given circle + date.
// Used by Thursday data entry to populate reviewFarPages automatically.
router.get("/review-plans/circle-day-quota", authenticate, async (req, res): Promise<void> => {
  const circleId = Number(req.query.circleId);
  const date = req.query.date as string;
  if (!circleId || !date || !isValidIsoDate(date)) {
    res.status(400).json({ error: "circleId and valid date required" }); return;
  }

  const plans = await db.select().from(reviewPlansTable).where(and(
    eq(reviewPlansTable.circleId, circleId),
    eq(reviewPlansTable.status, "active"),
    eq(reviewPlansTable.planType, "girls_review"),
    isNotNull(reviewPlansTable.startDate),
  ));

  if (plans.length === 0) { res.json({ quotas: {} }); return; }

  const planIds = plans.map(p => p.id);
  const allDays = await db.select({
    planId: reviewPlanDaysTable.planId,
    dayNumber: reviewPlanDaysTable.dayNumber,
    pages: reviewPlanDaysTable.pages,
  }).from(reviewPlanDaysTable).where(inArray(reviewPlanDaysTable.planId, planIds));
  const daysByPlan = new Map<number, Array<{ dayNumber: number; pages: number | null }>>();
  for (const d of allDays) {
    const list = daysByPlan.get(d.planId) ?? [];
    list.push({ dayNumber: d.dayNumber, pages: d.pages });
    daysByPlan.set(d.planId, list);
  }
  // اتجاه كل طالبة (عادي أو عكسي بالسور) من حساب الخطة نفسه، ليكون نطاق الخميس على ترتيب مراجعتها.
  const coverage = await loadGirlsCoverage(plans, daysByPlan);

  type Range = { surahStart: string; ayahStart: number; surahEnd: string; ayahEnd: number };
  const quotas: Record<number, { pages: number; dayNumber: number; ranges: Range[] }> = {};
  for (const plan of plans) {
    if (!plan.startDate) continue;
    const cycleDates = getCycleDates(plan.startDate, 21);
    const dayIdx = cycleDates.indexOf(date);
    if (dayIdx < 0) continue;
    const dayNumber = dayIdx + 1;
    const sortedDays = [...(daysByPlan.get(plan.id) ?? [])].sort((x, y) => x.dayNumber - y.dayNumber);
    const planDay = sortedDays.find(d => d.dayNumber === dayNumber);
    if (planDay && (planDay.pages ?? 0) > 0) {
      // نطاق نصيب اليوم: يُسجَّل مع صفحات المراجعة البعيدة عند «صح» يوم الخميس، وإلا لا يُحسب
      // اليوم في حالة الخطة (المقارنة بالنطاق لا بالصفحات).
      const dayRanges = coverage.get(plan.id)?.dayRanges
        ?? computeDayRanges(getPlanQuotaRanges(plan), sortedDays);
      const idx = sortedDays.findIndex(d => d.dayNumber === dayNumber);
      quotas[plan.studentId] = { pages: planDay.pages ?? 0, dayNumber, ranges: (idx >= 0 ? dayRanges[idx] : undefined) ?? [] };
    }
  }

  res.json({ quotas });
});

export default router;
