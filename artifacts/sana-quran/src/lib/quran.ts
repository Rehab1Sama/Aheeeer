import { MUSHAF_PAGES, AYAH_COUNTS } from "./mushaf-pages";

export interface Surah {
  number: number;
  name: string;
  ayahs: number;
  startPage: number;
}

export const SURAHS: Surah[] = [
  { number: 1, name: "الفاتحة", ayahs: 7, startPage: 1 },
  { number: 2, name: "البقرة", ayahs: 286, startPage: 2 },
  { number: 3, name: "آل عمران", ayahs: 200, startPage: 50 },
  { number: 4, name: "النساء", ayahs: 176, startPage: 77 },
  { number: 5, name: "المائدة", ayahs: 120, startPage: 106 },
  { number: 6, name: "الأنعام", ayahs: 165, startPage: 128 },
  { number: 7, name: "الأعراف", ayahs: 206, startPage: 151 },
  { number: 8, name: "الأنفال", ayahs: 75, startPage: 177 },
  { number: 9, name: "التوبة", ayahs: 129, startPage: 187 },
  { number: 10, name: "يونس", ayahs: 109, startPage: 208 },
  { number: 11, name: "هود", ayahs: 123, startPage: 221 },
  { number: 12, name: "يوسف", ayahs: 111, startPage: 235 },
  { number: 13, name: "الرعد", ayahs: 43, startPage: 249 },
  { number: 14, name: "إبراهيم", ayahs: 52, startPage: 255 },
  { number: 15, name: "الحجر", ayahs: 99, startPage: 262 },
  { number: 16, name: "النحل", ayahs: 128, startPage: 267 },
  { number: 17, name: "الإسراء", ayahs: 111, startPage: 282 },
  { number: 18, name: "الكهف", ayahs: 110, startPage: 293 },
  { number: 19, name: "مريم", ayahs: 98, startPage: 305 },
  { number: 20, name: "طه", ayahs: 135, startPage: 312 },
  { number: 21, name: "الأنبياء", ayahs: 112, startPage: 322 },
  { number: 22, name: "الحج", ayahs: 78, startPage: 332 },
  { number: 23, name: "المؤمنون", ayahs: 118, startPage: 342 },
  { number: 24, name: "النور", ayahs: 64, startPage: 350 },
  { number: 25, name: "الفرقان", ayahs: 77, startPage: 359 },
  { number: 26, name: "الشعراء", ayahs: 227, startPage: 367 },
  { number: 27, name: "النمل", ayahs: 93, startPage: 377 },
  { number: 28, name: "القصص", ayahs: 88, startPage: 385 },
  { number: 29, name: "العنكبوت", ayahs: 69, startPage: 396 },
  { number: 30, name: "الروم", ayahs: 60, startPage: 404 },
  { number: 31, name: "لقمان", ayahs: 34, startPage: 411 },
  { number: 32, name: "السجدة", ayahs: 30, startPage: 415 },
  { number: 33, name: "الأحزاب", ayahs: 73, startPage: 418 },
  { number: 34, name: "سبأ", ayahs: 54, startPage: 428 },
  { number: 35, name: "فاطر", ayahs: 45, startPage: 434 },
  { number: 36, name: "يس", ayahs: 83, startPage: 440 },
  { number: 37, name: "الصافات", ayahs: 182, startPage: 446 },
  { number: 38, name: "ص", ayahs: 88, startPage: 453 },
  { number: 39, name: "الزمر", ayahs: 75, startPage: 458 },
  { number: 40, name: "غافر", ayahs: 85, startPage: 467 },
  { number: 41, name: "فصلت", ayahs: 54, startPage: 477 },
  { number: 42, name: "الشورى", ayahs: 53, startPage: 483 },
  { number: 43, name: "الزخرف", ayahs: 89, startPage: 489 },
  { number: 44, name: "الدخان", ayahs: 59, startPage: 496 },
  { number: 45, name: "الجاثية", ayahs: 37, startPage: 499 },
  { number: 46, name: "الأحقاف", ayahs: 35, startPage: 502 },
  { number: 47, name: "محمد", ayahs: 38, startPage: 507 },
  { number: 48, name: "الفتح", ayahs: 29, startPage: 511 },
  { number: 49, name: "الحجرات", ayahs: 18, startPage: 515 },
  { number: 50, name: "ق", ayahs: 45, startPage: 518 },
  { number: 51, name: "الذاريات", ayahs: 60, startPage: 520 },
  { number: 52, name: "الطور", ayahs: 49, startPage: 523 },
  { number: 53, name: "النجم", ayahs: 62, startPage: 526 },
  { number: 54, name: "القمر", ayahs: 55, startPage: 528 },
  { number: 55, name: "الرحمن", ayahs: 78, startPage: 531 },
  { number: 56, name: "الواقعة", ayahs: 96, startPage: 534 },
  { number: 57, name: "الحديد", ayahs: 29, startPage: 537 },
  { number: 58, name: "المجادلة", ayahs: 22, startPage: 542 },
  { number: 59, name: "الحشر", ayahs: 24, startPage: 545 },
  { number: 60, name: "الممتحنة", ayahs: 13, startPage: 549 },
  { number: 61, name: "الصف", ayahs: 14, startPage: 551 },
  { number: 62, name: "الجمعة", ayahs: 11, startPage: 553 },
  { number: 63, name: "المنافقون", ayahs: 11, startPage: 554 },
  { number: 64, name: "التغابن", ayahs: 18, startPage: 556 },
  { number: 65, name: "الطلاق", ayahs: 12, startPage: 558 },
  { number: 66, name: "التحريم", ayahs: 12, startPage: 560 },
  { number: 67, name: "الملك", ayahs: 30, startPage: 562 },
  { number: 68, name: "القلم", ayahs: 52, startPage: 564 },
  { number: 69, name: "الحاقة", ayahs: 52, startPage: 566 },
  { number: 70, name: "المعارج", ayahs: 44, startPage: 568 },
  { number: 71, name: "نوح", ayahs: 28, startPage: 570 },
  { number: 72, name: "الجن", ayahs: 28, startPage: 572 },
  { number: 73, name: "المزمل", ayahs: 20, startPage: 574 },
  { number: 74, name: "المدثر", ayahs: 56, startPage: 575 },
  { number: 75, name: "القيامة", ayahs: 40, startPage: 577 },
  { number: 76, name: "الإنسان", ayahs: 31, startPage: 578 },
  { number: 77, name: "المرسلات", ayahs: 50, startPage: 580 },
  { number: 78, name: "النبأ", ayahs: 40, startPage: 582 },
  { number: 79, name: "النازعات", ayahs: 46, startPage: 583 },
  { number: 80, name: "عبس", ayahs: 42, startPage: 585 },
  { number: 81, name: "التكوير", ayahs: 29, startPage: 586 },
  { number: 82, name: "الانفطار", ayahs: 19, startPage: 587 },
  { number: 83, name: "المطففين", ayahs: 36, startPage: 587.5 },
  { number: 84, name: "الانشقاق", ayahs: 25, startPage: 589 },
  { number: 85, name: "البروج", ayahs: 22, startPage: 590 },
  { number: 86, name: "الطارق", ayahs: 17, startPage: 591 },
  { number: 87, name: "الأعلى", ayahs: 19, startPage: 591.5 },
  { number: 88, name: "الغاشية", ayahs: 26, startPage: 592 },
  { number: 89, name: "الفجر", ayahs: 30, startPage: 593 },
  { number: 90, name: "البلد", ayahs: 20, startPage: 594 },
  { number: 91, name: "الشمس", ayahs: 15, startPage: 595 },
  { number: 92, name: "الليل", ayahs: 21, startPage: 595.5 },
  { number: 93, name: "الضحى", ayahs: 11, startPage: 596 },
  { number: 94, name: "الشرح", ayahs: 8, startPage: 596.5 },
  { number: 95, name: "التين", ayahs: 8, startPage: 597 },
  { number: 96, name: "العلق", ayahs: 19, startPage: 597 },
  { number: 97, name: "القدر", ayahs: 5, startPage: 598 },
  { number: 98, name: "البينة", ayahs: 8, startPage: 598 },
  { number: 99, name: "الزلزلة", ayahs: 8, startPage: 599 },
  { number: 100, name: "العاديات", ayahs: 11, startPage: 599 },
  { number: 101, name: "القارعة", ayahs: 11, startPage: 600 },
  { number: 102, name: "التكاثر", ayahs: 8, startPage: 600 },
  { number: 103, name: "العصر", ayahs: 3, startPage: 601 },
  { number: 104, name: "الهمزة", ayahs: 9, startPage: 601 },
  { number: 105, name: "الفيل", ayahs: 5, startPage: 601 },
  { number: 106, name: "قريش", ayahs: 4, startPage: 602 },
  { number: 107, name: "الماعون", ayahs: 7, startPage: 602 },
  { number: 108, name: "الكوثر", ayahs: 3, startPage: 602 },
  { number: 109, name: "الكافرون", ayahs: 6, startPage: 603 },
  { number: 110, name: "النصر", ayahs: 3, startPage: 603 },
  { number: 111, name: "المسد", ayahs: 5, startPage: 603 },
  { number: 112, name: "الإخلاص", ayahs: 4, startPage: 604 },
  { number: 113, name: "الفلق", ayahs: 5, startPage: 604 },
  { number: 114, name: "الناس", ayahs: 6, startPage: 604 },
];

