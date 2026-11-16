import { test } from "node:test";
import assert from "node:assert/strict";
import { getExpectedEntryDays, isEntryExpectedOn } from "../src/lib/dataEntrySchedule";

test("الفتيات من الأحد إلى الخميس", () => {
  assert.deepEqual(getExpectedEntryDays("girls", "إشراق ١"), [0, 1, 2, 3, 4]);
  assert.equal(isEntryExpectedOn("girls", "إشراق ١", "2026-11-21"), false); // سبت
});

test("مشكاة كلها (ومنها ٢ و٥) من الأحد إلى الأربعاء", () => {
  for (const name of ["مشكاة ١", "مشكاة ٢", "مشكاة 5"]) assert.deepEqual(getExpectedEntryDays("recitation", name), [0, 1, 2, 3]);
});

test("الأمهات والأطفال وسنى من الأحد إلى الأربعاء", () => {
  for (const t of ["mothers", "children", "fixation"]) assert.equal(isEntryExpectedOn(t, "", "2026-11-19"), false); // خميس
});

test("حلقات مهج: الإدخال متوقع يوم الأربعاء فقط", () => {
  // 2026-11-18 أربعاء، 2026-11-15 أحد، 2026-11-19 خميس
  assert.equal(isEntryExpectedOn("girls", "مهج 1", "2026-11-18"), true);
  assert.equal(isEntryExpectedOn("girls", "مهج 1", "2026-11-15"), false);
  assert.equal(isEntryExpectedOn("girls", "مهج 3", "2026-11-19"), false);
  assert.equal(isEntryExpectedOn("girls", "وهج ١", "2026-11-15"), true);
});
