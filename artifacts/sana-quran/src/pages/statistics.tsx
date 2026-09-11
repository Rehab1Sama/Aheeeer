import { useState, useEffect } from "react";
import { useGetStatsSummary, useGetCirclesStats, useGetCurrentUser, useListRecords } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatPages } from "@/lib/quran";
import { schoolConfig, getFieldLabel } from "@/lib/schoolConfig";
import {
  BarChart2, Users, BookOpen, GraduationCap, TrendingUp, TrendingDown, Minus,
  Award, Calendar, BookMarked, Eye, Layers, CheckCircle2, FlaskConical, Clock, AlertCircle,
  Star, ShieldCheck
} from "lucide-react";

function getTrackLabel(dataEntryType: string, fallback: string): string {
  const found = schoolConfig.defaultTrackTypes.find(t => t.dataEntryType === dataEntryType);
  return found ? found.name : fallback;
}

function StatCard({
  label, value, color, icon: Icon, sub,
}: {
  label: string; value: string | number; color: string;
  icon?: any; sub?: string;
}) {
  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-4 text-center">
        {Icon && <Icon className={`w-5 h-5 mx-auto mb-1.5 ${color}`} />}
        <p className={`text-2xl font-bold ${color}`}>{value}</p>
        <p className="text-xs text-muted-foreground mt-1 font-medium leading-tight">{label}</p>
        {sub && <p className="text-xs text-muted-foreground/70 mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function PeriodFilter({
  periodDays,
  setPeriodDays,
  customFrom,
  customTo,
  setCustomFrom,
  setCustomTo,
}: {
  periodDays: number;
  setPeriodDays: (v: number) => void;
  customFrom: string;
  customTo: string;
  setCustomFrom: (v: string) => void;
  setCustomTo: (v: string) => void;
}) {
  return (
    <Card className="border-0 shadow-sm" data-testid="card-date-range">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-bold flex items-center gap-2">
          <Calendar className="w-4 h-4 text-primary" />
          الفترة الزمنية
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">
          {PERIOD_OPTIONS.map(opt => (
            <button
              key={opt.days}
              onClick={() => setPeriodDays(opt.days)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                periodDays === opt.days
                  ? "bg-primary text-white shadow-sm"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
              data-testid={`btn-period-${opt.days}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-border/50 pt-3">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">من تاريخ</label>
            <Input
              type="date"
              value={customFrom}
              onChange={e => { setCustomFrom(e.target.value); setPeriodDays(0); }}
              className="h-9 w-[150px]"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">إلى تاريخ</label>
            <Input
              type="date"
              value={customTo}
              onChange={e => { setCustomTo(e.target.value); setPeriodDays(0); }}
              className="h-9 w-[150px]"
            />
          </div>
          {periodDays === 0 && (!customFrom || !customTo) && (
            <span className="pb-2 text-xs text-amber-600">اختاري تاريخ البداية والنهاية</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ArchivePeriodSettings() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const token = localStorage.getItem("sana_auth_token");
    fetch(`${BASE}/api/settings`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(r => r.ok ? r.json() : {})
      .then((data: any) => {
        try {
          const p = JSON.parse(data.student_record_archive_periods ?? "[]")[0];
          if (p) { setFrom(p.from ?? ""); setTo(p.to ?? ""); }
        } catch { /* empty setting */ }
        setLoaded(true);
      }).catch(() => setLoaded(true));
  }, []);
  const save = async () => {
    if (!from || !to || from > to) return;
    setSaving(true);
    const token = localStorage.getItem("sana_auth_token");
    await fetch(`${BASE}/api/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ key: "student_record_archive_periods", value: JSON.stringify([{ from, to }]) }),
    });
    setSaving(false);
  };
  if (!loaded) return null;
  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-2"><CardTitle className="text-sm font-bold">أرشفة عرض الغياب والتقصير للطالبات</CardTitle></CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-end gap-2">
          <div><label className="text-xs text-muted-foreground block mb-1">من</label><Input type="date" value={from} onChange={e => setFrom(e.target.value)} /></div>
          <div><label className="text-xs text-muted-foreground block mb-1">إلى</label><Input type="date" value={to} onChange={e => setTo(e.target.value)} /></div>
          <Button onClick={save} disabled={saving || !from || !to || from > to}>{saving ? "جاري الحفظ..." : "حفظ الأرشفة"}</Button>
        </div>
        <p className="text-xs text-muted-foreground mt-2">تبقى البيانات محفوظة للإدارة والتقارير والشهادات، وتُخفى الغيابات والتقصير عن حساب الطالبة فقط.</p>
      </CardContent>
    </Card>
  );
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function useTeacherRecords(periodDays: number) {
  const [data, setData] = useState<any[]>([]);
  useEffect(() => {
    const token = localStorage.getItem("sana_auth_token");
    fetch(`${BASE}/api/stats/teacher-records?days=${periodDays}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(r => r.ok ? r.json() : [])
      .then(setData)
      .catch(() => {});
  }, [periodDays]);
  return data;
}

type JuzStats = {
  examsByJuz: { juzNumber: number; count: number }[];
  nearingJuzCompletion: number;
  completedJuzNotTested: number;
};

function useJuzStats() {
  const [data, setData] = useState<JuzStats | null>(null);
  useEffect(() => {
    const token = localStorage.getItem("sana_auth_token");
    fetch(`${BASE}/api/stats/juz-stats`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(r => r.ok ? r.json() : null)
      .then(setData)
      .catch(() => {});
  }, []);
  return data;
}

type TeacherPerf = {
  teacherId: number; teacherName: string; circleId: number; circleName: string; track: string;
  teacherAbsences: number; studentCount: number; totalSessions: number;
  absenceCount: number; attendanceRate: number | null; deficiencyCount: number;
  memorizePages: number; reviewPages: number; performanceScore: number;
};

function useTeacherPerformance(periodFrom?: string, periodTo?: string) {
  const [data, setData] = useState<TeacherPerf[] | null>(null);
  useEffect(() => {
    const token = localStorage.getItem("sana_auth_token");
    const params = periodFrom && periodTo ? `?dateFrom=${periodFrom}&dateTo=${periodTo}` : "";
    fetch(`${BASE}/api/stats/teacher-performance${params}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(r => r.ok ? r.json() : null)
      .then(setData)
      .catch(() => {});
  }, [periodFrom, periodTo]);
  return data;
}

function TeacherPerformanceCard({ periodFrom, periodTo }: { periodFrom?: string; periodTo?: string }) {
  const data = useTeacherPerformance(periodFrom, periodTo);
  if (!data || data.length === 0) return null;

  const maxScore = Math.max(...data.map(t => t.performanceScore), 1);

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-bold flex items-center gap-2">
          <GraduationCap className="w-4 h-4 text-teal-600" />
          تقرير أداء المعلمات
          <Badge className="mr-auto bg-muted text-muted-foreground border-0 text-xs">{data.length} معلمة</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="text-right py-2.5 px-3 font-semibold text-muted-foreground">#</th>
                <th className="text-right py-2.5 px-3 font-semibold text-muted-foreground">المعلمة</th>
                <th className="text-right py-2.5 px-3 font-semibold text-muted-foreground">الحلقة</th>
                <th className="text-right py-2.5 px-3 font-semibold text-muted-foreground">غياب المعلمة</th>
                <th className="text-right py-2.5 px-3 font-semibold text-muted-foreground">حضور الطالبات</th>
                <th className="text-right py-2.5 px-3 font-semibold text-muted-foreground">الحفظ (وجه)</th>
                <th className="text-right py-2.5 px-3 font-semibold text-muted-foreground">التقصير</th>
                <th className="text-right py-2.5 px-3 font-semibold text-muted-foreground">الأداء</th>
              </tr>
            </thead>
            <tbody>
              {data.map((t, i) => {
                const scoreColor = t.performanceScore >= 70 ? "text-emerald-600" : t.performanceScore >= 40 ? "text-amber-600" : "text-rose-500";
                const scoreBg    = t.performanceScore >= 70 ? "bg-emerald-500" : t.performanceScore >= 40 ? "bg-amber-400" : "bg-rose-400";
                return (
                  <tr key={t.teacherId} className={`border-b border-border/50 hover:bg-muted/20 transition-colors ${i === 0 ? "bg-amber-50/40" : ""}`}>
                    <td className="py-2.5 px-3 font-bold text-muted-foreground">
                      {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}
                    </td>
                    <td className="py-2.5 px-3 font-semibold">{t.teacherName}</td>
                    <td className="py-2.5 px-3 text-muted-foreground">{t.circleName}</td>
                    <td className="py-2.5 px-3">
                      {t.teacherAbsences > 0
                        ? <span className="text-rose-600 font-bold bg-rose-50 px-1.5 py-0.5 rounded">{t.teacherAbsences} يوم</span>
                        : <span className="text-emerald-600 font-medium">✓ لا غياب</span>}
                    </td>
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
                    <td className="py-2.5 px-3 min-w-[90px]">
                      <div className="flex items-center gap-1.5">
                        <div className="flex-1 bg-muted rounded-full h-1.5">
                          <div className={`h-full rounded-full ${scoreBg} transition-all`}
                            style={{ width: `${(t.performanceScore / maxScore) * 100}%` }} />
                        </div>
                        <span className={`font-bold w-6 text-left ${scoreColor}`}>{t.performanceScore}</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="px-3 py-2 bg-muted/30 border-t border-border/50">
          <p className="text-[10px] text-muted-foreground">نقاط الأداء = حضور الطالبات (40%) + معدل الحفظ (40%) − التقصير (20%) − غياب المعلمة</p>
        </div>
      </CardContent>
    </Card>
  );
}

type WeeklyComparison = {
  thisWeek: { memorize: number; reviewNear: number; reviewFar: number; totalPages: number; absences: number; attendanceRate: number | null; topStudents: { name: string; pages: number }[]; topCircleName: string | null; topCirclePages: number };
  lastWeek: { memorize: number; reviewNear: number; reviewFar: number; totalPages: number; absences: number; attendanceRate: number | null; topStudents: { name: string; pages: number }[]; topCircleName: string | null; topCirclePages: number };
  trends: Record<string, "up" | "down" | "same">;
  changes: Record<string, number | null>;
};

function useWeeklyComparison() {
  const [data, setData] = useState<WeeklyComparison | null>(null);
  useEffect(() => {
    const token = localStorage.getItem("sana_auth_token");
    fetch(`${BASE}/api/stats/weekly-comparison`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(r => r.ok ? r.json() : null)
      .then(setData)
      .catch(() => {});
  }, []);
  return data;
}

function WeeklyTrendIcon({ trend, positive = "up" }: { trend?: string; positive?: "up" | "down" }) {
  const isGood = trend === positive;
  const isBad  = trend === (positive === "up" ? "down" : "up");
  if (isGood) return <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />;
  if (isBad)  return <TrendingDown className="w-3.5 h-3.5 text-rose-500" />;
  return <Minus className="w-3.5 h-3.5 text-muted-foreground" />;
}

function WeeklyComparisonCard({ data }: { data: WeeklyComparison }) {
  const { thisWeek, lastWeek, trends, changes } = data;

  const metrics = [
    { label: "الحفظ", key: "memorize", curr: thisWeek.memorize, prev: lastWeek.memorize, color: "text-teal-700", bg: "bg-teal-50", positive: "up" as const, unit: "وجه" },
    { label: "م. قريبة", key: "reviewNear", curr: thisWeek.reviewNear, prev: lastWeek.reviewNear, color: "text-blue-700", bg: "bg-blue-50", positive: "up" as const, unit: "وجه" },
    { label: "م. بعيدة", key: "reviewFar", curr: thisWeek.reviewFar, prev: lastWeek.reviewFar, color: "text-indigo-700", bg: "bg-indigo-50", positive: "up" as const, unit: "وجه" },
    { label: "الغياب", key: "absences", curr: thisWeek.absences, prev: lastWeek.absences, color: "text-rose-600", bg: "bg-rose-50", positive: "down" as const, unit: "" },
  ];

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-bold flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-primary" />
          مقارنة هذا الأسبوع بالماضي
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {metrics.map(m => {
            const ch = changes[m.key];
            const tr = trends[m.key];
            return (
              <div key={m.key} className={`${m.bg} rounded-xl p-3`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-muted-foreground font-medium">{m.label}</span>
                  <WeeklyTrendIcon trend={tr} positive={m.positive} />
                </div>
                <p className={`text-xl font-bold ${m.color}`}>{m.unit ? formatPages(m.curr) : m.curr}</p>
                <div className="flex items-center gap-1 mt-1">
                  <span className="text-[10px] text-muted-foreground">قبله: {m.unit ? formatPages(m.prev) : m.prev}</span>
                  {ch !== null && ch !== 0 && (
                    <span className={`text-[10px] font-bold ${ch > 0 ? (m.positive === "up" ? "text-emerald-600" : "text-rose-500") : (m.positive === "up" ? "text-rose-500" : "text-emerald-600")}`}>
                      {ch > 0 ? "+" : ""}{ch}%
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* أفضل 3 طالبات */}
        {thisWeek.topStudents.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
              <Award className="w-3.5 h-3.5 text-amber-500" />
              أعلى حفظًا هذا الأسبوع
            </p>
            <div className="space-y-1.5">
              {thisWeek.topStudents.map((s, i) => (
                <div key={i} className="flex items-center justify-between bg-amber-50/60 rounded-lg px-3 py-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-amber-700 w-4">{i + 1}.</span>
                    <span className="text-sm font-semibold text-amber-900">{s.name}</span>
                  </div>
                  <Badge className="bg-amber-100 text-amber-700 border-0 text-xs">{formatPages(s.pages)} وجه</Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* أفضل حلقة */}
        {thisWeek.topCircleName && (
          <div className="flex items-center gap-3 bg-emerald-50 rounded-xl px-3 py-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">أفضل حلقة هذا الأسبوع</p>
              <p className="font-bold text-emerald-800 text-sm">{thisWeek.topCircleName}</p>
            </div>
            <Badge className="mr-auto bg-emerald-100 text-emerald-700 border-0">{formatPages(thisWeek.topCirclePages)} وجه</Badge>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function JuzStatsCard({ juzStats }: { juzStats: JuzStats | null }) {
  if (!juzStats) return null;
  const { examsByJuz, nearingJuzCompletion, completedJuzNotTested } = juzStats;
  const maxCount = Math.max(...examsByJuz.map(j => j.count), 1);

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-bold flex items-center gap-2">
          <FlaskConical className="w-4 h-4 text-violet-600" />
          إحصائيات الاختبارات والأجزاء
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-amber-50 p-3 text-center border border-amber-100">
            <Clock className="w-4 h-4 mx-auto mb-1 text-amber-500" />
            <p className="text-2xl font-bold text-amber-600">{nearingJuzCompletion}</p>
            <p className="text-xs text-muted-foreground mt-1 leading-tight">شارفن على إنهاء الجزء<br/><span className="text-amber-500 font-medium">(باقي وجهين)</span></p>
          </div>
          <div className="rounded-xl bg-rose-50 p-3 text-center border border-rose-100">
            <AlertCircle className="w-4 h-4 mx-auto mb-1 text-rose-500" />
            <p className="text-2xl font-bold text-rose-600">{completedJuzNotTested}</p>
            <p className="text-xs text-muted-foreground mt-1 leading-tight">أنهين الجزء<br/><span className="text-rose-500 font-medium">ولم يختبرن بعد</span></p>
          </div>
        </div>

        {examsByJuz.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
              <FlaskConical className="w-3 h-3 text-violet-500" />
              المختبرات بالأجزاء
            </p>
            <div className="space-y-1">
              {examsByJuz.map(j => (
                <div key={j.juzNumber} className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-12 shrink-0 text-right">
                    جزء {j.juzNumber}
                  </span>
                  <div className="flex-1 bg-muted rounded-full h-2">
                    <div
                      className="h-full rounded-full bg-violet-400 transition-all"
                      style={{ width: `${(j.count / maxCount) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs font-bold w-6 text-right text-violet-700">{j.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {examsByJuz.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-2">لا توجد اختبارات مسجّلة بعد</p>
        )}
      </CardContent>
    </Card>
  );
}

function LeaderStats({ summary, circleStats, periodDays }: { summary: any; circleStats: any[]; periodDays: number }) {
  const teacherRecords = useTeacherRecords(periodDays);
  const juzStats = useJuzStats();
  const weeklyData = useWeeklyComparison();
  const today = new Date().toISOString().slice(0, 10);
  const fromDate = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return (
    <div className="space-y-5">
      {/* Weekly comparison */}
      {weeklyData && <WeeklyComparisonCard data={weeklyData} />}

      {/* Teacher Performance */}
      <TeacherPerformanceCard periodFrom={fromDate} periodTo={today} />

      {/* Staff counts */}
      <div>
        <h2 className="text-sm font-bold text-muted-foreground mb-3 flex items-center gap-2">
          <Users className="w-4 h-4" />
          الكوادر التعليمية
        </h2>
        <div className="grid grid-cols-3 gap-3">
          <StatCard label="معلمات" value={summary.teacherCount ?? 0} color="text-teal-600" icon={GraduationCap} />
          <StatCard label="مشرفات" value={summary.supervisorCount ?? 0} color="text-blue-600" icon={Award} />
          <StatCard label="مسؤولات مسار" value={summary.trackSupervisorCount ?? 0} color="text-teal-600" icon={Layers} />
        </div>
      </div>

      {/* Student counts by type */}
      <div>
        <h2 className="text-sm font-bold text-muted-foreground mb-3 flex items-center gap-2">
          <BookOpen className="w-4 h-4" />
          الطالبات ({summary.studentCount ?? 0} إجمالًا)
        </h2>
        <div className="grid grid-cols-3 gap-3">
          <StatCard label="حلقات الفتيات" value={summary.totalGirlsStudents ?? 0} color="text-rose-500" icon={Users} />
          <StatCard label="حلقات الأطفال" value={summary.totalChildrenStudents ?? 0} color="text-amber-500" icon={Users} />
          <StatCard label="حلقات الأمهات" value={summary.totalMothersStudents ?? 0} color="text-teal-500" icon={Users} />
        </div>
      </div>

      {/* Age distribution */}
      {summary.ageDistribution?.length > 0 && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold">توزيع الطالبات حسب الأعمار</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {summary.ageDistribution.map((item: any) => (
                <div key={item.age} className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-24 text-right shrink-0">{item.age}</span>
                  <div className="flex-1 bg-muted rounded-full h-2.5">
                    <div
                      className="bg-primary rounded-full h-2.5 transition-all"
                      style={{ width: `${Math.min(100, (item.count / (summary.studentCount || 1)) * 100)}%` }}
                    />
                  </div>
                  <span className="text-xs font-bold w-8 text-right">{item.count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Page stats */}
      <div>
        <h2 className="text-sm font-bold text-muted-foreground mb-3 flex items-center gap-2">
          <BookMarked className="w-4 h-4" />
          إحصائيات الأوجه
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label={`${getFieldLabel("memorize")} (وجه)`} value={formatPages(summary.totalMemorizePages)} color="text-teal-600" icon={BookOpen} />
          <StatCard label={getFieldLabel("review_near")} value={formatPages(summary.totalReviewNearPages)} color="text-blue-600" icon={Eye} />
          <StatCard label={getFieldLabel("review_far")} value={formatPages(summary.totalReviewFarPages)} color="text-teal-600" icon={Eye} />
          <StatCard label={getFieldLabel("recitation")} value={formatPages(summary.totalRecitationPages)} color="text-emerald-600" icon={BookMarked} />
        </div>
      </div>
      {(summary.totalReviewPages > 0) && (
        <StatCard label={getTrackLabel("simple_review", "المراجعة العامة")} value={formatPages(summary.totalReviewPages)} color="text-cyan-600" icon={BookMarked} />
      )}
      {((summary as any).totalFixationPages > 0) && (
        <StatCard label={getTrackLabel("fixation", "التثبيت")} value={formatPages((summary as any).totalFixationPages)} color="text-amber-600" icon={BookOpen} />
      )}

      {/* Absences + Deficiencies */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="الغياب (إجمالي)" value={summary.totalAbsences ?? 0} color="text-rose-500" icon={Users} />
        <StatCard label="التقصير (إجمالي)" value={summary.totalDeficiencies ?? 0} color="text-orange-500" icon={BarChart2} />
      </div>

      {/* Top circle */}
      {summary.topCircle && (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <Award className="w-8 h-8 text-amber-500 shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">الحلقة الأولى خلال الفترة</p>
              <p className="font-bold text-foreground">{summary.topCircle}</p>
              <p className="text-xs text-amber-600">{formatPages(summary.topCirclePages)} وجه</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Juz Stats */}
      <JuzStatsCard juzStats={juzStats} />

      {/* Circles Table */}
      {circleStats?.length > 0 && (
        <Card className="border-0 shadow-sm" data-testid="card-circles-stats-table">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold">تفاصيل الحلقات</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b border-border">
                  <tr>
                    <th className="text-right py-2.5 px-3 font-semibold text-muted-foreground text-xs">الحلقة</th>
                    <th className="text-right py-2.5 px-3 font-semibold text-muted-foreground text-xs">المسار</th>
                    <th className="text-right py-2.5 px-3 font-semibold text-muted-foreground text-xs">الحفظ</th>
                    <th className="text-right py-2.5 px-3 font-semibold text-muted-foreground text-xs">المراجعة</th>
                    <th className="text-right py-2.5 px-3 font-semibold text-muted-foreground text-xs">التلاوة</th>
                    <th className="text-right py-2.5 px-3 font-semibold text-muted-foreground text-xs">غياب الطالبات</th>
                    <th className="text-right py-2.5 px-3 font-semibold text-muted-foreground text-xs">غياب المعلمة</th>
                    <th className="text-right py-2.5 px-3 font-semibold text-muted-foreground text-xs">التقصير</th>
                    <th className="text-right py-2.5 px-3 font-semibold text-muted-foreground text-xs">عدد</th>
                  </tr>
                </thead>
                <tbody>
                  {circleStats
                    .filter((c: any) => c.studentCount > 0)
                    .sort((a: any, b: any) => b.totalMemorizePages - a.totalMemorizePages)
                    .map((circle: any, idx: number) => (
                      <tr key={circle.circleId} className="border-b border-border/50 hover:bg-muted/30 transition-colors"
                        data-testid={`row-stats-circle-${circle.circleId}`}
                      >
                        <td className="py-2 px-3 font-semibold text-xs">{circle.circleName}</td>
                        <td className="py-2 px-3 text-muted-foreground text-xs">{circle.track}</td>
                        <td className="py-2 px-3 text-teal-600 font-bold text-xs">{formatPages(circle.totalMemorizePages)}</td>
                        <td className="py-2 px-3 text-blue-600 text-xs">{formatPages(circle.totalReviewPages)}</td>
                        <td className="py-2 px-3 text-emerald-600 text-xs">{formatPages(circle.totalRecitationPages)}</td>
                        <td className="py-2 px-3 text-rose-500 text-xs">{circle.totalAbsences}</td>
                        <td className="py-2 px-3 text-xs">
                          {(circle.teacherAbsences ?? 0) > 0
                            ? <span className="text-orange-600 font-bold">{circle.teacherAbsences}</span>
                            : <span className="text-muted-foreground">—</span>
                          }
                        </td>
                        <td className="py-2 px-3 text-xs">
                          {(circle.deficiencyCount ?? 0) > 0
                            ? <span className="text-red-600 font-bold">{circle.deficiencyCount}</span>
                            : <span className="text-muted-foreground">—</span>
                          }
                        </td>
                        <td className="py-2 px-3 text-muted-foreground text-xs">{circle.studentCount}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Teacher Records Table */}
      {teacherRecords.length > 0 && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <GraduationCap className="w-4 h-4 text-teal-600" />
              سجل المعلمات
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b border-border">
                  <tr>
                    <th className="text-right py-2.5 px-3 font-semibold text-muted-foreground text-xs">المعلمة</th>
                    <th className="text-right py-2.5 px-3 font-semibold text-muted-foreground text-xs">الحلقة</th>
                    <th className="text-right py-2.5 px-3 font-semibold text-muted-foreground text-xs">المسار</th>
                    <th className="text-right py-2.5 px-3 font-semibold text-muted-foreground text-xs">الغياب</th>
                    <th className="text-right py-2.5 px-3 font-semibold text-muted-foreground text-xs">التأخير</th>
                    <th className="text-right py-2.5 px-3 font-semibold text-muted-foreground text-xs">التحضير</th>
                  </tr>
                </thead>
                <tbody>
                  {teacherRecords.map((t: any) => (
                    <tr key={t.teacherId} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                      <td className="py-2 px-3 font-semibold text-xs">{t.teacherName}</td>
                      <td className="py-2 px-3 text-xs text-muted-foreground">{t.circleName}</td>
                      <td className="py-2 px-3 text-xs text-muted-foreground">{t.track}</td>
                      <td className="py-2 px-3 text-xs">
                        {t.absenceCount > 0
                          ? <span className="text-rose-600 font-bold">{t.absenceCount}</span>
                          : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="py-2 px-3 text-xs">
                        {t.tardyCount > 0
                          ? <span className="text-orange-500 font-bold">{t.tardyCount}</span>
                          : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="py-2 px-3 text-xs">
                        {t.prepIssueCount > 0
                          ? <span className="text-amber-600 font-bold">{t.prepIssueCount}</span>
                          : <span className="text-muted-foreground">—</span>}
                      </td>
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

function TrackSupervisorStats({ summary, circleStats }: { summary: any; circleStats: any[] }) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard label="الحفظ (وجه)" value={formatPages(summary.totalMemorizePages)} color="text-teal-600" icon={BookOpen} />
        <StatCard label="المراجعة القريبة" value={formatPages(summary.totalReviewNearPages)} color="text-blue-600" icon={Eye} />
        <StatCard label="المراجعة البعيدة" value={formatPages(summary.totalReviewFarPages)} color="text-teal-600" icon={Eye} />
        <StatCard label="الغياب" value={summary.totalAbsences ?? 0} color="text-rose-500" icon={Users} />
        <StatCard label="التقصير" value={summary.totalDeficiencies ?? 0} color="text-orange-500" icon={BarChart2} />
      </div>
      {(summary.totalRecitationPages > 0 || summary.totalReviewPages > 0) && (
        <div className="grid grid-cols-2 gap-3">
          {summary.totalReviewPages > 0 && <StatCard label="المراجعة" value={formatPages(summary.totalReviewPages)} color="text-cyan-600" icon={BookMarked} />}
          {summary.totalRecitationPages > 0 && <StatCard label="التلاوة" value={formatPages(summary.totalRecitationPages)} color="text-emerald-600" icon={BookMarked} />}
        </div>
      )}

      {circleStats?.length > 0 && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold">حلقات المسار</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b border-border">
                  <tr>
                    <th className="text-right py-2.5 px-3 font-semibold text-muted-foreground text-xs">الحلقة</th>
                    <th className="text-right py-2.5 px-3 font-semibold text-muted-foreground text-xs">الحفظ</th>
                    <th className="text-right py-2.5 px-3 font-semibold text-muted-foreground text-xs">المراجعة</th>
                    <th className="text-right py-2.5 px-3 font-semibold text-muted-foreground text-xs">الغياب</th>
                    <th className="text-right py-2.5 px-3 font-semibold text-muted-foreground text-xs">التقصير</th>
                    <th className="text-right py-2.5 px-3 font-semibold text-muted-foreground text-xs">عدد</th>
                  </tr>
                </thead>
                <tbody>
                  {circleStats.filter((c: any) => c.studentCount > 0).map((c: any) => (
                    <tr key={c.circleId} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                      <td className="py-2 px-3 font-semibold text-xs">{c.circleName}</td>
                      <td className="py-2 px-3 text-teal-600 font-bold text-xs">{formatPages(c.totalMemorizePages)}</td>
                      <td className="py-2 px-3 text-blue-600 text-xs">{formatPages(c.totalReviewPages)}</td>
                      <td className="py-2 px-3 text-rose-500 text-xs">{c.totalAbsences}</td>
                      <td className="py-2 px-3 text-xs">
                        {(c.deficiencyCount ?? 0) > 0
                          ? <span className="text-red-600 font-bold">{c.deficiencyCount}</span>
                          : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="py-2 px-3 text-muted-foreground text-xs">{c.studentCount}</td>
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

function TeacherStats({ summary, circleStats }: { summary: any; circleStats: any[] }) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard label="عدد الطالبات" value={summary.studentCount ?? 0} color="text-primary" icon={Users} />
        <StatCard label="الغياب" value={summary.totalAbsences ?? 0} color="text-rose-500" icon={Users} />
        <StatCard label="التقصير" value={summary.totalDeficiencies ?? 0} color="text-orange-500" icon={BarChart2} />
        <StatCard label="الحفظ (وجه)" value={formatPages(summary.totalMemorizePages)} color="text-teal-600" icon={BookOpen} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="المراجعة القريبة" value={formatPages(summary.totalReviewNearPages)} color="text-blue-600" icon={Eye} />
        <StatCard label="المراجعة البعيدة" value={formatPages(summary.totalReviewFarPages)} color="text-teal-600" icon={Eye} />
        {summary.totalReviewPages > 0 && <StatCard label="المراجعة" value={formatPages(summary.totalReviewPages)} color="text-cyan-600" icon={Eye} />}
        {summary.totalRecitationPages > 0 && <StatCard label="التلاوة" value={formatPages(summary.totalRecitationPages)} color="text-emerald-600" icon={BookMarked} />}
      </div>
    </div>
  );
}

function StudentStats({ userId }: { userId: number }) {
  const { data: records } = useListRecords(
    undefined,
    { query: { queryKey: ["myRecords", userId] } }
  );

  const sorted = (records ?? []).slice().sort((a: any, b: any) => b.date.localeCompare(a.date));
  const totalMem = Math.round(sorted.reduce((s: number, r: any) => s + (r.memorizePages ?? 0), 0) * 2) / 2;
  const totalRevNear = Math.round(sorted.reduce((s: number, r: any) => s + (r.reviewNearPages ?? 0), 0) * 2) / 2;
  const totalRevFar = Math.round(sorted.reduce((s: number, r: any) => s + (r.reviewFarPages ?? 0), 0) * 2) / 2;
  const totalRev = Math.round(sorted.reduce((s: number, r: any) => s + (r.reviewPages ?? 0), 0) * 2) / 2;
  const totalRec = Math.round(sorted.reduce((s: number, r: any) => s + (r.recitationPages ?? 0), 0) * 2) / 2;
  const totalAbsences = sorted.filter((r: any) => r.isAbsent).length;
  const totalSessions = sorted.filter((r: any) => !r.isAbsent).length;

  const TOTAL_QURAN_PAGES = 604;
  const progressPct = Math.min(100, Math.round((totalMem / TOTAL_QURAN_PAGES) * 1000) / 10);

  const latestRecord = sorted.find((r: any) => !r.isAbsent);

  return (
    <div className="space-y-5">
      {/* Progress bar */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            تقدمي في الحفظ
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{formatPages(totalMem)} وجه من أصل {TOTAL_QURAN_PAGES}</span>
            <span className="font-bold text-primary">{progressPct}%</span>
          </div>
          <div className="bg-muted rounded-full h-4 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${progressPct}%`,
                background: "linear-gradient(90deg, hsl(210, 51%, 21%) 0%, hsl(177, 35%, 40%) 100%)",
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

      <div className="grid grid-cols-3 gap-3">
        <StatCard label="إجمالي الحفظ" value={formatPages(totalMem)} color="text-teal-600" icon={BookOpen} />
        <StatCard label="الجلسات" value={totalSessions} color="text-primary" icon={Calendar} />
        <StatCard label="الغيابات" value={totalAbsences} color="text-rose-500" icon={Users} />
      </div>

      {(totalRevNear > 0 || totalRevFar > 0 || totalRev > 0 || totalRec > 0) && (
        <div className="grid grid-cols-2 gap-3">
          {totalRevNear > 0 && <StatCard label="م. قريبة" value={formatPages(totalRevNear)} color="text-blue-600" icon={Eye} />}
          {totalRevFar > 0 && <StatCard label="م. بعيدة" value={formatPages(totalRevFar)} color="text-teal-600" icon={Eye} />}
          {totalRev > 0 && <StatCard label="مراجعة" value={formatPages(totalRev)} color="text-cyan-600" icon={Eye} />}
          {totalRec > 0 && <StatCard label="تلاوة" value={formatPages(totalRec)} color="text-emerald-600" icon={BookMarked} />}
        </div>
      )}

      {sorted.length > 0 && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Calendar className="w-4 h-4 text-primary" />
              آخر السجلات
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border/50">
              {sorted.slice(0, 10).map((r: any) => (
                <div key={r.id} className="flex items-center justify-between px-4 py-2.5">
                  <span className="text-xs text-muted-foreground">{r.date}</span>
                  <div className="flex gap-2">
                    {r.isAbsent ? (
                      <Badge className="bg-rose-100 text-rose-700 border-0 text-xs">غائبة</Badge>
                    ) : (
                      <>
                        {(r.memorizePages ?? 0) > 0 && (
                          <Badge className="bg-teal-100 text-teal-700 border-0 text-xs">
                            {formatPages(r.memorizePages)} ح
                          </Badge>
                        )}
                        {((r.reviewNearPages ?? 0) + (r.reviewFarPages ?? 0) + (r.reviewPages ?? 0)) > 0 && (
                          <Badge className="bg-blue-100 text-blue-700 border-0 text-xs">
                            {formatPages((r.reviewNearPages ?? 0) + (r.reviewFarPages ?? 0) + (r.reviewPages ?? 0))} م
                          </Badge>
                        )}
                        {(r.recitationPages ?? 0) > 0 && (
                          <Badge className="bg-emerald-100 text-emerald-700 border-0 text-xs">
                            {formatPages(r.recitationPages)} ت
                          </Badge>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

const PERIOD_OPTIONS = [
  { label: "هذا الأسبوع", days: 7 },
  { label: "آخر 30 يوم", days: 30 },
  { label: "آخر 90 يوم", days: 90 },
  { label: "هذا العام", days: 365 },
];

export default function StatisticsPage() {
  const { data: user } = useGetCurrentUser({ query: { queryKey: ["getCurrentUser"] } });
  const [periodDays, setPeriodDays] = useState(365);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const today = new Date().toISOString().slice(0, 10);
  const fromDate = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const hasCustomRange = periodDays === 0 && customFrom && customTo && customFrom <= customTo;
  const dateParams = {
    dateFrom: hasCustomRange ? customFrom : fromDate,
    dateTo: hasCustomRange ? customTo : today,
  };

  const { data: summary, isError: summaryError } = useGetStatsSummary(dateParams, {
    query: { queryKey: ["statsSummary", dateParams] }
  });
  const { data: circleStats, isError: circleStatsError } = useGetCirclesStats(dateParams, {
    query: { queryKey: ["circlesStats", dateParams] }
  });

  const role = user?.role ?? "student";
  const isStudent = role === "student";

  const roleLabel: Record<string, string> = {
    leader: "إحصائيات المقرأة الشاملة",
    track_supervisor: "إحصائيات مسارك",
    teacher: "إحصائيات حلقتك",
    supervisor: "إحصائيات حلقتك",
    data_entry: "إحصائيات المسار",
    student: "إحصائياتي",
  };

  return (
    <div className="space-y-5" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <BarChart2 className="w-6 h-6 text-primary" />
          الإحصائيات
        </h1>
        <p className="text-muted-foreground text-sm mt-1">{roleLabel[role] ?? "الإحصائيات"}</p>
      </div>

      {/* Student view — no date filter, just their own records */}
      {isStudent && user?.id ? (
        <StudentStats userId={user.id} />
      ) : (
        <>
          <PeriodFilter
            periodDays={periodDays}
            setPeriodDays={setPeriodDays}
            customFrom={customFrom}
            customTo={customTo}
            setCustomFrom={setCustomFrom}
            setCustomTo={setCustomTo}
          />
          {role === "leader" && <ArchivePeriodSettings />}

          {summary && circleStats !== undefined ? (
            role === "leader" ? (
              <LeaderStats summary={summary} circleStats={circleStats ?? []} periodDays={periodDays} />
            ) : role === "track_supervisor" ? (
              <TrackSupervisorStats summary={summary} circleStats={circleStats ?? []} />
            ) : (
              <TeacherStats summary={summary} circleStats={circleStats ?? []} />
            )
          ) : (
            <div className="text-center py-10 text-muted-foreground text-sm">
              {summaryError || circleStatsError
                ? "تعذر تحميل الإحصائيات. حدّثي الصفحة أو سجّلي الدخول من جديد."
                : "جاري التحميل..."}
            </div>
          )}
        </>
      )}
    </div>
  );
}
