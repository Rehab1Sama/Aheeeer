import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Clock, User, CalendarDays } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const getToken = () => localStorage.getItem("sana_auth_token");
const authHeader = (): Record<string, string> => { const t = getToken(); return t ? { Authorization: `Bearer ${t}` } : {}; };

function getMeccaToday(): string {
  const d = new Date(Date.now() + 3 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}
function addDays(date: string, n: number): string {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function fmtMinutes(min: number): string {
  if (min <= 0) return "٠ د";
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h} س ${m} د` : `${m} د`;
}
function fmtTimeAgo(iso: string | null): string {
  if (!iso) return "—";
  const diffMin = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (diffMin < 1) return "الآن";
  if (diffMin < 60) return `قبل ${diffMin} د`;
  const h = Math.floor(diffMin / 60);
  return `قبل ${h} س`;
}

interface TodayRow {
  supervisorNameId: number; name: string; track: string | null;
  morningMinutes: number; eveningMinutes: number; totalMinutes: number; lastHeartbeatAt: string | null;
}
interface RangeRow {
  supervisorNameId: number; name: string; track: string | null;
  morningMinutes: number; eveningMinutes: number; totalMinutes: number; activeDays: number;
  byDay: { date: string; morningMinutes: number; eveningMinutes: number }[];
}

export default function SupervisorHoursPage() {
  const [today, setToday] = useState<TodayRow[]>([]);
  const [range, setRange] = useState<RangeRow[]>([]);
  const [dateFrom, setDateFrom] = useState(addDays(getMeccaToday(), -6));
  const [dateTo, setDateTo] = useState(getMeccaToday());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`${BASE}/api/track-supervisor/sessions/today`, { headers: authHeader() })
      .then(r => r.ok ? r.json() : [])
      .then(setToday)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetch(`${BASE}/api/track-supervisor/sessions/range?dateFrom=${dateFrom}&dateTo=${dateTo}`, { headers: authHeader() })
      .then(r => r.ok ? r.json() : [])
      .then(setRange)
      .catch(() => setRange([]));
  }, [dateFrom, dateTo]);

  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Clock className="w-6 h-6 text-primary" /> ساعات عمل مسؤولات المسار
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          يُحسب من نشاط فعلي (heartbeat) بعد ما تحدد كل واحدة اسمها — يميّز الفرد حتى لو الحساب مشترك.
        </p>
      </div>

      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-bold">اليوم</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {loading ? (
            <p className="text-sm text-muted-foreground">جاري التحميل...</p>
          ) : today.length === 0 ? (
            <p className="text-sm text-muted-foreground">ما فيه نشاط مسجّل اليوم بعد</p>
          ) : (
            <div className="space-y-2">
              {today.map(row => (
                <div key={row.supervisorNameId} className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-muted/40">
                  <div className="flex items-center gap-2 min-w-0">
                    <User className="w-4 h-4 text-primary shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">{row.name}</p>
                      {row.track && <p className="text-xs text-muted-foreground truncate">{row.track}</p>}
                    </div>
                  </div>
                  <div className="text-left shrink-0">
                    <p className="text-sm font-bold text-primary">{fmtMinutes(row.totalMinutes)}</p>
                    <p className="text-[12px] text-muted-foreground">آخر نشاط: {fmtTimeAgo(row.lastHeartbeatAt)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <CalendarDays className="w-4 h-4" /> نطاق تاريخي
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div><label className="text-xs text-muted-foreground block mb-1">من تاريخ</label><Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} /></div>
            <div><label className="text-xs text-muted-foreground block mb-1">إلى تاريخ</label><Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} /></div>
          </div>
          {range.length === 0 ? (
            <p className="text-sm text-muted-foreground">ما فيه نشاط مسجّل بهذا النطاق</p>
          ) : (
            <div className="space-y-2">
              {range.map(row => (
                <div key={row.supervisorNameId} className="p-2.5 rounded-xl bg-muted/40">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">{row.name}</p>
                      {row.track && <p className="text-xs text-muted-foreground truncate">{row.track}</p>}
                    </div>
                    <div className="text-left shrink-0">
                      <p className="text-sm font-bold text-primary">{fmtMinutes(row.totalMinutes)}</p>
                      <p className="text-[12px] text-muted-foreground">{row.activeDays} يوم نشِط</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
