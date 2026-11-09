// ============================================================================
// محرك حساب الأوسمة اللحظي (live) — بدون أي كتابة بقاعدة البيانات.
// ============================================================================
// كل دالة هنا تُحسب استحقاق وسام مباشرة من البيانات الفعلية (سجلات، خطط...).
// راجعي lib/badgeDefinitions.ts للأسماء والنصوص والدرجات.
// ============================================================================

import { db, recordsTable, circlesTable, studentsTable, studentEnrollmentsTable, teacherAbsencesTable, tracksTable, dailyCircleTasksTable, trackSupervisorNamesTable, reviewPlansTable, reviewPlanDaysTable, globalSettingsTable } from "@workspace/db";
import { eq, and, gte, lte, inArray } from "drizzle-orm";
import { getLastCompletedWeekStart, addDaysStr, getMakkahDay, minutesSinceMakkahDayStart, ONE_AM_MINUTES_SINCE_DAY_START } from "./date";
import { computeShortcoming } from "../routes/shortcomings";
import { isEntryExpectedOn } from "./dataEntrySchedule";
import { isCircleFullyRecorded, type RosterStudent, type LeaveRange } from "./weeklyCompleteness";
import { getPlanCycleDates, getEffectiveEndDate, PLAN_TOTAL_DAYS, type PlanType } from "../routes/reviewPlans";
import { getBadgeTier, type BadgeTierDefinition } from "./badgeDefinitions";
import { reviewCompletions } from "./reviewCompletion";

export interface EarnedBadge {
  badgeId: string;
  tier: number;
  name: string;
  subtitle: string;
  emoji: string;
  image: string | null;
  thumb: string | null;
  color: string;
}

function tierToEarned(badgeId: string, t: BadgeTierDefinition): EarnedBadge {
  return { badgeId, tier: t.tier, name: t.name, subtitle: t.subtitle, emoji: t.emoji, image: t.image ?? null, thumb: t.thumb ?? null, color: t.color };
}

// ── ١. أقمر الحلقة (٤ درجات) — حسب أسبوع محدد (افتراضيًا آخر أسبوع مكتمل) ──

/**
 * يرجّع خريطة circleId -> عدد الغياب خلال الأسبوع، و hasAnyRecord = هل فيه إدخال
 * بيانات فعلي **وكامل** بالحلقة (مو مجرد سجل واحد).
 *
 * 🐛 تصحيح: hasAnyRecord سابقًا كانت تصير true بمجرد وجود سجل واحد بالحلقة —
 * فحلقة أدخلت بيانات طالبة أو طالبتين بس (والباقي بدون أي سجل أصلًا) كانت
 * تُحسب "صفر غياب" وهميًا، لأن absenceCount يُحسب فقط من السجلات الموجودة
 * فعلًا ويتجاهل الطالبات اللي ما انسجل حضورهن إطلاقًا. الحين hasAnyRecord ما
 * تصير true إلا لو *كل* طالبات الحلقة النشيطات عندهن سجل (حاضر أو غايب) مرة
 * على الأقل بالأسبوع — أي إدخال جزئي يُعامل معاملة "ما فيه إدخال أصلًا".
 *
 * ✅ استثناءات عادلة: لا يُطلب إدخال (١) في أيام غياب المعلمة المسجّلة بجدول
 * teacher_absences، ولا (٢) للطالبة في أيام إجازتها الرسمية. المنطق كله في
 * lib/weeklyCompleteness.ts. عدّ الغياب نفسه (absenceCount) ما تغيّر.
 */
