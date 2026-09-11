// جدول أيام العمل الأسبوعية حسب نوع إدخال البيانات (dataEntryType) للحلقة.
// المستخدم لإخفاء تنبيهات "لم يتم إدخال البيانات" في الأيام اللي أصلًا
// ما فيها إدخال متوقع لهذا النوع من الحلقات (مثل مشكاة/الأطفال/الأمهات).
//
// getUTCDay(): الأحد=0، الاثنين=1، الثلاثاء=2، الأربعاء=3، الخميس=4، الجمعة=5، السبت=6

const SUN_TO_WED = [0, 1, 2, 3];          // الأحد-الأربعاء (مشكاة/أمهات/أطفال)
const SUN_TO_THU = [0, 1, 2, 3, 4];      // الأحد-الخميس (فتيات/تثبيت)
const TUESDAY_ONLY = [2];                // الثلاثاء فقط (مشكاة ٢ و٥)

// حلقات مشكاة ٢ و٥ تحديدًا تشتغل الثلاثاء فقط، بقية حلقات مشكاة من الأحد للأربعاء
const SPECIAL_MISHKAH_NAME = /مشكاة\s*[25٢٥](\D|$)/;

/**
 * الأيام المتوقع فيها إدخال بيانات لهذا النوع من الحلقات.
 * 
 * جدول الأيام:
 * - مشكاة ٢ و٥: الثلاثاء فقط [2]
 * - مشكاة (الباقي): الأحد-الأربعاء [0,1,2,3]
 * - أمهات/أطفال: الأحد-الأربعاء [0,1,2,3]
 * - فتيات/تثبيت: الأحد-الخميس [0,1,2,3,4]
 */
export function getExpectedEntryDays(
  dataEntryType: string | null | undefined,
  circleName: string | null | undefined,
): number[] {
  if (dataEntryType === "recitation") {
    return SPECIAL_MISHKAH_NAME.test(circleName ?? "") ? TUESDAY_ONLY : SUN_TO_WED;
  }
  if (dataEntryType === "mothers" || dataEntryType === "children") {
    return SUN_TO_WED;
  }
  // الأنواع العادية: فتيات (girls)، تثبيت (fixation)، وأي نوع آخر
  return SUN_TO_THU;
}

/** هل يُتوقع إدخال بيانات لهذه الحلقة بتاريخ dateStr (YYYY-MM-DD)؟ */
export function isEntryExpectedOn(
  dataEntryType: string | null | undefined,
  circleName: string | null | undefined,
  dateStr: string,
): boolean {
  const days = getExpectedEntryDays(dataEntryType, circleName);
  const dow = new Date(dateStr + "T12:00:00Z").getUTCDay();
  return days.includes(dow);
}
