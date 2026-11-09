import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useListStudents, useGetCurrentUser, useListRecords } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BadgeChip } from "@/components/badges/BadgeChip";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Users, Archive, Loader2, MessageCircle, BookOpen, CalendarDays, CheckCircle2, History } from "lucide-react";
import { makeWhatsAppLink } from "@/lib/utils";
import { computeDayRanges, type DayRangeSegment, formatPages } from "@/lib/quran";
import { getInputFields, getFieldLabel } from "@/lib/schoolConfig";
import MessagesSection from "@/components/MessagesSection";
import MonthlyLeaderboardCard from "@/components/MonthlyLeaderboardCard";
import { getCurrentPlanDay, getDayDates, formatArDate, getPlanRanges, type ReviewPlan } from "@/components/ReviewPlanSection";
import { isFreshBadge } from "@/lib/badgeWindow";

// حقول "الصفحات" القابلة للعرض من سجل يومي واحد، وكيفية استخراج كل حقل من الـ record.
// يُطابق تمامًا حقول الإدخال المُستخدمة في شاشة إدخال البيانات (data-entry.tsx)
// عبر getInputFields، حتى تُعرض لكل معلمة فقط ما تُدخله فعليًا لمسارها.
const PAGE_FIELD_GETTERS: Record<string, (r: any) => number> = {
  memorize: r => r?.memorizePages ?? 0,
  review_near: r => r?.reviewNearPages ?? 0,
  review_far: r => r?.reviewFarPages ?? 0,
  review: r => r?.reviewPages ?? 0,
  recitation: r => r?.recitationPages ?? 0,
};
const PAGE_FIELD_COLORS: Record<string, string> = {
  memorize: "text-teal-600",
  review_near: "text-blue-600",
  review_far: "text-indigo-600",
  review: "text-blue-600",
  recitation: "text-purple-600",
};
// ترتيب عرض ثابت ومنطقي (الحفظ/التثبيت أولًا، ثم المراجعات، ثم التلاوة، ثم التكرار)
const FIELD_DISPLAY_ORDER = ["memorize", "review_near", "review_far", "review", "recitation", "repetitions"];