export async function getCircleAbsenceCounts(weekStart: string, weekEnd: string, circleIds?: number[]) {
  const recordConditions = [gte(recordsTable.date, weekStart), lte(recordsTable.date, weekEnd)];
  if (circleIds && circleIds.length > 0) recordConditions.push(inArray(recordsTable.circleId, circleIds));

  const weekRecords = await db.select({ circleId: recordsTable.circleId, studentId: recordsTable.studentId, date: recordsTable.date, isAbsent: recordsTable.isAbsent })
    .from(recordsTable).where(and(...recordConditions));

  const absenceCount: Record<number, number> = {};
  const recordedDatesByStudent = new Map<number, Set<string>>();
  for (const r of weekRecords) {
    if (r.isAbsent) absenceCount[r.circleId] = (absenceCount[r.circleId] ?? 0) + 1;
    let dates = recordedDatesByStudent.get(r.studentId);
    if (!dates) { dates = new Set(); recordedDatesByStudent.set(r.studentId, dates); }
    dates.add(r.date);
  }

  const circleConditions = [eq(circlesTable.isArchived, false)];
  if (circleIds && circleIds.length > 0) circleConditions.push(inArray(circlesTable.id, circleIds));
  const [circlesInfo, allTracks, activeStudents] = await Promise.all([
    db.select({ id: circlesTable.id, name: circlesTable.name, trackType: circlesTable.trackType, trackId: circlesTable.trackId })
      .from(circlesTable).where(and(...circleConditions)),
    db.select().from(tracksTable),
    (async () => {
      const studentConditions = [eq(studentsTable.isArchived, false)];
      if (circleIds && circleIds.length > 0) studentConditions.push(inArray(studentsTable.circleId, circleIds));
      return db.select({ id: studentsTable.id, circleId: studentsTable.circleId, leaveStart: studentsTable.leaveStart, leaveEnd: studentsTable.leaveEnd }).from(studentsTable).where(and(...studentConditions));
    })(),
  ]);

  // أيام غياب المعلمة + إجازات التسجيل (enrollments) خلال الأسبوع — تُستثنى من شرط الاكتمال
  const teacherAbsentByCircle = new Map<number, Set<string>>();
  const enrollmentLeave = new Map<string, LeaveRange>(); // مفتاح: studentId|circleId
  {
    const taConditions = [gte(teacherAbsencesTable.date, weekStart), lte(teacherAbsencesTable.date, weekEnd)];
    if (circleIds && circleIds.length > 0) taConditions.push(inArray(teacherAbsencesTable.circleId, circleIds));
    const enrConditions = [eq(studentEnrollmentsTable.isArchived, false)];
    if (circleIds && circleIds.length > 0) enrConditions.push(inArray(studentEnrollmentsTable.circleId, circleIds));
    const [taRows, enrRows] = await Promise.all([
      db.select({ circleId: teacherAbsencesTable.circleId, date: teacherAbsencesTable.date }).from(teacherAbsencesTable).where(and(...taConditions)),
      db.select({ studentId: studentEnrollmentsTable.studentId, circleId: studentEnrollmentsTable.circleId, leaveStart: studentEnrollmentsTable.leaveStart, leaveEnd: studentEnrollmentsTable.leaveEnd })
        .from(studentEnrollmentsTable).where(and(...enrConditions)),
    ]);
    for (const t of taRows) {
      let set = teacherAbsentByCircle.get(t.circleId);
      if (!set) { set = new Set(); teacherAbsentByCircle.set(t.circleId, set); }
      set.add(t.date);
    }
    for (const e of enrRows) {
      if (e.leaveStart && e.leaveEnd) enrollmentLeave.set(`${e.studentId}|${e.circleId}`, { start: e.leaveStart, end: e.leaveEnd });
    }
  }
  const trackById = new Map(allTracks.map(t => [t.id, t]));

  const activeByCircle = new Map<number, RosterStudent[]>();
  for (const s of activeStudents) {
    if (s.circleId == null) continue;
    let list = activeByCircle.get(s.circleId);
    if (!list) { list = []; activeByCircle.set(s.circleId, list); }
    list.push({ id: s.id, leaveStart: s.leaveStart, leaveEnd: s.leaveEnd });
  }

  // الأيام الخمسة (أحد-خميس) ضمن نطاق هذا الأسبوع — نفلترها لكل حلقة حسب
  // أيامها المتوقعة فعليًا (بعض الأنواع أحد-أربعاء بس)
  const weekDates = [0, 1, 2, 3, 4].map(i => addDaysStr(weekStart, i));

  const hasAnyRecord = new Set<number>();
  for (const circle of circlesInfo) {
    const roster = activeByCircle.get(circle.id);
    if (!roster || roster.length === 0) continue;

    const dataEntryType = circle.trackId
      ? (trackById.get(circle.trackId)?.dataEntryType ?? circle.trackType ?? "girls")
      : (circle.trackType ?? "girls");

    const expectedDates = weekDates.filter(d => isEntryExpectedOn(dataEntryType, circle.name, d));
    if (expectedDates.length === 0) continue; // احتياطي، ما يفترض يصير

    // كل طالبة نشيطة لازم عندها سجل بكل يوم من أيام الحلقة المتوقعة (مو يوم واحد بس)،
    // عدا أيام غياب المعلمة وأيام إجازة الطالبة (انظري weeklyCompleteness.ts)
    const enrollmentLeaveByStudent = new Map<number, LeaveRange>();
    for (const st of roster) {
      const l = enrollmentLeave.get(`${st.id}|${circle.id}`);
      if (l) enrollmentLeaveByStudent.set(st.id, l);
    }
    const fullyRecorded = isCircleFullyRecorded({
      students: roster,
      expectedDates,
      teacherAbsentDates: teacherAbsentByCircle.get(circle.id) ?? new Set<string>(),
      recordedDatesByStudent,
      enrollmentLeaveByStudent,
    });
    if (fullyRecorded) hasAnyRecord.add(circle.id);
  }

  return { hasAnyRecord, absenceCount };
}

