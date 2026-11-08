import { test } from "node:test";
import assert from "node:assert/strict";
import { parseChildrenMessage } from "../../sana-quran/src/lib/cardParser";
import { QURAN_SURAHS } from "../src/lib/quranMetadata";

const SURAHS = QURAN_SURAHS.map((s) => ({ name: s.name, ayahs: s.ayahs }));
// نموذج حقيقي من معلمة أطفال (الأسماء كما أرسلتها القائدة)
const MSG = `حلقة سِـراج (٢) 🍨
• المعلمة: *جُمانة مَروان*
• ⁠المشرفة: أ.*هَـديل عدنان*

*نصاب الحفظ و المراجعـة ليوم الأحَد 🌟*
───

1- *تـسنيم كوكش* 🌸
الحفظ : الإنسان ١-٥
المراجعه : التكاثر والقارعه
ــــــــــ

2- *مليكـة محمد* 🌸
الحفظ : تجميع سورة الممتحنة 
المراجعه: العصر و التكاثر والقارعه
───

3- *لـؤي عثمان*🌟
الحفظ : الغاشية ١٥-٢٢
المراجعه : العاديات 
──

4 *محمـد عثمان* 🌟
الحفظ : الكافرون
المراجعه : الناس
───

5- *سلمـان محمد* 🌟
الحفظ : العاديات
المراجعه : التكاثر

🍃 حفظ يوم الأربعاء:

نور: مراجعة الهمزة، العصر، التكاثر.

ماهر: مراجعة الهمزة.

غنى: مراجعة الكافرون، الكوثر، الماعون.

تاليا: مراجعة الممتحنة ١-٣.

فهد: مراجعة التكاثر، القارعة، العاديات 
١-٥.

ريم: غائبة`;

const cards = parseChildrenMessage(MSG, SURAHS);
const by = (n: string) => cards.find((c) => c.name.startsWith(n))!;
const r = (f: any) => f.range && `${f.range.surahStart} ${f.range.ayahStart}-${f.range.surahEnd} ${f.range.ayahEnd}`;

test("يقرأ كل الأطفال ويتجاهل رأس الرسالة", () => {
  assert.deepEqual(cards.map((c) => c.name), ["تسنيم كوكش", "مليكة محمد", "لؤي عثمان", "محمد عثمان", "سلمان محمد", "نور", "ماهر", "غنى", "تاليا", "فهد", "ريم"]);
});

test("الحفظ بالآيات والمراجعة بعدة سور متصلة", () => {
  assert.equal(r(by("تسنيم").memorize), "الإنسان 1-الإنسان 5");
  assert.equal(r(by("تسنيم").review), "القارعة 1-التكاثر 8");
  assert.equal(by("تسنيم").review!.status, "ok");
  assert.equal(r(by("مليكة").memorize), "الممتحنة 1-الممتحنة 13");
  assert.equal(r(by("مليكة").review), "القارعة 1-العصر 3");
});

test("سطر واحد «الاسم: مراجعة …» = مراجعة فقط", () => {
  assert.equal(by("نور").memorize.status, "empty");
  assert.equal(r(by("نور").review), "التكاثر 1-الهمزة 9");
  assert.equal(r(by("غنى").review), "الماعون 1-الكافرون 6");
  assert.equal(r(by("تاليا").review), "الممتحنة 1-الممتحنة 3");
});

test("سطر مكسور قبل الآيات، وسور بآيات جزئية", () => {
  assert.equal(r(by("فهد").review), "العاديات 1-التكاثر 8");
  assert.equal(by("فهد").review!.status, "check"); // العاديات ١-٥ ثم القارعة: غير متصل
});

test("«غائبة» بجانب الاسم ← غياب بلا نصاب", () => {
  assert.equal(by("ريم").absent, true);
});
