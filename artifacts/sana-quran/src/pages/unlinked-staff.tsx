import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UserX, Link2, RefreshCw, Search, CheckCircle2 } from "lucide-react";

interface StaffUser {
  id: number;
  name: string;
  email: string;
  role: "teacher" | "supervisor";
  circleId: number | null;
  track: string | null;
  createdAt: string;
}

interface Circle {
  id: number;
  name: string;
  track: string | null;
  teacherId: number | null;
  supervisorId: number | null;
}

function roleLabel(role: string) {
  if (role === "teacher") return "معلمة";
  if (role === "supervisor") return "مشرفة";
  return role;
}

function roleBadgeClass(role: string) {
  if (role === "teacher") return "bg-teal-50 text-teal-700 border border-teal-200";
  if (role === "supervisor") return "bg-indigo-50 text-indigo-700 border border-indigo-200";
  return "bg-muted text-muted-foreground";
}

export default function UnlinkedStaffPage() {
  const [data, setData] = useState<{ unlinked: StaffUser[]; circles: Circle[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [assignMap, setAssignMap] = useState<Record<number, number | null>>({});
  const [saving, setSaving] = useState<Record<number, boolean>>({});
  const [done, setDone] = useState<Set<number>>(new Set());
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const fetchData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("sana_auth_token");
      const res = await fetch("/api/users/unlinked-staff", {
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      if (!res.ok) throw new Error();
      setData(await res.json());
    } catch {
      toast({ title: "خطأ في تحميل البيانات", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleLink = async (user: StaffUser) => {
    const circleId = assignMap[user.id];
    if (!circleId) { toast({ title: "اختاري الحلقة أولاً", variant: "destructive" }); return; }
    setSaving(s => ({ ...s, [user.id]: true }));
    try {
      const token = localStorage.getItem("sana_auth_token");
      const res = await fetch(`/api/users/${user.id}/set-role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ role: user.role, circleId }),
      });
      if (!res.ok) throw new Error();
      toast({ title: `تم ربط ${user.name} بالحلقة بنجاح` });
      setDone(d => new Set([...d, user.id]));
      queryClient.invalidateQueries({ queryKey: ["circles"] });
      setTimeout(() => fetchData(), 800);
    } catch {
      toast({ title: "خطأ في الربط", variant: "destructive" });
    } finally {
      setSaving(s => ({ ...s, [user.id]: false }));
    }
  };

  const filtered = (data?.unlinked ?? []).filter(u =>
    !done.has(u.id) &&
    (!search || u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50/30 p-4 md:p-6" dir="rtl">
      <div className="max-w-2xl mx-auto space-y-5">

        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <UserX className="w-5 h-5 text-rose-500" />
              الموظفات غير المرتبطات
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">معلمات ومشرفات سجّلن لكن لم يُربطن بحلقة بعد</p>
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
        ) : (
          <>
            {(data?.unlinked.length ?? 0) === 0 ? (
              <Card className="border-emerald-200 bg-emerald-50">
                <CardContent className="flex flex-col items-center justify-center py-14 gap-3">
                  <CheckCircle2 className="w-12 h-12 text-emerald-400" />
                  <p className="text-base font-semibold text-emerald-700">جميع الموظفات مرتبطات بحلقاتهن ✓</p>
                  <p className="text-sm text-emerald-600">لا توجد معلمة أو مشرفة بدون حلقة</p>
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
                    placeholder="بحث بالاسم أو البريد..."
                    className="w-full h-10 rounded-xl border border-input bg-white px-4 pe-10 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 text-right"
                  />
                </div>

                <p className="text-xs text-muted-foreground">
                  {filtered.length} موظفة غير مرتبطة
                </p>

                <div className="space-y-3">
                  {filtered.map(user => (
                    <Card key={user.id} className="border border-border shadow-sm hover:shadow-md transition-shadow">
                      <CardContent className="p-4 space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-semibold text-sm">{user.name}</p>
                              <span className={`text-[10px] font-semibold rounded-full px-2 py-0.5 ${roleBadgeClass(user.role)}`}>
                                {roleLabel(user.role)}
                              </span>
                              {user.track && (
                                <span className="text-[10px] bg-slate-100 text-slate-600 rounded-full px-2 py-0.5 border border-slate-200">
                                  {user.track}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5 truncate" dir="ltr">{user.email}</p>
                          </div>
                        </div>

                        <div className="flex gap-2 items-center">
                          <select
                            value={assignMap[user.id] ?? ""}
                            onChange={e => setAssignMap(m => ({ ...m, [user.id]: e.target.value ? parseInt(e.target.value) : null }))}
                            className="flex-1 h-9 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                          >
                            <option value="">-- اختاري الحلقة --</option>
                            {(data?.circles ?? [])
                              .filter(c => user.role === "teacher" ? !c.teacherId : !c.supervisorId)
                              .map(c => (
                                <option key={c.id} value={c.id}>
                                  {c.name}{c.track ? ` — ${c.track}` : ""}
                                </option>
                              ))
                            }
                          </select>
                          <Button
                            size="sm"
                            onClick={() => handleLink(user)}
                            disabled={saving[user.id] || !assignMap[user.id]}
                            className="shrink-0 gap-1.5 bg-teal-600 hover:bg-teal-700 text-white"
                          >
                            {saving[user.id] ? (
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Link2 className="w-3.5 h-3.5" />
                            )}
                            ربط
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}

                  {filtered.length === 0 && search && (
                    <p className="text-center text-sm text-muted-foreground py-8">لا نتائج للبحث</p>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
