import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRange, parseCards } from "../../sana-quran/src/lib/cardParser";
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

test("بطاقة سُنى للتثبيت: الاسم والتثبيت والسماع والتكرار، وتجاهل بطاقات القالب", () => {
  const text = [
    "*(1) بطـاقة الإنجـاز ☀️.*",
    "> مسـار سنـى للتثبيت . .",
    "> الطالبة المُتقنـة : وعد عطا ",
    "التثبيت الجـديد 📜: سورة البقرة ١٥٤ الى ١٦٣",
    "• *سمـاع الشيخ :* مرتين ✅",
    "• *سمـاع والترديد معه :* مرة واحدة✅",
    "• *التكرار الذاتي :* خمس مرات✅",
    "• *سرد الرفيقة :* ثلاث مرات✅",
    "> *تحضير بُنيّة وَهج 🌟*",
    "• *اســــم الحبيبة:* لا يشترط أن يكون رباعيًا :)",
    "• ⁠*النصاب الجديد:* ما سيتم تسميعه.",
    "> *تحضير بُنيّة وَهج 🌟*",
    "• *اســــم الحبيبة:* ",
    "• ⁠*النصاب الجديد:* ",
  ].join("\n");
  const cards = parseCards(text, SURAHS);
  assert.equal(cards.length, 1);
  assert.equal(cards[0]!.name, "وعد عطا");
  assert.deepEqual(cards[0]!.memorize.range, { surahStart: "البقرة", ayahStart: 154, surahEnd: "البقرة", ayahEnd: 163 });
  assert.equal(cards[0]!.listened, true);
  assert.equal(cards[0]!.repetitions, 5);
});

test("سور فيها حرف القاف لا تُقرأ سورة «ق»", () => {
  assert.equal(parseRange("القيامة ١ الى ١٠", SURAHS).range?.surahStart, "القيامة");
  assert.equal(parseRange("الحاقة من ١ إلى ١٢", SURAHS).range?.surahStart, "الحاقة");
});
