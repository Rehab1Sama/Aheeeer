import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart3, Users, BookOpen, RefreshCw, TrendingUp, Calendar } from "lucide-react";
import { useGetCurrentUser } from "@workspace/api-client-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const getToken = () => localStorage.getItem("sana_auth_token");

function getWeekRange(offset = 0) {
  const now = new Date();
  const day = now.getDay();
  const diff = (day + 1) % 7;
  const sun = new Date(now); sun.setDate(now.getDate() - diff + offset * 7);
  const sat = new Date(sun); sat.setDate(sun.getDate() + 6);
  return {
    from: sun.toISOString().slice(0, 10),
    to: sat.toISOString().slice(0, 10),
  };
}

const PRESETS = [
  { label: "هذا الأسبوع", ...getWeekRange(0) },
  { label: "الأسبوع الماضي", ...getWeekRange(-1) },
  {
    label: "آخر 30 يوم",
    from: new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10),
    to: new Date().toISOString().slice(0, 10),
  },
];

interface TrackStat {
  trackName: string;
  uniqueStudents: number;
  totalRecords: number;
  presentCount: number;
  attendanceRate: number;
  avgMemorizePages: number;
  avgReviewNearPages: number;
  avgReviewFarPages: number;
  avgReviewPages: number;
  avgTotalReviewPages: number;
}

interface ReportData {
  dateRange: { from: string; to: string };
  tracks: TrackStat[];
  overall: Omit<TrackStat, "trackName">;
}

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color: string }) {
  return (
    <div className={`rounded-2xl p-4 ${color} space-y-1`}>
      <p className="text-xs font-semibold opacity-70">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
      {sub && <p className="text-xs opacity-60">{sub}</p>}
    </div>
  );
}

function ProgressBar({ value, max, color = "bg-primary" }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-semibold w-8 text-right">{value}</span>
    </div>
  );
}