export function getSurahByName(name: string): Surah | undefined {
  return SURAHS.find(s => s.name === name);
}

// إيجاد مؤشر الوجه في MUSHAF_PAGES الذي يحتوي على (surahNum, ayahNum)
function findWajhIdx(surahNum: number, ayahNum: number): number {
  let result = 0;
  for (let i = 0; i < MUSHAF_PAGES.length; i++) {
    const [s, a] = MUSHAF_PAGES[i];
    if (s < surahNum || (s === surahNum && a <= ayahNum)) result = i;
    else break;
  }
  return result;
}

// التحقق من أن الوجه عند مؤشر idx مكتمل بالكامل ضمن النطاق المنتهي عند (endSurahNum, endAyah)
// الوجه مكتمل إذا كان النطاق يصل إلى آخر آية في ذلك الوجه أو يتجاوزها
function isWajhComplete(idx: number, endSurahNum: number, endAyah: number): boolean {
  if (idx + 1 >= MUSHAF_PAGES.length) return true;
  const [nextS, nextA] = MUSHAF_PAGES[idx + 1];
  let lastS: number, lastA: number;
  if (nextA > 1) {
    lastS = nextS; lastA = nextA - 1;
  } else {
    // الوجه ينتهي بآخر آية من السورة السابقة
    lastS = nextS - 1;
    lastA = AYAH_COUNTS[nextS - 2] ?? 3;
  }
  return endSurahNum > lastS || (endSurahNum === lastS && endAyah >= lastA);
}

