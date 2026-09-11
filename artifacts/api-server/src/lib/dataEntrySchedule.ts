// جدول أيام العمل الأسبوعية حسب نوع إدخال البيانات (dataEntryType) للحلقة.
// المستخدم لإخفاء تنبيهات "لم يتم إدخال البيانات" في الأيام اللي أصلًا
// ما فيها إدخال متوقع لهذا النوع من الحلقات (مثل مشكاة/الأطفال/الأمهات).
//
// getUTCDay(): الأحد=0، الاثنين=1، الثلاثاء=2، الأربعاء=3، الخميس=4، الجمعة=5، السبت=6

const SUN_TO_WED = [0, 1, 2, 3];
const TUESDAY_ONLY = [2];

// حلقات مشكاة ٢ و٥ تحديدًا تشتغل الثلاثاء فقط، بقية حلقات مشكاة من الأحد للأربعاء
const SPECIAL_MISHKAH_NAME = /مشكاة\s*[25٢٥](\D|$)/;

/**
 * الأيام المتوقع فيها إدخال بيانات لهذا النوع من الحلقات.
 * null = بدون قيد (كل الأيام)، يشمل الأنواع العادية (فتيات/تثبيت/بسيطة...) ولم تتغير.
 */
export function getExpectedEntryDays(
  dataEntryType: string | null | undefined,
  circleName: string | null | undefined,
): number[] | null {
  if (dataEntryType === "recitation") {
    return SPECIAL_MISHKAH_NAME.test(circleName ?? "") ? TUESDAY_ONLY : SUN_TO_WED;
  }
  if (dataEntryType === "mothers" || dataEntryType === "children") {
    return SUN_TO_WED;
  }
  return null;
}

/** هل يُتوقع إدخال بيانات لهذه الحلقة بتاريخ dateStr (YYYY-MM-DD)؟ */
export function isEntryExpectedOn(
  dataEntryType: string | null | undefined,
  circleName: string | null | undefined,
  dateStr: string,
): boolean {
  const days = getExpectedEntryDays(dataEntryType, circleName);
  if (!days) return true;
  const dow = new Date(dateStr + "T12:00:00Z").getUTCDay();
  return days.includes(dow);
}