function getVisiblePageFields(inputFields: string[]): string[] {
  return FIELD_DISPLAY_ORDER.filter(f => inputFields.includes(f) && (f in PAGE_FIELD_GETTERS || f === "repetitions"));
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function isOnLeave(student: any): boolean {
  const today = new Date().toISOString().slice(0, 10);
  if (!student.leaveStart) return false;
  if (student.leaveStart <= today && (!student.leaveEnd || student.leaveEnd >= today)) return true;
  return false;
}

function authHeader(): Record<string, string> {
  const token = localStorage.getItem("sana_auth_token");
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (token) h["Authorization"] = `Bearer ${token}`;
  return h;
}

// ─── Circle Plans Card ─────────────────────────────────────────────────────────
function CirclePlansCard({ circlePlans, trackType }: { circlePlans: ReviewPlan[]; trackType: string }) {
  const [expanded, setExpanded] = useState<number | null>(null);
  const isFixation = trackType === "fixation";
  const totalDays = isFixation ? 24 : 21;
  const planMode: "girls" | "fixation" = isFixation ? "fixation" : "girls";
  const today = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-bold flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-primary" />
          خطط الحلقة النشطة
          <span className="text-xs font-normal text-muted-foreground bg-muted rounded-full px-2 py-0.5">{circlePlans.length}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0 pb-2">
        <div className="divide-y divide-border/40">
          {circlePlans.map(plan => {
            const dates = getDayDates(plan.startDate, totalDays, planMode);
            const endDate = dates[dates.length - 1] ?? plan.startDate;
            const currentDay = getCurrentPlanDay(plan.startDate, totalDays, planMode);
            const isCompleted = today > endDate;
            const isOpen = expanded === plan.id;

            let statusBadge: React.ReactNode;
            if (isCompleted) {
              statusBadge = (
                <span className="flex items-center gap-1 text-[11px] bg-emerald-100 text-emerald-700 rounded-full px-2 py-0.5">
                  <CheckCircle2 className="w-3 h-3" />اكتملت
                </span>
              );
            } else if (currentDay === 0) {
              statusBadge = (
                <span className="text-[11px] bg-amber-100 text-amber-700 rounded-full px-2 py-0.5 flex items-center gap-1">
                  <CalendarDays className="w-3 h-3" />لم تبدأ
                </span>
              );
            } else {
              statusBadge = (
                <span className="text-[11px] bg-violet-100 text-violet-700 rounded-full px-2 py-0.5">
                  يوم {currentDay} / {totalDays}
                </span>
              );
            }

            return (
              <div key={plan.id} style={{ borderRight: `3px solid ${plan.themeColor}` }}>
                <button
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors text-right"
                  onClick={() => setExpanded(isOpen ? null : plan.id)}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm">{plan.studentName ?? "—"}</span>
                    {statusBadge}
                  </div>
                  <span className="text-xs text-muted-foreground">{formatArDate(plan.startDate)} ← {formatArDate(endDate)}</span>
                </button>
                {isOpen && (
                  <div className="px-4 pb-4">
                    {(() => {
                      const planRanges = getPlanRanges(plan);
                      // نطاق الأيام وتظليل المنجز من الخادم (النطاق الدقيق والعكس بالسور) — نفس صفحة «خطط المراجعة».
                      const computedRanges = plan.coverage?.dayRanges ?? (planRanges.length > 0 ? computeDayRanges(planRanges, plan.days ?? []) : null);
                      return (
                    <div className="overflow-x-auto rounded-xl border border-border/40 mt-1">
                      <table className="w-full text-xs min-w-[260px]">
                        <thead className="bg-muted/50">
                          <tr>
                            <th className="py-2 px-2 text-right font-semibold text-muted-foreground w-8">يوم</th>
                            <th className="py-2 px-2 text-right font-semibold text-muted-foreground">التاريخ</th>
                            <th className="py-2 px-2 text-right font-semibold text-muted-foreground">النطاق</th>
                            <th className="py-2 px-2 text-center font-semibold text-muted-foreground w-12">صفحات</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(plan.days ?? []).map((day: any, dayIndex: number) => {
                            const dateStr = dates[day.dayNumber - 1];
                            const isToday = day.dayNumber === currentDay;
                            const isPast = plan.coverage ? plan.coverage.coveredDays.includes(day.dayNumber) : day.dayNumber < currentDay;
                            return (
                              <tr key={day.dayNumber}
                                className={`border-t border-border/20 ${isToday ? "font-semibold" : ""}`}
                                style={isToday ? { background: plan.themeColor + "70" } : isPast ? { opacity: 0.45 } : {}}>
                                <td className="py-1.5 px-2 text-center text-muted-foreground font-mono">{day.dayNumber}</td>
                                <td className="py-1.5 px-2 text-muted-foreground text-[12px]">{dateStr ? formatArDate(dateStr) : "—"}</td>
                                <td className="py-1.5 px-2 text-[12px]">
                                  {day.surahStart
                                    ? `${day.surahStart}${day.ayahStart ? ` (${day.ayahStart}` : ""}${day.surahEnd && day.surahEnd !== day.surahStart ? ` ← ${day.surahEnd}` : ""}${day.ayahEnd ? ` ${day.ayahEnd})` : ""}`
                                    : computedRanges?.[dayIndex]?.map((segment: DayRangeSegment) =>
                                        `${segment.surahStart} آية ${segment.ayahStart} ← ${segment.surahEnd} آية ${segment.ayahEnd}`,
                                      ).join(" + ") || "—"}
                                </td>
                                <td className="py-1.5 px-2 text-center">{day.pages ?? "—"}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Student Full History Dialog ────────────────────────────────────────────────
function StudentHistoryDialog({
  student,
  records,
  visibleFields,
  onClose,
}: {
  student: { id: number; name: string } | null;
  records: any[];
  visibleFields: string[];
  onClose: () => void;
}) {
  return (
    <Dialog open={!!student} onOpenChange={open => !open && onClose()}>
      <DialogContent dir="rtl" className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="w-4 h-4 text-primary" />
            سجل التسميع الكامل — {student?.name}
          </DialogTitle>
        </DialogHeader>
        {records.length === 0 ? (
          <p className="text-center py-8 text-muted-foreground text-sm">لا توجد سجلات مسجّلة بعد</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border/40 max-h-[60vh] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 sticky top-0">
                <tr>
                  <th className="text-right py-2.5 px-3 font-semibold text-muted-foreground">التاريخ</th>
                  {visibleFields.map(field => (
                    <th key={field} className="text-right py-2.5 px-3 font-semibold text-muted-foreground">
                      {getFieldLabel(field)}
                    </th>
                  ))}
                  <th className="text-right py-2.5 px-3 font-semibold text-muted-foreground">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {records.map(r => (
                  <tr key={r.id} className="border-t border-border/30">
                    <td className="py-2 px-3 text-muted-foreground text-xs whitespace-nowrap">{formatArDate(r.date)}</td>
                    {visibleFields.map(field => (
                      <td key={field} className={`py-2 px-3 font-medium ${PAGE_FIELD_COLORS[field] ?? "text-foreground"}`}>
                        {field === "repetitions" ? (r.repetitions ?? "—") : formatPages(PAGE_FIELD_GETTERS[field]?.(r))}
                      </td>
                    ))}
                    <td className="py-2 px-3">
                      {r.isAbsent ? (
                        <Badge className="bg-rose-100 text-rose-700 border-0 text-xs">غائبة</Badge>
                      ) : (
                        <Badge className="bg-emerald-100 text-emerald-700 border-0 text-xs">حاضرة</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────
export default function MyCirclePage() {
  const [showArchived, setShowArchived] = useState(false);
  const [circlePlans, setCirclePlans] = useState<any[]>([]);
  const [historyStudent, setHistoryStudent] = useState<{ id: number; name: string } | null>(null);
  const [examAssignment, setExamAssignment] = useState<null | {
    rotationName: string;
    examCircleName: string;
    examMeetingTime?: string | null;
    examCircleWhatsappLink?: string | null;
  }>(null);
  const [circleBadges, setCircleBadges] = useState<any[]>([]);
  const [liveCircleBadges, setLiveCircleBadges] = useState<any[]>([]);
  const { data: user } = useGetCurrentUser({ query: { queryKey: ["getCurrentUser"] } });
  const circleId = user?.circleId ?? undefined;
  const trackType: string = (user as any)?.circleDataEntryType ?? (user as any)?.trackType ?? "";

  const { data: students } = useListStudents(
    circleId ? { circleId } : undefined,
    { query: { queryKey: ["students", circleId], enabled: !!circleId } }
  );
  const { data: archivedStudents } = useListStudents(
    circleId ? { circleId, isArchived: true } : undefined,
    { query: { queryKey: ["students-archived", circleId], enabled: !!circleId } }
  );
  const { data: records } = useListRecords(
    circleId ? { circleId } : undefined,
    { query: { queryKey: ["records", circleId], enabled: !!circleId } }
  );

  // Fetch exam rotation assignment for current teacher
  useEffect(() => {
    fetch(`${BASE}/api/exam-rotations/my-assignment`, { headers: authHeader() })
      .then(r => r.ok ? r.json() : null)
      .then(data => setExamAssignment(data))
      .catch(() => {});
  }, []);

  // Fetch circle-level badges اليدوية (تصنعها القائدة بنفسها من صفحة الأوسمة)
  useEffect(() => {
    if (!circleId) { setCircleBadges([]); return; }
    fetch(`${BASE}/api/badge-assignments?entityType=circle&entityId=${circleId}`, { headers: authHeader() })
      .then(r => r.ok ? r.json() : [])
      .then(setCircleBadges)
      .catch(() => setCircleBadges([]));
  }, [circleId]);

  // Fetch أوسمة حلقتنا اللحظية (بالكود، مثل أقمر الحلقة) — بدون تخزين قاعدة بيانات
  useEffect(() => {
    if (!circleId) { setLiveCircleBadges([]); return; }
    fetch(`${BASE}/api/live-badges/circle/${circleId}`, { headers: authHeader() })
      .then(r => r.ok ? r.json() : [])
      .then(setLiveCircleBadges)
      .catch(() => setLiveCircleBadges([]));
  }, [circleId]);

  // Fetch review plans for girls/fixation circles
  useEffect(() => {
    if (!circleId) { setCirclePlans([]); return; }
    if (trackType !== "girls" && trackType !== "fixation") { setCirclePlans([]); return; }
    fetch(`${BASE}/api/circles/${circleId}/review-plans`, { headers: authHeader() })
      .then(r => r.ok ? r.json() : []).then(setCirclePlans).catch(() => setCirclePlans([]));
  }, [circleId, trackType]);

  // حقول الإدخال الفعلية لمسار هذه المعلمة/المشرفة، ثم أعمدة الصفحات المُشتقة منها
  const inputFields = getInputFields(trackType);
  const visiblePageFields = getVisiblePageFields(inputFields);
  const primaryField = visiblePageFields[0] ?? "memorize";

  // Get latest record per student, and the full history (all records) per student
  const latestByStudent: Record<number, any> = {};
  const historyByStudent: Record<number, any[]> = {};
  records?.forEach(r => {
    const existing = latestByStudent[r.studentId];
    if (!existing || r.date > existing.date) {
      latestByStudent[r.studentId] = r;
    }
    (historyByStudent[r.studentId] ??= []).push(r);
  });
  Object.values(historyByStudent).forEach(list => list.sort((a, b) => (a.date < b.date ? 1 : -1)));

  const totalPrimary = Object.values(latestByStudent).reduce((s, r) => s + (PAGE_FIELD_GETTERS[primaryField]?.(r) ?? 0), 0);
  const totalAbsent = Object.values(latestByStudent).filter(r => r.isAbsent).length;
  const studentsOnLeave = (students ?? []).filter(s => isOnLeave(s)).length;

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-foreground">حلقتي</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {user?.name} · {(user as any)?.track ?? ""}
          </p>
        </div>
        {circleId && (
          <CircleOverviewLink circleId={circleId} />
        )}
      </div>

      <MonthlyLeaderboardCard userRole={(user as any)?.role} />

      {(() => { const freshLive = liveCircleBadges.filter((b: any) => isFreshBadge(b)); const freshManual = circleBadges.filter((b: any) => isFreshBadge(b)); const total = circleBadges.length + liveCircleBadges.length; return total > 0 && (
        <Card className="border-0 shadow-sm border-r-4 border-r-indigo-400">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold flex items-center justify-between gap-2 text-indigo-700">
              <span>🌙 أوسمة حلقتنا</span>
              <a href={`${BASE}/badges`} className="text-xs font-semibold text-primary hover:underline">كل الأوسمة ({total}) ←</a>
            </CardTitle>
          </CardHeader>
          {freshLive.length + freshManual.length > 0 && (
          <CardContent className="pt-0">
            <div className="flex flex-wrap gap-6">
              {freshLive.map((b: any) => (
                <BadgeChip key={`live-${b.badgeId}`} badge={b} size={400} compact />
              ))}
              {freshManual.map((b: any) => (
                <BadgeChip key={b.id} badge={b} size={400} compact />
              ))}
            </div>
          </CardContent>
          )}
        </Card>
      ); })()}
      {((user?.role === "teacher" && (user as any)?.circleSupervisorName) ||
        (user?.role === "supervisor" && (user as any)?.circleTeacherName)) && (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">
              {user?.role === "teacher" ? "المشرفة الخاصة بالحلقة" : "المعلمة الخاصة بالحلقة"}
            </p>
            <p className="font-bold text-primary">
              {user?.role === "teacher" ? (user as any).circleSupervisorName : (user as any).circleTeacherName}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Messages from leader */}
      <MessagesSection />

      {/* Exam rotation assignment */}
      {examAssignment && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-2">
          <p className="text-xs font-bold text-amber-700">📋 شقلبة الاختبار — {examAssignment.rotationName}</p>
          <p className="text-sm text-amber-800">
            ستراقبين حلقة:{" "}
            <span className="font-semibold">{examAssignment.examCircleName}</span>
            {examAssignment.examMeetingTime && (
              <span className="text-xs text-amber-600 mr-1">({examAssignment.examMeetingTime})</span>
            )}
          </p>
          {examAssignment.examCircleWhatsappLink && (
            <a href={examAssignment.examCircleWhatsappLink} target="_blank" rel="noopener noreferrer">
              <Button size="sm" variant="outline" className="text-xs border-amber-300 text-amber-700 hover:bg-amber-100 gap-1">
                <MessageCircle className="w-3 h-3" />
                رابط مجموعة الحلقة
              </Button>
            </a>
          )}
        </div>
      )}

      {/* Quick stats */}
      <div className={`grid gap-4 ${studentsOnLeave > 0 ? "grid-cols-4" : "grid-cols-3"}`}>
        <Card className="border-0 shadow-sm" data-testid="card-my-students">
          <CardContent className="p-4 text-center">
            <p className="text-3xl font-bold text-primary">{students?.length ?? 0}</p>
            <p className="text-xs text-muted-foreground mt-1 font-medium">الطالبات</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm" data-testid="card-my-memorize">
          <CardContent className="p-4 text-center">
            <p className="text-3xl font-bold text-teal-600">{formatPages(totalPrimary)}</p>
            <p className="text-xs text-muted-foreground mt-1 font-medium">أوجه {getFieldLabel(primaryField)}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm" data-testid="card-my-absences">
          <CardContent className="p-4 text-center">
            <p className="text-3xl font-bold text-rose-500">{totalAbsent}</p>
            <p className="text-xs text-muted-foreground mt-1 font-medium">الغائبات</p>
          </CardContent>
        </Card>
        {studentsOnLeave > 0 && (
          <Card className="border-0 shadow-sm bg-amber-50 border-amber-100">
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-amber-600">{studentsOnLeave}</p>
              <p className="text-xs text-amber-700 mt-1 font-medium">في إجازة</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Students list */}
      <Card className="border-0 shadow-sm" data-testid="card-students-list">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" />
              الطالبات
            </CardTitle>
            {(archivedStudents?.length ?? 0) > 0 && (user?.role === "leader" || user?.role === "track_supervisor") && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-muted-foreground gap-1"
                onClick={() => setShowArchived(v => !v)}
              >
                <Archive className="w-3.5 h-3.5" />
                المؤرشفات ({archivedStudents?.length})
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {!students || students.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground text-sm">لا توجد طالبات في هذه الحلقة</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b border-border">
                  <tr>
                    <th className="text-right py-3 px-4 font-semibold text-muted-foreground">الاسم</th>
                    {visiblePageFields.map(field => (
                      <th key={field} className="text-right py-3 px-4 font-semibold text-muted-foreground">
                        {getFieldLabel(field)}
                      </th>
                    ))}
                    <th className="text-right py-3 px-4 font-semibold text-muted-foreground">الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map(student => {
                    const record = latestByStudent[student.id];
                    const onLeave = isOnLeave(student);
                    const studentPlan = circlePlans.find((p: any) => p.studentId === student.id);
                    let planBadge: React.ReactNode = null;
                    if (studentPlan) {
                      const pMode: "girls" | "fixation" = studentPlan.planType === "fixation" ? "fixation" : "girls";
                      const totalDays = studentPlan.planType === "fixation" ? 24 : 21;
                      const todayDay = getCurrentPlanDay(studentPlan.startDate, totalDays, pMode);
                      if (todayDay > 0 && todayDay <= totalDays) {
                        planBadge = <Badge className="bg-violet-100 text-violet-700 border-0 text-[11px] px-1.5 py-0">يوم {todayDay}</Badge>;
                      } else if (todayDay > totalDays) {
                        planBadge = <Badge className="bg-emerald-100 text-emerald-700 border-0 text-[11px] px-1.5 py-0">✓ اكتملت</Badge>;
                      }
                    }
                    return (
                      <tr key={student.id}
                        className={`border-b border-border/50 transition-colors ${onLeave ? "bg-amber-50/50" : "hover:bg-muted/30"}`}
                        data-testid={`row-student-${student.id}`}
                      >
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold">{student.fullName}</span>
                            {(student as any).phone && (
                              <span className="text-xs text-muted-foreground" dir="ltr">{(student as any).phone}</span>
                            )}
                            {(student as any).phone && (
                              <a
                                href={makeWhatsAppLink((student as any).phone)}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={e => e.stopPropagation()}
                                className="text-emerald-500 hover:text-emerald-700 transition-colors"
                                title="واتساب"
                              >
                                <MessageCircle className="w-3.5 h-3.5" />
                              </a>
                            )}
                            {onLeave && (
                              <Badge className="bg-amber-100 text-amber-700 border-0 text-xs px-1.5">إجازة</Badge>
                            )}
                            {planBadge}
                            <button
                              onClick={() => setHistoryStudent({ id: student.id, name: student.fullName })}
                              className="text-muted-foreground hover:text-primary transition-colors shrink-0"
                              title="عرض السجل الكامل"
                            >
                              <History className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                        {visiblePageFields.map(field => (
                          <td key={field} className={`py-3 px-4 font-medium ${PAGE_FIELD_COLORS[field] ?? "text-foreground"}`}>
                            {field === "repetitions" ? (record?.repetitions ?? "—") : formatPages(PAGE_FIELD_GETTERS[field]?.(record))}
                          </td>
                        ))}
                        <td className="py-3 px-4">
                          {onLeave ? (
                            <Badge className="bg-amber-100 text-amber-700 border-0 text-xs">في إجازة</Badge>
                          ) : record?.isAbsent ? (
                            <Badge className="bg-rose-100 text-rose-700 border-0 text-xs">غائبة</Badge>
                          ) : record ? (
                            <Badge className="bg-emerald-100 text-emerald-700 border-0 text-xs">حاضرة</Badge>
                          ) : (
                            <Badge className="bg-gray-100 text-gray-500 border-0 text-xs">لا يوجد</Badge>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Plans section — girls / fixation tracks */}
      {(trackType === "girls" || trackType === "fixation") && circlePlans.length > 0 && (
        <CirclePlansCard circlePlans={circlePlans} trackType={trackType} />
      )}

      {/* Archived Students */}
      {showArchived && (archivedStudents?.length ?? 0) > 0 && (user?.role === "leader" || user?.role === "track_supervisor") && (
        <Card className="border-0 shadow-sm border-dashed border-gray-300">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold flex items-center gap-2 text-muted-foreground">
              <Archive className="w-4 h-4" />
              الطالبات المؤرشفات
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 border-b border-border">
                  <tr>
                    <th className="text-right py-3 px-4 font-semibold text-muted-foreground">الاسم</th>
                    <th className="text-right py-3 px-4 font-semibold text-muted-foreground">سبب الأرشفة</th>
                  </tr>
                </thead>
                <tbody>
                  {archivedStudents!.map(student => (
                    <tr key={student.id} className="border-b border-border/50 opacity-70">
                      <td className="py-2.5 px-4 font-medium">{student.fullName}</td>
                      <td className="py-2.5 px-4 text-muted-foreground text-xs">
                        {(student as any).archiveReason ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <StudentHistoryDialog
        student={historyStudent}
        records={historyStudent ? (historyByStudent[historyStudent.id] ?? []) : []}
        visibleFields={visiblePageFields}
        onClose={() => setHistoryStudent(null)}
      />
    </div>
  );
}

function CircleOverviewLink({ circleId }: { circleId: number }) {
  const [, navigate] = useLocation();
  return (
    <button
      onClick={() => navigate(`/circle/${circleId}`)}
      className="shrink-0 text-xs font-semibold text-primary hover:underline px-2 py-1 rounded-lg border border-primary/20"
    >
      عرض صفحة الحلقة الموحّدة
    </button>
  );
}
