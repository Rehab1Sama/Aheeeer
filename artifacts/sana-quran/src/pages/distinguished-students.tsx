import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Star, CalendarDays, AlertTriangle } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const getToken = () => localStorage.getItem("sana_auth_token");
const authHeader = (): Record<string, string> => { const t = getToken(); return t ? { Authorization: `Bearer ${t}` } : {}; };

function getMeccaToday(): string {
  const d = new Date(Date.now() + 3 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

interface MeritStudent {
  studentId: number;
  studentName: string;
  circleId: number;
  circleName: string;
  note: string | null;
}

function StudentList({ students, loading, emptyText }: { students: MeritStudent[]; loading: boolean; emptyText: string }) {
  if (loading) return <p className="text-sm text-muted-foreground">جاري التحميل...</p>;
  if (students.length === 0) return <p className="text-sm text-muted-foreground">{emptyText}</p>;
  return (
    <div className="space-y-2">
      {students.map(s => (
        <div key={s.studentId} className="p-2.5 rounded-xl bg-muted/40">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Star className="w-4 h-4 text-amber-500 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">{s.studentName}</p>
                <p className="text-xs text-muted-foreground truncate">{s.circleName}</p>
              </div>
            </div>
          </div>
          {s.note && (
            <div className="mt-1.5 flex items-start gap-1.5 text-xs text-amber-700 bg-amber-50 rounded-lg px-2 py-1">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{s.note}</span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default function DistinguishedStudentsPage() {
  const [tab, setTab] = useState<"weekly" | "monthly">("weekly");

  const [weekDate, setWeekDate] = useState(getMeccaToday());
  const [weekRange, setWeekRange] = useState<{ weekStart: string | null; weekEnd: string | null }>({ weekStart: null, weekEnd: null });
  const [weeklyStudents, setWeeklyStudents] = useState<MeritStudent[]>([]);
  const [weeklyLoading, setWeeklyLoading] = useState(true);

  const [month, setMonth] = useState(getMeccaToday().slice(0, 7));
  const [monthlyStudents, setMonthlyStudents] = useState<MeritStudent[]>([]);
  const [monthlyLoading, setMonthlyLoading] = useState(true);

  useEffect(() => {
    setWeeklyLoading(true);
    fetch(`${BASE}/api/distinguished-students/weekly?date=${weekDate}`, { headers: authHeader() })
      .then(r => r.ok ? r.json() : { weekStart: null, weekEnd: null, students: [] })
      .then(data => { setWeekRange({ weekStart: data.weekStart, weekEnd: data.weekEnd }); setWeeklyStudents(data.students ?? []); })
      .catch(() => setWeeklyStudents([]))
      .finally(() => setWeeklyLoading(false));
  }, [weekDate]);

  useEffect(() => {
    setMonthlyLoading(true);
    fetch(`${BASE}/api/distinguished-students/monthly?month=${month}`, { headers: authHeader() })
      .then(r => r.ok ? r.json() : { students: [] })
      .then(data => setMonthlyStudents(data.students ?? []))
      .catch(() => setMonthlyStudents([]))
      .finally(() => setMonthlyLoading(false));
  }, [month]);

  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Star className="w-6 h-6 text-amber-500" /> المتميزات
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          الطالبات اللي ما غِبن طوال الفترة المختارة بمسارك — ولو عندها تقصير مسجّل بأحد الأيام، تظهر لك ملاحظة بجانب اسمها.
        </p>
      </div>

      <Tabs value={tab} onValueChange={v => setTab(v as "weekly" | "monthly")}>
        <TabsList>
          <TabsTrigger value="weekly">أسبوعي</TabsTrigger>
          <TabsTrigger value="monthly">شهري</TabsTrigger>
        </TabsList>

        <TabsContent value="weekly">
          <Card className="border-0 shadow-sm mt-3">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <CalendarDays className="w-4 h-4" /> اختاري أي يوم من الأسبوع المطلوب
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-3">
              <Input type="date" value={weekDate} onChange={e => setWeekDate(e.target.value)} className="max-w-[200px]" />
              {weekRange.weekStart && weekRange.weekEnd && (
                <p className="text-xs text-muted-foreground">
                  الأسبوع: من {weekRange.weekStart} إلى {weekRange.weekEnd} (الأحد–الخميس)
                </p>
              )}
              <StudentList students={weeklyStudents} loading={weeklyLoading} emptyText="ما فيه طالبات متميزات بهذا الأسبوع بعد" />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="monthly">
          <Card className="border-0 shadow-sm mt-3">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <CalendarDays className="w-4 h-4" /> اختاري الشهر
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-3">
              <Input type="month" value={month} onChange={e => setMonth(e.target.value)} className="max-w-[200px]" />
              <StudentList students={monthlyStudents} loading={monthlyLoading} emptyText="ما فيه طالبات متميزات بهذا الشهر بعد" />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