/**
 * درجة وسام "أقمر الحلقة" لحلقة واحدة خلال أسبوع معيّن.
 * يرجّع null لو ما فيه إدخال بيانات فعلي بالأسبوع، أو لو الغياب ٤ فأكثر (لا وسام).
 */
export async function computeCircleWeeklyMoonBadge(
  circleId: number,
  weekStart: string = getLastCompletedWeekStart(),
): Promise<EarnedBadge | null> {
  const weekEnd = addDaysStr(weekStart, 4);
  const { hasAnyRecord, absenceCount } = await getCircleAbsenceCounts(weekStart, weekEnd, [circleId]);
  if (!hasAnyRecord.has(circleId)) return null; // ما فيه إدخال بيانات فعلي

  const absences = absenceCount[circleId] ?? 0;
  if (absences > 3) return null; // لا وسام من ٤ غياب فأكثر

  const tierDef = getBadgeTier("circle_weekly_moon", absences);
  return tierDef ? tierToEarned("circle_weekly_moon", tierDef) : null;
}

/** نفس الحساب أعلاه لكل الحلقات النشطة دفعة وحدة (يُستخدم بالـ cron الأسبوعي) */
export async function computeAllCirclesWeeklyMoonBadges(
  weekStart: string = getLastCompletedWeekStart(),
): Promise<Map<number, EarnedBadge>> {
  const weekEnd = addDaysStr(weekStart, 4);
  const circles = await db.select({ id: circlesTable.id, trackType: circlesTable.trackType })
    .from(circlesTable).where(eq(circlesTable.isArchived, false));
  const eligibleIds = circles
    .filter(c => c.trackType !== "archive" && c.trackType !== "registration")
    .map(c => c.id);
  if (eligibleIds.length === 0) return new Map();

  const { hasAnyRecord, absenceCount } = await getCircleAbsenceCounts(weekStart, weekEnd, eligibleIds);

  const result = new Map<number, EarnedBadge>();
  for (const id of eligibleIds) {
    if (!hasAnyRecord.has(id)) continue;
    const absences = absenceCount[id] ?? 0;
    if (absences > 3) continue;
    const tierDef = getBadgeTier("circle_weekly_moon", absences);
    if (tierDef) result.set(id, tierToEarned("circle_weekly_moon", tierDef));
  }
  return result;
}

// ── ٣. حضور فترة كاملة بلا غياب (فردي) — نطاق تاريخ حر ────────────────────
// معاد هيكلتها: الدالة العامة تقبل [dateFrom, dateTo] حرّة (تحددها القائدة من
// صفحة "مستحقات الأوسمة")، بدل شهر تقويمي ثابت لازم ينتهي أولًا. الغلاف
// الشهري (أدناه) موجود فقط للتوافق مع أي استخدام قديم بمعامل month=YYYY-MM.

