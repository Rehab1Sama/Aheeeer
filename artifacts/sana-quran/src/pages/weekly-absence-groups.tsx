import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CalendarCheck, ChevronRight, ChevronLeft, Users, ArrowUp, ArrowDown, Minus } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const getToken = () => localStorage.getItem("sana_auth_token");
const authHeader = (): Record<string, string> => {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
};

function getMeccaToday(): string {
  const d = new Date(Date.now() + 3 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}
function addDays(date: string, n: number): string {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
// الأحد = 0
function getSunday(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d.toISOString().slice(0, 10);
}
function formatDateShort(dateStr: string): string {
  const months = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
  const d = new Date(dateStr + "T12:00:00Z");
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]}`;
}

type Trend = "improved" | "worse" | "same";
interface CircleGroupItem {
  id: number;
  name: string;
  track: string;
  absenceCount: number;
  prevAbsenceCount: number;
  trend: Trend;
}
interface GroupsResponse {
  weekStart: string;
  weekEnd: string;
  availableTracks: string[];
  groups: Record<string, CircleGroupItem[]>;
  /** حلقات بدون أي إدخال بيانات هالأسبوع — ما تدخل مجموعة "صفر غياب" ولا أي مجموعة ثانية */
  noData?: { id: number; name: string; track: string }[];
}

const GROUP_CONFIG: { key: string; label: string; badge: string; bg: string; text: string; border: string }[] = [
  { key: "0", label: "صفر غياب", badge: "bg-emerald-100 text-emerald-700", bg: "bg-emerald-50", text: "text-emerald-900", border: "border-r-emerald-400" },
  { key: "1", label: "غياب واحد", badge: "bg-teal-100 text-teal-700", bg: "bg-teal-50", text: "text-teal-900", border: "border-r-teal-400" },
  { key: "2", label: "غيابان", badge: "bg-amber-100 text-amber-700", bg: "bg-amber-50", text: "text-amber-900", border: "border-r-amber-400" },
  { key: "3", label: "٣ غيابات", badge: "bg-orange-100 text-orange-700", bg: "bg-orange-50", text: "text-orange-900", border: "border-r-orange-400" },
  { key: "4", label: "٤ غيابات", badge: "bg-red-100 text-red-700", bg: "bg-red-50", text: "text-red-900", border: "border-r-red-400" },
  { key: "5+", label: "٥ غيابات فأكثر", badge: "bg-purple-100 text-purple-700", bg: "bg-purple-50", text: "text-purple-900", border: "border-r-purple-400" },
];

function TrendIcon({ trend }: { trend: Trend }) {
  if (trend === "improved") {
    return (
      <span className="inline-flex items-center gap-0.5 text-emerald-600" title="تحسّن عن الأسبوع الماضي">
        <ArrowUp className="w-3.5 h-3.5" />
      </span>
    );
  }
  if (trend === "worse") {
    return (
      <span className="inline-flex items-center gap-0.5 text-red-600" title="أسوأ من الأسبوع الماضي">
        <ArrowDown className="w-3.5 h-3.5" />
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 text-muted-foreground/60" title="مثل الأسبوع الماضي">
      <Minus className="w-3.5 h-3.5" />
    </span>
  );
}

export default function WeeklyAbsenceGroupsPage() {
  const todaySunday = getSunday(getMeccaToday());
  const [weekStart, setWeekStart] = useState(todaySunday);
  const [trackFilter, setTrackFilter] = useState<string>("");
  const [data, setData] = useState<GroupsResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchGroups = useCallback((ws: string, track: string) => {
    setLoading(true);
    const trackQuery = track ? `&track=${encodeURIComponent(track)}` : "";
    fetch(`${BASE}/api/attendance/weekly-circle-groups?weekStart=${ws}${trackQuery}`, { headers: authHeader() })
      .then(r => (r.ok ? r.json() : null))
      .then(d => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchGroups(weekStart, trackFilter); }, [weekStart, trackFilter, fetchGroups]);

  const isCurrentWeek = weekStart === todaySunday;
  const weekEnd = addDays(weekStart, 4);
  const totalCircles = data ? Object.values(data.groups).reduce((sum, g) => sum + g.length, 0) : 0;

  return (
    <div className="space-y-4 p-4 max-w-3xl mx-auto" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">غياب الحلقات الأسبوعي</h1>
        <p className="text-muted-foreground text-sm mt-1">توزيع الحلقات حسب عدد الغيابات خلال الأسبوع (الأحد - الخميس)</p>
      </div>

      <Card className="border-0 shadow-sm border-r-4 border-r-indigo-400">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-bold flex items-center gap-2 text-indigo-700">
            <CalendarCheck className="w-4 h-4" />
            الأسبوع
          </CardTitle>
          <div className="flex items-center gap-2 mt-2">
            <button
              onClick={() => setWeekStart(addDays(weekStart, -7))}
              className="p-1.5 rounded-lg hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <span className="text-sm font-semibold text-foreground min-w-[200px] text-center">
              الأحد {formatDateShort(weekStart)} - الخميس {formatDateShort(weekEnd)}
              {isCurrentWeek && <span className="text-xs text-indigo-500 mr-1">(الحالي)</span>}
            </span>
            <button
              onClick={() => setWeekStart(addDays(weekStart, 7))}
              disabled={isCurrentWeek}
              className="p-1.5 rounded-lg hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            {!isCurrentWeek && (
              <button onClick={() => setWeekStart(todaySunday)} className="text-xs text-indigo-500 hover:text-indigo-700 underline mr-1">
                هذا الأسبوع
              </button>
            )}
          </div>

          {data && data.availableTracks.length > 1 && (
            <div className="mt-3">
              <select
                value={trackFilter}
                onChange={e => setTrackFilter(e.target.value)}
                className="w-full text-sm rounded-lg border border-border bg-background px-3 py-2 text-foreground"
              >
                <option value="">كل المسارات</option>
                {data.availableTracks.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          )}
        </CardHeader>
      </Card>

      {loading ? (
        <div className="text-center py-10 text-muted-foreground text-sm">جاري التحميل...</div>
      ) : !data || (totalCircles === 0 && !(data.noData && data.noData.length > 0)) ? (
        <Card className="border-0 shadow-sm">
          <CardContent className="py-10 text-center text-muted-foreground text-sm">
            لا توجد بيانات لهذا الأسبوع
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-indigo-600">{totalCircles}</p>
              <p className="text-xs text-muted-foreground mt-1">إجمالي الحلقات{trackFilter ? ` (${trackFilter})` : ""}</p>
            </CardContent>
          </Card>

          {GROUP_CONFIG.map(g => {
            const items = data.groups[g.key] ?? [];
            if (items.length === 0) return null;
            return (
              <Card key={g.key} className={`border-0 shadow-sm border-r-4 ${g.border}`}>
                <CardHeader className="pb-3">
                  <CardTitle className={`text-sm font-bold flex items-center gap-2 ${g.text}`}>
                    {g.label}
                    <Badge className={`${g.badge} border-0 text-xs`}>{items.length}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0 space-y-2">
                  {items.map(c => (
                    <div key={c.id} className={`flex items-center justify-between ${g.bg} rounded-xl px-3 py-2.5`}>
                      <div className="flex items-center gap-2">
                        <span className={`font-semibold text-sm ${g.text}`}>{c.name}</span>
                        <TrendIcon trend={c.trend} />
                      </div>
                      <span className={`text-xs ${g.text} opacity-70 flex items-center gap-1`}>
                        <Users className="w-3 h-3" /> {c.track}
                      </span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            );
          })}

          {data.noData && data.noData.length > 0 && (
            <Card className="border-0 shadow-sm border-r-4 border-r-gray-300">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-bold flex items-center gap-2 text-gray-600">
                  بدون إدخال بيانات هالأسبوع
                  <Badge className="bg-gray-100 text-gray-600 border-0 text-xs">{data.noData.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-2">
                {data.noData.map(c => (
                  <div key={c.id} className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2.5">
                    <span className="font-semibold text-sm text-gray-600">{c.name}</span>
                    <span className="text-xs text-gray-500 opacity-70 flex items-center gap-1">
                      <Users className="w-3 h-3" /> {c.track}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
