import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeName, phoneTail, maskEmail } from "../src/lib/nameMatch";

test("الاسم الموحّد يتجاهل الهمزات والتشكيل والتطويل والمسافات", () => {
  assert.equal(normalizeName("  إصلاحُ   عبد الواحد "), normalizeName("اصلاح عبد الواحد"));
  assert.equal(normalizeName("شَيماء قاسم"), normalizeName("شيماء قاسم"));
  assert.equal(normalizeName("آسيه الزهرانيـة"), normalizeName("اسيه الزهرانيه"));
  assert.notEqual(normalizeName("ملك حسن"), normalizeName("ملاك حسن"));
});

test("الجوال بآخر ٩ أرقام مهما كان مفتاح الدولة أو الأرقام العربية", () => {
  assert.equal(phoneTail("+966 50 123 4567"), phoneTail("0501234567"));
  assert.equal(phoneTail("٠٥٠١٢٣٤٥٦٧"), "501234567");
  assert.equal(phoneTail("123"), "");
});

test("تلميح البريد لا يكشفه", () => {
  assert.equal(maskEmail("rehab@gmail.com"), "re***@gmail.com");
});
