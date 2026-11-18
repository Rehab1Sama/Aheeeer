// تدقيق حالات خطط المراجعة (البنات): حالة الموقع (نفس دالة الصفحات) + فحوص مستقلة تكشف التصنيف المريب.
// قاعدة الإدارة: نصيب يوم مغطّى لاحقًا = منتظم مهما كان سبب الفوات (مشرفة/غياب معلمة/غياب طالبة).
import { db, reviewPlansTable, recordsTable, studentsTable, studentEnrollmentsTable, circlesTable } from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
import { loadGirlsCoverage, getPlanCycleDates } from "../routes/reviewPlans";
import { getPlanQuotaRanges } from "./quranRanges";
import { orderedPlanWajhs, coveredWajhSet, computeCurrentDay } from "./planProgress";
import { getMakkahDay } from "./date";

type R = { surahStart: string; ayahStart: number; surahEnd: string; ayahEnd: number };
const rng = (a: string | null, b: number | null, c: string | null, d: number | null): R | null =>
  a && b != null && c && d != null ? { surahStart: a, ayahStart: b, surahEnd: c, ayahEnd: d } : null;
const fmt = (r: R | null) => (r ? `${r.surahStart} ${r.ayahStart}←${r.surahEnd} ${r.ayahEnd}` : "—");

export async function auditGirlsPlans() {
  const plans = await db.select().from(reviewPlansTable)
    .where(and(eq(reviewPlansTable.status, "active"), eq(reviewPlansTable.planType, "girls_review")));
  const enr = await db.select({ studentId: studentEnrollmentsTable.studentId, circleId: studentEnrollmentsTable.circleId, name: studentsTable.fullName, archived: studentsTable.isArchived })
    .from(studentEnrollmentsTable).innerJoin(studentsTable, eq(studentsTable.id, studentEnrollmentsTable.studentId))
    .where(eq(studentEnrollmentsTable.isArchived, false));
  const live = new Map(enr.filter((e) => !e.archived).map((e) => [`${e.studentId}:${e.circleId}`, e.name]));
  const livePlans = plans.filter((p) => live.has(`${p.studentId}:${p.circleId}`) && p.startDate);
  const circles = new Map((await db.select({ id: circlesTable.id, name: circlesTable.name }).from(circlesTable)).map((c) => [c.id, c.name]));
  const cov = await loadGirlsCoverage(livePlans);

  const recs = livePlans.length ? await db.select().from(recordsTable).where(and(
    inArray(recordsTable.studentId, [...new Set(livePlans.map((p) => p.studentId))]),
    inArray(recordsTable.date, [...new Set(livePlans.flatMap((p) => getPlanCycleDates(p.startDate!, "girls_review")))]),
  )) : [];
  const recsBy = new Map<string, typeof recs>();
  for (const r of recs) { const k = `${r.studentId}:${r.circleId}`; (recsBy.get(k) ?? recsBy.set(k, []).get(k)!).push(r); }

  const today = getMakkahDay();
  const counts = { behind: 0, ontrack: 0, ahead: 0, none: 0 };
  const flags: Record<string, string[]> = { nearCovers: [], farPagesEnough: [], noRangesOnlyPages: [], lenient: [], outsidePlan: [] };
  for (const p of livePlans) {
    const c = cov.get(p.id);
    const st = c?.status ?? null;
    if (st) counts[st]++; else counts.none++;
    const dates = getPlanCycleDates(p.startDate!, "girls_review");
    const cur = computeCurrentDay(dates, today, 21);
    const rs = (recsBy.get(`${p.studentId}:${p.circleId}`) ?? []).filter((r) => dates.slice(0, cur).includes(r.date)).sort((a, b) => a.date.localeCompare(b.date));
    const present = rs.filter((r) => !r.isAbsent);
    const wajhs = orderedPlanWajhs(getPlanQuotaRanges(p));
    const planSet = new Set(wajhs);
    const far = present.flatMap((r) => [rng(r.reviewFarSurahStart, r.reviewFarAyahStart, r.reviewFarSurahEnd, r.reviewFarAyahEnd), rng(r.reviewFar2SurahStart, r.reviewFar2AyahStart, r.reviewFar2SurahEnd, r.reviewFar2AyahEnd)]).filter(Boolean) as R[];
    const near = present.map((r) => rng(r.reviewNearSurahStart, r.reviewNearAyahStart, r.reviewNearSurahEnd, r.reviewNearAyahEnd)).filter(Boolean) as R[];
    const farIn = [...coveredWajhSet(far)].filter((w) => planSet.has(w)).length;
    const nearIn = [...coveredWajhSet(near)].filter((w) => planSet.has(w)).length;
    const farOut = [...coveredWajhSet(far)].filter((w) => !planSet.has(w)).length;
    const farPages = present.reduce((s, r) => s + (r.reviewFarPages ?? 0) + (r.reviewFar2Pages ?? 0), 0);
    const days = (p.totalPages ?? 0) / 21;
    const plannedWajhs = Math.round(days * cur * 2);
    // بلا أسماء: سجل التشغيل في مستودع عام — الأسماء تُجلب من القاعدة برقم الخطة
    const who = `خطة #${p.id} | ${circles.get(p.circleId)} | ${st ?? "—"} (وصلت يوم ${c?.daysReached ?? 0} من ${cur}، تأخير ${c?.unresolvedDelayDays ?? 0})`;
    const detail = `${who}\n    الخطة: ${p.quotaSurahStart ? `${p.quotaSurahStart}←${p.quotaSurahEnd}` : p.extraRanges ? `أجزاء ${p.extraRanges}` : "—"} ${p.totalPages}ص\n    ` +
      rs.map((r) => `${r.date.slice(5)}${r.isAbsent ? " غائبة" : ` بعيدة:${fmt(rng(r.reviewFarSurahStart, r.reviewFarAyahStart, r.reviewFarSurahEnd, r.reviewFarAyahEnd))} قريبة:${fmt(rng(r.reviewNearSurahStart, r.reviewNearAyahStart, r.reviewNearSurahEnd, r.reviewNearAyahEnd))}`}`).join("\n    ");
    if (wajhs.length === 0) { flags.noRangesOnlyPages!.push(detail); continue; }
    if (st === "behind") {
      if (nearIn >= plannedWajhs && farIn < plannedWajhs) flags.nearCovers!.push(detail);
      else if (farOut > 0 && farIn < plannedWajhs) flags.outsidePlan!.push(detail);
      else if (farPages * 2 >= plannedWajhs) flags.farPagesEnough!.push(detail);
    }
    if ((st === "ontrack" || st === "ahead") && farIn < plannedWajhs * 0.5 && present.length > 0) flags.lenient!.push(detail);
  }
  return { today, plans: livePlans.length, counts, flagCounts: Object.fromEntries(Object.entries(flags).map(([k, v]) => [k, v.length])), flags };
}
