import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRange } from "../../sana-quran/src/lib/cardParser";
import { QURAN_SURAHS } from "../src/lib/quranMetadata";

const SURAHS = QURAN_SURAHS.map((s) => ({ name: s.name, ayahs: s.ayahs }));

test("نطاق سورة واحدة بالآيات", () => {
  const r = parseRange("البقرة ١-٥", SURAHS);
  assert.equal(r.status, "ok");
  assert.deepEqual(r.range, { surahStart: "البقرة", ayahStart: 1, surahEnd: "البقرة", ayahEnd: 5 });
});

test("«جزء عم» يُقرأ من النبأ إلى الناس", () => {
  const r = parseRange("جزء عم", SURAHS);
  assert.equal(r.range?.surahStart, "النبأ");
  assert.equal(r.range?.surahEnd, "الناس");
});

test("الفراغ ← حقل فارغ", () => {
  assert.equal(parseRange("  ", SURAHS).status, "empty");
});
