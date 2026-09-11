import { useState, useEffect, useCallback } from "react";
import { useListCircles, useGetCurrentUser } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, Loader2, ArrowLeftRight, UserSearch } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type PoolStudent = {
  studentId: number;
  fullName: string;
  phone: string | null;
  source: "registration" | "no_circle";
  circleName: string | null;
};

function getToken() {
  return localStorage.getItem("sana_auth_token");
}

export default function RegistrationPoolSearchPage() {
  const { data: user } = useGetCurrentUser({ query: { queryKey: ["getCurrentUser"] } });
  const { data: circles } = useListCircles(undefined, { query: { queryKey: ["circles"] } });
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PoolStudent[]>([]);
  const [searching, setSearching] = useState(false);
  const [targetCircle, setTargetCircle] = useState<Record<number, number>>({});
  const [claiming, setClaiming] = useState<number | null>(null);
  const { toast } = useToast();

  const myCircles = (circles ?? []).filter(
    (c: any) => !c.isArchived && c.trackType !== "registration" && c.track === user?.track
  );

  const runSearch = useCallback((term: string) => {
    if (term.trim().length < 2) { setResults([]); return; }
    setSearching(true);
    const token = getToken();
    fetch(`${BASE}/api/students/unassigned-search?q=${encodeURIComponent(term.trim())}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(r => r.ok ? r.json() : [])
      .then((data: PoolStudent[]) => setResults(data))
      .finally(() => setSearching(false));
  }, []);

  useEffect(() => {
    const t = setTimeout(() => runSearch(q), 300);
    return () => clearTimeout(t);
  }, [q, runSearch]);

  const handleClaim = async (student: PoolStudent) => {
    const circleId = targetCircle[student.studentId];
    if (!circleId) {
      toast({ title: "اختاري حلقتك أولًا", variant: "destructive" });
      return;
    }
    setClaiming(student.studentId);
    try {
      const token = getToken();
      const res = await fetch(`${BASE}/api/students/${student.studentId}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ circleId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? "تعذّر نقل الطالبة");
      }
      toast({ title: `✅ تم نقل ${student.fullName} لحلقتك بنجاح` });
      setResults(prev => prev.filter(s => s.studentId !== student.studentId));
    } catch (err: any) {
      toast({ title: err?.message ?? "حدث خطأ أثناء النقل", variant: "destructive" });
    } finally {
      setClaiming(null);
    }
  };

  if (user?.role !== "track_supervisor") return null;

  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">البحث في قائمة التسجيل</h1>
        <p className="text-muted-foreground text-sm mt-1">
          دوّري باسم أي طالبة موجودة بقائمة التسجيل المشتركة، واسحبيها مباشرة لأي حلقة من حلقات مسارك.
        </p>
      </div>

      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-bold flex items-center gap-2">
            <UserSearch className="w-4 h-4 text-primary" />
            بحث بالاسم
          </CardTitle>
          <div className="relative mt-2">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="اكتبي اسم الطالبة (حرفين على الأقل)..."
              className="w-full pr-9 pl-3 py-2 text-sm border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {searching ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : q.trim().length < 2 ? (
            <p className="text-center py-10 text-muted-foreground text-sm">اكتبي حرفين على الأقل لبدء البحث</p>
          ) : results.length === 0 ? (
            <p className="text-center py-10 text-muted-foreground text-sm">لا توجد نتائج مطابقة بقائمة التسجيل</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b border-border">
                  <tr>
                    <th className="py-3 px-4 text-right font-semibold text-muted-foreground">الاسم</th>
                    <th className="py-3 px-4 text-right font-semibold text-muted-foreground">الجوال</th>
                    <th className="py-3 px-4 text-right font-semibold text-muted-foreground">الحالة الحالية</th>
                    <th className="py-3 px-4 text-right font-semibold text-muted-foreground">نقل إلى</th>
                    <th className="py-3 px-4 text-right w-10" />
                  </tr>
                </thead>
                <tbody>
                  {results.map(s => (
                    <tr key={s.studentId} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                      <td className="py-3 px-4 font-semibold">{s.fullName}</td>
                      <td className="py-3 px-4 text-muted-foreground text-xs">{s.phone ?? "—"}</td>
                      <td className="py-3 px-4">
                        <Badge className="bg-amber-100 text-amber-700 border-0 text-[10px] px-1.5">
                          {s.source === "registration" ? "قائمة التسجيل" : "بلا حلقة"}
                        </Badge>
                      </td>
                      <td className="py-3 px-4">
                        <select
                          className="text-sm border border-input rounded-lg px-2 py-1.5 bg-background text-right w-full max-w-[220px] focus:outline-none focus:ring-2 focus:ring-primary/20"
                          value={targetCircle[s.studentId] ?? ""}
                          onChange={e => {
                            const cid = parseInt(e.target.value);
                            setTargetCircle(prev => cid ? { ...prev, [s.studentId]: cid } : (() => { const n = { ...prev }; delete n[s.studentId]; return n; })());
                          }}
                        >
                          <option value="">— اختاري حلقتك —</option>
                          {myCircles.map((c: any) => (
                            <option key={c.id} value={c.id}>
                              {c.name}{c.meetingTime ? ` — ${c.meetingTime}` : ""}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-3 px-4">
                        <Button
                          size="sm"
                          className="gap-1.5"
                          disabled={!targetCircle[s.studentId] || claiming === s.studentId}
                          onClick={() => handleClaim(s)}
                        >
                          <ArrowLeftRight className="w-3.5 h-3.5" />
                          {claiming === s.studentId ? "جاري النقل..." : "نقل"}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
