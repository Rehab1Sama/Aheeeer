import { test } from "node:test";
import assert from "node:assert/strict";
import { isShortcomingRecord } from "../src/lib/shortcoming";

const base = { isAbsent: false, reviewNearPages: 0, reviewFarPages: 0, reviewFar2Pages: 0, reviewPages: 0, listenedToReciter: true };

test("الفتيات: يوم بلا أي مراجعة = تقصير واحد", () => {
  assert.equal(isShortcomingRecord(base, "girls"), true);
  assert.equal(isShortcomingRecord({ ...base, reviewFar2Pages: 1 }, "girls"), false); // البعيدة ٢ تكفي
});

test("الغائبة لا تقصير عليها، والتعديل اليدوي يُقدَّم", () => {
  assert.equal(isShortcomingRecord({ ...base, isAbsent: true }, "girls"), false);
  assert.equal(isShortcomingRecord({ ...base, shortcomingOverride: false }, "girls"), false);
  assert.equal(isShortcomingRecord({ ...base, reviewNearPages: 2, shortcomingOverride: true }, "girls"), true);
});

test("الأمهات والأطفال لا تقصير تلقائي، ومشكاة بعدم السماع", () => {
  assert.equal(isShortcomingRecord(base, "mothers"), false);
  assert.equal(isShortcomingRecord(base, "children"), false);
  assert.equal(isShortcomingRecord(base, "recitation"), false);
  assert.equal(isShortcomingRecord({ ...base, listenedToReciter: false }, "recitation"), true);
});