/**
 * حضور كامل بلا أي غياب خلال [dateFrom, dateTo] (شاملة الطرفين).
 * null لو ما فيه إدخال بيانات فعلي **وكامل** بالفترة.
 *
 * 🐛 تصحيح (نفس فكرة تصحيح hasAnyRecord لأقمر الحلقة أعلاه): سابقًا كانت
 * الدالة تمنح الوسام بمجرد وجود سجلات وما فيها أي غياب — حتى لو كانت
 * السجلات تغطي جزء بسيط من الفترة بس (طالبة انضمت متأخرة، رجعت من إجازة،
 * أو نقص إدخال لبقية الأيام). الحين لازم يكون عندها سجل بكل يوم من أيام
 * الإدخال المتوقعة لحلقتها ضمن الفترة كاملة، وإلا تُعامل معاملة "ما فيه
 * إدخال كافٍ" (null) — مو استحقاق فعلي.
 */
export async function computeStudentPerfectAttendanceInRange(
  studentId: number,
  dateFrom: string,
  dateTo: string,
): Promise<EarnedBadge | null> {
  const [student] = await db.select({ circleId: studentsTable.circleId, isArchived: studentsTable.isArchived })
    .from(studentsTable).where(eq(studentsTable.id, studentId));
  if (!student?.circleId || student.isArchived) return null;

  const [circle] = await db.select({ name: circlesTable.name, trackType: circlesTable.trackType, trackId: circlesTable.trackId })
    .from(circlesTable).where(eq(circlesTable.id, student.circleId));
  if (!circle) return null;

  const dataEntryType = circle.trackId
    ? ((await db.select().from(tracksTable).where(eq(tracksTable.id, circle.trackId)))[0]?.dataEntryType ?? circle.trackType ?? "girls")
    : (circle.trackType ?? "girls");

  const expectedDates: string[] = [];
  for (let d = dateFrom; d <= dateTo; d = addDaysStr(d, 1)) {
    if (isEntryExpectedOn(dataEntryType, circle.name, d)) expectedDates.push(d);
  }
  if (expectedDates.length === 0) return null;

  const recs = await db.select({ date: recordsTable.date, isAbsent: recordsTable.isAbsent })
    .from(recordsTable)
    .where(and(eq(recordsTable.studentId, studentId), gte(recordsTable.date, dateFrom), lte(recordsTable.date, dateTo)));

  const recordedDates = new Set(recs.map(r => r.date));
  const fullyRecorded = expectedDates.every(d => recordedDates.has(d));
  if (!fullyRecorded) return null; // إدخال ناقص لبعض الأيام المتوقعة — مو استحقاق فعلي بعد

  if (recs.some(r => r.isAbsent)) return null;

  const tierDef = getBadgeTier("monthly_perfect", 0);
  return tierDef ? tierToEarned("monthly_perfect", tierDef) : null;
}

/** شهر ميلادي كامل بلا أي غياب. month بصيغة YYYY-MM، افتراضيًا الشهر الحالي (توقيت مكة) */
export async function computeStudentMonthlyPerfectAttendance(
  studentId: number,
  month: string = getMakkahDay().slice(0, 7),
): Promise<EarnedBadge | null> {
  const monthStart = `${month}-01`;
  const [y, m] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const monthEnd = `${month}-${String(lastDay).padStart(2, "0")}`;
  return computeStudentPerfectAttendanceInRange(studentId, monthStart, monthEnd);
}

// ── ٤. التطور — تحسّن غياب الطالبة هالأسبوع مقارنة باللي قبله ──────────────
// "شع نورك" يقارن بين آخر أسبوعين متتاليين فقط. لو الأسبوع السابق بالكامل
// قبل بداية الفصل الحالي (term_start_date بالإعدادات)، ما فيه أساس عادل
// للمقارنة — يعني الوسام فعليًا ما يبدأ إلا من ثاني أسبوع بالفصل. لو
// term_start_date مو محدد أصلًا، نتجاهل هذا الشرط (نفس السلوك القديم).
const TERM_START_SETTING_KEY = "term_start_date";

