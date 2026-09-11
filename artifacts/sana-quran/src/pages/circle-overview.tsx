import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, ArrowRight, Users, CalendarDays } from "lucide-react";
import { getToken } from "@/lib/auth";
import { BadgeChip } from "@/components/badges/BadgeChip";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const authHeader = (): Record<string, string> => {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
};

interface DaySummary {
  date: string;
  dayName: string;
  hasData: boolean;
  presentCount: number;
  absentCount: number;
}

interface OverviewData {
  circle: { id: number; name: string; track: string; teacherName: string | null; supervisorName: string | null };
  badges: { badgeId: string; tier: number; name: string; subtitle: string; emoji: string; image: string | null; color: string }[];
  today: { date: string; hasData: boolean; absentNames: string[] };
  week: { weekStart: string; weekEnd: string; days: DaySummary[]; totalAbsent: number };
}

export default function CircleOverviewPage({ circleId }: { circleId: number }) {
  const [, navigate] = useLocation();
  const [data, setData] = useState<OverviewData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!circleId || isNaN(circleId)) { setError("رقم حلقة غير صالح"); setLoading(false); return; }
    setLoading(true);
    setError(null);
    fetch(`${BASE}/api/circles/${circleId}/overview`, { headers: authHeader() })
      .then(async r => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(body?.error === "Forbidden" ? "ما عندك صلاحية لعرض هذه الحلقة" : "تعذّر تحميل بيانات الحلقة");
        }
        return r.json();
      })
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [circleId]);

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-4" dir="rtl">
        <button onClick={() => navigate("/")} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowRight className="w-4 h-4" /> رجوع
        </button>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-6 text-center text-sm text-destructive">{error ?? "خطأ غير متوقع"}</CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <button onClick={() => navigate("/")} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-2">
          <ArrowRight className="w-4 h-4" /> رجوع
        </button>
        <h1 className="text-2xl font-bold text-foreground">{data.circle.name}</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {data.circle.track}
          {data.circle.teacherName && <> · معلمة: {data.circle.teacherName}</>}
          {data.circle.supervisorName && <> · مشرفة: {data.circle.supervisorName}</>}
        </p>
      </div>

      {data.badges.length > 0 && (
        <Card className="border-0 shadow-sm border-r-4 border-r-indigo-400">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold flex items-center gap-2 text-indigo-700">🌙 أوسمة الحلقة</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex flex-wrap gap-4">
              {data.badges.map(b => (
                <BadgeChip
                  key={b.badgeId}
                  badge={b}
                  size={200}
                  compact
                  trailing={(b as any).timesAwarded > 1 && (
                    <span className="text-[10px] font-normal opacity-70"> (تكررت {(b as any).timesAwarded} مرة)</span>
                  )}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <Users className="w-4 h-4 text-rose-600" /> غياب اليوم
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {!data.today.hasData ? (
            <p className="text-sm text-muted-foreground">ما فيه إدخال بيانات لليوم بعد</p>
          ) : data.today.absentNames.length === 0 ? (
            <p className="text-sm text-emerald-700 font-medium">لا يوجد غياب اليوم 🎉</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {data.today.absentNames.map(name => (
                <span key={name} className="rounded-full bg-rose-50 text-rose-700 border border-rose-100 px-2.5 py-1 text-xs font-medium">
                  {name}
                </span>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-blue-600" /> ملخص الأسبوع
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 space-y-1.5">
          {data.week.days.map(d => (
            <div key={d.date} className="flex items-center justify-between text-sm py-1 border-b border-border/30 last:border-0">
              <span className="font-medium">{d.dayName}</span>
              {!d.hasData ? (
                <span className="text-xs text-muted-foreground">لا يوجد إدخال</span>
              ) : (
                <span className="flex items-center gap-3 text-xs">
                  <span className="text-emerald-700">حاضرة: {d.presentCount}</span>
                  <span className="text-rose-700">غايبة: {d.absentCount}</span>
                </span>
              )}
            </div>
          ))}
          <div className="pt-2 mt-2 border-t border-border/50 flex items-center justify-between text-sm font-bold">
            <span>إجمالي غياب الأسبوع</span>
            <span className="text-rose-700">{data.week.totalAbsent}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
