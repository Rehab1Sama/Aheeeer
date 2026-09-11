import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { UserX, RefreshCw, Search, CheckCircle2, Link2, ExternalLink, MessageCircle } from "lucide-react";
import { useLocation } from "wouter";

interface UnlinkedStudent {
  id: number;
  fullName: string;
  phone: string | null;
  country: string | null;
  email: string | null;
  preferredCircleName: string | null;
  preferredCircleId: number | null;
  createdAt: string;
}

interface Circle { id: number; name: string; track: string | null; }

const TOKEN = () => localStorage.getItem("sana_auth_token");
const H = () => ({ Authorization: `Bearer ${TOKEN()}`, "Content-Type": "application/json" });

export default function UnlinkedStudentsPage() {
  const [students, setStudents] = useState<UnlinkedStudent[]>([]);
  const [circles, setCircles] = useState<Circle[]>([]);
  const [regCircleId, setRegCircleId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [assignMap, setAssignMap] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState<Record<number, boolean>>({});
  const [done, setDone] = useState<Set<number>>(new Set());
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/students/without-circle", { headers: H() });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setStudents(data.students ?? []);
      setCircles(data.circles ?? []);
      setRegCircleId(data.regCircleId ?? null);
    } catch {
      toast({ title: "خطأ في تحميل البيانات", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleAssign = async (student: UnlinkedStudent) => {
    const circleId = assignMap[student.id];
    if (!circleId) { toast({ title: "اختاري الحلقة أولاً", variant: "destructive" }); return; }
    setSaving(s => ({ ...s, [student.id]: true }));
    try {
      const res = await fetch(`/api/students/${student.id}`, {
        method: "PATCH",
        headers: H(),
        body: JSON.stringify({ circleId: parseInt(circleId) }),
      });
      if (!res.ok) throw new Error();
      toast({ title: `تم نقل ${student.fullName} إلى الحلقة المختارة ✓` });
      setDone(d => new Set([...d, student.id]));
      queryClient.invalidateQueries({ queryKey: ["circles"] });
      setTimeout(fetchData, 800);
    } catch {
      toast({ title: "خطأ في النقل", variant: "destructive" });
    } finally {
      setSaving(s => ({ ...s, [student.id]: false }));
    }
  };

  const filtered = students.filter(s =>
    !done.has(s.id) &&
    (!search ||
      s.fullName.toLowerCase().includes(search.toLowerCase()) ||
      (s.email ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (s.country ?? "").toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="space-y-5" dir="rtl">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <UserX className="w-5 h-5 text-rose-500" />
            طالبات بدون حلقة
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">طالبات سجّلن لكن لم يُنقلن لحلقتهن بعد</p>
        </div>
        <button
          onClick={fetchData}
          disabled={loading}
          className="p-2 rounded-lg border border-border hover:bg-muted transition-colors"
          title="تحديث"
        >
          <RefreshCw className={`w-4 h-4 text-muted-foreground ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {loading ? (
        <div className="text-center py-16">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">جاري التحميل...</p>
        </div>
      ) : filtered.length === 0 && !search ? (
        <Card className="border-emerald-200 bg-emerald-50">
          <CardContent className="flex flex-col items-center justify-center py-14 gap-3">
            <CheckCircle2 className="w-12 h-12 text-emerald-400" />
            <p className="text-base font-semibold text-emerald-700">جميع الطالبات في حلقاتهن ✓</p>
            <p className="text-sm text-emerald-600">لا توجد طالبة بدون حلقة</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="بحث بالاسم أو الإيميل أو الدولة..."
              className="w-full h-10 rounded-xl border border-input bg-white px-4 pe-10 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 text-right"
            />
          </div>
          <p className="text-xs text-muted-foreground">{filtered.length} طالبة بدون حلقة</p>

          <div className="space-y-3">
            {filtered.map(student => {
              const waPhone = student.phone ? student.phone.replace(/[\s\-\(\)\+]/g, "") : null;
              const defaultCircle = student.preferredCircleId
                ? String(student.preferredCircleId)
                : "";
              return (
                <Card key={student.id} className="border border-border shadow-sm hover:shadow-md transition-shadow">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            onClick={() => navigate(`/students/${student.id}`)}
                            className="font-semibold text-sm text-primary hover:underline text-right"
                          >
                            {student.fullName}
                          </button>
                          {student.country && (
                            <span className="text-[10px] bg-slate-100 text-slate-600 rounded-full px-2 py-0.5 border border-slate-200">
                              {student.country}
                            </span>
                          )}
                        </div>
                        {student.email && (
                          <p className="text-xs text-muted-foreground mt-0.5" dir="ltr">{student.email}</p>
                        )}
                        {student.preferredCircleName && (
                          <p className="text-xs text-primary/70 mt-0.5">
                            🎯 تفضل: {student.preferredCircleName}
                          </p>
                        )}
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          سجّلت: {new Date(student.createdAt).toLocaleDateString("ar-SA", { year: "numeric", month: "short", day: "numeric" })}
                        </p>
                      </div>
                      <div className="flex gap-1.5 shrink-0">
                        {waPhone && (
                          <a href={`https://wa.me/${waPhone}`} target="_blank" rel="noopener noreferrer"
                            className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors"
                            title="فتح واتساب">
                            <MessageCircle className="w-4 h-4" />
                          </a>
                        )}
                        <button
                          onClick={() => navigate(`/students/${student.id}`)}
                          className="p-1.5 rounded-lg bg-muted/50 text-muted-foreground hover:bg-muted transition-colors"
                          title="فتح الملف">
                          <ExternalLink className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="flex gap-2 items-center">
                      <select
                        value={assignMap[student.id] ?? defaultCircle}
                        onChange={e => setAssignMap(m => ({ ...m, [student.id]: e.target.value }))}
                        className="flex-1 h-9 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                      >
                        <option value="">-- اختاري الحلقة --</option>
                        {circles.map(c => (
                          <option key={c.id} value={String(c.id)}>
                            {c.name}{c.track ? ` — ${c.track}` : ""}
                          </option>
                        ))}
                      </select>
                      <Button
                        size="sm"
                        onClick={() => handleAssign(student)}
                        disabled={saving[student.id] || !(assignMap[student.id] ?? defaultCircle)}
                        className="shrink-0 gap-1.5 bg-teal-600 hover:bg-teal-700 text-white"
                      >
                        {saving[student.id]
                          ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          : <Link2 className="w-3.5 h-3.5" />
                        }
                        نقل
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            {filtered.length === 0 && search && (
              <p className="text-center text-sm text-muted-foreground py-8">لا نتائج للبحث</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