// حساب عدد الأوجه بناءً على عدّ الأوجه الكاملة من مصحف المدينة المنورة.
// كل إدخالَين في MUSHAF_PAGES = وجه واحد بمنطق المستخدم (نتيجة * 0.5)
// أمثلة: البقرة 1-12 → 1.5، 1-16 → 2، 1-20 → 2.5، 1-21 → 2.5
// يقبل النطاق بأي اتجاه — لو البداية بعد النهاية يُعكس الترتيب تلقائياً
export function calculatePages(
  startSurahName: string | null | undefined,
  startAyah: number | null | undefined,
  endSurahName: string | null | undefined,
  endAyah: number | null | undefined
): number {
  if (!startSurahName || !endSurahName || !startAyah || !endAyah) return 0;

  const startIdx = SURAHS.findIndex(s => s.name === startSurahName);
  const endIdx   = SURAHS.findIndex(s => s.name === endSurahName);
  if (startIdx === -1 || endIdx === -1) return 0;

  let startSurahNum = startIdx + 1;
  let endSurahNum   = endIdx + 1;
  let startAyahNum  = startAyah;
  let endAyahNum    = endAyah;

  // إذا كانت البداية بعد النهاية في المصحف، اعكس الترتيب تلقائياً
  const rawStartIdx = findWajhIdx(startSurahNum, startAyahNum);
  const rawEndIdx   = findWajhIdx(endSurahNum, endAyahNum);
  if (rawStartIdx > rawEndIdx) {
    [startSurahNum, endSurahNum] = [endSurahNum, startSurahNum];
    [startAyahNum, endAyahNum]   = [endAyahNum, startAyahNum];
  }

  const startWajhIdx = findWajhIdx(startSurahNum, startAyahNum);

  let count = 0;
  for (let i = startWajhIdx; i < MUSHAF_PAGES.length; i++) {
    if (isWajhComplete(i, endSurahNum, endAyahNum)) count++;
    else break;
  }

  return count * 0.5;
}

export interface DayQuotaRange {
  surahStart: string;
  ayahStart: number;
  surahEnd: string;
  ayahEnd: number;
}

