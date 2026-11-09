import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, AlertCircle, ChevronRight, ChevronLeft, CalendarDays, Users } from "lucide-react";

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
function formatDateAr(dateStr: string): string {
  const days = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
  const months = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
  const d = new Date(dateStr + "T12:00:00Z");
  return `${days[d.getUTCDay()]} ${d.getUTCDate()} ${months[d.getUTCMonth()]}`;
}
function daysAgoAr(fromDate: string, toDate: string): string {
  const a = new Date(fromDate + "T00:00:00Z").getTime();
  const b = new Date(toDate + "T00:00:00Z").getTime();
  const diff = Math.round((b - a) / 86400000);
  if (diff <= 0) return "اليوم";
  if (diff === 1) return "أمس";
  return `منذ ${diff} يوم`;
}

interface CircleStatus {
  circleId: number;
  circleName: string;
  totalStudents: number;
  enteredCount: number;
  missingCount: number;
  enteredToday: boolean;
  completed: boolean;
  enteredByNames: string[];
  lastEntryDate: string | null;
}

export default function TrackEntryStatusPage() {
  const today = getMeccaToday();
  const [date, setDate] = useState(today);
  const [circles, setCircles] = useState<CircleStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [holiday, setHoliday] = useState<string | null>(null);

  const fetchStatus = useCallback((d: string) => {
    setLoading(true);
    fetch(`${BASE}/api/data-entry/track-status?date=${d}`, { headers: authHeader() })
      .then(r => (r.ok ? r.json() : { circles: [] }))
      .then(data => { setCircles(Array.isArray(data.circles) ? data.circles : []); setHoliday(typeof data.holiday === "string" ? data.holiday : null); })
      .catch(() => { setCircles([]); setHoliday(null); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchStatus(date); }, [date, fetchStatus]);

  const isToday = date === today;
  const completedCircles = circles.filter(c => c.enteredToday);
  const missingCircles = circles.filter(c => !c.enteredToday);

  return (
    <div className="space-y-4 p-4 max-w-3xl mx-auto" dir="rtl">
      <Card className="border-0 shadow-sm border-r-4 border-r-indigo-400">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-bold flex items-center gap-2 text-indigo-700">
            <CalendarDays className="w-4 h-4" />
            حالة إدخال البيانات — مساري
          </CardTitle>
          <div className="flex items-center gap-2 mt-2">
            <button
              onClick={() => setDate(addDays(date, -1))}
              className="p-1.5 rounded-lg hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <span className="text-sm font-semibold text-foreground min-w-[160px] text-center">
              {formatDateAr(date)}
              {isToday && <span className="text-xs text-indigo-500 mr-1">(اليوم)</span>}
            </span>
            <button
              onClick={() => setDate(addDays(date, 1))}
              disabled={isToday}
              className="p-1.5 rounded-lg hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            {!isToday && (
              <button onClick={() => setDate(today)} className="text-xs text-indigo-500 hover:text-indigo-700 underline mr-1">
                اليوم
              </button>
            )}
          </div>
        </CardHeader>
      </Card>

      {loading ? (
        <div className="text-center py-10 text-muted-foreground text-sm">جاري التحميل...</div>
      ) : holiday ? (
        <Card className="border-0 shadow-sm">
          <CardContent className="py-10 text-center text-sm font-semibold text-primary">
            {holiday}، لا إدخال في هذا اليوم. دمتِ بخير 🌿
          </CardContent>
        </Card>
      ) : circles.length === 0 ? (
        <Card className="border-0 shadow-sm">
          <CardContent className="py-10 text-center text-muted-foreground text-sm">
            لا توجد حلقات في مسارك
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4 text-center">
                <p className="text-3xl font-bold text-emerald-600">{completedCircles.length}</p>
                <p className="text-xs text-muted-foreground mt-1">حلقات أدخلت بياناتها</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4 text-center">
                <p className="text-3xl font-bold text-amber-600">{missingCircles.length}</p>
                <p className="text-xs text-muted-foreground mt-1">حلقات لم تُدخل بعد</p>
              </CardContent>
            </Card>
          </div>

          {missingCircles.length > 0 && (
            <Card className="border-0 shadow-sm border-r-4 border-r-amber-400">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-bold flex items-center gap-2 text-amber-700">
                  <AlertCircle className="w-4 h-4" />
                  لم تُدخل بياناتها بعد
                  <Badge className="bg-amber-100 text-amber-700 border-0 text-xs">{missingCircles.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-2">
                {missingCircles.map(c => (
                  <div key={c.circleId} className="flex items-center justify-between bg-amber-50 rounded-xl px-3 py-2.5">
                    <div>
                      <span className="font-semibold text-sm text-amber-900">{c.circleName}</span>
                      <span className="text-xs text-amber-600 mr-2 flex items-center gap-1 inline-flex">
                        <Users className="w-3 h-3" /> {c.totalStudents}
                      </span>
                    </div>
                    <span className="text-xs text-amber-500">
                      {c.lastEntryDate ? `آخر إدخال ${daysAgoAr(c.lastEntryDate, date)}` : "لا يوجد إدخال سابق"}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {completedCircles.length > 0 && (
            <Card className="border-0 shadow-sm border-r-4 border-r-emerald-400">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-bold flex items-center gap-2 text-emerald-700">
                  <CheckCircle className="w-4 h-4" />
                  أدخلت بياناتها
                  <Badge className="bg-emerald-100 text-emerald-700 border-0 text-xs">{completedCircles.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-2">
                {completedCircles.map(c => (
                  <div key={c.circleId} className="flex items-center justify-between bg-emerald-50 rounded-xl px-3 py-2.5">
                    <div>
                      <span className="font-semibold text-sm text-emerald-900">{c.circleName}</span>
                      <span className="text-xs text-emerald-600 mr-2">
                        {c.enteredCount}/{c.totalStudents} طالبة
                      </span>
                    </div>
                    <span className="text-xs text-emerald-600">
                      {c.enteredByNames.length > 0 ? c.enteredByNames.join("، ") : ""}
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