async function getTermStartDate(): Promise<string | null> {
  const [row] = await db.select().from(globalSettingsTable).where(eq(globalSettingsTable.key, TERM_START_SETTING_KEY));
  return row?.value || null;
}

export async function computeStudentImprovement(
  studentId: number,
  weekStart: string = getLastCompletedWeekStart(),
): Promise<EarnedBadge | null> {
  // مُعطَّل مؤقتًا بطلب من المستخدمة — ما يشتغل إلا بدءًا من هالتاريخ (أول أسبوع
  // بعد تاريخ هذا التعديل). لو حبيتي تفعّلينه فورًا لاحقًا، غيّري التاريخ هنا.
  const IMPROVEMENT_BADGE_ACTIVE_FROM = "2026-09-13";
  if (weekStart < IMPROVEMENT_BADGE_ACTIVE_FROM) return null;

  const weekEnd = addDaysStr(weekStart, 4);
  const prevWeekStart = addDaysStr(weekStart, -7);
  const prevWeekEnd = addDaysStr(prevWeekStart, 4);

  const termStart = await getTermStartDate();
  if (termStart && prevWeekEnd < termStart) return null; // الأسبوع السابق بالكامل قبل بداية الفصل — لا مقارنة عادلة بعد

  const [thisWeek, prevWeek] = await Promise.all([
    db.select({ isAbsent: recordsTable.isAbsent }).from(recordsTable)
      .where(and(eq(recordsTable.studentId, studentId), gte(recordsTable.date, weekStart), lte(recordsTable.date, weekEnd))),
    db.select({ isAbsent: recordsTable.isAbsent }).from(recordsTable)
      .where(and(eq(recordsTable.studentId, studentId), gte(recordsTable.date, prevWeekStart), lte(recordsTable.date, prevWeekEnd))),
  ]);

  // لازم إدخال فعلي بالأسبوعين عشان تكون المقارنة عادلة
  if (thisWeek.length === 0 || prevWeek.length === 0) return null;

  const thisAbsences = thisWeek.filter(r => r.isAbsent).length;
  const prevAbsences = prevWeek.filter(r => r.isAbsent).length;

  if (thisAbsences >= prevAbsences) return null; // ما فيه تحسّن

  const tierDef = getBadgeTier("improvement", 0);
  return tierDef ? tierToEarned("improvement", tierDef) : null;
}

// ── ٥. مسارنا الأحب — صفر تقصير بكل حلقات المسار خلال الأسبوع ─────────────

/**
 * ملاحظة تقنية: نطابق المسار عبر حقل circles.track النصي (نفس الحقل المستخدم
 * أصلًا بمنطق قمر الأسبوع وبنظام الرسائل لاستهداف مسؤولة المسار)، مو عبر
 * tracks.id/tracksTable — عشان التوافق مع بقية الكود الحالي. لو تقرر المستخدمة
 * لاحقًا توحيد الاثنين لازم نراجع هذي الدالة معهم.
 */
