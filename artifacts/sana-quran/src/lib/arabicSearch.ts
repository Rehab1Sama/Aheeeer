// بحث عربي متسامح: يتجاهل الهمزات والتشكيل والتطويل والمسافات وحالة الأحرف،
// ويساوي بين الأرقام العربية والإنجليزية — فـ«الق١١» يجد «ألق 11»، و«اسراء» يجد «إسراء».
const DIACRITICS = /[ً-ٰٟـ]/g;

export function normalizeSearch(text: unknown): string {
  return String(text ?? "")
    .replace(DIACRITICS, "")
    .replace(/[أإآٱ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/ؤ/g, "و").replace(/ئ/g, "ي")
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[\s‌‍‎‏_\-–—.،,]+/g, "")
    .toLowerCase();
}

/** هل يحتوي النص على عبارة البحث؟ (عبارة فارغة = نعم) */
export function searchMatch(haystack: unknown, needle: unknown): boolean {
  const n = normalizeSearch(needle);
  if (!n) return true;
  return normalizeSearch(haystack).includes(n);
}
