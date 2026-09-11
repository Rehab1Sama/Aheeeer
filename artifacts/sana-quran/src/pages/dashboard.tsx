import { useGetStatsSummary, useGetCirclesStats, useGetCurrentUser, useGetRepeatedAbsences, useGetMonthlyComparison, useGetDailySnapshot, useListStudentsNearCompletion } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BookOpen, Users, Calendar, Star, TrendingUp, TrendingDown, Minus, Award, CheckCircle2, AlertTriangle, Plane, ClipboardCheck, AlertCircle, GraduationCap, ShieldCheck, ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { formatPages } from "@/lib/quran";
import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import MonthlyLeaderboardCard from "@/components/MonthlyLeaderboardCard";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type WeeklyData = {
  thisWeek: {
    memorize: number; reviewNear: number; reviewFar: number; totalPages: number;
    absences: number; attendanceRate: number | null;
    topStudents: { name: string; pages: number }[];
    topCircleName: string | null; topCirclePages: number;
  };
  lastWeek: { memorize: number; totalPages: number; absences: number; topStudents: { name: string; pages: number }[] };
  trends: Record<string, "up" | "down" | "same">;
  changes: Record<string, number | null>;
};

function useWeeklyDash(circleId?: number | null) {
  const [data, setData] = useState<WeeklyData | null>(null);
  useEffect(() => {
    setData(null);
    const token = localStorage.getItem("sana_auth_token");
    const qs = circleId ? `?circleId=${circleId}` : '';
    fetch(`${BASE}/api/stats/weekly-comparison${qs}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(r => r.ok ? r.json() : null)
      .then(setData)
      .catch(() => {});
  }, [circleId]);
  return data;
}

type HonorData = {
  month: string; monthLabel: string; honoredCount: number;
  honored: { studentId: number; studentName: string; circleName: string; track: string; memorizePages: number; sessions: number }[];
};

function useMonthlyHonor(month?: string) {
  const [data, setData] = useState<HonorData | null>(null);
  useEffect(() => {
    const token = localStorage.getItem("sana_auth_token");
    const params = month ? `?month=${month}` : "";
    fetch(`${BASE}/api/stats/monthly-honor${params}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(r => r.ok ? r.json() : null)
      .then(setData)
      .catch(() => {});
  }, [month]);
  return data;
}

function TrendIcon({ trend }: { trend?: string }) {
  if (trend === "up") return <TrendingUp className="w-3 h-3 text-emerald-500" />;
  if (trend === "down") return <TrendingDown className="w-3 h-3 text-rose-500" />;
  return <Minus className="w-3 h-3 text-muted-foreground" />;
}

function MonthlyHonorBoard({ role }: { role?: string }) {
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const honor = useMonthlyHonor(selectedMonth);

  const prevMonth = () => {
    const [y, m] = selectedMonth.split("-").map(Number);
    const d = new Date(y, m - 2, 1);
    setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };
  const nextMonth = () => {
    const [y, m] = selectedMonth.split("-").map(Number);
    const d = new Date(y, m, 1);
    const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const nextKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (nextKey > todayKey) return;
    setSelectedMonth(nextKey);
  };
  const isCurrentMonth = selectedMonth === `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  if (!honor) return null;

  return (
    <Card className="border-0 shadow-sm border-r-4 border-r-yellow-400 bg-gradient-to-l from-yellow-50/60 to-amber-50/40">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-bold flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-yellow-600" />
            لوحة التكريم الشهري
          </CardTitle>
          <div className="flex items-center gap-1">
            <button onClick={prevMonth} className="p-1 rounded-lg hover:bg-muted/60 transition-colors">
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </button>
            <span className="text-xs font-semibold text-foreground px-1 min-w-[80px] text-center">{honor.monthLabel}</span>
            <button onClick={nextMonth} disabled={isCurrentMonth} className="p-1 rounded-lg hover:bg-muted/60 transition-colors disabled:opacity-30">
              <ChevronLeft className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {honor.honoredCount === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            لا توجد طالبات مكتملة الشروط حتى الآن
          </p>
        ) : (
          <>
            <div className="flex items-center gap-2 bg-yellow-100/60 rounded-xl px-3 py-2">
              <Star className="w-4 h-4 text-yellow-600 shrink-0" />
              <p className="text-xs text-yellow-800 font-medium">
                طالبات بلا غياب ولا تقصير — <strong>{honor.honoredCount} طالبة</strong>
              </p>
            </div>
            <div className="space-y-1.5 max-h-72 overflow-y-auto">
              {honor.honored.map((s, i) => (
                <div key={s.studentId} className="flex items-center gap-2 bg-white/70 rounded-xl px-3 py-2">
                  <span className="text-sm font-bold text-amber-500 w-6 shrink-0">
                    {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{s.studentName}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{s.circleName} · {s.track}</p>
                  </div>
                  <div className="flex flex-col items-end shrink-0">
                    <span className="text-xs font-bold bg-teal-100 text-teal-700 rounded-full px-2 py-0.5">{formatPages(s.memorizePages)} وجه</span>
                    <span className="text-[10px] text-muted-foreground mt-0.5">{s.sessions} جلسة</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  // circleId من الرابط هو مصدر الحقيقة الوحيد — يمنع خلط بيانات الحلقات
  const urlCircleId = new URLSearchParams(window.location.search).get('circleId');
  const circleId: number | null | undefined = urlCircleId
    ? parseInt(urlCircleId, 10)
    : undefined;

  const { data: user } = useGetCurrentUser({ query: { queryKey: ["getCurrentUser"] } });
  // إذا لم يكن في الرابط، استخدم circleId المستخدم من الـ JWT
  const effectiveCircleId: number | null | undefined = circleId ?? ((user as any)?.circleId as number | null | undefined);

  const dashboardToday = new Date().toISOString().slice(0, 10);
  const dashboardFromDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const circleParam = effectiveCircleId
    ? { circleId: effectiveCircleId, dateFrom: dashboardFromDate, dateTo: dashboardToday }
    : { dateFrom: dashboardFromDate, dateTo: dashboardToday };

  const { data: summary } = useGetStatsSummary(circleParam as any, { query: { queryKey: ["statsSummary", effectiveCircleId] } });
  const { data: circleStats } = useGetCirclesStats(circleParam as any, { query: { queryKey: ["circlesStats", effectiveCircleId] } });
  const { data: monthly } = useGetMonthlyComparison({ query: { queryKey: ["monthlyComparison", effectiveCircleId], ...(effectiveCircleId ? {} : {}) } });
  const weekly = useWeeklyDash(effectiveCircleId);
  const { data: repeatedAbsences } = useGetRepeatedAbsences(
    { minAbsences: 3, ...(circleParam as any) },
    { query: { queryKey: ["repeatedAbsences", effectiveCircleId] } }
  );
  const { data: snapshot } = useGetDailySnapshot({ query: { queryKey: ["dailySnapshot", effectiveCircleId] } });
  const { data: nearCompletion = [] } = useListStudentsNearCompletion({ query: { queryKey: ["nearCompletion", effectiveCircleId] } });

  const stats = [
    {
      label: "أوجه الحفظ",
      value: formatPages(summary?.totalMemorizePages),
      icon: BookOpen,
      bg: "bg-teal-50",
      textColor: "text-teal-700",
    },
    {
      label: "المراجعة القريبة",
      value: formatPages(summary?.totalReviewNearPages),
      icon: TrendingUp,
      bg: "bg-blue-50",
      textColor: "text-blue-700",
    },
    {
      label: "المراجعة البعيدة",
      value: formatPages(summary?.totalReviewFarPages),
      icon: TrendingUp,
      bg: "bg-teal-100",
      textColor: "text-teal-600",
    },
    {
      label: "إجمالي الغيابات",
      value: summary?.totalAbsences?.toString() ?? "0",
      icon: Calendar,
      bg: "bg-rose-50",
      textColor: "text-rose-700",
    },
    {
      label: "الطالبات (فتيات)",
      value: summary?.totalGirlsStudents?.toString() ?? "0",
      icon: Users,
      bg: "bg-pink-50",
      textColor: "text-pink-700",
    },
    {
      label: "الأمهات",
      value: summary?.totalMothersStudents?.toString() ?? "0",
      icon: Users,
      bg: "bg-emerald-50",
      textColor: "text-emerald-700",
    },
    {
      label: "الأطفال",
      value: summary?.totalChildrenStudents?.toString() ?? "0",
      icon: Users,
      bg: "bg-amber-50",
      textColor: "text-amber-700",
    },
    {
      label: "الحلقة الأكثر إنجازًا",
      value: summary?.topCircle ?? "—",
      sub: summary?.topCirclePages != null ? `${formatPages(summary.topCirclePages)} وجه` : "",
      icon: Star,
      bg: "bg-teal-50",
      textColor: "text-teal-700",
    },
    {
      label: "الحلقة الأقل غيابًا",
      value: summary?.leastAbsentCircle ?? "—",
      sub: summary?.leastAbsentCircleAbsences != null ? `${summary.leastAbsentCircleAbsences} غياب` : "",
      icon: CheckCircle2,
      bg: "bg-green-50",
      textColor: "text-green-700",
    },
    ...((summary as any)?.totalFixationPages > 0 ? [{
      label: "التثبيت الجديد (سُنى)",
      value: formatPages((summary as any).totalFixationPages),
      icon: BookOpen,
      bg: "bg-amber-50",
      textColor: "text-amber-700",
    }] : []),
  ];

  const hasMoshkah = summary?.moshkahTopMemorize || summary?.moshkahTopReview || summary?.moshkahTopRecitation;
  const hasAlerts = repeatedAbsences && repeatedAbsences.length > 0;

  return (
    <div className="space-y-8" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">مرحبًا، {user?.name}</h1>
        <p className="text-muted-foreground mt-1 text-sm">لوحة التحكم الرئيسية</p>
      </div>

      <MonthlyLeaderboardCard userRole={(user as any)?.role} />

      {/* Daily Snapshot */}
      {snapshot && (
        <div className="space-y-4">
          {/* Today's activity cards */}
          <div className="grid grid-cols-3 gap-3">
            <Card className={`border-0 shadow-sm ${
              snapshot.circlesRecordedToday === snapshot.totalActiveCircles && snapshot.totalActiveCircles > 0
                ? "bg-emerald-50"
                : "bg-background"
            }`}>
              <CardContent className="p-4 text-center">
                <div className="flex items-center justify-center gap-1 mb-1">
                  <ClipboardCheck className="w-4 h-4 text-emerald-600" />
                </div>
                <p className="text-2xl font-bold text-emerald-700">
                  {snapshot.circlesRecordedToday}/{snapshot.totalActiveCircles}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">حلقات سُجّلت اليوم</p>
              </CardContent>
            </Card>

            <Card className={`border-0 shadow-sm ${snapshot.studentsOnLeave > 0 ? "bg-amber-50" : "bg-background"}`}>
              <CardContent className="p-4 text-center">
                <div className="flex items-center justify-center gap-1 mb-1">
                  <Plane className="w-4 h-4 text-amber-600" />
                </div>
                <p className="text-2xl font-bold text-amber-600">{snapshot.studentsOnLeave}</p>
                <p className="text-xs text-muted-foreground mt-0.5">في إجازة الآن</p>
              </CardContent>
            </Card>

            <Card className={`border-0 shadow-sm ${snapshot.circlesNotRecordedInWeek.length > 0 ? "bg-rose-50" : "bg-background"}`}>
              <CardContent className="p-4 text-center">
                <div className="flex items-center justify-center gap-1 mb-1">
                  <AlertCircle className={`w-4 h-4 ${snapshot.circlesNotRecordedInWeek.length > 0 ? "text-rose-500" : "text-muted-foreground"}`} />
                </div>
                <p className={`text-2xl font-bold ${snapshot.circlesNotRecordedInWeek.length > 0 ? "text-rose-600" : "text-foreground"}`}>
                  {snapshot.circlesNotRecordedInWeek.length}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">حلقة لم تُسجّل أسبوعًا</p>
              </CardContent>
            </Card>
          </div>

          {/* Expiring leave alerts */}
          {snapshot.leavingThisWeek.length > 0 && (
            <Card className="border-0 shadow-sm border-r-4 border-r-amber-400 bg-amber-50/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold flex items-center gap-2 text-amber-700">
                  <Plane className="w-4 h-4" />
                  إجازات تنتهي هذا الأسبوع — {snapshot.leavingThisWeek.length} طالبة
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-1.5">
                  {snapshot.leavingThisWeek.map(s => (
                    <div key={s.studentId} className="flex items-center justify-between bg-white/70 rounded-xl px-3 py-2">
                      <div>
                        <span className="font-semibold text-sm text-amber-800">{s.studentName}</span>
                        <span className="text-xs text-amber-600 mr-2">{s.circleName} · {s.track}</span>
                      </div>
                      <span className="text-xs font-medium bg-amber-100 text-amber-700 rounded-full px-2 py-0.5">
                        تنتهي {new Date(s.leaveEnd).toLocaleDateString("ar-SA", { month: "short", day: "numeric" })}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Circles not recorded this week */}
          {snapshot.circlesNotRecordedInWeek.length > 0 && (
            <Card className="border-0 shadow-sm border-r-4 border-r-rose-400">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold flex items-center gap-2 text-rose-600">
                  <AlertCircle className="w-4 h-4" />
                  حلقات لم تُسجّل منذ أسبوع — {snapshot.circlesNotRecordedInWeek.length}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex flex-wrap gap-1.5">
                  {snapshot.circlesNotRecordedInWeek.map(c => (
                    <div key={c.circleId} className="bg-rose-50 rounded-lg px-2.5 py-1.5 text-xs">
                      <span className="font-semibold text-rose-800">{c.circleName}</span>
                      <span className="text-rose-500 mr-1">· {c.track}</span>
                      {c.daysSinceLastRecord != null && (
                        <span className="text-rose-400 mr-1">({c.daysSinceLastRecord} يوم)</span>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Near Juz Completion — student personal card */}
      {user?.role === "student" && nearCompletion.length > 0 && nearCompletion[0].nearCompletion && (
        <Card className="border-0 shadow-sm border-r-4 border-r-amber-500 bg-gradient-to-l from-amber-50 to-yellow-50">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="text-3xl">🎉</div>
              <div>
                <p className="font-bold text-amber-800 text-base">أنتِ على وشك إتمام الجزء!</p>
                <p className="text-xs text-amber-600 mt-0.5">
                  حفظتِ <strong>{nearCompletion[0].totalMemorizePages}</strong> صفحة — أتمّي الجزء {nearCompletion[0].juzCompleted + 1}
                </p>
                {nearCompletion[0].hasExamRecord && (
                  <p className="text-xs text-green-600 mt-1">✓ تم تسجيل اختبارك</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Near Juz Completion — student personal card for completed juz */}
      {user?.role === "student" && nearCompletion.length > 0 && !nearCompletion[0].nearCompletion && nearCompletion[0].hasExamRecord && (
        <Card className="border-0 shadow-sm border-r-4 border-r-green-500 bg-green-50/60">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="text-3xl">🌟</div>
              <div>
                <p className="font-bold text-green-800 text-base">ما شاء الله — أتممتِ جزءًا!</p>
                <p className="text-xs text-green-600 mt-0.5">
                  أتممتِ {nearCompletion[0].juzCompleted} جزء — {nearCompletion[0].totalMemorizePages} صفحة
                </p>
                <p className="text-xs text-green-600 mt-0.5">✓ تم تسجيل اختبارك</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Near Juz Completion — list for leader/teacher/supervisor/volunteer */}
      {user?.role !== "student" && nearCompletion.filter(s => s.nearCompletion).length > 0 && (
        <Card className="border-0 shadow-sm border-r-4 border-r-amber-500 bg-amber-50/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold flex items-center gap-2 text-amber-700">
              <GraduationCap className="w-4 h-4" />
              طالبات قرب إتمام الجزء — {nearCompletion.filter(s => s.nearCompletion).length}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-1.5">
              {nearCompletion.filter(s => s.nearCompletion).slice(0, 6).map(s => (
                <div key={s.studentId} className="flex items-center justify-between bg-white/70 rounded-xl px-3 py-2">
                  <div>
                    <span className="font-semibold text-sm text-amber-800">{s.studentName}</span>
                    <span className="text-xs text-amber-600 mr-2">{s.circleName}</span>
                  </div>
                  <div className="flex flex-col items-end gap-0.5">
                    <span className="text-xs font-bold bg-amber-100 text-amber-700 rounded-full px-2 py-0.5">
                      {s.totalMemorizePages} صفحة
                    </span>
                    {s.hasExamRecord && (
                      <span className="text-[10px] text-green-600">✓ تم اختبارها</span>
                    )}
                  </div>
                </div>
              ))}
              {nearCompletion.filter(s => s.nearCompletion).length > 6 && (
                <p className="text-xs text-muted-foreground text-center pt-1">
                  و {nearCompletion.filter(s => s.nearCompletion).length - 6} أخريات...
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Absence Alerts */}
      {hasAlerts && (
        <Card className="border-0 shadow-sm border-r-4 border-r-rose-400" data-testid="card-absence-alerts">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-bold flex items-center gap-2 text-rose-600">
              <AlertTriangle className="w-4 h-4" />
              تنبيه غياب متكرر — {repeatedAbsences.length} طالبة
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {repeatedAbsences.slice(0, 8).map(s => (
                <div key={s.studentId} className="flex items-center justify-between bg-rose-50 rounded-xl px-3 py-2">
                  <div>
                    <span className="font-semibold text-sm text-rose-800">{s.studentName}</span>
                    <span className="text-xs text-rose-500 mr-2">{s.circleName} · {s.track}</span>
                  </div>
                  <span className="text-xs font-bold bg-rose-100 text-rose-700 rounded-full px-2.5 py-1">
                    {s.absenceCount} غياب
                  </span>
                </div>
              ))}
              {repeatedAbsences.length > 8 && (
                <p className="text-xs text-muted-foreground text-center pt-1">و {repeatedAbsences.length - 8} أخريات...</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <motion.div
        className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4"
        initial="hidden"
        animate="visible"
        variants={{ visible: { transition: { staggerChildren: 0.07 } } }}
      >
        {stats.map((stat, i) => (
          <motion.div
            key={i}
            variants={{
              hidden: { opacity: 0, y: 16 },
              visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" } },
            }}
          >
            <Card className="border-0 shadow-sm hover:shadow-md transition-shadow overflow-hidden" data-testid={`card-stat-${i}`}>
              <CardContent className="p-4">
                <div className={`w-9 h-9 rounded-xl ${stat.bg} flex items-center justify-center mb-3`}>
                  <stat.icon className={`w-4 h-4 ${stat.textColor}`} />
                </div>
                <p className="text-2xl font-bold text-foreground truncate">{stat.value}</p>
                {stat.sub && <p className="text-xs text-muted-foreground">{stat.sub}</p>}
                <p className="text-xs text-muted-foreground mt-1 font-medium">{stat.label}</p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </motion.div>

      {/* Weekly Achievements Board */}
      {weekly && user?.role !== "student" && (
        <Card className="border-0 shadow-sm border-r-4 border-r-amber-400 bg-amber-50/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <Award className="w-4 h-4 text-amber-500" />
              إنجازات هذا الأسبوع
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* mini stats row */}
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-teal-50 rounded-xl p-2.5 text-center">
                <div className="flex items-center justify-center gap-1 mb-0.5">
                  {weekly.trends.memorize === "up" ? <TrendingUp className="w-3 h-3 text-emerald-500" /> : weekly.trends.memorize === "down" ? <TrendingDown className="w-3 h-3 text-rose-500" /> : <Minus className="w-3 h-3 text-muted-foreground" />}
                  <span className="text-[10px] text-muted-foreground">الحفظ</span>
                </div>
                <p className="font-bold text-teal-700">{formatPages(weekly.thisWeek.memorize)}</p>
                {weekly.changes.memorize != null && weekly.changes.memorize !== 0 && (
                  <p className={`text-[10px] font-semibold ${weekly.changes.memorize > 0 ? "text-emerald-600" : "text-rose-500"}`}>
                    {weekly.changes.memorize > 0 ? "+" : ""}{weekly.changes.memorize}%
                  </p>
                )}
              </div>
              <div className="bg-blue-50 rounded-xl p-2.5 text-center">
                <div className="flex items-center justify-center gap-1 mb-0.5">
                  {weekly.trends.totalPages === "up" ? <TrendingUp className="w-3 h-3 text-emerald-500" /> : weekly.trends.totalPages === "down" ? <TrendingDown className="w-3 h-3 text-rose-500" /> : <Minus className="w-3 h-3 text-muted-foreground" />}
                  <span className="text-[10px] text-muted-foreground">الإجمالي</span>
                </div>
                <p className="font-bold text-blue-700">{formatPages(weekly.thisWeek.totalPages)}</p>
                {weekly.changes.totalPages != null && weekly.changes.totalPages !== 0 && (
                  <p className={`text-[10px] font-semibold ${weekly.changes.totalPages > 0 ? "text-emerald-600" : "text-rose-500"}`}>
                    {weekly.changes.totalPages > 0 ? "+" : ""}{weekly.changes.totalPages}%
                  </p>
                )}
              </div>
              <div className="bg-rose-50 rounded-xl p-2.5 text-center">
                <div className="flex items-center justify-center gap-1 mb-0.5">
                  {weekly.trends.absences === "down" ? <TrendingUp className="w-3 h-3 text-emerald-500" /> : weekly.trends.absences === "up" ? <TrendingDown className="w-3 h-3 text-rose-500" /> : <Minus className="w-3 h-3 text-muted-foreground" />}
                  <span className="text-[10px] text-muted-foreground">الغياب</span>
                </div>
                <p className="font-bold text-rose-600">{weekly.thisWeek.absences}</p>
                {weekly.changes.absences != null && weekly.changes.absences !== 0 && (
                  <p className={`text-[10px] font-semibold ${weekly.changes.absences < 0 ? "text-emerald-600" : "text-rose-500"}`}>
                    {weekly.changes.absences > 0 ? "+" : ""}{weekly.changes.absences}%
                  </p>
                )}
              </div>
            </div>

            {/* Top 3 students */}
            {weekly.thisWeek.topStudents.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2">🏆 أعلى حفظًا هذا الأسبوع</p>
                <div className="space-y-1.5">
                  {weekly.thisWeek.topStudents.map((s, i) => (
                    <div key={i} className="flex items-center gap-2 bg-white/70 rounded-xl px-3 py-1.5">
                      <span className="text-sm font-bold text-amber-500 w-5">{i === 0 ? "🥇" : i === 1 ? "🥈" : "🥉"}</span>
                      <span className="text-sm font-semibold text-foreground flex-1 truncate">{s.name}</span>
                      <span className="text-xs font-bold bg-amber-100 text-amber-700 rounded-full px-2 py-0.5">{formatPages(s.pages)} وجه</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Top circle */}
            {weekly.thisWeek.topCircleName && (
              <div className="flex items-center gap-3 bg-emerald-50 rounded-xl px-3 py-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-muted-foreground">أفضل حلقة</p>
                  <p className="font-bold text-emerald-800 text-sm truncate">{weekly.thisWeek.topCircleName}</p>
                </div>
                <span className="text-xs font-bold bg-emerald-100 text-emerald-700 rounded-full px-2 py-0.5 shrink-0">{formatPages(weekly.thisWeek.topCirclePages)} وجه</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Monthly Honor Board */}
      <MonthlyHonorBoard role={user?.role} />

      {/* Monthly Comparison */}
      {monthly && (
        <Card className="border-0 shadow-sm" data-testid="card-monthly-comparison">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <Calendar className="w-4 h-4 text-blue-500" />
              مقارنة الشهر الحالي بالسابق
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-blue-50 rounded-xl p-3 text-center">
                <div className="flex items-center justify-center gap-1 mb-1">
                  <TrendIcon trend={monthly.trends?.pages === "up" ? "up" : monthly.trends?.pages === "down" ? "down" : "same"} />
                  <span className="text-xs text-muted-foreground font-medium">الأوجه</span>
                </div>
                <p className="font-bold text-blue-700 text-lg">{formatPages(monthly.thisMonth?.pages)}</p>
                <p className="text-xs text-muted-foreground">قبله: {formatPages(monthly.lastMonth?.pages)}</p>
              </div>
              <div className="bg-rose-50 rounded-xl p-3 text-center">
                <div className="flex items-center justify-center gap-1 mb-1">
                  <TrendIcon trend={monthly.trends?.absences === "up" ? "down" : monthly.trends?.absences === "down" ? "up" : "same"} />
                  <span className="text-xs text-muted-foreground font-medium">الغيابات</span>
                </div>
                <p className="font-bold text-rose-600 text-lg">{monthly.thisMonth?.absences ?? 0}</p>
                <p className="text-xs text-muted-foreground">قبله: {monthly.lastMonth?.absences ?? 0}</p>
              </div>
              <div className="bg-emerald-50 rounded-xl p-3 text-center">
                <div className="flex items-center justify-center gap-1 mb-1">
                  <TrendIcon trend={monthly.trends?.attendanceRate} />
                  <span className="text-xs text-muted-foreground font-medium">الحضور</span>
                </div>
                <p className="font-bold text-emerald-700 text-lg">
                  {monthly.thisMonth?.attendanceRate != null ? `${monthly.thisMonth.attendanceRate}%` : "—"}
                </p>
                <p className="text-xs text-muted-foreground">
                  قبله: {monthly.lastMonth?.attendanceRate != null ? `${monthly.lastMonth.attendanceRate}%` : "—"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {hasMoshkah && (
        <Card className="border-0 shadow-sm" data-testid="card-moshkah-stats">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <Award className="w-4 h-4 text-amber-500" />
              مشكاة نور — أعلى إنجاز
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {summary?.moshkahTopMemorize && (
                <div className="bg-teal-50 rounded-xl p-3">
                  <p className="text-xs text-muted-foreground font-medium mb-1">الأعلى حفظًا</p>
                  <p className="font-bold text-teal-700">{summary.moshkahTopMemorize}</p>
                  {summary.moshkahTopMemorizePages != null && (
                    <p className="text-xs text-teal-500 mt-0.5">{formatPages(summary.moshkahTopMemorizePages)} وجه</p>
                  )}
                </div>
              )}
              {summary?.moshkahTopReview && (
                <div className="bg-blue-50 rounded-xl p-3">
                  <p className="text-xs text-muted-foreground font-medium mb-1">الأعلى مراجعة</p>
                  <p className="font-bold text-blue-700">{summary.moshkahTopReview}</p>
                  {summary.moshkahTopReviewPages != null && (
                    <p className="text-xs text-blue-500 mt-0.5">{formatPages(summary.moshkahTopReviewPages)} وجه</p>
                  )}
                </div>
              )}
              {summary?.moshkahTopRecitation && (
                <div className="bg-emerald-50 rounded-xl p-3">
                  <p className="text-xs text-muted-foreground font-medium mb-1">الأعلى تلاوة</p>
                  <p className="font-bold text-emerald-700">{summary.moshkahTopRecitation}</p>
                  {summary.moshkahTopRecitationPages != null && (
                    <p className="text-xs text-emerald-500 mt-0.5">{formatPages(summary.moshkahTopRecitationPages)} وجه</p>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Track comparison */}
      {circleStats && circleStats.length > 0 && (() => {
        const byTrack: Record<string, { students: number; memorize: number; review: number; absences: number }> = {};
        circleStats.forEach(c => {
          const t = c.track || "غير محدد";
          if (!byTrack[t]) byTrack[t] = { students: 0, memorize: 0, review: 0, absences: 0 };
          byTrack[t].students += c.studentCount;
          byTrack[t].memorize += c.totalMemorizePages;
          byTrack[t].review += c.totalReviewPages;
          byTrack[t].absences += c.totalAbsences;
        });
        const rows = Object.entries(byTrack)
          .filter(([, v]) => v.students > 0)
          .sort((a, b) => b[1].memorize - a[1].memorize);
        if (rows.length < 2) return null;
        return (
          <Card className="border-0 shadow-sm" data-testid="card-track-comparison">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary" />
                مقارنة المسارات
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 border-b border-border">
                    <tr>
                      <th className="text-right py-2.5 px-3 font-semibold text-muted-foreground">المسار</th>
                      <th className="text-right py-2.5 px-3 font-semibold text-muted-foreground">الطالبات</th>
                      <th className="text-right py-2.5 px-3 font-semibold text-muted-foreground">الحفظ (وجه)</th>
                      <th className="text-right py-2.5 px-3 font-semibold text-muted-foreground">المراجعة</th>
                      <th className="text-right py-2.5 px-3 font-semibold text-muted-foreground">الغياب</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(([track, v]) => (
                      <tr key={track} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                        <td className="py-2.5 px-3 font-bold">{track}</td>
                        <td className="py-2.5 px-3 text-muted-foreground">{v.students}</td>
                        <td className="py-2.5 px-3 text-teal-600 font-semibold">{formatPages(v.memorize)}</td>
                        <td className="py-2.5 px-3 text-blue-600">{formatPages(v.review)}</td>
                        <td className="py-2.5 px-3 text-rose-500">{v.absences}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {circleStats && circleStats.length > 0 && (
        <Card className="border-0 shadow-sm" data-testid="card-circles-stats">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-bold">إحصائيات الحلقات</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-right py-2 px-3 font-semibold text-muted-foreground">الحلقة</th>
                    <th className="text-right py-2 px-3 font-semibold text-muted-foreground">المسار</th>
                    <th className="text-right py-2 px-3 font-semibold text-muted-foreground">الحفظ</th>
                    <th className="text-right py-2 px-3 font-semibold text-muted-foreground">المراجعة</th>
                    <th className="text-right py-2 px-3 font-semibold text-muted-foreground">الغياب</th>
                    <th className="text-right py-2 px-3 font-semibold text-muted-foreground">الطالبات</th>
                  </tr>
                </thead>
                <tbody>
                  {circleStats
                    .filter(c => c.studentCount > 0)
                    .sort((a, b) => b.totalMemorizePages - a.totalMemorizePages)
                    .slice(0, 15)
                    .map(circle => (
                      <tr key={circle.circleId} className="border-b border-border/50 hover:bg-muted/30 transition-colors"
                        data-testid={`row-circle-${circle.circleId}`}
                      >
                        <td className="py-2.5 px-3 font-semibold">{circle.circleName}</td>
                        <td className="py-2.5 px-3 text-muted-foreground">{circle.track}</td>
                        <td className="py-2.5 px-3 text-primary font-medium">{formatPages(circle.totalMemorizePages)}</td>
                        <td className="py-2.5 px-3 text-blue-600 font-medium">{formatPages(circle.totalReviewPages)}</td>
                        <td className="py-2.5 px-3 text-rose-500 font-medium">{circle.totalAbsences}</td>
                        <td className="py-2.5 px-3 text-muted-foreground">{circle.studentCount}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