function _findWajhIdx(surahNum: number, ayahNum: number): number {
  let result = 0;
  for (let i = 0; i < MUSHAF_PAGES.length; i++) {
    const [s, a] = MUSHAF_PAGES[i]!;
    if (s < surahNum || (s === surahNum && a <= ayahNum)) result = i;
    else break;
  }
  return result;
}

export type DayRangeSegment = { surahStart: string; ayahStart: number; surahEnd: string; ayahEnd: number };

export function computeDayRanges(
  quotaRanges: DayQuotaRange[],
  days: Array<{ pages?: number | null }>
): Array<DayRangeSegment[]> {
  if (quotaRanges.length === 0) return days.map(() => []);

  // Build an ordered list of all wajh indices that belong to ANY of the quota ranges
  const allWajhIndices: number[] = [];

  for (const range of quotaRanges) {
    const startSurahIdx = SURAHS.findIndex(s => s.name === range.surahStart);
    const endSurahIdx   = SURAHS.findIndex(s => s.name === range.surahEnd);
    if (startSurahIdx === -1 || endSurahIdx === -1) continue;

    let rawStart = _findWajhIdx(startSurahIdx + 1, range.ayahStart);
    let rawEnd   = _findWajhIdx(endSurahIdx + 1,   range.ayahEnd);
    if (rawStart > rawEnd) [rawStart, rawEnd] = [rawEnd, rawStart];

    for (let i = rawStart; i <= rawEnd; i++) allWajhIndices.push(i);
  }

  if (allWajhIndices.length === 0) return days.map(() => []);

  let pos = 0;

  function wajhToRange(wajhIdx: number): DayRangeSegment | null {
    const startEntry = MUSHAF_PAGES[wajhIdx];
    if (!startEntry) return null;
    const startSurah = SURAHS[startEntry[0] - 1];
    let endSurahNum: number;
    let endAyahNum: number;
    if (wajhIdx + 1 < MUSHAF_PAGES.length) {
      const nextEntry = MUSHAF_PAGES[wajhIdx + 1]!;
      if (nextEntry[1] > 1) {
        endSurahNum = nextEntry[0];
        endAyahNum  = nextEntry[1] - 1;
      } else {
        endSurahNum = nextEntry[0] - 1;
        endAyahNum  = AYAH_COUNTS[nextEntry[0] - 2] ?? 1;
      }
    } else {
      endSurahNum = 114;
      endAyahNum  = 6;
    }
    const endSurah = SURAHS[endSurahNum - 1];
    if (!startSurah || !endSurah) return null;
    return { surahStart: startSurah.name, ayahStart: startEntry[1], surahEnd: endSurah.name, ayahEnd: endAyahNum };
  }

  return days.map(day => {
    if (!day.pages || day.pages <= 0 || pos >= allWajhIndices.length) return [];
    const wajhCount = Math.round(day.pages * 2);
    if (wajhCount === 0) return [];

    const dayEndPos = Math.min(pos + wajhCount - 1, allWajhIndices.length - 1);

    // Split into contiguous segments (handles non-adjacent ranges)
    const segBounds: Array<[number, number]> = [];
    let segStart = pos;
    for (let i = pos + 1; i <= dayEndPos; i++) {
      if (allWajhIndices[i] !== allWajhIndices[i - 1]! + 1) {
        segBounds.push([segStart, i - 1]);
        segStart = i;
      }
    }
    segBounds.push([segStart, dayEndPos]);

    pos = dayEndPos + 1;

    const segments: DayRangeSegment[] = [];
    for (const [from, to] of segBounds) {
      const segStartWajh = allWajhIndices[from]!;
      const segEndWajh   = allWajhIndices[to]!;
      const startEntry = MUSHAF_PAGES[segStartWajh];
      if (!startEntry) continue;
      const startSurah = SURAHS[startEntry[0] - 1];
      const endRange = wajhToRange(segEndWajh);
      if (!startSurah || !endRange) continue;
      segments.push({
        surahStart: startSurah.name,
        ayahStart:  startEntry[1],
        surahEnd:   endRange.surahEnd,
        ayahEnd:    endRange.ayahEnd,
      });
    }
    return segments;
  });
}

