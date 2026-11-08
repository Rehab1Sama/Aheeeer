// قاعدة التقصير اليومي — مصدر واحد لكل الصفحات (صفحة التقصير، الإحصائيات، الشهادات، ملف الطالبة).
// كانت مكتوبة بخمس صيغ مختلفة فتختلف الأرقام بين الصفحات.
//
//   الغائبة لا تقصير عليها.
//   تعديل المسؤولة اليدوي (shortcomingOverride) يُقدَّم على كل شيء.
//   الأمهات والأطفال: لا تقصير تلقائي.
//   الفتيات: تقصير واحد إن خلا اليوم من كل مراجعة (القريبة والبعيدة ١ و٢).
//   بقية المسارات (مشكاة، سُنى…): تقصير إن سُجّل أنها لم تسمع للقارئ.
export interface ShortcomingRecordLike {
  isAbsent: boolean;
  shortcomingOverride?: boolean | null;
  reviewNearPages?: number | null;
  reviewFarPages?: number | null;
  reviewFar2Pages?: number | null;
  reviewPages?: number | null;
  listenedToReciter?: boolean | null;
}

export type ShortcomingReason = "review" | "listen";

/** سبب التقصير التلقائي (قبل التعديل اليدوي)، أو null. */
export function autoShortcomingReason(r: ShortcomingRecordLike, trackType: string | null | undefined): ShortcomingReason | null {
  if (r.isAbsent) return null;
  const t = trackType ?? "girls";
  if (t === "children" || t === "mothers") return null;
  if (t === "girls") {
    const noReview = (r.reviewNearPages ?? 0) === 0 && (r.reviewFarPages ?? 0) === 0
      && (r.reviewFar2Pages ?? 0) === 0 && (r.reviewPages ?? 0) === 0;
    return noReview ? "review" : null;
  }
  return r.listenedToReciter === false ? "listen" : null;
}

/** هل اليوم تقصير؟ (مع التعديل اليدوي) */
export function isShortcomingRecord(r: ShortcomingRecordLike, trackType: string | null | undefined): boolean {
  if (r.isAbsent) return false;
  if (r.shortcomingOverride != null) return r.shortcomingOverride;
  return autoShortcomingReason(r, trackType) !== null;
}
