// قواعد احتساب خطة المراجعة (كما اعتمدتها الإدارة) — أي تعديل يكسرها يُكتشف هنا قبل النشر.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  evaluateCoverage, orderedPlanWajhs, surahReversedWajhs, wajhsToQuotaRanges, daySlices, type CoverageDayRecord,
} from "../src/lib/planProgress";

// خطة: الأنفال كاملة ثم التوبة كاملة، ٤ أوجه (صفحتان) لكل يوم
const PLAN = [
  { surahStart: "الأنفال", ayahStart: 1, surahEnd: "الأنفال", ayahEnd: 75 },
  { surahStart: "التوبة", ayahStart: 1, surahEnd: "التوبة", ayahEnd: 129 },
];
const wajhs = orderedPlanWajhs(PLAN);
const DAYS = Array.from({ length: Math.floor(wajhs.length / 4) }, (_, i) => ({ dayNumber: i + 1, pages: 2 }));
// تواريخ متتالية تبدأ الأحد ٢٠٢٦-١١-١٥ (اليوم السابع سبت)
const DATES = DAYS.map((_, i) => {
  const d = new Date(Date.UTC(2026, 10, 15 + i));
  return d.toISOString().slice(0, 10);
});
const slicesFwd = daySlices(wajhs, DAYS);
const slicesRev = daySlices(surahReversedWajhs(wajhs), DAYS);
const rec = (ws: number[]): CoverageDayRecord => ({ isAbsent: false, farRanges: wajhsToQuotaRanges(ws) });
const day = (n: number, rev = false) => (rev ? slicesRev : slicesFwd).get(n)!;

test("كل الأيام منجزة حتى اليوم ← منتظمة", () => {
  const r = evaluateCoverage(wajhs, DAYS, DATES, 3, { [DATES[0]!]: rec(day(1)), [DATES[1]!]: rec(day(2)), [DATES[2]!]: rec(day(3)) });
  assert.equal(r.status, "ontrack");
  assert.equal(r.daysReached, 3);
  assert.equal(r.unresolvedDelayDays, 0);
});

test("تغطية يوم لاحق تُسقط تأخير ما قبله وتنبيه عدم الإدخال", () => {
  const r = evaluateCoverage(wajhs, DAYS, DATES, 3, { [DATES[0]!]: rec(day(1)), [DATES[2]!]: rec(day(3)) });
  assert.equal(r.daysReached, 3);
  assert.equal(r.unresolvedDelayDays, 0);
  assert.deepEqual(r.missingSupervisorDates, []);
});

test("يوم بسجل بلا تغطية بعد آخر يوم منجز ← يوم تأخير", () => {
  const r = evaluateCoverage(wajhs, DAYS, DATES, 3, {
    [DATES[0]!]: rec(day(1)), [DATES[1]!]: { isAbsent: true, farRanges: [] }, [DATES[2]!]: rec([]),
  });
  assert.equal(r.daysReached, 1);
  assert.equal(r.unresolvedDelayDays, 2);
  assert.equal(r.status, "behind");
});

test("يوم بلا سجل بعد آخر يوم منجز ← لم تُدخل المشرفة (لا تأخير)، واليوم الحالي لا يُحسب", () => {
  const r = evaluateCoverage(wajhs, DAYS, DATES, 3, { [DATES[0]!]: rec(day(1)) });
  assert.equal(r.unresolvedDelayDays, 0);
  assert.deepEqual(r.missingSupervisorDates, [DATES[1]]);
});

test("السبت بلا سجل لا يُعدّ «لم تُدخل المشرفة»", () => {
  const recs: Record<string, CoverageDayRecord> = {};
  for (let d = 1; d <= 6; d++) recs[DATES[d - 1]!] = rec(day(d));
  const r = evaluateCoverage(wajhs, DAYS, DATES, 8, recs); // اليوم ٧ سبت بلا سجل، واليوم ٨ الحالي
  assert.ok(!r.missingSupervisorDates.includes(DATES[6]!));
});

test("البدء بآخر سورة في الخطة ← خطة عكسية (بالسور) لا متقدمة", () => {
  const r = evaluateCoverage(wajhs, DAYS, DATES, 2, { [DATES[0]!]: rec(day(1, true)), [DATES[1]!]: rec(day(2, true)) });
  assert.equal(r.reversed, true);
  assert.equal(r.status, "ontrack");
  assert.equal(r.daysReached, 2);
});

test("سماح وجه واحد للنصيب الذي يزيد على وجهين", () => {
  const ws = day(1);
  const r = evaluateCoverage(wajhs, DAYS, DATES, 1, { [DATES[0]!]: rec(ws.slice(0, ws.length - 1)) });
  assert.equal(r.daysReached, 1);
});

test("إنجاز نصيب أيام قادمة ← متقدمة", () => {
  const r = evaluateCoverage(wajhs, DAYS, DATES, 2, { [DATES[0]!]: rec([...day(1), ...day(2), ...day(3), ...day(4)]) });
  assert.equal(r.status, "ahead");
  assert.equal(r.daysReached, 4);
});