// حدود الأجزاء الثلاثين (بداية ونهاية كل جزء بالسورة والآية)
export const JUZ_RANGES: Array<{ surahStart: string; ayahStart: number; surahEnd: string; ayahEnd: number }> = [
  { surahStart: "الفاتحة",    ayahStart: 1,   surahEnd: "البقرة",      ayahEnd: 141 },
  { surahStart: "البقرة",     ayahStart: 142,  surahEnd: "البقرة",      ayahEnd: 252 },
  { surahStart: "البقرة",     ayahStart: 253,  surahEnd: "آل عمران",    ayahEnd: 92  },
  { surahStart: "آل عمران",   ayahStart: 93,   surahEnd: "النساء",      ayahEnd: 23  },
  { surahStart: "النساء",     ayahStart: 24,   surahEnd: "النساء",      ayahEnd: 147 },
  { surahStart: "النساء",     ayahStart: 148,  surahEnd: "المائدة",     ayahEnd: 81  },
  { surahStart: "المائدة",    ayahStart: 82,   surahEnd: "الأنعام",     ayahEnd: 110 },
  { surahStart: "الأنعام",    ayahStart: 111,  surahEnd: "الأعراف",     ayahEnd: 87  },
  { surahStart: "الأعراف",    ayahStart: 88,   surahEnd: "الأنفال",     ayahEnd: 40  },
  { surahStart: "الأنفال",    ayahStart: 41,   surahEnd: "التوبة",      ayahEnd: 92  },
  { surahStart: "التوبة",     ayahStart: 93,   surahEnd: "هود",         ayahEnd: 5   },
  { surahStart: "هود",        ayahStart: 6,    surahEnd: "يوسف",        ayahEnd: 52  },
  { surahStart: "يوسف",       ayahStart: 53,   surahEnd: "إبراهيم",     ayahEnd: 52  },
  { surahStart: "الحجر",      ayahStart: 1,    surahEnd: "النحل",       ayahEnd: 128 },
  { surahStart: "الإسراء",    ayahStart: 1,    surahEnd: "الكهف",       ayahEnd: 74  },
  { surahStart: "الكهف",      ayahStart: 75,   surahEnd: "طه",          ayahEnd: 135 },
  { surahStart: "الأنبياء",   ayahStart: 1,    surahEnd: "الحج",        ayahEnd: 78  },
  { surahStart: "المؤمنون",   ayahStart: 1,    surahEnd: "الفرقان",     ayahEnd: 20  },
  { surahStart: "الفرقان",    ayahStart: 21,   surahEnd: "النمل",       ayahEnd: 55  },
  { surahStart: "النمل",      ayahStart: 56,   surahEnd: "العنكبوت",    ayahEnd: 45  },
  { surahStart: "العنكبوت",   ayahStart: 46,   surahEnd: "الأحزاب",     ayahEnd: 30  },
  { surahStart: "الأحزاب",    ayahStart: 31,   surahEnd: "يس",          ayahEnd: 27  },
  { surahStart: "يس",         ayahStart: 28,   surahEnd: "الزمر",       ayahEnd: 31  },
  { surahStart: "الزمر",      ayahStart: 32,   surahEnd: "فصلت",        ayahEnd: 46  },
  { surahStart: "فصلت",       ayahStart: 47,   surahEnd: "الجاثية",     ayahEnd: 37  },
  { surahStart: "الأحقاف",    ayahStart: 1,    surahEnd: "الذاريات",    ayahEnd: 30  },
  { surahStart: "الذاريات",   ayahStart: 31,   surahEnd: "الحديد",      ayahEnd: 29  },
  { surahStart: "المجادلة",   ayahStart: 1,    surahEnd: "التحريم",     ayahEnd: 12  },
  { surahStart: "الملك",      ayahStart: 1,    surahEnd: "المرسلات",    ayahEnd: 50  },
  { surahStart: "النبأ",      ayahStart: 1,    surahEnd: "الناس",       ayahEnd: 6   },
];

/** تحويل قائمة أرقام الأجزاء (1-30) إلى نطاقات DayQuotaRange */
export function juzListToQuotaRanges(juzNumbers: number[]): DayQuotaRange[] {
  const sorted = [...juzNumbers].sort((a, b) => a - b);
  return sorted
    .filter(n => n >= 1 && n <= 30)
    .map(n => ({ ...JUZ_RANGES[n - 1]! }));
}

export function formatPages(pages: number | null | undefined): string {
  if (!pages && pages !== 0) return "-";
  // Use Arabic comma for decimal
  return pages.toString().replace(".", ",");
}
