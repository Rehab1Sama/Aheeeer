import { useState, useEffect } from "react";
import { useGetStatsSummary, useGetCurrentUser } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatPages } from "@/lib/quran";
import {
  Users, BookOpen, TrendingUp, TrendingDown, Minus,
  Award, Star, GraduationCap, ChevronLeft, ChevronRight,
  CalendarDays, CheckCircle2, BarChart2,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function authFetch(url: string) {
  const token = localStorage.getItem("sana_auth_token");
  return fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
}

type HonorData = {
  month: string; monthLabel: string; honoredCount: number;
  honored: { studentId: number; studentName: string; circleName: string; track: string; memorizePages: number; sessions: number }[];
};

function useMonthlyHonor(month?: string) {
  const [data, setData] = useState<HonorData | null>(null);
  useEffect(() => {
    const params = month ? `?month=${month}` : "";
    authFetch(`${BASE}/api/stats/monthly-honor${params}`)
      .then(r => r.ok ? r.json() : null).then(setData).catch(() => {});
  }, [month]);
  return data;
}

type TeacherPerf = {
  teacherId: number; teacherName: string; circleId: number; circleName: string; track: string;
  teacherAbsences: number; studentCount: number; totalSessions: number;
  absenceCount: number; attendanceRate: number | null; deficiencyCount: number;
  memorizePages: number; reviewPages: number; performanceScore: number;
};

function useTeacherPerformance() {
  const [data, setData] = useState<TeacherPerf[] | null>(null);
  useEffect(() => {
    authFetch(`${BASE}/api/stats/teacher-performance`)
      .then(r => r.ok ? r.json() : null).then(setData).catch(() => {});
  }, []);
  return data;
}

type WeeklyData = {
  thisWeek: {
    memorize: number; reviewNear: number; reviewFar: number; totalPages: number;
    absences: number; attendanceRate: number | null;
    topStudents: { name: string; pages: number }[];
    topCircleName: string | null; topCirclePages: number;
  };
  lastWeek: { memorize: number; totalPages: number; absences: number };
  trends: Record<string, "up" | "down" | "same">;
  changes: Record<string, number | null>;
};

function useWeeklyData() {
  const [data, setData] = useState<WeeklyData | null>(null);
  useEffect(() => {
    authFetch(`${BASE}/api/stats/weekly-comparison`)
      .then(r => r.ok ? r.json() : null).then(setData).catch(() => {});
  }, []);
  return data;
}

function TrendIcon({ trend, positive = "up" }: { trend?: string; positive?: "up" | "down" }) {
  const isGood = trend === positive;
  const isBad  = trend === (positive === "up" ? "down" : "up");
  if (isGood) return <TrendingUp className="w-3 h-3 text-emerald-500" />;
  if (isBad)  return <TrendingDown className="w-3 h-3 text-rose-500" />;
  return <Minus className="w-3 h-3 text-muted-foreground" />;
}

function StatCard({ label, value, sub, icon: Icon, color }: {
  label: string; value: string | number; sub?: string; icon?: any; color?: string;
}) {
  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-4 text-center">
        {Icon && <Icon className={`w-5 h-5 mx-auto mb-1.5 ${color ?? "text-primary"}`} />}
        <p className={`text-2xl font-bold ${color ?? "text-foreground"}`}>{value}</p>
        <p className="text-xs text-muted-foreground mt-1 font-medium leading-tight">{label}</p>
        {sub && <p className="text-[10px] text-muted-foreground/70 mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

export default function TrackReportPage() {
  const { data: me } = useGetCurrentUser({ query: { queryKey: ["getCurrentUser"] } });

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const today = now.toISOString().slice(0, 10);
  const monthLabel = now.toLocaleDateString("ar-SA", { month: "long", year: "numeric" });

  const { data: summary } = useGetStatsSummary(
    { dateFrom: monthStart, dateTo: today } as any,
    { query: { queryKey: ["trackSummary", monthStart, today] } }
  );

  const weekly = useWeeklyData();
  const perfData = useTeacherPerformance();

  const [honorMonth, setHonorMonth] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  );
  const honorData = useMonthlyHonor(honorMonth);

  const prevHonorMonth = () => {
    const [y, m] = honorMonth.split("-").map(Number);
    const d = new Date(y, m - 2, 1);
    setHonorMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };
  const nextHonorMonth = () => {
    const [y, m] = honorMonth.split("-").map(Number);
    const d = new Date(y, m, 1);
    const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const nextKey  = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (nextKey > todayKey) return;
    setHonorMonth(nextKey);
  };
  const isCurrent = honorMonth === `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const attendanceRate = weekly?.thisWeek.attendanceRate;
  const attColor = attendanceRate == null
    ? "text-foreground"
    : attendanceRate >= 80 ? "text-emerald-600" : attendanceRate >= 60 ? "text-amber-600" : "text-rose-500";

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">

        {/* Header */}
        <div className="text-center">
          <h1 className="text-xl font-bold text-foreground">ملخص مسارك</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {me?.track ?? "المسار"} · {monthLabel}
          </p>
        </div>

        {/* Summary stat cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard
            label="إجمالي الطالبات"
            value={(summary as any)?.studentCount ?? "—"}
            icon={Users}
            color="text-primary"
          />
          <StatCard
            label="صفحات الحفظ (الشهر)"
            value={summary ? formatPages((summary as any).totalMemorizePages ?? 0) : "—"}
            icon={BookOpen}
            color="text-teal-600"
            sub="وجه"
          />
          <StatCard
            label="نسبة الحضور (الأسبوع)"
            value={attendanceRate != null ? `${attendanceRate}%` : "—"}
            icon={CalendarDays}
            color={attColor}
          />
          <StatCard
            label="عدد الحلقات"
            value={perfData?.length ?? "—"}
            icon={BarChart2}
            color="text-violet-600"
          />
        </div>

        {/* Top students this week */}
        {weekly && weekly.thisWeek.topStudents.length > 0 && (
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Star className="w-4 h-4 text-amber-500" />
                أعلى الطالبات حفظاً هذا الأسبوع
                <Badge className="mr-auto bg-amber-50 text-amber-700 border-0 text-xs">
                  {formatPages(weekly.thisWeek.memorize)} وجه هذا الأسبوع
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-2">
              {weekly.thisWeek.topStudents.map((s, i) => (
                <div key={i} className="flex items-center gap-3 p-2 rounded-xl bg-muted/30">
                  <span className="text-lg leading-none">{i === 0 ? "🥇" : i === 1 ? "🥈" : "🥉"}</span>
                  <span className="flex-1 font-semibold text-sm">{s.name}</span>
                  <span className="text-xs font-bold text-teal-700 bg-teal-50 px-2 py-0.5 rounded-lg">
                    {formatPages(s.pages)} وجه
                  </span>
                </div>
              ))}

              {/* weekly trend indicators */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                {[
                  { label: "مقارنة الحفظ", key: "memorize", curr: weekly.thisWeek.memorize, prev: weekly.lastWeek.memorize },
                  { label: "مقارنة الحضور", key: "attendanceRate", curr: attendanceRate, prev: null, positive: "up" as const },
                ].map(item => (
                  <div key={item.key} className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/20 rounded-lg px-2.5 py-1.5">
                    <TrendIcon trend={weekly.trends[item.key]} positive={item.positive ?? "up"} />
                    <span>{item.label}</span>
                    {weekly.changes[item.key] != null && (
                      <span className={`mr-auto font-semibold ${weekly.changes[item.key]! > 0 ? "text-emerald-600" : weekly.changes[item.key]! < 0 ? "text-rose-500" : "text-muted-foreground"}`}>
                        {weekly.changes[item.key]! > 0 ? "+" : ""}{weekly.changes[item.key]}%
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Circle performance table */}
        {perfData && perfData.length > 0 && (
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <GraduationCap className="w-4 h-4 text-teal-600" />
                أداء الحلقات (هذا الشهر)
                <Badge className="mr-auto bg-muted text-muted-foreground border-0 text-xs">{perfData.length} حلقة</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 border-b border-border">
                    <tr>
                      <th className="text-right py-2.5 px-3 font-semibold text-muted-foreground">#</th>
                      <th className="text-right py-2.5 px-3 font-semibold text-muted-foreground">الحلقة</th>
                      <th className="text-right py-2.5 px-3 font-semibold text-muted-foreground">حضور</th>
                      <th className="text-right py-2.5 px-3 font-semibold text-muted-foreground">حفظ</th>
                      <th className="text-right py-2.5 px-3 font-semibold text-muted-foreground">تقصير</th>
                      <th className="text-right py-2.5 px-3 font-semibold text-muted-foreground">الأداء</th>
                    </tr>
                  </thead>
                  <tbody>
                    {perfData.map((t, i) => {
                      const scoreColor = t.performanceScore >= 70 ? "text-emerald-600" : t.performanceScore >= 40 ? "text-amber-600" : "text-rose-500";
                      const scoreBg    = t.performanceScore >= 70 ? "bg-emerald-500" : t.performanceScore >= 40 ? "bg-amber-400" : "bg-rose-400";
                      const maxScore   = Math.max(...perfData.map(x => x.performanceScore), 1);
                      return (
                        <tr key={t.circleId} className={`border-b border-border/50 hover:bg-muted/20 transition-colors ${i === 0 ? "bg-amber-50/40" : ""}`}>
                          <td className="py-2.5 px-3 font-bold text-muted-foreground">
                            {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}
                          </td>
                          <td className="py-2.5 px-3 font-semibold">{t.circleName}</td>
                          <td className="py-2.5 px-3">
                            {t.attendanceRate != null
                              ? <span className={`font-bold ${t.attendanceRate >= 80 ? "text-emerald-600" : t.attendanceRate >= 60 ? "text-amber-600" : "text-rose-500"}`}>{t.attendanceRate}%</span>
                              : "—"}
                          </td>
                          <td className="py-2.5 px-3 text-teal-700 font-bold">{formatPages(t.memorizePages)}</td>
                          <td className="py-2.5 px-3">
                            {t.deficiencyCount > 0
                              ? <span className="text-orange-600 font-bold">{t.deficiencyCount}</span>
                              : <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="py-2.5 px-3 min-w-[80px]">
                            <div className="flex items-center gap-1.5">
                              <div className="flex-1 bg-muted rounded-full h-1.5">
                                <div className={`h-full rounded-full ${scoreBg} transition-all`}
                                  style={{ width: `${(t.performanceScore / maxScore) * 100}%` }} />
                              </div>
                              <span className={`font-bold w-5 text-left ${scoreColor}`}>{t.performanceScore}</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="px-3 py-2 bg-muted/30 border-t border-border/50">
                <p className="text-[10px] text-muted-foreground">الأداء = حضور (40%) + معدل الحفظ (40%) − التقصير (20%) − غياب المعلمة</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Monthly honor board */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Award className="w-4 h-4 text-violet-600" />
              لوحة التكريم الشهري
              <div className="mr-auto flex items-center gap-1">
                <button onClick={prevHonorMonth} className="p-1 rounded hover:bg-muted transition-colors">
                  <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
                <span className="text-xs font-medium px-2">
                  {honorData?.monthLabel ?? honorMonth}
                </span>
                <button onClick={nextHonorMonth} disabled={isCurrent}
                  className={`p-1 rounded transition-colors ${isCurrent ? "opacity-30 cursor-not-allowed" : "hover:bg-muted"}`}>
                  <ChevronLeft className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {!honorData ? (
              <p className="text-xs text-muted-foreground text-center py-4">جاري التحميل…</p>
            ) : honorData.honored.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6">لا توجد طالبات مؤهلات للتكريم هذا الشهر</p>
            ) : (
              <>
                <div className="flex items-center gap-2 mb-3">
                  <Badge className="bg-violet-50 text-violet-700 border-0 text-xs">
                    {honorData.honoredCount} طالبة بلا غياب ولا تقصير
                  </Badge>
                </div>
                <div className="space-y-2">
                  {honorData.honored.map((h, i) => (
                    <div key={h.studentId} className="flex items-center gap-3 p-2.5 rounded-xl bg-gradient-to-l from-violet-50/50 to-transparent border border-violet-100/60">
                      <span className="text-base leading-none">
                        {i === 0 ? "🏆" : i < 3 ? "⭐" : <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm leading-tight truncate">{h.studentName}</p>
                        <p className="text-[10px] text-muted-foreground">{h.circleName}</p>
                      </div>
                      <div className="text-left shrink-0">
                        <p className="text-xs font-bold text-teal-700">{formatPages(h.memorizePages)} وجه</p>
                        <p className="text-[10px] text-muted-foreground">{h.sessions} جلسة</p>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