export async function computeTrackNoShortcoming(
  trackName: string,
  weekStart: string = getLastCompletedWeekStart(),
): Promise<EarnedBadge | null> {
  const weekEnd = addDaysStr(weekStart, 4);

  const trackCircles = await db.select().from(circlesTable)
    .where(and(eq(circlesTable.track, trackName), eq(circlesTable.isArchived, false)));
  if (trackCircles.length === 0) return null;
  const circleIds = trackCircles.map(c => c.id);

  const allTracks = await db.select().from(tracksTable);
  const circleTrackTypeMap: Record<number, string> = {};
  for (const c of trackCircles) {
    if (c.trackId) {
      const t = allTracks.find(t => t.id === c.trackId);
      circleTrackTypeMap[c.id] = t?.dataEntryType ?? c.trackType ?? "girls";
    } else {
      circleTrackTypeMap[c.id] = c.trackType ?? "girls";
    }
  }

  const weekRecords = await db.select().from(recordsTable)
    .where(and(inArray(recordsTable.circleId, circleIds), gte(recordsTable.date, weekStart), lte(recordsTable.date, weekEnd)));

  if (weekRecords.length === 0) return null; // ما فيه إدخال بيانات فعلي

  const presentRecords = weekRecords.filter(r => !r.isAbsent);
  if (presentRecords.length === 0) return null;

  const studentIds = [...new Set(presentRecords.map(r => r.studentId))];
  const students = studentIds.length > 0
    ? await db.select({ id: studentsTable.id, isNewcomer: studentsTable.isNewcomer, createdAt: studentsTable.createdAt })
        .from(studentsTable).where(inArray(studentsTable.id, studentIds))
    : [];
  const studentMap = new Map(students.map(s => [s.id, s]));

  const anyShortcoming = presentRecords.some(r => {
    const student = studentMap.get(r.studentId);
    const { isShortcoming } = computeShortcoming(
      r, circleTrackTypeMap[r.circleId], student?.isNewcomer ?? false, student?.createdAt ?? null,
    );
    return isShortcoming;
  });

  if (anyShortcoming) return null;

  const tierDef = getBadgeTier("track_no_shortcoming", 0);
  return tierDef ? tierToEarned("track_no_shortcoming", tierDef) : null;
}

// ── ٢. إنهاء خطة المراجعة — حسب دورة المراجعة الفعلية ─────────────────────
// المعيار: بعد ما تنتهي دورة الطالبة (اليوم > تاريخ نهاية الدورة الفعلي —
// نفس getEffectiveEndDate المستخدم بصفحة الخطة)، نقارن تراكم المُنجَز (من
// records.reviewFarPages للمراجعة أو records.reviewPages للتثبيت) بتراكم
// المطلوب (من review_plan_days.pages) يوم بيوم طول الدورة:
//   - ما تأخرت أي يوم (المُنجَز ≥ المطلوب تراكميًا كل يوم) → "أنهت بوقتها"
//   - تأخرت بس لحقت (وصل المُنجَز للمطلوب بنهاية الدورة رغم تعثر بالمنتصف) → "تأخرت بس وصلت"
//   - ما لحقت للنهاية → بدون وسام (الدرجة الثالثة "تذكير" أُلغيت بقرار من المستخدمة —
//     getBadgeTier ترجع null تلقائيًا لأن تعريف الدرجة ٢ ما عاد موجود بـ badgeDefinitions.ts)
// نأخذ آخر دورة منتهية للطالبة (من أي نوع: مراجعة أو تثبيت)، ونتجاهل الدورات
// المنتهية من أكثر من ضعف طولها عشان ما يعلق الوسام للأبد.
// ⚠️ تبسيط مقصود: ما يعيد نفس خوارزمية الألوان اليومية (ahead/ontrack/behind
// مع قاعدة "الاستدراك" بالضبط) الموجودة بـ ReviewPlanSection.tsx — يعتمد على
// المجاميع التراكمية فقط، وهو أبسط لكن يعكس نفس الفكرة. راجعيه مع المستخدمة
// لو حبت مطابقة أدق لاحقًا.
export async function computeReviewPlanCompletion(studentId: number): Promise<EarnedBadge | null> {
  // المصدر الموحّد (lib/reviewCompletion.ts): نفس حساب صفحة الخطط
  const [c] = await reviewCompletions(getMakkahDay(), studentId);
  if (!c) return null;
  const tierDef = getBadgeTier("review_plan_completion", c.tier);
  return tierDef ? tierToEarned("review_plan_completion", tierDef) : null;
}

// ── ٦. فخر الأسبوع (مسؤولة المسار) ────────────────────────────────────────
// معيار مُعتمَد (حسب الهاندوف الأصلي — نهائي): **متوسط** وقت انتهاء شغل المسار
// قبل الساعة ١ بالليل، محسوب فقط عبر الليالي اللي فيها دوام فعلي (نستثني
// حلقات زي "مشكاة ٢/٥" اللي تشتغل الثلاثاء بس، عبر isEntryExpectedOn). هذا
// متوسط مو شرط "كل ليلة قبل ١" — عادي لو ليلة أو ليلتين تجاوزت الساعة ١، طالما
// المتوسط العام قبلها.
// "انتهاء الشغل" ليوم معيّن = آخر وقت بين (كل حلقات المسار المتوقع دوامها
// هالليلة أدخلت بياناتها بـ records) و(كل حلقة عندها سجل بـ daily_circle_tasks
// لليوم) — أي أقصى وقت (createdAt) بين الاثنين، لكل حلقات المسار المتوقعة.

