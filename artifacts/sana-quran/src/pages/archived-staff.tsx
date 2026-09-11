import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Archive, RefreshCw, Search, UserCheck } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const getToken = () => localStorage.getItem("sana_auth_token");

const ROLE_LABELS: Record<string, string> = {
  teacher: "معلمة",
  supervisor: "مشرفة",
  track_supervisor: "مسؤولة مسار",
  data_entry: "مدخلة بيانات",
  deputy: "نائبة",
};
const ROLE_COLORS: Record<string, string> = {
  teacher: "bg-blue-100 text-blue-700",
  supervisor: "bg-green-100 text-green-700",
  track_supervisor: "bg-purple-100 text-purple-700",
  data_entry: "bg-amber-100 text-amber-700",
  deputy: "bg-teal-100 text-teal-700",
};

interface ArchivedUser {
  id: number;
  name: string;
  email: string;
  role: string;
  track: string | null;
  circleId: number | null;
  createdAt: string;
}

export default function ArchivedStaffPage() {
  const [users, setUsers] = useState<ArchivedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` };

  async function fetchArchived() {
    setLoading(true);
    try {
      const res = await fetch(`${BASE}/api/users/archived-staff`, { headers });
      if (!res.ok) throw new Error();
      setUsers(await res.json());
    } catch {
      toast({ title: "خطأ في تحميل البيانات", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchArchived(); }, []);

  async function handleRestore(userId: number, userName: string) {
    if (!confirm(`هل تريدين استعادة حساب "${userName}"؟`)) return;
    setRestoring(userId);
    try {
      const res = await fetch(`${BASE}/api/users/${userId}/restore`, { method: "POST", headers });
      if (!res.ok) throw new Error();
      toast({ title: `تم استعادة حساب ${userName} ✓` });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["users"] }),
        queryClient.invalidateQueries({ queryKey: ["circles"] }),
        queryClient.invalidateQueries({ queryKey: ["circles-all"] }),
      ]);
      await fetchArchived();
    } catch {
      toast({ title: "حدث خطأ", variant: "destructive" });
    } finally {
      setRestoring(null); }
  }

  const filtered = users.filter(u =>
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase()) ||
    (u.track ?? "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4" dir="rtl">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Archive className="w-6 h-6 text-primary" />
          <div>
            <h1 className="text-xl font-bold">الموظفات المؤرشفات</h1>
            <p className="text-xs text-muted-foreground mt-0.5">الحسابات التي تم أرشفتها — يمكن استعادتها في أي وقت</p>
          </div>
        </div>
        <Button size="icon" variant="outline" onClick={fetchArchived} disabled={loading} title="تحديث القائمة">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          className="pr-9 text-sm"
          placeholder="بحث بالاسم أو البريد أو المسار..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Archive className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>{users.length === 0 ? "لا توجد حسابات مؤرشفة" : "لا نتائج لهذا البحث"}</p>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">{filtered.length} حساب مؤرشف</p>
          {filtered.map(u => (
            <div key={u.id} className="flex items-center gap-3 rounded-xl border bg-card p-3 shadow-sm">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-sm">{u.name}</p>
                  <Badge className={`text-xs px-2 py-0 h-5 ${ROLE_COLORS[u.role] ?? "bg-gray-100 text-gray-700"}`}>
                    {ROLE_LABELS[u.role] ?? u.role}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{u.email}</p>
                {u.track && <p className="text-xs text-muted-foreground">مسار: {u.track}</p>}
              </div>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 text-xs shrink-0"
                onClick={() => handleRestore(u.id, u.name)}
                disabled={restoring === u.id}
              >
                {restoring === u.id
                  ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  : <UserCheck className="w-3.5 h-3.5" />}
                استعادة
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