export default function ReportsPage() {
  const { data: user } = useGetCurrentUser({ query: { queryKey: ["getCurrentUser"] } });
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [preset, setPreset] = useState(0);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [useCustom, setUseCustom] = useState(false);

  const role = (user as any)?.role ?? "";
  const allowed = ["leader", "deputy", "track_supervisor", "teacher", "supervisor"].includes(role);

  const fetchReport = (from: string, to: string) => {
    setLoading(true);
    fetch(`${BASE}/api/reports/weekly?from=${from}&to=${to}`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setData(d); })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!allowed) return;
    const range = PRESETS[preset];
    fetchReport(range.from, range.to);
  }, [preset, allowed]);

  const handleCustomSearch = () => {
    if (customFrom && customTo) {
      setUseCustom(true);
      fetchReport(customFrom, customTo);
    }
  };

  if (!allowed) return <div className="p-8 text-center text-muted-foreground">غير مصرح</div>;

  const maxStudents = Math.max(1, ...(data?.tracks.map(t => t.uniqueStudents) ?? [1]));
  const maxMemorize = Math.max(1, ...(data?.tracks.map(t => t.avgMemorizePages) ?? [1]));
  const maxReview = Math.max(1, ...(data?.tracks.map(t => t.avgTotalReviewPages) ?? [1]));

  return (
    <div className="space-y-5" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">التقارير الأسبوعية</h1>
        <p className="text-muted-foreground text-sm mt-1">متوسطات الحفظ والمراجعة لكل مسار</p>
      </div>

      {/* Date range selectors */}
      <Card className="border-0 shadow-sm">
        <CardContent className="pt-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p, i) => (
              <button
                key={i}
                onClick={() => { setUseCustom(false); setPreset(i); }}
                className={`px-3 py-1.5 rounded-xl text-sm font-semibold border transition-colors ${
                  !useCustom && preset === i
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border hover:bg-muted/50"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <div className="flex items-center gap-1.5">
              <label className="text-xs text-muted-foreground">من</label>
              <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                className="border border-input rounded-xl px-2 py-1.5 text-sm bg-background" />
            </div>
            <div className="flex items-center gap-1.5">
              <label className="text-xs text-muted-foreground">إلى</label>
              <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                className="border border-input rounded-xl px-2 py-1.5 text-sm bg-background" />
            </div>
            <button
              onClick={handleCustomSearch}
              disabled={!customFrom || !customTo}
              className="px-3 py-1.5 rounded-xl text-sm font-semibold bg-secondary text-secondary-foreground disabled:opacity-40"
            >
              بحث
            </button>
          </div>
          {data && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {data.dateRange.from} — {data.dateRange.to}
            </p>
          )}
        </CardContent>
      </Card>

      {loading && (
        <div className="flex justify-center py-12">
          <RefreshCw className="w-6 h-6 animate-spin text-primary" />
        </div>
      )}

      {data && !loading && (
        <>
          {/* Overall summary */}
          <div>
            <h2 className="text-sm font-bold text-muted-foreground mb-3 flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              ملخص عام
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard label="طالبات نشطات" value={data.overall.uniqueStudents}
                sub="في الفترة المحددة" color="bg-blue-50 text-blue-800" />
              <StatCard label="نسبة الحضور" value={`${data.overall.attendanceRate}%`}
                sub={`${data.overall.presentCount} من ${data.overall.totalRecords}`}
                color="bg-emerald-50 text-emerald-800" />
              <StatCard label="متوسط الحفظ اليومي" value={data.overall.avgMemorizePages}
                sub="وجه / يوم / طالبة" color="bg-purple-50 text-purple-800" />
              <StatCard label="متوسط المراجعة" value={data.overall.avgTotalReviewPages}
                sub="وجه / يوم / طالبة" color="bg-amber-50 text-amber-800" />
            </div>
          </div>

          {/* Per-track breakdown */}
          {data.tracks.length === 0 ? (
            <Card className="border-0 shadow-sm">
              <CardContent className="py-12 text-center text-muted-foreground text-sm">
                لا توجد بيانات للفترة المحددة
              </CardContent>
            </Card>
          ) : (
            <div>
              <h2 className="text-sm font-bold text-muted-foreground mb-3 flex items-center gap-2">
                <BarChart3 className="w-4 h-4" />
                تفصيل حسب المسار
              </h2>
              <div className="space-y-3">
                {data.tracks.map((track) => (
                  <Card key={track.trackName} className="border-0 shadow-sm">
                    <CardHeader className="pb-2 pt-4">
                      <div className="flex items-center justify-between gap-2">
                        <CardTitle className="text-sm font-bold">{track.trackName}</CardTitle>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="text-xs gap-1">
                            <Users className="w-3 h-3" />
                            {track.uniqueStudents} طالبة
                          </Badge>
                          <Badge
                            className={`text-xs ${
                              track.attendanceRate >= 80 ? "bg-emerald-100 text-emerald-700 border-0"
                              : track.attendanceRate >= 60 ? "bg-amber-100 text-amber-700 border-0"
                              : "bg-red-100 text-red-700 border-0"
                            }`}
                          >
                            حضور {track.attendanceRate}%
                          </Badge>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="bg-purple-50 rounded-xl p-2.5">
                          <p className="text-purple-500 font-semibold mb-0.5 flex items-center gap-1">
                            <BookOpen className="w-3 h-3" />
                            متوسط الحفظ
                          </p>
                          <p className="text-lg font-bold text-purple-800">{track.avgMemorizePages}</p>
                          <p className="text-purple-400 text-[10px]">وجه / يوم</p>
                        </div>
                        <div className="bg-amber-50 rounded-xl p-2.5">
                          <p className="text-amber-500 font-semibold mb-0.5 flex items-center gap-1">
                            <RefreshCw className="w-3 h-3" />
                            متوسط المراجعة
                          </p>
                          <p className="text-lg font-bold text-amber-800">{track.avgTotalReviewPages}</p>
                          <p className="text-amber-400 text-[10px]">وجه / يوم</p>
                        </div>
                      </div>

                      {(track.avgReviewNearPages > 0 || track.avgReviewFarPages > 0 || track.avgReviewPages > 0) && (
                        <div className="space-y-1.5 text-xs">
                          {track.avgReviewNearPages > 0 && (
                            <div>
                              <p className="text-muted-foreground mb-0.5">مراجعة قريبة</p>
                              <ProgressBar value={track.avgReviewNearPages} max={maxReview} color="bg-secondary" />
                            </div>
                          )}
                          {track.avgReviewFarPages > 0 && (
                            <div>
                              <p className="text-muted-foreground mb-0.5">مراجعة بعيدة</p>
                              <ProgressBar value={track.avgReviewFarPages} max={maxReview} color="bg-blue-400" />
                            </div>
                          )}
                          {track.avgReviewPages > 0 && (
                            <div>
                              <p className="text-muted-foreground mb-0.5">مراجعة عامة</p>
                              <ProgressBar value={track.avgReviewPages} max={maxReview} color="bg-amber-400" />
                            </div>
                          )}
                        </div>
                      )}

                      <div className="pt-1 border-t border-border">
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>إجمالي السجلات: <span className="font-semibold text-foreground">{track.totalRecords}</span></span>
                          <span>حاضرات: <span className="font-semibold text-emerald-600">{track.presentCount}</span></span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