/** آخر وقت إدخال (records أو daily_circle_tasks) لمجموعة حلقات بتاريخ معيّن، أو null لو ما فيه بيانات */
async function getTrackFinishTime(circleIds: number[], date: string): Promise<Date | null> {
  if (circleIds.length === 0) return null;
  const [recRows, taskRows] = await Promise.all([
    db.select({ createdAt: recordsTable.createdAt }).from(recordsTable)
      .where(and(inArray(recordsTable.circleId, circleIds), eq(recordsTable.date, date))),
    db.select({ createdAt: dailyCircleTasksTable.createdAt }).from(dailyCircleTasksTable)
      .where(and(inArray(dailyCircleTasksTable.circleId, circleIds), eq(dailyCircleTasksTable.date, date))),
  ]);
  const timestamps = [...recRows.map(r => r.createdAt), ...taskRows.map(r => r.createdAt)].filter((d): d is Date => !!d);
  if (timestamps.length === 0) return null;
  return new Date(Math.max(...timestamps.map(d => d.getTime())));
}

export async function computeSupervisorWeeklyCommitment(
  supervisorNameId: number,
  weekStart: string = getLastCompletedWeekStart(),
): Promise<EarnedBadge | null> {
  // مُعطَّل مؤقتًا بطلب من المستخدمة — ما يشتغل إلا بدءًا من هالتاريخ (أول أسبوع
  // يُعلن جمعته القادمة). لو حبيتي تفعّلينه فورًا لاحقًا، غيّري التاريخ هنا.
  const TRACK_SUPERVISOR_PRIDE_ACTIVE_FROM = "2026-09-13";
  if (weekStart < TRACK_SUPERVISOR_PRIDE_ACTIVE_FROM) return null;

  const [nameRow] = await db.select().from(trackSupervisorNamesTable).where(eq(trackSupervisorNamesTable.id, supervisorNameId));
  if (!nameRow) return null;

  const [track] = await db.select().from(tracksTable).where(eq(tracksTable.id, nameRow.trackId));
  const trackCircles = await db.select({ id: circlesTable.id, name: circlesTable.name, trackType: circlesTable.trackType })
    .from(circlesTable).where(and(eq(circlesTable.trackId, nameRow.trackId), eq(circlesTable.isArchived, false)));
  if (trackCircles.length === 0) return null;

  const workDays = Array.from({ length: 5 }, (_, i) => addDaysStr(weekStart, i));
  const finishMinutesList: number[] = [];

  for (const date of workDays) {
    // فقط الحلقات المتوقع دوامها هالليلة
    const expectedCircleIds = trackCircles
      .filter(c => isEntryExpectedOn(track?.dataEntryType ?? c.trackType ?? null, c.name, date))
      .map(c => c.id);
    if (expectedCircleIds.length === 0) continue; // ما فيه دوام متوقع لأي حلقة بالمسار هالليلة

    const finish = await getTrackFinishTime(expectedCircleIds, date);
    if (!finish) continue; // ما فيه بيانات فعلية هالليلة رغم توقع الدوام — تُستثنى من المتوسط، مو تُحسب كتأخير

    finishMinutesList.push(minutesSinceMakkahDayStart(date, finish));
  }

  if (finishMinutesList.length === 0) return null; // ما فيه بيانات كافية بالأسبوع للحكم

  const avgMinutes = finishMinutesList.reduce((a, b) => a + b, 0) / finishMinutesList.length;
  if (avgMinutes > ONE_AM_MINUTES_SINCE_DAY_START) return null;

  const tierDef = getBadgeTier("track_supervisor_pride", 0);
  return tierDef ? tierToEarned("track_supervisor_pride", tierDef) : null;
}
