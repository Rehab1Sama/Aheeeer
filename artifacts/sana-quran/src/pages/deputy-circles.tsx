import { useState, useEffect, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { Users, Clock, ChevronDown, ChevronUp, CheckCircle2, Circle, CalendarCheck, Filter } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const getToken = () => localStorage.getItem("sana_auth_token");

interface Circle {
  id: number;
  name: string;
  track: string | null;
  trackType: string | null;
  meetingTime: string | null;
  teacherId: number | null;
  isArchived: boolean;
}

interface CircleVisit {
  id: number;
  circleId: number;
  visitDate: string;
  notes: string | null;
  createdById: number;
  createdAt: string;
  circleName?: string;
  circleTrack?: string | null;
}

const PERIODS = [
  { label: "الفترة الأولى", range: "5ص – 11ص", minHour: 5, maxHour: 11 },
  { label: "الفترة الثانية", range: "12م – 3م", minHour: 12, maxHour: 15 },
  { label: "الفترة الثالثة", range: "4م – 7م", minHour: 16, maxHour: 19 },
  { label: "الفترة الرابعة", range: "8م – 12م", minHour: 20, maxHour: 23 },
];

function getTimePeriod(meetingTime: string | null | undefined): number {
  if (!meetingTime) return -1;
  const hour = parseInt(meetingTime.split(":")[0] ?? "0", 10);
  if (hour >= 5 && hour <= 11) return 0;
  if (hour >= 12 && hour <= 15) return 1;
  if (hour >= 16 && hour <= 19) return 2;
  if (hour >= 20) return 3;
  return -1;
}

function formatTime(meetingTime: string | null | undefined): string {
  if (!meetingTime) return "";
  const [hourStr, minStr] = meetingTime.split(":");
  const hour = parseInt(hourStr ?? "0", 10);
  const min = minStr ?? "00";
  const period = hour < 12 ? "ص" : "م";
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${min} ${period}`;
}

function getMeccaToday(): string {
  return new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function getWeekStart(): string {
  const d = new Date(Date.now() + 3 * 60 * 60 * 1000);
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  return d.toISOString().slice(0, 10);
}

function getMonthStart(): string {
  const d = new Date(Date.now() + 3 * 60 * 60 * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function formatDateAr(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("ar-SA", { weekday: "long", year: "numeric", month: "short", day: "numeric" });
}

export default function DeputyCirclesPage() {
  const [circles, setCircles] = useState<Circle[]>([]);
  const [todayVisits, setTodayVisits] = useState<CircleVisit[]>([]);
  const [historyVisits, setHistoryVisits] = useState<CircleVisit[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedPeriods, setExpandedPeriods] = useState<Set<number>>(new Set([0, 1, 2, 3]));
  const [expandedNotes, setExpandedNotes] = useState<Set<number>>(new Set());
  const [notesDraft, setNotesDraft] = useState<Record<number, string>>({});
  const [savingVisit, setSavingVisit] = useState<number | null>(null);
  const [historyFilter, setHistoryFilter] = useState<"week" | "month" | "all">("week");
  const [showHistory, setShowHistory] = useState(false);
  const { toast } = useToast();

  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` };
  const today = getMeccaToday();

  const fetchData = useCallback(async () => {
    try {
      const [circlesRes, visitsRes] = await Promise.all([
        fetch(`${BASE}/api/circles`, { headers }),
        fetch(`${BASE}/api/deputy/circle-visits`, { headers }),
      ]);
      const circlesData: Circle[] = circlesRes.ok ? await circlesRes.json() : [];
      const visitsData: CircleVisit[] = visitsRes.ok ? await visitsRes.json() : [];

      setCircles(circlesData.filter(c => !c.isArchived));
      setTodayVisits(visitsData.filter(v => v.visitDate === today));

      const initNotes: Record<number, string> = {};
      for (const v of visitsData) {
        if (v.visitDate === today) initNotes[v.circleId] = v.notes ?? "";
      }
      setNotesDraft(prev => ({ ...prev, ...initNotes }));
    } catch {
      toast({ title: "خطأ في تحميل البيانات", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [today]);

  const fetchHistory = useCallback(async (filter: "week" | "month" | "all") => {
    try {
      const res = await fetch(`${BASE}/api/deputy/circle-visits/history?filter=${filter}`, { headers });
      if (res.ok) setHistoryVisits(await res.json());
    } catch {
      toast({ title: "خطأ في تحميل السجل", variant: "destructive" });
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (showHistory) fetchHistory(historyFilter);
  }, [showHistory, historyFilter, fetchHistory]);

  function togglePeriod(idx: number) {
    setExpandedPeriods(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  }

  function isVisitedToday(circleId: number): boolean {
    return todayVisits.some(v => v.circleId === circleId);
  }

  function getTodayVisit(circleId: number): CircleVisit | undefined {
    return todayVisits.find(v => v.circleId === circleId);
  }

  async function handleToggleVisit(circle: Circle) {
    setSavingVisit(circle.id);
    try {
      const existing = getTodayVisit(circle.id);
      if (existing) {
        await fetch(`${BASE}/api/deputy/circle-visits/${existing.id}`, { method: "DELETE", headers });
        setTodayVisits(prev => prev.filter(v => v.id !== existing.id));
        setNotesDraft(prev => ({ ...prev, [circle.id]: "" }));
        toast({ title: `تم إلغاء زيارة ${circle.name}` });
      } else {
        const notes = notesDraft[circle.id]?.trim() || null;
        const res = await fetch(`${BASE}/api/deputy/circle-visits`, {
          method: "POST", headers,
          body: JSON.stringify({ circleId: circle.id, notes }),
        });
        if (res.ok) {
          const visit: CircleVisit = await res.json();
          setTodayVisits(prev => [...prev, visit]);
          toast({ title: `✓ تمت زيارة ${circle.name}` });
        }
      }
    } catch {
      toast({ title: "حدث خطأ", variant: "destructive" });
    } finally {
      setSavingVisit(null);
    }
  }

  async function handleSaveNotes(circle: Circle) {
    const existing = getTodayVisit(circle.id);
    if (!existing) {
      await handleToggleVisit(circle);
      return;
    }
    setSavingVisit(circle.id);
    try {
      const res = await fetch(`${BASE}/api/deputy/circle-visits/${existing.id}/notes`, {
        method: "PATCH", headers,
        body: JSON.stringify({ notes: notesDraft[circle.id]?.trim() ?? null }),
      });
      if (res.ok) {
        const updated: CircleVisit = await res.json();
        setTodayVisits(prev => prev.map(v => v.id === existing.id ? updated : v));
        toast({ title: "تم حفظ الملاحظة" });
      }
    } catch {
      toast({ title: "حدث خطأ", variant: "destructive" });
    } finally {
      setSavingVisit(null);
    }
  }

  const grouped = PERIODS.map((period, idx) => ({
    ...period,
    idx,
    circles: circles
      .filter(c => getTimePeriod(c.meetingTime) === idx)
      .sort((a, b) => (a.meetingTime ?? "").localeCompare(b.meetingTime ?? "")),
  }));

  const unassigned = circles.filter(c => getTimePeriod(c.meetingTime) === -1);
  const visitedTodayCircles = circles.filter(c => isVisitedToday(c.id));

  const filteredHistory = historyVisits.filter(v => {
    if (historyFilter === "week") return v.visitDate >= getWeekStart();
    if (historyFilter === "month") return v.visitDate >= getMonthStart();
    return true;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  function CircleRow({ circle }: { circle: Circle }) {
    const visited = isVisitedToday(circle.id);
    const visit = getTodayVisit(circle.id);
    const isExpanded = expandedNotes.has(circle.id);

    return (
      <div className={`border-b last:border-0 transition-colors ${visited ? "bg-blue-50/70" : ""}`}>
        <div className="flex items-center gap-3 px-4 py-3">
          <button
            onClick={() => handleToggleVisit(circle)}
            disabled={savingVisit === circle.id}
            className="shrink-0"
          >
            {visited
              ? <CheckCircle2 className="w-5 h-5 text-blue-600" />
              : <Circle className="w-5 h-5 text-muted-foreground hover:text-primary transition-colors" />
            }
          </button>
          <div className="flex-1 min-w-0">
            <p className={`font-medium text-sm truncate ${visited ? "text-blue-800" : ""}`}>{circle.name}</p>
            {circle.track && (
              <p className={`text-xs ${visited ? "text-blue-600" : "text-muted-foreground"}`}>{circle.track}</p>
            )}
          </div>
          {circle.meetingTime && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
              <Clock className="w-3 h-3" />
              {formatTime(circle.meetingTime)}
            </div>
          )}
          {visited && (
            <Badge className="bg-blue-100 text-blue-700 border-blue-200 text-[10px] shrink-0">زيارة</Badge>
          )}
          <button
            onClick={() => setExpandedNotes(prev => {
              const next = new Set(prev);
              if (next.has(circle.id)) next.delete(circle.id); else next.add(circle.id);
              return next;
            })}
            className="shrink-0 p-1"
          >
            {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
          </button>
        </div>

        {isExpanded && (
          <div className="px-4 pb-3 space-y-2 border-t bg-white/50">
            {visit?.notes && !notesDraft[circle.id] && (
              <p className="text-xs text-muted-foreground pt-2 italic">الملاحظة المحفوظة: {visit.notes}</p>
            )}
            <Textarea
              value={notesDraft[circle.id] ?? ""}
              onChange={e => setNotesDraft(prev => ({ ...prev, [circle.id]: e.target.value }))}
              placeholder="أضيفي ملاحظة حول الزيارة..."
              rows={2}
              className="text-sm resize-none mt-2"
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => handleSaveNotes(circle)}
                disabled={savingVisit === circle.id}
                className={visited ? "bg-blue-600 hover:bg-blue-700" : ""}
              >
                {visited ? "حفظ الملاحظة" : "تسجيل الزيارة"}
              </Button>
              {visited && (
                <Button size="sm" variant="outline" onClick={() => handleToggleVisit(circle)} disabled={savingVisit === circle.id}>
                  إلغاء الزيارة
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4" dir="rtl">
      <div>
        <h1 className="text-xl font-bold">الحلقات</h1>
        <p className="text-sm text-muted-foreground mt-1">
          مجمّعة حسب الفترة الزمنية · {circles.length} حلقة · اليوم {formatDateAr(today)}
        </p>
      </div>

      {visitedTodayCircles.length > 0 && (
        <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-3">
          <p className="text-sm font-semibold text-blue-800 mb-0.5 flex items-center gap-2">
            <CalendarCheck className="w-4 h-4" />
            زيارات اليوم ({visitedTodayCircles.length})
          </p>
          <p className="text-xs text-blue-600">
            {visitedTodayCircles.map(c => c.name).join(" · ")}
          </p>
        </div>
      )}

      <div className="space-y-3">
        {grouped.map(period => (
          <div key={period.idx} className="rounded-xl border bg-card shadow-sm overflow-hidden">
            <button
              className="w-full flex items-center justify-between p-4 hover:bg-muted/30 transition-colors"
              onClick={() => togglePeriod(period.idx)}
            >
              <div className="flex items-center gap-3">
                <div className="w-2 h-8 rounded-full bg-primary opacity-70" />
                <div className="text-right">
                  <p className="font-semibold text-sm">{period.label}</p>
                  <p className="text-xs text-muted-foreground">{period.range}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs">
                  {period.circles.length} حلقة
                </Badge>
                {period.circles.filter(c => isVisitedToday(c.id)).length > 0 && (
                  <Badge className="bg-blue-100 text-blue-700 border-blue-200 text-xs">
                    {period.circles.filter(c => isVisitedToday(c.id)).length} زيارة
                  </Badge>
                )}
                {expandedPeriods.has(period.idx)
                  ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
                  : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
              </div>
            </button>

            {expandedPeriods.has(period.idx) && (
              <div className="border-t divide-y divide-border/40">
                {period.circles.length === 0 ? (
                  <p className="text-center text-sm text-muted-foreground py-4">لا توجد حلقات في هذه الفترة</p>
                ) : (
                  period.circles.map(circle => <CircleRow key={circle.id} circle={circle} />)
                )}
              </div>
            )}
          </div>
        ))}

        {unassigned.length > 0 && (
          <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
            <div className="p-4 border-b">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-sm text-muted-foreground">غير محدد الفترة</p>
                <Badge variant="outline" className="text-xs">{unassigned.length} حلقة</Badge>
              </div>
            </div>
            <div className="divide-y divide-border/40">
              {unassigned.map(circle => <CircleRow key={circle.id} circle={circle} />)}
            </div>
          </div>
        )}
      </div>

      {/* Visited circles history */}
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <button
          className="w-full flex items-center justify-between p-4 hover:bg-muted/30 transition-colors"
          onClick={() => setShowHistory(p => !p)}
        >
          <div className="flex items-center gap-2">
            <CalendarCheck className="w-4 h-4 text-blue-600" />
            <span className="font-semibold text-sm">حلقات تمت زيارتها</span>
          </div>
          {showHistory ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </button>

        {showHistory && (
          <div className="border-t">
            <div className="flex items-center gap-2 px-4 pt-3 pb-2 border-b bg-muted/20">
              <Filter className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">فلتر:</span>
              {(["week", "month", "all"] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setHistoryFilter(f)}
                  className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                    historyFilter === f
                      ? "bg-primary text-white border-primary"
                      : "bg-white text-muted-foreground border-border hover:bg-muted/30"
                  }`}
                >
                  {f === "week" ? "هذا الأسبوع" : f === "month" ? "هذا الشهر" : "الكل"}
                </button>
              ))}
            </div>

            {filteredHistory.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-6">لا توجد زيارات مسجلة</p>
            ) : (
              <div className="divide-y divide-border/30 max-h-72 overflow-y-auto">
                {filteredHistory
                  .sort((a, b) => b.visitDate.localeCompare(a.visitDate))
                  .map(visit => (
                    <div key={visit.id} className="px-4 py-3 bg-blue-50/30">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
                          <p className="font-medium text-sm text-foreground">
                            {visit.circleName ?? circles.find(c => c.id === visit.circleId)?.name ?? `حلقة #${visit.circleId}`}
                          </p>
                        </div>
                        <span className="text-xs text-muted-foreground shrink-0">{formatDateAr(visit.visitDate)}</span>
                      </div>
                      {visit.notes && (
                        <p className="text-xs text-muted-foreground mt-1 mr-6 whitespace-pre-wrap">{visit.notes}</p>
                      )}
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
