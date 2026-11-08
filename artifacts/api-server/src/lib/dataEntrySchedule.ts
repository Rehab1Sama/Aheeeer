// جدول أيام العمل الأسبوعية حسب نوع إدخال البيانات (dataEntryType) للحلقة.
// المستخدم لإخفاء تنبيهات "لم يتم إدخال البيانات" في الأيام اللي أصلًا
// ما فيها إدخال متوقع لهذا النوع من الحلقات (مثل مشكاة/الأطفال/الأمهات).
//
// getUTCDay(): الأحد=0، الاثنين=1، الثلاثاء=2، الأربعاء=3، الخميس=4، الجمعة=5، السبت=6

const SUN_TO_WED = [0, 1, 2, 3];          // الأحد-الأربعاء (مشكاة/أمهات/أطفال/تثبيت سُنى)
const SUN_TO_THU = [0, 1, 2, 3, 4];      // الأحد-الخميس (فتيات)

/**
 * الأيام المتوقع فيها إدخال بيانات لهذا النوع من الحلقات.
 * 
 * جدول الأيام:
 * - مشكاة (كل الحلقات): الأحد-الأربعاء [0,1,2,3]
 * - أمهات/أطفال: الأحد-الأربعاء [0,1,2,3]
 * - تثبيت (مسار سُنى): الأحد-الأربعاء [0,1,2,3] — لا يوجد إدخال يوم الخميس
 *   (يتوافق مع إيقاع خطة التثبيت في reviewPlans.ts: أحد-أربعاء)
 * - فتيات (وأي نوع آخر): الأحد-الخميس [0,1,2,3,4]
 */
export function getExpectedEntryDays(
  dataEntryType: string | null | undefined,
  circleName: string | null | undefined,
): number[] {
  void circleName; // كان لمشكاة ٢ و٥ (الثلاثاء فقط)؛ صارتا مثل بقية حلقات مشكاة
  if (dataEntryType === "recitation" || dataEntryType === "mothers" || dataEntryType === "children" || dataEntryType === "fixation") {
    return SUN_TO_WED;
  }
  // الأنواع العادية: فتيات (girls) وأي نوع آخر
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
