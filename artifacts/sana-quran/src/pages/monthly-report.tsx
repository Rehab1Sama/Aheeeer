import { useState } from "react";
import { useGetMonthlyAttendanceReport } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronUp, BarChart2, Users, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";

function getCurrentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function getCurrentWeekStart() {
  const d = new Date();
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1 - day);
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

function addDays(dateStr: string, days: number) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function weekLabel(weekStart: string) {
  const start = new Date(weekStart);
  const end = new Date(weekStart);
  end.setDate(end.getDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString("ar-SA", { month: "short", day: "numeric" });
  return `${fmt(start)} — ${fmt(end)}`;
}

function monthLabel(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("ar-SA", { year: "numeric", month: "long" });
}

function exportToCsv(report: any[], month: string) {
  const label = monthLabel(month);
  const rows: string[][] = [
    ["الحلقة", "المسار", "الطالبات", "السجلات", "الغيابات", "معدل الحضور"],
  ];
  for (const circle of report) {
    rows.push([
      circle.circleName,
      circle.track,
      String(circle.totalStudents),
      String(circle.totalSessions),
      String(circle.totalAbsences),
      circle.attendanceRate != null ? `${circle.attendanceRate}%` : "—",
    ]);
    for (const s of circle.students) {
      rows.push([
        `  └ ${s.studentName}`,
        circle.track,
        "",
        String(s.sessions),
        String(s.absences),
        s.attendanceRate != null ? `${s.attendanceRate}%` : "—",
      ]);
    }
  }
  const bom = "\uFEFF";
  const csv = bom + rows.map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `تقرير-الحضور-${label}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function rateColor(r: number | null | undefined) {
  if (r == null) return "text-muted-foreground";
  if (r >= 80) return "text-emerald-600";
  if (r >= 60) return "text-amber-600";
  return "text-rose-600";
}

export default function MonthlyReportPage() {
  const [mode, setMode] = useState<"monthly" | "weekly">("monthly");
  const [month, setMonth] = useState(getCurrentMonth());
  const [weekStart, setWeekStart] = useState(getCurrentWeekStart());
  const [expandedCircle, setExpandedCircle] = useState<number | null>(null);

  const queryParams = mode === "weekly" ? { weekStart } : { month };
  const queryKey = mode === "weekly" ? ["monthlyReport", "week", weekStart] : ["monthlyReport", month];

  const { data: report, isLoading } = useGetMonthlyAttendanceReport(
    queryParams,
    { query: { queryKey } }
  );

  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  const totalStudents = report?.reduce((s, c) => s + c.totalStudents, 0) ?? 0;
  const totalSessions = report?.reduce((s, c) => s + c.totalSessions, 0) ?? 0;
  const totalAbsences = report?.reduce((s, c) => s + c.totalAbsences, 0) ?? 0;
  const overallRate = totalSessions > 0 ? Math.round(((totalSessions - totalAbsences) / totalSessions) * 100) : null;

  const today = new Date().toISOString().slice(0, 10);
  const canGoNextWeek = addDays(weekStart, 7) <= today;

  return (
    <div className="space-y-5" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">تقرير الحضور</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {mode === "weekly" ? weekLabel(weekStart) : monthLabel(month)}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Mode toggle */}
          <div className="flex rounded-lg border border-border overflow-hidden text-xs font-medium">
            <button
              onClick={() => setMode("monthly")}
              className={`px-3 py-1.5 transition-colors ${mode === "monthly" ? "bg-primary text-white" : "bg-background text-foreground hover:bg-muted"}`}
            >
              شهري
            </button>
            <button
              onClick={() => setMode("weekly")}
              className={`px-3 py-1.5 transition-colors ${mode === "weekly" ? "bg-primary text-white" : "bg-background text-foreground hover:bg-muted"}`}
            >
              أسبوعي
            </button>
          </div>

          {/* Monthly selector */}
          {mode === "monthly" && (
            <select
              value={month}
              onChange={e => setMonth(e.target.value)}
              className="border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground"
            >
              {months.map(m => (
                <option key={m} value={m}>{monthLabel(m)}</option>
              ))}
            </select>
          )}

          {/* Weekly navigator */}
          {mode === "weekly" && (
            <div className="flex items-center gap-1 border border-border rounded-lg overflow-hidden text-sm">
              <button
                onClick={() => setWeekStart(w => addDays(w, -7))}
                className="px-2.5 py-1.5 hover:bg-muted transition-colors font-bold"
                title="الأسبوع السابق"
              >›</button>
              <span className="px-2 py-1 text-xs text-muted-foreground min-w-[110px] text-center">
                {weekLabel(weekStart)}
              </span>
              <button
                onClick={() => setWeekStart(w => addDays(w, 7))}
                disabled={!canGoNextWeek}
                className="px-2.5 py-1.5 hover:bg-muted transition-colors font-bold disabled:opacity-30"
                title="الأسبوع التالي"
              >‹</button>
            </div>
          )}

          {report && report.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => exportToCsv(report, mode === "weekly" ? weekStart : month)}
              className="gap-1.5 text-xs"
            >
              <Download className="w-3.5 h-3.5" />
              تصدير CSV
            </Button>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 text-center">
            <p className="text-3xl font-bold text-foreground">{totalStudents}</p>
            <p className="text-xs text-muted-foreground mt-1">إجمالي الطالبات</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 text-center">
            <p className={`text-3xl font-bold ${rateColor(overallRate)}`}>
              {overallRate != null ? `${overallRate}%` : "—"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">معدل الحضور</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 text-center">
            <p className="text-3xl font-bold text-foreground">{totalSessions}</p>
            <p className="text-xs text-muted-foreground mt-1">إجمالي السجلات</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 text-center">
            <p className="text-3xl font-bold text-rose-600">{totalAbsences}</p>
            <p className="text-xs text-muted-foreground mt-1">إجمالي الغيابات</p>
          </CardContent>
        </Card>
      </div>

      {isLoading && (
        <div className="text-center py-8 text-muted-foreground">جاري التحميل...</div>
      )}

      {/* Attendance Rate Bar Chart */}
      {report && report.filter(c => c.attendanceRate != null).length > 0 && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <BarChart2 className="w-4 h-4 text-primary" />
              مقارنة معدلات الحضور بين الحلقات
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 pb-4">
            <ResponsiveContainer width="100%" height={Math.max(180, report.length * 32)}>
              <BarChart
                data={report
                  .filter(c => c.attendanceRate != null)
                  .sort((a, b) => (b.attendanceRate ?? 0) - (a.attendanceRate ?? 0))
                  .map(c => ({ name: c.circleName, rate: c.attendanceRate, track: c.track }))}
                layout="vertical"
                margin={{ top: 4, right: 48, bottom: 4, left: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(v: number) => [`${v}%`, "معدل الحضور"]}
                  labelFormatter={(l) => l}
                  contentStyle={{ direction: "rtl", fontFamily: "Arial" }}
                />
                <Bar dataKey="rate" radius={[0, 4, 4, 0]} maxBarSize={20}>
                  {report
                    .filter(c => c.attendanceRate != null)
                    .sort((a, b) => (b.attendanceRate ?? 0) - (a.attendanceRate ?? 0))
                    .map((c, i) => (
                      <Cell
                        key={i}
                        fill={
                          (c.attendanceRate ?? 0) >= 80
                            ? "#10b981"
                            : (c.attendanceRate ?? 0) >= 60
                            ? "#f59e0b"
                            : "#ef4444"
                        }
                      />
                    ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Circles breakdown */}
      {report && report.map(circle => (
        <Card key={circle.circleId} className="border-0 shadow-sm overflow-hidden">
          <CardHeader
            className="pb-3 cursor-pointer hover:bg-muted/20 transition-colors"
            onClick={() => setExpandedCircle(expandedCircle === circle.circleId ? null : circle.circleId)}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <BarChart2 className="w-4 h-4 text-primary shrink-0" />
                <div className="min-w-0">
                  <CardTitle className="text-sm font-bold text-foreground truncate">{circle.circleName}</CardTitle>
                  <p className="text-xs text-muted-foreground">{circle.track}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <div className="text-center">
                  <p className={`text-base font-bold ${rateColor(circle.attendanceRate)}`}>
                    {circle.attendanceRate != null ? `${circle.attendanceRate}%` : "—"}
                  </p>
                  <p className="text-xs text-muted-foreground">حضور</p>
                </div>
                <Badge variant="outline" className="text-xs gap-1">
                  <Users className="w-3 h-3" />
                  {circle.totalStudents}
                </Badge>
                {expandedCircle === circle.circleId
                  ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
                  : <ChevronDown className="w-4 h-4 text-muted-foreground" />
                }
              </div>
            </div>
          </CardHeader>

          {expandedCircle === circle.circleId && (
            <CardContent className="pt-0">
              <div className="text-xs text-muted-foreground flex gap-4 mb-3 pb-3 border-b border-border">
                <span>سجلات: <strong className="text-foreground">{circle.totalSessions}</strong></span>
                <span>غيابات: <strong className="text-rose-600">{circle.totalAbsences}</strong></span>
              </div>
              <div className="space-y-1.5">
                {circle.students
                  .sort((a, b) => (b.absences ?? 0) - (a.absences ?? 0))
                  .map(s => (
                    <div key={s.studentId} className="flex items-center justify-between py-1.5 border-b border-border/40 last:border-0">
                      <span className="text-sm text-foreground">{s.studentName}</span>
                      <div className="flex items-center gap-3 text-xs">
                        <span className="text-muted-foreground">{s.sessions} سجل</span>
                        {s.absences > 0 && (
                          <span className="text-rose-600 font-medium">{s.absences} غياب</span>
                        )}
                        <span className={`font-bold ${rateColor(s.attendanceRate)}`}>
                          {s.attendanceRate != null ? `${s.attendanceRate}%` : "—"}
                        </span>
                      </div>
                    </div>
                  ))}
              </div>
            </CardContent>
          )}
        </Card>
      ))}

      {report && report.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">لا توجد بيانات لهذا الشهر</div>
      )}
    </div>
  );
}
