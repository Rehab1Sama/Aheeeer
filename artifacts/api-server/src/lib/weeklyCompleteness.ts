// منطق "اكتمال إدخال الأسبوع" لوسام أقمر الحلقة — دالة نقية بلا أي اعتماد على
// قاعدة البيانات حتى يسهل اختبارها.
//
// القاعدة: الحلقة تُعتبر مكتملة الإدخال لو كل طالبة نشيطة عندها سجل بكل يوم
// دوام متوقع، مع استثناءين عادلين:
//   ١. أيام غياب المعلمة المسجّلة (ما فيه حلقة أصلًا ذاك اليوم).
//   ٢. الأيام اللي الطالبة فيها في إجازة رسمية (ما يُتوقع لها إدخال).
// ولازم يبقى على الأقل خلية واحدة مطلوبة فعليًا، وإلا (كل الأيام غياب معلمة
// أو كل الطالبات في إجازة) ما نعتبرها مكتملة — ما فيه إدخال حقيقي نكافئه.

export interface RosterStudent {
  id: number;
  leaveStart?: string | null;
  leaveEnd?: string | null;
}

export interface LeaveRange {
  start?: string | null;
  end?: string | null;
}

/** هل التاريخ (YYYY-MM-DD) يقع ضمن أي فترة إجازة من القائمة؟ */
export function isWithinLeave(date: string, ...ranges: Array<LeaveRange | undefined | null>): boolean {
  return ranges.some((r) => !!(r && r.start && r.end && r.start <= date && date <= r.end));
}

export function isCircleFullyRecorded(opts: {
  students: RosterStudent[];
  expectedDates: string[];
  teacherAbsentDates: ReadonlySet<string>;
  recordedDatesByStudent: ReadonlyMap<number, ReadonlySet<string>>;
  enrollmentLeaveByStudent?: ReadonlyMap<number, LeaveRange>;
}): boolean {
  const { students, expectedDates, teacherAbsentDates, recordedDatesByStudent, enrollmentLeaveByStudent } = opts;
  const requiredDates = expectedDates.filter((d) => !teacherAbsentDates.has(d));
  if (students.length === 0 || requiredDates.length === 0) return false;

  let anyRequiredCell = false;
  for (const st of students) {
    const recorded = recordedDatesByStudent.get(st.id);
    const ownLeave: LeaveRange = { start: st.leaveStart, end: st.leaveEnd };
    const enrLeave = enrollmentLeaveByStudent?.get(st.id);
    for (const d of requiredDates) {
      if (isWithinLeave(d, ownLeave, enrLeave)) continue;
      anyRequiredCell = true;
      if (!recorded || !recorded.has(d)) return false;
    }
  }
  return anyRequiredCell;
}
