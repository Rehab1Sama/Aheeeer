import { useState, useEffect, useCallback } from "react";
import { useGetCurrentUser } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Users, UserX, Loader2, RefreshCw, CheckCircle2, AlertTriangle, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type StaffingCircle = {
  id: number;
  name: string;
  track: string | null;
  meetingTime: string | null;
  teacherId: number | null;
  teacherName: string | null;
  supervisorId: number | null;
  supervisorName: string | null;
  missingTeacher: boolean;
  missingSupervisor: boolean;
};

type FreeUser = { id: number; name: string; track: string | null };

type StaffingData = {
  circles: StaffingCircle[];
  freeTeachers: FreeUser[];
  freeSupervisors: FreeUser[];
};

function getToken() {
  return localStorage.getItem("sana_auth_token");
}

function CircleRow({
  circle,
  type,
  volunteers,
  onAssign,
  assigning,
}: {
  circle: StaffingCircle;
  type: "teacher" | "supervisor";
  volunteers: FreeUser[];
  onAssign: (circleId: number, type: "teacher" | "supervisor", userId: number) => void;
  assigning: number | null;
}) {
  return (
    <div className="px-4 py-3 flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-sm">{circle.name}</span>
          {circle.track && (
            <Badge className="text-[10px] px-1.5 bg-muted text-muted-foreground border-0">{circle.track}</Badge>
          )}
          {circle.meetingTime && (
            <span className="flex items-center gap-1 text-xs text-teal-600">
              <Clock className="w-3 h-3" />
              {circle.meetingTime}
            </span>
          )}
        </div>
        {type === "teacher" && circle.missingSupervisor && (
          <p className="text-[11px] text-amber-600 mt-0.5">⚠ أيضاً بدون مشرفة</p>
        )}
        {type === "supervisor" && circle.missingTeacher && (
          <p className="text-[11px] text-rose-600 mt-0.5">⚠ أيضاً بدون معلمة</p>
        )}
      </div>
      <div className="shrink-0 flex items-center gap-2">
        {volunteers.length === 0 ? (
          <span className="text-xs text-muted-foreground">لا توجد متطوعات متاحات</span>
        ) : (
          <select
            className="text-sm border border-input rounded-lg px-2 py-1.5 bg-background text-right min-w-[180px] focus:outline-none focus:ring-2 focus:ring-primary/20"
            onChange={e => {
              const uid = parseInt(e.target.value);
              if (uid) onAssign(circle.id, type, uid);
              e.target.value = "";
            }}
            disabled={assigning === circle.id}
          >
            <option value="">تعيين {type === "teacher" ? "معلمة" : "مشرفة"}...</option>
            {volunteers.map(v => (
              <option key={v.id} value={v.id}>
                {v.name}{v.track ? ` — ${v.track}` : ""}
              </option>
            ))}
          </select>
        )}
        {assigning === circle.id && <Loader2 className="w-3.5 h-3.5 animate-spin text-primary shrink-0" />}
      </div>
    </div>
  );
}

export default function CirclesStaffingPage() {
  const { data: user } = useGetCurrentUser({ query: { queryKey: ["getCurrentUser"] } });
  const [data, setData] = useState<StaffingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState<number | null>(null);
  const { toast } = useToast();

  const fetchData = useCallback(() => {
    setLoading(true);
    const token = getToken();
    fetch(`${BASE}/api/circles/staffing`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(r => r.ok ? r.json() : null)
      .then((d: StaffingData | null) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleAssign = async (circleId: number, type: "teacher" | "supervisor", userId: number) => {
    setAssigning(circleId);
    try {
      const token = getToken();
      const body = type === "teacher" ? { circleId, teacherId: userId } : { circleId, supervisorId: userId };
      const res = await fetch(`${BASE}/api/circles/assign-staff`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
      toast({ title: "✅ تم التعيين بنجاح" });
      fetchData();
    } catch {
      toast({ title: "حدث خطأ أثناء التعيين", variant: "destructive" });
    } finally {
      setAssigning(null);
    }
  };

  if (!["leader", "deputy", "track_supervisor"].includes(user?.role ?? "")) return null;

  const missingTeacher = data?.circles.filter(c => c.missingTeacher) ?? [];
  const missingSupervisor = data?.circles.filter(c => c.missingSupervisor) ?? [];

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">توزيع المعلمات والمشرفات</h1>
          <p className="text-muted-foreground text-sm mt-1">
            حلقات تنقصها معلمة أو مشرفة مع اقتراح المتطوعات المتاحات
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData} className="gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" />
          تحديث
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-7 h-7 animate-spin text-primary" />
        </div>
      ) : !data ? (
        <p className="text-center py-12 text-muted-foreground text-sm">تعذّر تحميل البيانات</p>
      ) : data.circles.length === 0 ? (
        <Card className="border-0 shadow-sm">
          <CardContent className="py-16 text-center">
            <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
            <p className="text-base font-semibold text-foreground">جميع الحلقات مكتملة ✨</p>
            <p className="text-xs text-muted-foreground mt-1">كل حلقة لديها معلمة ومشرفة</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <Card className="border-0 shadow-sm bg-emerald-50/60">
              <CardContent className="p-4">
                <p className="text-xs font-semibold text-muted-foreground mb-1">معلمات غير مرتبطات</p>
                <p className="text-2xl font-bold text-emerald-600">{data.freeTeachers.length}</p>
                <p className="text-xs text-muted-foreground mt-1">متاحات للتوزيع</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm bg-amber-50/60">
              <CardContent className="p-4">
                <p className="text-xs font-semibold text-muted-foreground mb-1">مشرفات غير مرتبطات</p>
                <p className="text-2xl font-bold text-amber-600">{data.freeSupervisors.length}</p>
                <p className="text-xs text-muted-foreground mt-1">متاحات للتوزيع</p>
              </CardContent>
            </Card>
          </div>

          {missingTeacher.length > 0 && (
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <UserX className="w-4 h-4 text-rose-500" />
                  حلقات بدون معلمة
                  <Badge className="bg-rose-100 text-rose-700 border-0 text-xs">{missingTeacher.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-border/50">
                  {missingTeacher.map(circle => (
                    <CircleRow
                      key={circle.id}
                      circle={circle}
                      type="teacher"
                      volunteers={data.freeTeachers}
                      onAssign={handleAssign}
                      assigning={assigning}
                    />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {missingSupervisor.length > 0 && (
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                  حلقات بدون مشرفة
                  <Badge className="bg-amber-100 text-amber-700 border-0 text-xs">{missingSupervisor.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-border/50">
                  {missingSupervisor.map(circle => (
                    <CircleRow
                      key={circle.id}
                      circle={circle}
                      type="supervisor"
                      volunteers={data.freeSupervisors}
                      onAssign={handleAssign}
                      assigning={assigning}
                    />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
