import { useState, useEffect } from "react";
import { useGetCurrentUser } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { BookOpen, CheckCircle2, XCircle, ChevronDown, ChevronUp, Users, Loader2, RefreshCw, CalendarDays, RotateCcw, Clock, Settings2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { getCurrentPlanDay, getDayDates, formatArDate } from "@/components/ReviewPlanSection";
import { computeDayRanges, juzListToQuotaRanges, type DayQuotaRange, type DayRangeSegment } from "@/lib/quran";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const getToken = () => localStorage.getItem("sana_auth_token");
const authHeader = () => {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  const t = getToken();
  if (t) h["Authorization"] = `Bearer ${t}`;
  return h;
};

type DayEntry = {
  id: number;
  dayNumber: number;
  surahStart: string | null;
  ayahStart: number | null;
  surahEnd: string | null;
  ayahEnd: number | null;
  pages: number | null;
};

type PlanSummary = {
  id: number;
  planType: string;
  startDate: string;
  themeColor: string;
  totalPages: number | null;
  quotaType: string | null;
  quotaJuz: number | null;
  quotaSurahStart: string | null;
  quotaAyahStart: number | null;
  quotaSurahEnd: string | null;
  quotaAyahEnd: number | null;
  extraRanges: string | null;
  reviewSourceSnapshot?: string | null;
  planMode: string | null;
  createdAt: string;
  days: DayEntry[];
  status: "behind" | "ontrack" | "ahead" | null;
  isAbsentToday?: boolean;
};

const STATUS_COLORS: Record<"behind" | "ontrack" | "ahead", string> = {
  ahead: "#dbeafe",
  ontrack: "#dcfce7",
  behind: "#fef9c3",
};
const STATUS_TEXT_COLORS: Record<"behind" | "ontrack" | "ahead", string> = {
  ahead: "#1d4ed8",
  ontrack: "#15803d",
  behind: "#a16207",
};
const STATUS_LABELS: Record<"behind" | "ontrack" | "ahead", string> = {
  ahead: "متقدمة",
  ontrack: "منتظمة",
  behind: "متأخرة",
};
const ABSENT_TODAY_COLOR = "#f3f4f6";
const ABSENT_TODAY_TEXT_COLOR = "#6b7280";
const ABSENT_TODAY_LABEL = "غائبة اليوم";

type StudentRow = {
  studentId: number;
  studentName: string;
  isNewcomer: boolean;
  hasPlan: boolean;
  plan: PlanSummary | null;
};

type CircleOverview = {
  circleId: number;
  circleName: string;
  trackName: string;
  trackType: string;
  students: StudentRow[];
};

type CycleInfo = {
  cycleStartDate: string;
  cycleEndDate: string;
  currentDay: number;
  isCompleted: boolean;
  scheduledEndDate: string | null;
};

type DelayAlert = {
  studentId: number;
  studentName: string;
  circleId: number;
  circleName: string;
  planType: string;
  unresolvedDelayDays: number;
};

type CancellationRequest = {
  id: number;
  studentId: number;
  circleId: number;
  studentName: string;
  circleName: string;
  planType: string;
  startDate: string;
  cancellationRequestedAt?: string | null;
};

interface Props {
  userRole?: string;
}

function getMeccaToday(): string {
  return new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function getPlanMode(trackType: string): "girls" | "fixation" {
  return trackType === "fixation" ? "fixation" : "girls";
}

function getTotalDays(trackType: string): number {
  return trackType === "fixation" ? 24 : 21;
}

function getPlanTypeLabel(planType: string) {
  if (planType === "girls_review") return "مراجعة بنات";
  if (planType === "fixation") return "تثبيت";
  return planType;
}

function formatDayRange(day: DayEntry): string {
  if (!day.surahStart) return "—";
  let result = day.surahStart;
  if (day.ayahStart) result += ` آية ${day.ayahStart}`;
  if (day.surahEnd && day.surahEnd !== day.surahStart) {
    result += ` ← ${day.surahEnd}`;
    if (day.ayahEnd) result += ` آية ${day.ayahEnd}`;
  } else if (day.ayahEnd && day.ayahEnd !== day.ayahStart) {
    result += ` → آية ${day.ayahEnd}`;
  }
  return result;
}

function getPlanRanges(plan: PlanSummary): DayQuotaRange[] {
  if (plan.reviewSourceSnapshot) {
    try {
      const snapshot = JSON.parse(plan.reviewSourceSnapshot) as {
        approvedJuzNumbers?: unknown;
        recordRanges?: unknown;
      };
      const juzNumbers = Array.isArray(snapshot.approvedJuzNumbers)
        ? snapshot.approvedJuzNumbers.filter((value): value is number => Number.isInteger(value) && value >= 1 && value <= 30)
        : [];
      const recordRanges = Array.isArray(snapshot.recordRanges)
        ? snapshot.recordRanges.filter((range): range is DayQuotaRange => Boolean(
            range && typeof range === "object" &&
            typeof (range as DayQuotaRange).surahStart === "string" &&
            typeof (range as DayQuotaRange).surahEnd === "string" &&
            typeof (range as DayQuotaRange).ayahStart === "number" &&
            typeof (range as DayQuotaRange).ayahEnd === "number",
          ))
        : [];
      return [...juzListToQuotaRanges(juzNumbers), ...recordRanges];
    } catch {}
  }

  if (plan.quotaType === "juz") {
    try {
      const selected = plan.extraRanges ? JSON.parse(plan.extraRanges) : [];
      if (Array.isArray(selected)) {
        const juzNumbers = selected.filter((value): value is number => Number.isInteger(value) && value >= 1 && value <= 30);
        if (juzNumbers.length > 0) return juzListToQuotaRanges(juzNumbers);
      }
    } catch {}
    return plan.quotaJuz ? juzListToQuotaRanges(Array.from({ length: plan.quotaJuz }, (_, index) => index + 1)) : [];
  }

  if (plan.quotaType === "surah" && plan.quotaSurahStart && plan.quotaSurahEnd && plan.quotaAyahStart && plan.quotaAyahEnd) {
    const ranges: DayQuotaRange[] = [{
      surahStart: plan.quotaSurahStart,
      ayahStart: plan.quotaAyahStart,
      surahEnd: plan.quotaSurahEnd,
      ayahEnd: plan.quotaAyahEnd,
    }];
    if (plan.extraRanges) {
      try {
        const extra = JSON.parse(plan.extraRanges);
        if (Array.isArray(extra)) ranges.push(...extra);
      } catch {}
    }
    return ranges;
  }
  return [];
}

function buildQuotaLabel(plan: PlanSummary): string {
  if (plan.quotaType === "juz") return `${plan.quotaJuz} جزء`;
  if (plan.quotaType === "surah" && plan.quotaSurahStart) {
    const fmtRange = (s: string, as_: number | null, e: string | null, ae: number | null) =>
      `من ${s}${as_ ? ` آية ${as_}` : ""} إلى ${e ?? s}${ae ? ` آية ${ae}` : ""}`;
    const first = fmtRange(plan.quotaSurahStart, plan.quotaAyahStart, plan.quotaSurahEnd, plan.quotaAyahEnd);
    if (plan.extraRanges) {
      try {
        const extra = JSON.parse(plan.extraRanges) as Array<{ surahStart: string; ayahStart: number; surahEnd: string; ayahEnd: number }>;
        const extraLabels = extra.map(r => fmtRange(r.surahStart, r.ayahStart, r.surahEnd, r.ayahEnd));
        return [first, ...extraLabels].join(" + ");
      } catch { return first; }
    }
    return first;
  }
  return "";
}

function getPlanProgress(plan: PlanSummary, trackType: string) {
  const totalDays = getTotalDays(trackType);
  const mode = getPlanMode(trackType);
  const dates = getDayDates(plan.startDate, totalDays, mode);
  const endDate = dates[dates.length - 1] ?? plan.startDate;
  const today = getMeccaToday();
  const currentDay = getCurrentPlanDay(plan.startDate, totalDays, mode);
  const isCompleted = today > endDate;
  const notStarted = today < dates[0]!;
  return { currentDay, totalDays, endDate, isCompleted, notStarted };
}

function PlanBadge({ plan, trackType }: { plan: PlanSummary; trackType: string }) {
  const { currentDay, totalDays, isCompleted, notStarted } = getPlanProgress(plan, trackType);
  if (isCompleted) {
    return (
      <span className="text-[10px] bg-emerald-100 text-emerald-700 rounded-full px-2 py-0.5 flex items-center gap-1 whitespace-nowrap">
        <CheckCircle2 className="w-3 h-3" /> اكتملت
      </span>
    );
  }
  if (notStarted) {
    return (
      <span className="text-[10px] bg-amber-100 text-amber-700 rounded-full px-2 py-0.5 whitespace-nowrap">
        لم تبدأ بعد
      </span>
    );
  }
  return (
    <span className="text-[10px] bg-violet-100 text-violet-700 rounded-full px-2 py-0.5 whitespace-nowrap">
      يوم {currentDay} / {totalDays}
    </span>
  );
}

function FullPlanTable({ plan, trackType }: { plan: PlanSummary; trackType: string }) {
  const totalDays = getTotalDays(trackType);
  const mode = getPlanMode(trackType);
  const dates = getDayDates(plan.startDate, totalDays, mode);
  const today = getMeccaToday();
  const currentDay = getCurrentPlanDay(plan.startDate, totalDays, mode);
  const computedRanges = getPlanRanges(plan).length > 0 ? computeDayRanges(getPlanRanges(plan), plan.days) : null;

  if (!plan.days || plan.days.length === 0) {
    return (
      <div className="px-4 pb-2 text-xs text-muted-foreground italic">لا يوجد تفصيل أيام مُدخل</div>
    );
  }

  return (
    <div className="px-3 pb-3">
      <div className="overflow-x-auto rounded-lg border border-border/40">
        <table className="w-full text-xs min-w-[280px]">
          <thead className="bg-muted/50">
            <tr>
              <th className="py-1.5 px-2 text-right font-semibold text-muted-foreground w-8">يوم</th>
              <th className="py-1.5 px-2 text-right font-semibold text-muted-foreground">التاريخ</th>
              <th className="py-1.5 px-2 text-right font-semibold text-muted-foreground">النطاق</th>
              <th className="py-1.5 px-2 text-center font-semibold text-muted-foreground w-12">صفحات</th>
            </tr>
          </thead>
          <tbody>
            {plan.days.map((day, dayIndex) => {
              const dateStr = dates[day.dayNumber - 1];
              const isToday = day.dayNumber === currentDay;
              const isPast = day.dayNumber < currentDay;
              return (
                <tr
                  key={day.dayNumber}
                  className={`border-t border-border/20 ${isToday ? "font-semibold" : ""}`}
                  style={
                    isToday
                      ? { background: plan.themeColor + "70" }
                      : isPast
                      ? { opacity: 0.4 }
                      : {}
                  }
                >
                  <td className="py-1 px-2 text-center text-muted-foreground font-mono">{day.dayNumber}</td>
                  <td className="py-1 px-2 text-muted-foreground text-[10px]">
                    {dateStr ? formatArDate(dateStr) : "—"}
                  </td>
                  <td className="py-1 px-2 text-[10px]">
                    {day.surahStart
                      ? formatDayRange(day)
                      : computedRanges?.[dayIndex]?.map((segment: DayRangeSegment) =>
                          `${segment.surahStart} آية ${segment.ayahStart} ← ${segment.surahEnd} آية ${segment.ayahEnd}`,
                        ).join(" + ") || "—"}
                  </td>
                  <td className="py-1 px-2 text-center">{day.pages ?? "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StudentPlanRow({ student, trackType }: { student: StudentRow; trackType: string }) {
  const [expanded, setExpanded] = useState(false);
  const quotaLabel = student.plan ? buildQuotaLabel(student.plan) : "";

  return (
    <div className="border-b border-border/30 last:border-0">
      <div
        className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/20 transition-colors cursor-pointer"
        onClick={() => student.hasPlan && setExpanded(e => !e)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-foreground truncate">{student.studentName}</p>
            {student.isNewcomer && (
              <span className="text-[9px] bg-blue-100 text-blue-600 rounded-full px-1.5 py-0.5 whitespace-nowrap shrink-0">جديدة</span>
            )}
          </div>
          {student.hasPlan && student.plan && quotaLabel && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{quotaLabel}</p>
          )}
          {student.hasPlan && student.plan && !quotaLabel && student.plan.totalPages && (
            <p className="text-xs text-muted-foreground mt-0.5">{student.plan.totalPages} صفحة</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {student.hasPlan && student.plan ? (
            <>
              {student.plan.isAbsentToday && (
                <span
                  className="text-[10px] rounded-full px-2 py-0.5 font-semibold whitespace-nowrap"
                  style={{ background: ABSENT_TODAY_COLOR, color: ABSENT_TODAY_TEXT_COLOR }}
                >
                  {ABSENT_TODAY_LABEL}
                </span>
              )}
              {student.plan.status && (
                <span
                  className="text-[10px] rounded-full px-2 py-0.5 font-semibold whitespace-nowrap"
                  style={{ background: STATUS_COLORS[student.plan.status], color: STATUS_TEXT_COLORS[student.plan.status] }}
                >
                  {STATUS_LABELS[student.plan.status]}
                </span>
              )}
              <span
                className="w-3 h-3 rounded-full border border-border/30 shrink-0"
                style={{ background: student.plan.themeColor }}
              />
              <PlanBadge plan={student.plan} trackType={trackType} />
              {student.plan.days?.length > 0 && (
                expanded
                  ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
                  : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
              )}
            </>
          ) : (
            <span className="text-[10px] bg-rose-100 text-rose-600 rounded-full px-2 py-0.5 flex items-center gap-1 whitespace-nowrap">
              <XCircle className="w-3 h-3" /> بدون خطة
            </span>
          )}
        </div>
      </div>
      {expanded && student.plan && (
        <FullPlanTable plan={student.plan} trackType={trackType} />
      )}
    </div>
  );
}

function CircleCard({ circle }: { circle: CircleOverview }) {
  const [expanded, setExpanded] = useState(true);
  const withPlan = circle.students.filter(s => s.hasPlan);
  const total = circle.students.length;
  const percentage = total > 0 ? Math.round((withPlan.length / total) * 100) : 0;

  return (
    <Card className="border-0 shadow-sm overflow-hidden">
      <CardHeader
        className="pb-2 cursor-pointer select-none"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <CardTitle className="text-sm font-bold truncate">{circle.circleName}</CardTitle>
            <Badge variant="outline" className="text-[10px] shrink-0 border-muted-foreground/30 text-muted-foreground">
              {circle.trackName}
            </Badge>
          </div>
          <div className="flex items-center gap-2 shrink-0 mr-2">
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-emerald-600 font-semibold">{withPlan.length}</span>
              <span className="text-[10px] text-muted-foreground">/</span>
              <span className="text-[10px] text-muted-foreground">{total}</span>
            </div>
            <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${percentage}%`,
                  background: percentage === 100 ? "#10b981" : percentage > 50 ? "#8b5cf6" : "#f43f5e",
                }}
              />
            </div>
            <span className="text-[10px] text-muted-foreground w-7 text-left">{percentage}%</span>
            {expanded
              ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
              : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
            }
          </div>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="p-0 pb-1">
          {total === 0 ? (
            <div className="px-4 py-4 text-center text-sm text-muted-foreground">لا توجد طالبات في هذه الحلقة</div>
          ) : (
            <div>
              {circle.students.map(s => (
                <StudentPlanRow key={s.studentId} student={s} trackType={circle.trackType} />
              ))}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

// Shown instead of CycleBanner when there are girls circles but no cycle has
// ever been started yet (e.g. a brand-new database) — lets the leader/deputy
// set the very first cycle's start date so the normal renew/schedule tools
// become available afterwards.
function StartCycleBanner({ userRole, onStarted }: { userRole?: string; onStarted: () => void }) {
  const [open, setOpen] = useState(false);
  const [startDate, setStartDate] = useState(getMeccaToday());
  const [starting, setStarting] = useState(false);
  const canStart = userRole === "leader" || userRole === "deputy";

  const handleStart = async () => {
    setStarting(true);
    try {
      const res = await fetch(`${BASE}/api/review-plans/renew-all`, {
        method: "POST",
        headers: authHeader(),
        body: JSON.stringify({ newCycleStart: startDate }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "خطأ");
      setOpen(false);
      onStarted();
    } catch (e: any) {
      alert("خطأ: " + e.message);
    } finally {
      setStarting(false);
    }
  };

  if (!canStart) return null;

  return (
    <>
      <Card className="border-0 shadow-sm bg-violet-50 border-violet-200">
        <CardContent className="p-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-violet-100">
                <Clock className="w-5 h-5 text-violet-600" />
              </div>
              <div>
                <p className="text-sm font-bold text-foreground">لم تبدأ دورة مراجعة بعد</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  حددي تاريخ بداية الدورة الأولى لخطط مراجعة الفتيات
                </p>
              </div>
            </div>
            <Button size="sm" className="gap-1.5 text-xs" onClick={() => { setStartDate(getMeccaToday()); setOpen(true); }}>
              <Clock className="w-3.5 h-3.5" />
              بدء الدورة الأولى
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={v => { if (!v && !starting) setOpen(false); }}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-right">
              <Clock className="w-4 h-4 text-primary" />
              بدء الدورة الأولى
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              حددي تاريخ بداية الدورة — سيتم اعتمادها كبداية دور المراجعة (٢١ يوم) لجميع الطالبات اللاتي لديهن خطة حالياً، وبعدها تقدرين تجدولين نهاية الدورات وتجديدها من هنا.
            </p>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold">تاريخ بداية الدورة</label>
              <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="text-right" />
              {startDate && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <CalendarDays className="w-3.5 h-3.5" />
                  {formatArDate(startDate)}
                </p>
              )}
            </div>
          </div>
          <DialogFooter className="flex-row-reverse gap-2">
            <Button onClick={handleStart} disabled={starting || !startDate} className="gap-1.5">
              {starting ? <><Loader2 className="w-4 h-4 animate-spin" />جاري البدء...</> : <><Clock className="w-4 h-4" />بدء الدورة</>}
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={starting}>إلغاء</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function CycleBanner({
  cycleInfo,
  userRole,
  onRenewSuccess,
}: {
  cycleInfo: CycleInfo;
  userRole?: string;
  onRenewSuccess: () => void;
}) {
  const [renewOpen, setRenewOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [newDate, setNewDate] = useState(getMeccaToday());
  const [endDate, setEndDate] = useState(getMeccaToday());
  const [scheduleStart, setScheduleStart] = useState("");
  const [renewing, setRenewing] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [renewResult, setRenewResult] = useState<{ renewed: number; skipped: number } | null>(null);
  const [scheduleResult, setScheduleResult] = useState<{ cycleEndDate: string; newCycleStart: string } | null>(null);
  const canRenew = userRole === "leader" || userRole === "deputy";

  const today = getMeccaToday();
  const daysLeft = cycleInfo.isCompleted
    ? 0
    : cycleInfo.currentDay > 0
    ? 21 - cycleInfo.currentDay
    : 21;

  const handleRenew = async () => {
    setRenewing(true);
    try {
      const res = await fetch(`${BASE}/api/review-plans/renew-all`, {
        method: "POST",
        headers: authHeader(),
        body: JSON.stringify({ newCycleStart: newDate }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "خطأ");
      setRenewResult({ renewed: data.renewed, skipped: data.skipped });
      onRenewSuccess();
    } catch (e: any) {
      alert("خطأ: " + e.message);
    } finally {
      setRenewing(false);
    }
  };

  const handleSchedule = async () => {
    setScheduling(true);
    try {
      const res = await fetch(`${BASE}/api/review-plans/schedule-cycle-end`, {
        method: "POST",
        headers: authHeader(),
        body: JSON.stringify({ cycleEndDate: endDate, newCycleStart: scheduleStart }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "خطأ");
      setScheduleResult({ cycleEndDate: data.cycleEndDate, newCycleStart: data.newCycleStart });
      onRenewSuccess();
    } catch (e: any) {
      alert("خطأ: " + e.message);
    } finally {
      setScheduling(false);
    }
  };

  return (
    <>
      <Card className={`border-0 shadow-sm ${cycleInfo.isCompleted ? "bg-emerald-50 border-emerald-200" : "bg-violet-50 border-violet-200"}`}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${cycleInfo.isCompleted ? "bg-emerald-100" : "bg-violet-100"}`}>
                {cycleInfo.isCompleted
                  ? <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  : <Clock className="w-5 h-5 text-violet-600" />
                }
              </div>
              <div>
                <p className="text-sm font-bold text-foreground">
                  {cycleInfo.isCompleted
                    ? "انتهى الدور الحالي"
                    : `الدور الحالي · اليوم ${cycleInfo.currentDay} من ٢١`}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {cycleInfo.isCompleted
                    ? `انتهى في ${formatArDate(cycleInfo.cycleEndDate)}`
                    : daysLeft > 0
                    ? `متبقٍ ${daysLeft} يوم · ينتهي ${formatArDate(cycleInfo.cycleEndDate)}`
                    : `ينتهي ${formatArDate(cycleInfo.cycleEndDate)}`}
                </p>
                {cycleInfo.scheduledEndDate && (
                  <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    مجدوَل: تُقفل الخطط الحالية في {formatArDate(cycleInfo.scheduledEndDate)}
                  </p>
                )}
              </div>
            </div>
            {canRenew && (
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  className="gap-1.5 text-xs"
                  variant="outline"
                  onClick={() => { setScheduleResult(null); setEndDate(today); setScheduleStart(""); setScheduleOpen(true); }}
                >
                  <Clock className="w-3.5 h-3.5" />
                  جدولة نهاية الدورة
                </Button>
                <Button
                  size="sm"
                  className="gap-1.5 text-xs"
                  variant={cycleInfo.isCompleted ? "default" : "outline"}
                  onClick={() => { setRenewResult(null); setNewDate(today); setRenewOpen(true); }}
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  تجديد الخطط الآن
                </Button>
              </div>
            )}
          </div>

          {/* Progress bar */}
          {!cycleInfo.isCompleted && cycleInfo.currentDay > 0 && (
            <div className="mt-3">
              <div className="w-full h-2 bg-violet-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-violet-500 rounded-full transition-all"
                  style={{ width: `${Math.min(100, (cycleInfo.currentDay / 21) * 100)}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                <span>{formatArDate(cycleInfo.cycleStartDate)}</span>
                <span>{formatArDate(cycleInfo.cycleEndDate)}</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Renew dialog */}
      <Dialog open={renewOpen} onOpenChange={v => { if (!v && !renewing) setRenewOpen(false); }}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-right">
              <RotateCcw className="w-4 h-4 text-primary" />
              تجديد خطط المراجعة
            </DialogTitle>
          </DialogHeader>

          {renewResult ? (
            <div className="space-y-3 py-2">
              <div className="bg-emerald-50 rounded-xl p-4 text-center space-y-1">
                <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
                <p className="font-bold text-emerald-700">تم التجديد بنجاح!</p>
                <p className="text-sm text-muted-foreground">جُدِّدت <span className="font-bold text-foreground">{renewResult.renewed}</span> خطة</p>
                {renewResult.skipped > 0 && (
                  <p className="text-xs text-muted-foreground">{renewResult.skipped} خطة لم تحتج للتجديد</p>
                )}
              </div>
              <Button className="w-full" onClick={() => setRenewOpen(false)}>إغلاق</Button>
            </div>
          ) : (
            <>
              <div className="space-y-4 py-2">
                <p className="text-sm text-muted-foreground">
                  سيتم تجديد جميع خطط مراجعة الفتيات تلقائياً بناءً على نصاب كل طالبة + ما حفظته خلال الدور الحالي حتى اليوم السابق لبداية الدور الجديد.
                </p>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold">تاريخ بداية الدور الجديد</label>
                  <Input
                    type="date"
                    value={newDate}
                    onChange={e => setNewDate(e.target.value)}
                    className="text-right"
                  />
                  {newDate && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <CalendarDays className="w-3.5 h-3.5" />
                      {formatArDate(newDate)}
                    </p>
                  )}
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-700">
                  ℹ️ ستُجدَّد جميع الخطط — بما فيها الجارية — ويُحسب نصاب الدور الجديد من المحفوظات حتى اليوم السابق لتاريخ البداية المحدد.
                </div>
              </div>
              <DialogFooter className="flex-row-reverse gap-2">
                <Button onClick={handleRenew} disabled={renewing || !newDate} className="gap-1.5">
                  {renewing ? <><Loader2 className="w-4 h-4 animate-spin" />جاري التجديد...</> : <><RotateCcw className="w-4 h-4" />تجديد الآن</>}
                </Button>
                <Button variant="ghost" onClick={() => setRenewOpen(false)} disabled={renewing}>إلغاء</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Schedule cycle-end dialog */}
      <Dialog open={scheduleOpen} onOpenChange={v => { if (!v && !scheduling) setScheduleOpen(false); }}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-right">
              <Clock className="w-4 h-4 text-primary" />
              جدولة نهاية الدورة الحالية
            </DialogTitle>
          </DialogHeader>

          {scheduleResult ? (
            <div className="space-y-3 py-2">
              <div className="bg-emerald-50 rounded-xl p-4 text-center space-y-1">
                <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
                <p className="font-bold text-emerald-700">تمت الجدولة بنجاح!</p>
                <p className="text-sm text-muted-foreground">
                  ستُقفل الخطط الحالية في <span className="font-bold text-foreground">{formatArDate(scheduleResult.cycleEndDate)}</span>{" "}
                  وتبدأ الدورة الجديدة في <span className="font-bold text-foreground">{formatArDate(scheduleResult.newCycleStart)}</span>
                </p>
              </div>
              <Button className="w-full" onClick={() => setScheduleOpen(false)}>إغلاق</Button>
            </div>
          ) : (
            <>
              <div className="space-y-4 py-2">
                <p className="text-sm text-muted-foreground">
                  حددي تاريخ نهاية الدورة الحالية — ستُقفل خطط جميع الطالبات تلقائياً في ذلك التاريخ (حتى لو لم تصل خطة إحداهن لليوم الـ٢١ طبيعيًا)، وتبدأ خطط الدورة الجديدة تلقائيًا في التاريخ التالي.
                </p>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold">تاريخ نهاية الدورة الحالية</label>
                  <Input
                    type="date"
                    value={endDate}
                    onChange={e => setEndDate(e.target.value)}
                    className="text-right"
                  />
                  {endDate && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <CalendarDays className="w-3.5 h-3.5" />
                      {formatArDate(endDate)}
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold">تاريخ بداية الدورة الجديدة</label>
                  <Input
                    type="date"
                    value={scheduleStart}
                    min={endDate}
                    onChange={e => setScheduleStart(e.target.value)}
                    className="text-right"
                  />
                  {scheduleStart && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <CalendarDays className="w-3.5 h-3.5" />
                      {formatArDate(scheduleStart)} · مدتها ٢١ يوم
                    </p>
                  )}
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700">
                  ⚠️ الطالبات اللي ما عندهن خطة أصلًا ما راح يتأثرن — يبدأن خطتهن من الصفر بعد بداية الدورة الجديدة. أما الخطط التي تُجدَّد تلقائيًا، فيمكن للطالبة تعديلها خلال ٤٨ ساعة من إنشائها.
                </div>
              </div>
              <DialogFooter className="flex-row-reverse gap-2">
                <Button onClick={handleSchedule} disabled={scheduling || !endDate || !scheduleStart} className="gap-1.5">
                  {scheduling ? <><Loader2 className="w-4 h-4 animate-spin" />جاري الجدولة...</> : <><Clock className="w-4 h-4" />جدولة</>}
                </Button>
                <Button variant="ghost" onClick={() => setScheduleOpen(false)} disabled={scheduling}>إلغاء</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

type StudentCircle = {
  id: number;
  name: string;
  track: string;
  trackType: string;
  dataEntryType?: string | null;
  teacherName?: string | null;
  supervisorName?: string | null;
};

function StudentMyPlanView() {
  const { data: user } = useGetCurrentUser({ query: { queryKey: ["getCurrentUser"] } });
  // Keyed by circleId so each enrolled circle's plan is fetched and rendered in
  // total isolation — a student enrolled in two tracks (e.g. بريق و سَنى) must
  // never see one circle's plan bleed into the other's card.
  const [plansByCircle, setPlansByCircle] = useState<Record<number, PlanSummary | null>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const studentId: number | undefined = (user as any)?.studentId;
  const circles: StudentCircle[] = (user as any)?.circles ?? [];
  // Fallback for older accounts where /auth/me hasn't resolved a `circles` list yet
  // but a single primary circle is still known — avoids showing "no plan" wrongly.
  const effectiveCircles: StudentCircle[] = circles.length > 0
    ? circles
    : (user as any)?.circleId
      ? [{ id: (user as any).circleId, name: "", track: "", trackType: (user as any)?.circleTrackType ?? "girls" }]
      : [];

  useEffect(() => {
    if (!user) return;
    if (!studentId || effectiveCircles.length === 0) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    Promise.all(
      effectiveCircles.map(c =>
        fetch(`${BASE}/api/students/${studentId}/review-plan?circleId=${c.id}`, { headers: authHeader() })
          .then(r => (r.ok ? r.json() : null))
          .then(data => [c.id, data ?? null] as const)
          .catch(() => [c.id, null] as const)
      )
    )
      .then(entries => setPlansByCircle(Object.fromEntries(entries)))
      .catch(() => setError("تعذّر تحميل الخطة"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId, effectiveCircles.map(c => c.id).join(",")]);

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  if (error) return <p className="text-center text-rose-500 py-10 text-sm">{error}</p>;

  const cardsData = effectiveCircles.map(c => ({ circle: c, plan: plansByCircle[c.id] ?? null }));
  const anyPlan = cardsData.some(cd => cd.plan);

  if (!anyPlan) return (
    <Card className="border-0 shadow-sm">
      <CardContent className="py-12 text-center">
        <XCircle className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">لا توجد خطة مراجعة حالية</p>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-5">
      {cardsData.map(({ circle, plan }) => {
        if (!plan) {
          // Only show a "no plan" note when the student has more than one circle,
          // so it's clear which specific circle has no plan yet.
          if (cardsData.length === 1) return null;
          return (
            <div key={circle.id} className="space-y-2">
              {circle.name && <p className="text-xs font-bold text-muted-foreground px-1">{circle.name}</p>}
              <Card className="border-0 shadow-sm">
                <CardContent className="py-6 text-center">
                  <p className="text-xs text-muted-foreground">لا توجد خطة مراجعة حالية في هذه الحلقة</p>
                </CardContent>
              </Card>
            </div>
          );
        }
        const trackType = circle.trackType || (plan.planType === "fixation" ? "fixation" : "girls");
        const quotaLabel = buildQuotaLabel(plan);
        return (
          <div key={circle.id} className="space-y-2">
            {circle.name && cardsData.length > 1 && (
              <p className="text-xs font-bold text-muted-foreground px-1">{circle.name}</p>
            )}
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <p className="font-bold text-foreground">
                      {plan.planType === "fixation" ? "خطة التثبيت الحالية" : "خطة المراجعة الحالية"}
                    </p>
                    {quotaLabel && <p className="text-sm text-muted-foreground mt-0.5">{quotaLabel}</p>}
                    {!quotaLabel && plan.totalPages && <p className="text-sm text-muted-foreground mt-0.5">{plan.totalPages} صفحة</p>}
                  </div>
                  <PlanBadge plan={plan} trackType={trackType} />
                </div>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm overflow-hidden">
              <FullPlanTable plan={plan} trackType={trackType} />
            </Card>
          </div>
        );
      })}
    </div>
  );
}

export default function ReviewPlansOverviewPage({ userRole }: Props) {
  if (userRole === "student") {
    return (
      <div className="max-w-3xl mx-auto space-y-5" dir="rtl">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-primary" />
            الخطط
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">خطة المراجعة الخاصة بك</p>
        </div>
        <StudentMyPlanView />
      </div>
    );
  }

  const [circles, setCircles] = useState<CircleOverview[]>([]);
  const [cycleInfo, setCycleInfo] = useState<CycleInfo | null>(null);
  const [delayAlerts, setDelayAlerts] = useState<DelayAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "with" | "without">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "behind" | "ontrack" | "ahead" | "absentToday">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [studentCanEditPlan, setStudentCanEditPlan] = useState(false);
  const [cancellationRequests, setCancellationRequests] = useState<CancellationRequest[]>([]);
  const [processingCancellation, setProcessingCancellation] = useState<number | null>(null);
  const [togglingEdit, setTogglingEdit] = useState(false);
  const canSeeStatusTabs = userRole === "leader" || userRole === "deputy" || userRole === "track_supervisor";

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [overviewRes, settingsRes, requestsRes] = await Promise.all([
        fetch(`${BASE}/api/review-plans/overview`, { headers: authHeader() }),
        fetch(`${BASE}/api/review-plans/settings`, { headers: authHeader() }),
        fetch(`${BASE}/api/review-plans/cancellation-requests`, { headers: authHeader() }),
      ]);
      if (!overviewRes.ok) throw new Error("فشل تحميل البيانات");
      const json = await overviewRes.json();
      if (Array.isArray(json)) {
        setCircles(json);
      } else {
        setCircles(json.circles ?? []);
        setCycleInfo(json.cycleInfo ?? null);
        setDelayAlerts(json.delayAlerts ?? []);
      }
      if (settingsRes.ok) {
        const settings = await settingsRes.json();
        setStudentCanEditPlan(settings.studentCanEditPlan ?? false);
      }
      if (requestsRes.ok) {
        setCancellationRequests(await requestsRes.json());
      }
    } catch {
      setError("تعذّر تحميل خطط المراجعة");
    } finally {
      setLoading(false);
    }
  };

  const handleToggleStudentEdit = async (value: boolean) => {
    setTogglingEdit(true);
    try {
      const res = await fetch(`${BASE}/api/review-plans/settings`, {
        method: "POST",
        headers: authHeader(),
        body: JSON.stringify({ studentCanEditPlan: value }),
      });
      if (!res.ok) throw new Error("فشل تحديث الإعداد");
      setStudentCanEditPlan(value);
    } catch (e: any) {
      alert("خطأ: " + e.message);
    } finally {
      setTogglingEdit(false);
    }
  };

  const handleCancellationDecision = async (request: CancellationRequest, approved: boolean) => {
    setProcessingCancellation(request.id);
    try {
      const res = await fetch(`${BASE}/api/students/${request.studentId}/review-plan/${request.id}/cancellation-approval`, {
        method: "PATCH",
        headers: authHeader(),
        body: JSON.stringify({ approved }),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error?.error ?? "تعذر تحديث الطلب");
      }
      setCancellationRequests(current => current.filter(item => item.id !== request.id));
      await fetchData();
    } catch (error: any) {
      alert(error.message);
    } finally {
      setProcessingCancellation(null);
    }
  };

  useEffect(() => { fetchData(); }, []);

  // Only girls circles matter for the cycle banner
  const girlsCircles = circles.filter(c => c.trackType === "girls");
  const hasCycleData = cycleInfo && girlsCircles.length > 0;

  // Group by track
  const trackGroups: Record<string, CircleOverview[]> = {};
  for (const circle of circles) {
    if (!trackGroups[circle.trackName]) trackGroups[circle.trackName] = [];
    trackGroups[circle.trackName].push(circle);
  }

  // Summary stats
  const allStudents = circles.flatMap(c => c.students);
  const withPlanCount = allStudents.filter(s => s.hasPlan).length;
  const withoutPlanCount = allStudents.filter(s => !s.hasPlan).length;
  const totalCount = allStudents.length;

  // Status counts (across all plan students), used for tab badges
  const statusCounts = {
    behind: allStudents.filter(s => s.plan?.status === "behind").length,
    ontrack: allStudents.filter(s => s.plan?.status === "ontrack").length,
    ahead: allStudents.filter(s => s.plan?.status === "ahead").length,
    absentToday: allStudents.filter(s => s.plan?.isAbsentToday).length,
  };

  // Filter circles
  function filterCircle(circle: CircleOverview): CircleOverview {
    let students = circle.students;
    if (filter === "with") students = students.filter(s => s.hasPlan);
    if (filter === "without") students = students.filter(s => !s.hasPlan);
    if (canSeeStatusTabs && statusFilter !== "all") {
      students = statusFilter === "absentToday"
        ? students.filter(s => s.plan?.isAbsentToday)
        : students.filter(s => s.plan?.status === statusFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      students = students.filter(s => s.studentName.toLowerCase().includes(q));
    }
    return { ...circle, students };
  }

  const filteredTracks = Object.entries(trackGroups).map(([track, circs]) => ({
    track,
    circles: circs.map(filterCircle).filter(c =>
      filter === "all" && statusFilter === "all" && !searchQuery.trim() ? true : c.students.length > 0
    ),
  })).filter(t => t.circles.length > 0);

  return (
    <div className="max-w-3xl mx-auto space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-primary" />
            خطط المراجعة
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            نظرة عامة على خطط الطالبات حسب الحلقات
          </p>
        </div>
        <button
          onClick={fetchData}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 font-medium disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          تحديث
        </button>
      </div>

      {/* Student edit/delete permission toggle — leader only */}
      {!loading && !error && userRole === "leader" && (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-muted">
                  <Settings2 className="w-4 h-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">السماح للطالبات بتعديل خططهن وحذفها</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {studentCanEditPlan
                      ? "مفعّل — الطالبات يستطعن حذف خططهن أو استبدالها حتى لو كانت الخطة لم تنتهِ بعد"
                      : "موقوف — الخطط مقفولة طوال الدورة ولا يمكن للطالبات تعديلها أو حذفها"}
                  </p>
                </div>
              </div>
              <Switch
                checked={studentCanEditPlan}
                onCheckedChange={handleToggleStudentEdit}
                disabled={togglingEdit}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {!loading && !error && cancellationRequests.length > 0 && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-600" />
              طلبات إلغاء الخطط
              <Badge variant="secondary">{cancellationRequests.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {cancellationRequests.map(request => (
              <div key={request.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{request.studentName}</p>
                  <p className="text-xs text-muted-foreground">{request.circleName} · {request.planType === "fixation" ? "خطة التثبيت" : "خطة المراجعة"}</p>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <Button
                    size="sm"
                    className="h-8 gap-1 bg-emerald-600 hover:bg-emerald-700"
                    disabled={processingCancellation === request.id}
                    onClick={() => handleCancellationDecision(request, true)}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />موافقة
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1 text-rose-600"
                    disabled={processingCancellation === request.id}
                    onClick={() => handleCancellationDecision(request, false)}
                  >
                    <XCircle className="w-3.5 h-3.5" />رفض
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Cycle management banner — girls only */}
      {!loading && !error && hasCycleData && (
        <CycleBanner
          cycleInfo={cycleInfo!}
          userRole={userRole}
          onRenewSuccess={fetchData}
        />
      )}

      {/* First-time setup banner — shown when girls circles exist but no cycle started yet */}
      {!loading && !error && !hasCycleData && girlsCircles.length > 0 && (
        <StartCycleBanner userRole={userRole} onStarted={fetchData} />
      )}

      {/* Summary cards */}
      {!loading && !error && (
        <div className="grid grid-cols-3 gap-3">
          <Card className="border-0 shadow-sm">
            <CardContent className="p-3 text-center">
              <p className="text-2xl font-bold text-foreground">{totalCount}</p>
              <p className="text-xs text-muted-foreground mt-0.5">إجمالي الطالبات</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="p-3 text-center">
              <p className="text-2xl font-bold text-emerald-600">{withPlanCount}</p>
              <p className="text-xs text-muted-foreground mt-0.5">لديهن خطة</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="p-3 text-center">
              <p className="text-2xl font-bold text-rose-500">{withoutPlanCount}</p>
              <p className="text-xs text-muted-foreground mt-0.5">بدون خطة</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      {!loading && !error && (
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex rounded-xl overflow-hidden border border-border">
            {(["all", "with", "without"] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                  filter === f ? "bg-primary text-white" : "text-muted-foreground hover:bg-muted"
                }`}
              >
                {f === "all" ? "الكل" : f === "with" ? "لديهن خطة" : "بدون خطة"}
              </button>
            ))}
          </div>
          <input
            type="text"
            placeholder="بحث عن طالبة..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="flex-1 min-w-40 text-sm border border-border rounded-xl px-3 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary/30"
            dir="rtl"
          />
        </div>
      )}

      {/* Status tabs — leader / deputy / track supervisor only */}
      {!loading && !error && canSeeStatusTabs && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {([
            { key: "all", label: "الكل", count: totalCount },
            { key: "behind", label: STATUS_LABELS.behind, count: statusCounts.behind },
            { key: "ontrack", label: STATUS_LABELS.ontrack, count: statusCounts.ontrack },
            { key: "ahead", label: STATUS_LABELS.ahead, count: statusCounts.ahead },
            { key: "absentToday", label: ABSENT_TODAY_LABEL, count: statusCounts.absentToday },
          ] as const).map(tab => {
            const active = statusFilter === tab.key;
            const bg = tab.key === "all" ? undefined : tab.key === "absentToday" ? ABSENT_TODAY_COLOR : STATUS_COLORS[tab.key];
            const textColor = tab.key === "all" ? undefined : tab.key === "absentToday" ? ABSENT_TODAY_TEXT_COLOR : STATUS_TEXT_COLORS[tab.key];
            return (
              <button
                key={tab.key}
                onClick={() => setStatusFilter(tab.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                  active ? "border-transparent shadow-sm" : "border-border/50 text-muted-foreground hover:bg-muted"
                }`}
                style={active ? { background: bg ?? "var(--primary)", color: tab.key === "all" ? "white" : textColor } : {}}
              >
                {tab.key !== "all" && (
                  <span className="w-2.5 h-2.5 rounded-full border border-black/10" style={{ background: bg }} />
                )}
                {tab.label}
                <span className="opacity-70">({tab.count})</span>
              </button>
            );
          })}
        </div>
      )}

      {/* "٣ تأخيرات بدون تدارك" alert banner — leader / deputy / track supervisor only */}
      {!loading && !error && canSeeStatusTabs && delayAlerts.length > 0 && (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-3.5 space-y-2">
          <p className="text-xs font-bold text-rose-700 flex items-center gap-1.5">
            <XCircle className="w-4 h-4" />
            {delayAlerts.length} طالبة متأخرة ٣ أيام أو أكثر بدون تدارك
          </p>
          <div className="flex flex-wrap gap-1.5">
            {delayAlerts.map(a => (
              <span
                key={`${a.studentId}-${a.circleId}`}
                className="text-[11px] bg-white border border-rose-200 text-rose-700 rounded-full px-2.5 py-1 whitespace-nowrap"
              >
                {a.studentName} · {a.circleName} · {a.unresolvedDelayDays} أيام
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      )}

      {/* Error */}
      {error && (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-6 text-center text-rose-500 text-sm">{error}</CardContent>
        </Card>
      )}

      {/* Content grouped by track */}
      {!loading && !error && filteredTracks.length === 0 && (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-8 text-center">
            <Users className="w-10 h-10 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              {searchQuery || filter !== "all"
                ? "لا توجد نتائج تطابق هذا البحث"
                : "لا توجد حلقات مرتبطة بحسابك"}
            </p>
          </CardContent>
        </Card>
      )}

      {!loading && !error && filteredTracks.map(({ track, circles: trackCircles }) => (
        <div key={track} className="space-y-3">
          {filteredTracks.length > 1 && (
            <div className="flex items-center gap-2">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs font-bold text-muted-foreground px-2 shrink-0">مسار {track}</span>
              <div className="h-px flex-1 bg-border" />
            </div>
          )}
          <div className="space-y-3">
            {trackCircles.map(circle => (
              <CircleCard key={circle.circleId} circle={circle} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
