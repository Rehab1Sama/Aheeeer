import { useState, useEffect, useCallback } from "react";
import { useListCircles, useGetCurrentUser } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Users, ArrowLeftRight, Loader2, CheckSquare, Square, Search, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type RegStudent = {
  id: number;
  fullName: string;
  phone: string | null;
  email: string | null;
  circleId: number | null;
  circleName: string;
};

function getToken() {
  return localStorage.getItem("sana_auth_token");
}

export default function RegistrationStudentsPage() {
  const { data: user } = useGetCurrentUser({ query: { queryKey: ["getCurrentUser"] } });
  const { data: circles } = useListCircles(undefined, { query: { queryKey: ["circles"] } });
  const [students, setStudents] = useState<RegStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [targetCircles, setTargetCircles] = useState<Record<number, number>>({});
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [transferring, setTransferring] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const { toast } = useToast();

  const fetchStudents = useCallback(() => {
    setLoading(true);
    const token = getToken();
    fetch(`${BASE}/api/registration-students`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(r => r.ok ? r.json() : [])
      .then((data: RegStudent[]) => { setStudents(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => { fetchStudents(); }, [fetchStudents]);

  const activeCircles = (circles ?? []).filter((c: any) => !c.isArchived && c.trackType !== "registration");

  const filteredStudents = students.filter(s =>
    s.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (s.phone ?? "").includes(searchTerm)
  );

  const toggleSelect = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === filteredStudents.length && filteredStudents.length > 0) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filteredStudents.map(s => s.id)));
    }
  };

  const handleTransfer = async () => {
    const transfers = [...selected]
      .filter(id => targetCircles[id])
      .map(id => ({ studentId: id, circleId: targetCircles[id] }));

    if (transfers.length === 0) {
      toast({ title: "اختاري حلقة مقصد لكل طالبة مُحددة", variant: "destructive" }); return;
    }

    setTransferring(true);
    try {
      const token = getToken();
      const res = await fetch(`${BASE}/api/registration-students/bulk-transfer`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ transfers }),
      });
      if (!res.ok) throw new Error();
      toast({ title: `✅ تم نقل ${transfers.length} طالبة بنجاح` });
      setSelected(new Set());
      setTargetCircles({});
      fetchStudents();
    } catch {
      toast({ title: "حدث خطأ أثناء النقل", variant: "destructive" });
    } finally {
      setTransferring(false);
    }
  };

  const readyToTransfer = [...selected].filter(id => targetCircles[id]).length;

  if (!["leader", "deputy"].includes(user?.role ?? "")) return null;

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">طالبات قائمة التسجيل</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {students.length} طالبة في انتظار التوزيع على الحلقات
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchStudents} className="gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" />
            تحديث
          </Button>
          {readyToTransfer > 0 && (
            <Button onClick={handleTransfer} disabled={transferring} className="gap-2">
              <ArrowLeftRight className="w-4 h-4" />
              {transferring ? "جاري النقل..." : `نقل ${readyToTransfer} طالبة`}
            </Button>
          )}
        </div>
      </div>

      {readyToTransfer > 0 && readyToTransfer < selected.size && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-2.5 text-sm text-amber-700">
          ⚠ {selected.size - readyToTransfer} طالبة مُحددة لم تُختر لها حلقة مقصد بعد
        </div>
      )}

      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3 flex-wrap">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" />
              الطالبات ({filteredStudents.length}{students.length !== filteredStudents.length ? ` من ${students.length}` : ""})
            </CardTitle>
            <div className="flex-1 min-w-[180px] relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="بحث باسم أو رقم جوال..."
                className="w-full pr-9 pl-3 py-1.5 text-sm border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-14">
              <Loader2 className="w-7 h-7 animate-spin text-primary" />
            </div>
          ) : students.length === 0 ? (
            <div className="text-center py-14">
              <p className="text-4xl mb-3">🎉</p>
              <p className="text-base font-semibold text-foreground">لا توجد طالبات في قائمة التسجيل</p>
              <p className="text-xs text-muted-foreground mt-1">جميع الطالبات موزّعات على حلقاتهن</p>
            </div>
          ) : filteredStudents.length === 0 ? (
            <p className="text-center py-10 text-muted-foreground text-sm">لا نتائج للبحث</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b border-border">
                  <tr>
                    <th className="py-3 px-4 text-right w-10">
                      <button onClick={toggleAll}>
                        {selected.size === filteredStudents.length && filteredStudents.length > 0
                          ? <CheckSquare className="w-4 h-4 text-primary" />
                          : <Square className="w-4 h-4 text-muted-foreground" />}
                      </button>
                    </th>
                    <th className="py-3 px-4 text-right font-semibold text-muted-foreground">الاسم</th>
                    <th className="py-3 px-4 text-right font-semibold text-muted-foreground">الجوال</th>
                    <th className="py-3 px-4 text-right font-semibold text-muted-foreground hidden md:table-cell">البريد</th>
                    <th className="py-3 px-4 text-right font-semibold text-muted-foreground">الحلقة المقصد</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStudents.map(student => {
                    const isSelected = selected.has(student.id);
                    const hasTarget = !!targetCircles[student.id];
                    return (
                      <tr
                        key={student.id}
                        className={`border-b border-border/50 transition-colors ${isSelected ? "bg-primary/5" : "hover:bg-muted/30"}`}
                      >
                        <td className="py-3 px-4">
                          <button onClick={() => toggleSelect(student.id)}>
                            {isSelected
                              ? <CheckSquare className="w-4 h-4 text-primary" />
                              : <Square className="w-4 h-4 text-muted-foreground" />}
                          </button>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold">{student.fullName}</span>
                            {isSelected && hasTarget && (
                              <Badge className="bg-emerald-100 text-emerald-700 border-0 text-[10px] px-1.5">جاهزة للنقل ✓</Badge>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-muted-foreground text-xs">{student.phone ?? "—"}</td>
                        <td className="py-3 px-4 text-muted-foreground text-xs hidden md:table-cell">{student.email ?? "—"}</td>
                        <td className="py-3 px-4">
                          <select
                            className="text-sm border border-input rounded-lg px-2 py-1.5 bg-background text-right w-full max-w-[240px] focus:outline-none focus:ring-2 focus:ring-primary/20"
                            value={targetCircles[student.id] ?? ""}
                            onChange={e => {
                              const cid = parseInt(e.target.value);
                              if (cid) {
                                setTargetCircles(prev => ({ ...prev, [student.id]: cid }));
                                setSelected(prev => new Set([...prev, student.id]));
                              } else {
                                setTargetCircles(prev => { const n = { ...prev }; delete n[student.id]; return n; });
                              }
                            }}
                          >
                            <option value="">— اختاري الحلقة —</option>
                            {activeCircles.map((c: any) => (
                              <option key={c.id} value={c.id}>
                                {c.name}{(c as any).meetingTime ? ` — ${(c as any).meetingTime}` : ""}{c.track ? ` (${c.track})` : ""}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
