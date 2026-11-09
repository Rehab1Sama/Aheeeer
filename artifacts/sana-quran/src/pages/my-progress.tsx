import { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import {
  useGetCurrentUser, useListRecords, useListCircles, useListStudents,
  useListUsers, useListBadgeAssignments, useGetMyMessages,
  useListStudentGoals, useCreateStudentGoal, useUpdateStudentGoal, useDeleteStudentGoal,
  useListCalendarEvents,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BadgeChip } from "@/components/badges/BadgeChip";
import { Input } from "@/components/ui/input";
import { TrendingUp, Calendar, Users, ExternalLink, Volume2, MessageSquare, AlertTriangle, Target, Plus, CheckCircle2, Circle, BookOpen, Loader2, Trash2, Clock } from "lucide-react";
import { formatPages } from "@/lib/quran";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import AudioContent from "@/pages/audio";
import { useToast } from "@/hooks/use-toast";
import ReviewPlanSection from "@/components/ReviewPlanSection";
import MonthlyLeaderboardCard from "@/components/MonthlyLeaderboardCard";
const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function authHdr(): Record<string, string> {
  const token = localStorage.getItem("sana_auth_token");
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (token) h["Authorization"] = `Bearer ${token}`;
  return h;
}

type Tab = "progress" | "plan" | "audio" | "circle";

export default function MyProgressPage() {
  const [, navigate] = useLocation();
  const [tab, setTab] = useState<Tab>("progress");
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Goals state
  const [goalFormOpen, setGoalFormOpen] = useState(false);
  const [newGoalTitle, setNewGoalTitle] = useState("");
  const [newGoalDate, setNewGoalDate] = useState("");
  const [newGoalNotes, setNewGoalNotes] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [archivePeriods, setArchivePeriods] = useState<{ from: string; to: string }[]>([]);
  const [archiveOpen, setArchiveOpen] = useState(false);

  const { data: user } = useGetCurrentUser({ query: { queryKey: ["getCurrentUser"] } });
  const calendarYear = new Date().getFullYear();
  const { data: calendarEvents = [] } = useListCalendarEvents({ year: calendarYear }, {
    query: { queryKey: ["calendarEvents", calendarYear] },
  });
  const { data: nextCalendarEvents = [] } = useListCalendarEvents({ year: calendarYear + 1 }, {
    query: { queryKey: ["calendarEvents", calendarYear + 1] },
  });
  // السنة السابقة أيضًا: فصل بدأ في نوفمبر يبقى «الحالي» في يناير
  const { data: prevCalendarEvents = [] } = useListCalendarEvents({ year: calendarYear - 1 }, {
    query: { queryKey: ["calendarEvents", calendarYear - 1] },
  });
  useEffect(() => {
    const token = localStorage.getItem("sana_auth_token");
    fetch(`${BASE}/api/settings`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(r => r.ok ? r.json() : {})
      .then((data: any) => {
        try { setArchivePeriods(JSON.parse(data.student_record_archive_periods ?? "[]")); } catch { setArchivePeriods([]); }
      }).catch(() => setArchivePeriods([]));
  }, []);
  
  // جلب رقم الحلقة من الرابط العلوي (URL) فوراً
  const urlParams = new URLSearchParams(window.location.search);
  const urlCircleId = urlParams.get('circleId');
  
  // تحديد الحلقة النشطة بدقة: الأولوية للرابط، ثم لحساب المستخدم
  const effectiveCircleId = urlCircleId ? parseInt(urlCircleId, 10) : (user as any)?.circleId;
  const circleId = effectiveCircleId;
  const studentId = (user as any)?.studentId;

  const { data: myGoals = [] } = useListStudentGoals(studentId!, {
    query: { queryKey: ["studentGoals", studentId], enabled: !!studentId },
  });
  const createGoalMutation = useCreateStudentGoal();
  const updateGoalMutation = useUpdateStudentGoal();
  const deleteGoalMutation = useDeleteStudentGoal();

  const invalidateGoals = () => queryClient.invalidateQueries({ queryKey: ["studentGoals", studentId] });

  const activeGoals = (myGoals as any[]).filter((g: any) => !g.isCompleted);
  const leaderMessages = (myGoals as any[]).filter((g: any) => g.motivationalMessage);

  async function handleSaveGoal() {
    if (!studentId || !newGoalTitle.trim()) return;
    createGoalMutation.mutate(
      { id: studentId, data: { title: newGoalTitle.trim(), targetDate: newGoalDate || undefined, notes: newGoalNotes || undefined } },
      {
        onSuccess: () => {
          toast({ title: "تم إضافة الهدف 🎯" });
          invalidateGoals();
          setGoalFormOpen(false);
          setNewGoalTitle(""); setNewGoalDate(""); setNewGoalNotes("");
        },
      }
    );
  }

  function handleToggleGoal(goalId: number, current: boolean) {
    if (!studentId) return;
    updateGoalMutation.mutate({ id: studentId, goalId, data: { isCompleted: !current } }, {
      onSuccess: () => invalidateGoals(),
    });
  }

  function handleDeleteGoal(goalId: number) {
    if (!studentId || !confirm("هل تريدين حذف هذا الهدف؟")) return;
    deleteGoalMutation.mutate({ id: studentId, goalId }, {
      onSuccess: () => { toast({ title: "تم حذف الهدف" }); invalidateGoals(); },
    });
  }

  // السجلات مفلترة بـ (studentId + circleId) — يعرض فقط سجلات الحلقة النشطة حالياً
  const { data: records } = useListRecords(
    studentId ? (effectiveCircleId ? { circleId: effectiveCircleId } : undefined) : undefined,
    { query: { queryKey: ["myRecords", studentId, effectiveCircleId], enabled: !!studentId } }
  );

  const onCircleTab = tab === "circle";
  // Circles always fetched (needed for trackType in shortcomings computation)
  const { data: allCircles = [] } = useListCircles(undefined, { query: { queryKey: ["circles"], enabled: !!user?.id } });
  const { data: allStudents = [] } = useListStudents(undefined, { query: { queryKey: ["allStudents"], enabled: onCircleTab } });
  const { data: allUsers = [] } = useListUsers(undefined, { query: { queryKey: ["users"], enabled: !!user?.id } });
  const { data: allBadgeAssignments = [] } = useListBadgeAssignments(undefined, { query: { queryKey: ["badgeAssignments"] } });
  const { data: myMessages = [] } = useGetMyMessages({ query: { queryKey: ["myMessages"], enabled: onCircleTab } });
  const myCircle = allCircles.find((c: any) => c.id === circleId);
  const circleChoices = ((user as any)?.circles ?? []).filter((c: any) => c?.id);
  const myTrackType: string = (user as any)?.circleTrackType ?? (myCircle as any)?.trackType ?? "";
  const circleMembers = (allStudents as any[]).filter((s: any) => s.circleId === circleId && s.fullName !== user?.name);
  const circleTeacher = (allUsers as any[]).find((u: any) => u.role === "teacher" && u.circleId === circleId)
    ?? ((user as any)?.circleTeacherName ? { name: (user as any).circleTeacherName } : null);
  const circleSupervisor = (allUsers as any[]).find((u: any) => u.role === "supervisor" && u.circleId === circleId)
    ?? ((user as any)?.circleSupervisorName ? { name: (user as any).circleSupervisorName } : null);
  const circleBadges = (allBadgeAssignments as any[]).filter((a: any) => a.entityType === "circle" && a.entityId === circleId);
  const myBadges = (allBadgeAssignments as any[]).filter((a: any) => a.entityType === "student" && a.entityId === user?.id);

  const [myLiveBadges, setMyLiveBadges] = useState<any[]>([]);
  useEffect(() => {
    if (!studentId) { setMyLiveBadges([]); return; }
    fetch(`${BASE}/api/live-badges/student/${studentId}`, { headers: authHdr() })
      .then(r => r.ok ? r.json() : [])
      .then(setMyLiveBadges)
      .catch(() => setMyLiveBadges([]));
  }, [studentId]);
  const circleMessages = (myMessages as any[]).filter((m: any) => m.targetType === "circle");

  // Progress data
  const sortedRecords = (records ?? [])
    .filter(r => !effectiveCircleId || (r as any).circleId === effectiveCircleId)
    .slice()
    .sort((a: any, b: any) => b.date.localeCompare(a.date));
  const visibleRecords = sortedRecords.filter((r: any) => (!dateFrom || r.date >= dateFrom) && (!dateTo || r.date <= dateTo));
  const allCalendarEvents = [...(prevCalendarEvents as any[]), ...(calendarEvents as any[]), ...(nextCalendarEvents as any[])];
  const semesterStarts = allCalendarEvents
    .filter(e => /بداية\s+الفصل/.test(e.title ?? ""))
    .sort((a, b) => a.date.localeCompare(b.date));
  const firstTermStart = semesterStarts.find(e => /الفصل\s*الأول/.test(e.title ?? ""))?.date;
  // الفصل الحالي من التقويم: آخر «بداية الفصل» بدأ فعلًا (كان مكتوبًا «الفصل الثاني» ثابتًا)
  const todayIso = new Date(Date.now() + 3 * 3600 * 1000).toISOString().slice(0, 10);
  const startedTerms = semesterStarts.filter(e => e.date <= todayIso);
  const currentTermEvent = startedTerms[startedTerms.length - 1] ?? semesterStarts.find(e => /الفصل\s*الثاني/.test(e.title ?? "")) ?? semesterStarts[1];
  const secondTermStart = currentTermEvent?.date;
  const currentTermName = (/بداية\s+(الفصل\s+\S+)/.exec(currentTermEvent?.title ?? "")?.[1] ?? "الفصل الحالي").trim();
  const nextTermEvent = semesterStarts.find(e => e.date > todayIso);
  // ما قبل بداية الفصل الحالي يُعرض أرشيفًا، وما بعدها سجل الفصل الحالي.
  const archivedRecords = visibleRecords.filter((r: any) =>
    secondTermStart ? r.date < secondTermStart : archivePeriods.some(p => r.date >= p.from && r.date <= p.to)
  );
  const currentRecords = visibleRecords.filter((r: any) =>
    secondTermStart ? r.date >= secondTermStart : !archivePeriods.some(p => r.date >= p.from && r.date <= p.to)
  );
  const totalMemorize = Math.round(visibleRecords.reduce((s, r) => s + (r.memorizePages ?? 0), 0) * 2) / 2;
  const latestRecord = visibleRecords.find(r => !r.isAbsent);
  const TOTAL_QURAN_PAGES = 604;
  const progressPct = Math.min(100, Math.round((totalMemorize / TOTAL_QURAN_PAGES) * 1000) / 10);

  // Shortcomings (التقصير) — mirrors logic in shortcomings.ts on the server
  const isRecitationTrack = myTrackType === "recitation";

  function computeShortcoming(r: any): { isShortcoming: boolean; reasons: string[] } {
    if (r.isAbsent) return { isShortcoming: false, reasons: [] };
    if (r.shortcomingOverride === true) return { isShortcoming: true, reasons: ["تقصير يدوي"] };
    if (r.shortcomingOverride === false) return { isShortcoming: false, reasons: [] };

    const reasons: string[] = [];
    let noReview = false;
    if (!isRecitationTrack) {
      noReview =
        (r.reviewNearPages ?? 0) === 0 &&
        (r.reviewFarPages ?? 0) === 0 &&
        (r.reviewPages ?? 0) === 0;
      if (noReview) reasons.push("بلا مراجعة");
    }
    const notListened = r.listenedToReciter === false;
    if (notListened) reasons.push("لم تسمع للمقرئ");
    // Non-recitation: either no review OR didn't hear → shortcoming
    const isShortcoming = !isRecitationTrack ? (noReview || notListened) : notListened;
    return { isShortcoming, reasons };
  }

  const shortcomingRecords = currentRecords
    .map(r => ({ r, ...computeShortcoming(r) }))
    .filter(x => x.isShortcoming);

  const now = new Date();
  const monthlyTrend = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const monthRecords = currentRecords.filter(r => r.date.startsWith(month));
    const sessions = monthRecords.length;
    const absences = monthRecords.filter(r => r.isAbsent).length;
    return {
      name: d.toLocaleDateString("ar-SA", { month: "short" }),
      rate: sessions > 0 ? Math.round(((sessions - absences) / sessions) * 100) : null,
      sessions, absences,
    };
  }).reverse();

  const hasPlanTab = myTrackType === "girls" || myTrackType === "fixation";
  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "progress", label: "تقدمي", icon: <TrendingUp className="w-4 h-4" /> },
    ...(hasPlanTab ? [{ id: "plan" as Tab, label: myTrackType === "fixation" ? "التثبيت" : "خطتي", icon: <BookOpen className="w-4 h-4" /> }] : []),
    { id: "audio",    label: "السماع",  icon: <Volume2 className="w-4 h-4" /> },
    { id: "circle",  label: "حلقتي",   icon: <Users className="w-4 h-4" /> },
  ];

  return (
    <div className="space-y-5" dir="rtl">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-foreground">مرحبًا، {user?.name}</h1>
          <p className="text-muted-foreground text-sm mt-0.5">{myCircle?.name ?? circleChoices.find((c: any) => c.id === effectiveCircleId)?.name ?? "..."}</p>
          {circleChoices.length > 1 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {circleChoices.map((c: any) => (
                <button key={c.id} onClick={() => { const url = new URL(window.location.href); url.searchParams.set("circleId", String(c.id)); window.location.assign(url.toString()); }}
                  className={`text-xs px-2.5 py-1 rounded-full border ${c.id === effectiveCircleId ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground border-border"}`}>
                  {c.name}
                </button>
              ))}
            </div>
          )}
        </div>
        {effectiveCircleId && (
          <button
            onClick={() => navigate(`/circle/${effectiveCircleId}`)}
            className="shrink-0 text-xs font-semibold text-primary hover:underline px-2 py-1 rounded-lg border border-primary/20"
          >
            عرض صفحة الحلقة الموحّدة
          </button>
        )}
      </div>

      <MonthlyLeaderboardCard userRole={(user as any)?.role} />

      <Card className="border-0 shadow-sm">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div><label className="text-xs text-muted-foreground block mb-1">من تاريخ</label><Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} /></div>
            <div><label className="text-xs text-muted-foreground block mb-1">إلى تاريخ</label><Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} /></div>
            {(dateFrom || dateTo) && <Button variant="outline" onClick={() => { setDateFrom(""); setDateTo(""); }}>مسح الفترة</Button>}
          </div>
        </CardContent>
      </Card>

      {/* Leader Messages Banner */}
      {leaderMessages.length > 0 && (
        <div className="rounded-2xl bg-gradient-to-r from-teal-600 to-teal-700 p-4 text-white shadow-md">
          <div className="flex items-start gap-3">
            <div className="text-2xl">💌</div>
            <div className="flex-1 min-w-0">
              <p className="text-white/80 text-xs font-semibold mb-1 uppercase tracking-wide">رسالة من القائدة</p>
              <p className="font-medium text-sm leading-snug italic">"{leaderMessages[0].motivationalMessage}"</p>
              {leaderMessages[0].title && (
                <p className="text-white/70 text-xs mt-1.5">بخصوص هدف: {leaderMessages[0].title}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tab bar */}
      <div className="flex gap-1 bg-muted/60 rounded-2xl p-1">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-bold transition-all ${
              tab === t.id
                ? "bg-white shadow text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* ─── Tab: خطتي / التثبيت ─── */}
      {tab === "plan" && (
        <div className="space-y-5">
          {studentId && circleId ? (
            <ReviewPlanSection
              studentId={studentId}
              circleId={circleId}
              trackType={myTrackType}
              canCreate={true}
              studentSelf={true}
            />
          ) : (
            <div className="text-center py-12 text-muted-foreground text-sm">
              لا يمكن تحميل بيانات الخطة
            </div>
          )}
        </div>
      )}

      {/* ─── Tab 1: تقدمي ─── */}
      {tab === "progress" && (
        <div className="space-y-5">
          {/* Progress bar */}
          <Card className="border-0 shadow-sm" data-testid="card-progress-bar">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary" />
                التقدم في الحفظ
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{formatPages(totalMemorize)} وجه من أصل {TOTAL_QURAN_PAGES}</span>
                <span className="font-bold text-primary">{progressPct}%</span>
              </div>
              <div className="bg-muted rounded-full h-5 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${progressPct}%`,
                    background: "linear-gradient(90deg, #1A2260 0%, #2B3784 100%)",
                  }}
                />
              </div>
              {latestRecord?.memorizeSurahStart && (
                <p className="text-xs text-muted-foreground">
                  آخر حفظ: من {latestRecord.memorizeSurahStart} إلى {latestRecord.memorizeSurahEnd}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Stats */}
          <div className="grid grid-cols-1 gap-4">
            <Card className="border-0 shadow-sm" data-testid="card-total-memorize">
              <CardContent className="p-4 text-center">
                <p className="text-3xl font-bold text-teal-600">{formatPages(totalMemorize)}</p>
                <p className="text-xs text-muted-foreground mt-1 font-medium">إجمالي الحفظ (وجه)</p>
              </CardContent>
            </Card>
          </div>

          {/* الأوسمة الجديدة: تبقى في الصفحة الأمامية ٢٤ ساعة فقط، ثم تكون في صفحة «أوسمتي» */}
          {(() => {
            const DAY_MS = 24 * 60 * 60 * 1000;
            const isNew = (t?: string | null) => !!t && Date.now() - new Date(t).getTime() < DAY_MS;
            const newLive = myLiveBadges.filter((b: any) => isNew(b.awardedAt));
            const newPersonal = myBadges.filter((b: any) => isNew(b.createdAt));
            const total = myLiveBadges.length + myBadges.length;
            if (total === 0) return null;
            return (
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-bold flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2">🌟 {newLive.length + newPersonal.length > 0 ? "وسام جديد" : "أوسمتي"}</span>
                    <a href={`${import.meta.env.BASE_URL.replace(/\/$/, "")}/badges`} className="text-xs font-normal text-primary">كل أوسمتي ({total}) ←</a>
                  </CardTitle>
                </CardHeader>
                {newLive.length + newPersonal.length > 0 && (
                  <CardContent className="pt-0">
                    <div className="flex flex-wrap gap-4 items-center">
                      {newLive.map((b: any) => <BadgeChip key={b.badgeId} badge={b} size={400} compact />)}
                      {newPersonal.map((b: any) => (
                        <span key={b.id} className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-semibold text-white" style={{ backgroundColor: b.badgeColor ?? "#f59e0b" }}>
                          {b.badgeEmoji} {b.badgeName}
                        </span>
                      ))}
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })()}

          {/* Latest record */}
          {latestRecord && (
            <Card className="border-0 shadow-sm" data-testid="card-latest-record">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-primary" />
                  آخر جلسة · {latestRecord.date}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {(latestRecord.memorizePages ?? 0) > 0 && (
                    <div className="bg-teal-50 rounded-xl p-3">
                      <p className="text-xs text-teal-600 font-semibold mb-1">الحفظ</p>
                      <p className="text-xl font-bold text-teal-700">{formatPages(latestRecord.memorizePages)}</p>
                      <p className="text-xs text-teal-500 mt-0.5">وجه</p>
                      {latestRecord.memorizeSurahStart && (
                        <p className="text-xs text-teal-400 mt-1 truncate">
                          {latestRecord.memorizeSurahStart} ← {latestRecord.memorizeSurahEnd}
                        </p>
                      )}
                    </div>
                  )}
                  {(latestRecord.reviewNearPages ?? 0) > 0 && (
                    <div className="bg-blue-50 rounded-xl p-3">
                      <p className="text-xs text-blue-600 font-semibold mb-1">مراجعة قريبة</p>
                      <p className="text-xl font-bold text-blue-700">{formatPages(latestRecord.reviewNearPages)}</p>
                      <p className="text-xs text-blue-500 mt-0.5">وجه</p>
                    </div>
                  )}
                  {(latestRecord.reviewFarPages ?? 0) > 0 && (
                    <div className="bg-teal-100 rounded-xl p-3">
                      <p className="text-xs text-teal-600 font-semibold mb-1">مراجعة بعيدة</p>
                      <p className="text-xl font-bold text-teal-600">{formatPages(latestRecord.reviewFarPages)}</p>
                      <p className="text-xs text-teal-600 mt-0.5">وجه</p>
                    </div>
                  )}
                  {((latestRecord as any).reviewPages ?? 0) > 0 && (
                    <div className="bg-cyan-50 rounded-xl p-3">
                      <p className="text-xs text-cyan-600 font-semibold mb-1">المراجعة</p>
                      <p className="text-xl font-bold text-cyan-700">{formatPages((latestRecord as any).reviewPages)}</p>
                      <p className="text-xs text-cyan-500 mt-0.5">وجه</p>
                    </div>
                  )}
                  {(latestRecord.recitationPages ?? 0) > 0 && (
                    <div className="bg-emerald-50 rounded-xl p-3">
                      <p className="text-xs text-emerald-600 font-semibold mb-1">التلاوة</p>
                      <p className="text-xl font-bold text-emerald-700">{formatPages(latestRecord.recitationPages)}</p>
                      <p className="text-xs text-emerald-500 mt-0.5">وجه</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Attendance trend */}
          {monthlyTrend.some(m => m.sessions > 0) && (
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-primary" />
                  تطور حضوري (6 أشهر)
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0 pb-3">
                <ResponsiveContainer width="100%" height={140}>
                  <AreaChart data={monthlyTrend} margin={{ top: 8, right: 16, bottom: 0, left: -24 }}>
                    <defs>
                      <linearGradient id="myTrendGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#7c3aed" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                    <YAxis domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 10 }} />
                    <Tooltip
                      formatter={(v: any) => v != null ? [`${v}%`, "نسبة الحضور"] : ["—", "نسبة الحضور"]}
                      contentStyle={{ direction: "rtl", fontFamily: "Arial", fontSize: 12 }}
                    />
                    <Area type="monotone" dataKey="rate" stroke="#7c3aed" strokeWidth={2.5}
                      fill="url(#myTrendGrad)" dot={{ r: 4, fill: "#7c3aed" }} connectNulls />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Full records table */}
          <Card className="border-0 shadow-sm" data-testid="card-records-history">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <Calendar className="w-4 h-4 text-primary" />
                سجل {currentTermName}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {currentRecords.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground text-sm">
                  لا سجلات في {currentTermName} بعد — ستظهر هنا أي سجلات جديدة مباشرة.
                  {secondTermStart && <span className="block mt-1 text-xs">يبدأ في {secondTermStart}</span>}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="mobile-cards w-full text-sm">
                    <thead className="bg-muted/50 border-b border-border">
                      <tr>
                        <th className="text-right py-3 px-4 font-semibold text-muted-foreground">التاريخ</th>
                        <th className="text-right py-3 px-4 font-semibold text-muted-foreground">الحلقة</th>
                        <th className="text-right py-3 px-4 font-semibold text-muted-foreground">الحفظ</th>
                        <th className="text-right py-3 px-4 font-semibold text-muted-foreground">المراجعة</th>
                        <th className="text-right py-3 px-4 font-semibold text-muted-foreground">الحالة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {currentRecords.filter(r => (r as any).circleId === effectiveCircleId).map(record => {
                        const recCircle = (allCircles as any[]).find((c: any) => c.id === (record as any).circleId);
                        return (
                          <tr key={record.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors"
                            data-testid={`row-record-${record.id}`}>
                            <td className="py-2.5 px-4 font-medium text-xs">{record.date}</td>
                            <td className="py-2.5 px-4 text-xs text-muted-foreground">
                              {recCircle?.name ?? "—"}
                            </td>
                            <td className="py-2.5 px-4 text-teal-600 font-semibold">{formatPages(record.memorizePages)}</td>
                            <td className="py-2.5 px-4 text-blue-600 font-medium">
                              {formatPages(
                                (record.reviewNearPages ?? 0) +
                                (record.reviewFarPages ?? 0) +
                                ((record as any).reviewPages ?? 0)
                              )}
                            </td>
                            <td className="py-2.5 px-4">
                              {record.isAbsent
                                ? <Badge className="bg-rose-100 text-rose-700 border-0 text-xs">غائبة</Badge>
                                : <Badge className="bg-emerald-100 text-emerald-700 border-0 text-xs">حاضرة</Badge>}
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

          {/* ─── My Goals ─── */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-bold flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Target className="w-4 h-4 text-teal-600" />
                  أهدافي
                </div>
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1 border-teal-200 text-teal-700 hover:bg-teal-50"
                  onClick={() => setGoalFormOpen(v => !v)}>
                  <Plus className="w-3 h-3" /> هدف جديد
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {goalFormOpen && (
                <div className="bg-teal-50/60 rounded-xl p-3 space-y-2 border border-teal-100">
                  <Input
                    placeholder="عنوان الهدف *"
                    value={newGoalTitle}
                    onChange={e => setNewGoalTitle(e.target.value)}
                    className="text-sm"
                  />
                  <Input
                    type="date"
                    value={newGoalDate}
                    onChange={e => setNewGoalDate(e.target.value)}
                    className="text-sm"
                  />
                  <Input
                    placeholder="ملاحظات (اختياري)"
                    value={newGoalNotes}
                    onChange={e => setNewGoalNotes(e.target.value)}
                    className="text-sm"
                  />
                  <div className="flex gap-2 justify-end">
                    <Button size="sm" variant="ghost" className="h-7 text-xs"
                      onClick={() => { setGoalFormOpen(false); setNewGoalTitle(""); setNewGoalDate(""); setNewGoalNotes(""); }}>
                      إلغاء
                    </Button>
                    <Button size="sm" className="h-7 text-xs bg-teal-600 hover:bg-teal-700"
                      onClick={handleSaveGoal}
                      disabled={!newGoalTitle.trim() || createGoalMutation.isPending}>
                      حفظ
                    </Button>
                  </div>
                </div>
              )}
              {(myGoals as any[]).length === 0 && !goalFormOpen ? (
                <p className="text-xs text-center text-muted-foreground py-3">لا توجد أهداف بعد — ابدئي بإضافة هدف 🎯</p>
              ) : (
                (myGoals as any[]).map((g: any) => (
                  <div key={g.id} className={`rounded-xl p-3 border transition-colors ${g.isCompleted ? "bg-green-50/60 border-green-100" : "bg-muted/20 border-border/30"}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2 flex-1 min-w-0">
                        <button onClick={() => handleToggleGoal(g.id, g.isCompleted)} className="mt-0.5 flex-shrink-0">
                          {g.isCompleted
                            ? <CheckCircle2 className="w-4 h-4 text-green-600" />
                            : <Circle className="w-4 h-4 text-muted-foreground" />}
                        </button>
                        <div className="min-w-0 flex-1">
                          <p className={`text-sm font-medium leading-tight ${g.isCompleted ? "line-through text-muted-foreground" : ""}`}>{g.title}</p>
                          {g.targetDate && (
                            <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {new Date(g.targetDate).toLocaleDateString("ar-SA")}
                            </p>
                          )}
                          {g.notes && <p className="text-xs text-muted-foreground mt-0.5">{g.notes}</p>}
                          {g.motivationalMessage && (
                            <p className="text-xs text-teal-700 mt-1.5 italic bg-teal-50 rounded-lg px-2 py-1">✨ {g.motivationalMessage}</p>
                          )}
                        </div>
                      </div>
                      <button onClick={() => handleDeleteGoal(g.id)}
                        className="p-1 rounded hover:bg-rose-50 text-muted-foreground hover:text-rose-600 transition-colors flex-shrink-0">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {user?.role === "student" && (
            <Card className="border-0 shadow-sm opacity-80">
              <button className="w-full p-4 flex items-center justify-between text-right" onClick={() => setArchiveOpen(v => !v)}>
                <span className="font-bold text-[#4A5590]">السجل الكامل — الفصل الأول</span>
                <span className="text-xs text-muted-foreground">{archiveOpen ? "إخفاء السجل" : `${archivedRecords.length} سجل سابق`}</span>
              </button>
              {archiveOpen && <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-[#F1F2F8] border-b border-[#C8CDE8]/50">
                      <tr>
                        <th className="text-right py-3 px-4 font-semibold text-[#5A6490]">التاريخ</th>
                        <th className="text-right py-3 px-4 font-semibold text-[#5A6490]">الحلقة</th>
                        <th className="text-right py-3 px-4 font-semibold text-[#5A6490]">الحفظ</th>
                        <th className="text-right py-3 px-4 font-semibold text-[#5A6490]">المراجعة</th>
                      </tr>
                    </thead>
                    <tbody>{archivedRecords.map(record => {
                      const recCircle = (allCircles as any[]).find((c: any) => c.id === (record as any).circleId);
                      return <tr key={record.id} className="border-b border-[#C8CDE8]/30 opacity-75">
                        <td className="py-2.5 px-4 text-xs">{record.date}</td>
                        <td className="py-2.5 px-4 text-xs text-muted-foreground">{recCircle?.name ?? "—"}</td>
                        <td className="py-2.5 px-4 text-teal-600 font-semibold">{formatPages(record.memorizePages)}</td>
                        <td className="py-2.5 px-4 text-blue-600 font-medium">{formatPages((record.reviewNearPages ?? 0) + (record.reviewFarPages ?? 0) + ((record as any).reviewPages ?? 0))}</td>
                      </tr>;
                    })}</tbody>
                  </table>
                </div>
                <p className="px-4 py-3 text-xs text-muted-foreground">الفصل الأول مغلق؛ الغياب والتقصير لا يظهران هنا.</p>
              </CardContent>}
            </Card>
          )}

        </div>
      )}

      {/* ─── Tab 2: السماع ─── */}
      {tab === "audio" && <AudioContent />}

      {/* ─── Tab 3: حلقتي ─── */}
      {tab === "circle" && (
        <div className="space-y-5">

          {/* Circle header card */}
          <Card className="border-0 shadow-sm bg-gradient-to-l from-teal-50 to-teal-50">
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-teal-500 font-semibold mb-1">حلقتي</p>
                  <p className="text-xl font-bold text-teal-800">{(myCircle as any)?.name ?? "—"}</p>
                </div>
                {(myCircle as any)?.whatsappLink && (
                  <a
                    href={(myCircle as any).whatsappLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 bg-green-500 hover:bg-green-600 text-white text-xs font-bold px-3 py-2 rounded-xl transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    قروب الواتساب
                  </a>
                )}
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="bg-white/70 rounded-xl p-3">
                  <p className="text-xs text-muted-foreground mb-1">المعلمة</p>
                  <p className="font-semibold text-sm">{circleTeacher?.name ?? "—"}</p>
                </div>
                <div className="bg-white/70 rounded-xl p-3">
                  <p className="text-xs text-muted-foreground mb-1">المشرفة</p>
                  <p className="font-semibold text-sm">{circleSupervisor?.name ?? "—"}</p>
                </div>
                {(myCircle as any)?.meetingTime && (
                  <div className="bg-white/70 rounded-xl p-3 col-span-2">
                    <p className="text-xs text-muted-foreground mb-1">⏰ وقت الحلقة</p>
                    <p className="font-semibold text-sm text-teal-700">{(myCircle as any).meetingTime}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Circle badges */}
          {circleBadges.length > 0 && (
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold">🏆 أوسمة الحلقة</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex flex-wrap gap-2">
                  {circleBadges.map((b: any) => (
                    <span
                      key={b.id}
                      className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-semibold text-white"
                      style={{ backgroundColor: b.badgeColor ?? "#f59e0b" }}
                    >
                      {b.badgeEmoji} {b.badgeName}
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Messages from leader about the circle */}
          {circleMessages.length > 0 && (
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-primary" />
                  رسائل القائدة للحلقة
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-2">
                {circleMessages.map((m: any) => (
                  <div key={m.id} className="bg-primary/5 rounded-xl p-3 border border-primary/10">
                    <p className="text-sm leading-relaxed">{m.content}</p>
                    <p className="text-xs text-muted-foreground mt-1.5">
                      {m.senderName} · {new Date(m.createdAt).toLocaleDateString("ar-SA", { month: "long", day: "numeric" })}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Circle members */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Users className="w-4 h-4 text-primary" />
                بنات الحلقة ({circleMembers.length + 1})
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {/* Me first */}
              <div className="flex items-center gap-3 py-2.5 border-b border-border/40">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold">
                  أنا
                </div>
                <span className="font-semibold text-sm">{user?.name}</span>
                <Badge className="mr-auto text-xs bg-primary/10 text-primary border-0">أنتِ</Badge>
              </div>
              {circleMembers.length === 0 ? (
                <p className="text-xs text-muted-foreground py-3 text-center">لا توجد طالبات أخريات في الحلقة</p>
              ) : (
                circleMembers.map((s: any, i: number) => (
                  <div
                    key={s.id}
                    className={`flex items-center gap-3 py-2.5 ${i < circleMembers.length - 1 ? "border-b border-border/30" : ""}`}
                  >
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-muted-foreground text-xs font-bold">
                      {s.fullName?.charAt(0) ?? "؟"}
                    </div>
                    <span className="text-sm">{s.fullName}</span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

        </div>
      )}

    </div>
  );
}
