import { useState, useEffect, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, XCircle, Clock, User, Phone, Globe, BookOpen, RefreshCw } from "lucide-react";

const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, "");
const getToken = () => localStorage.getItem("sana_auth_token");

async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

const ROLE_LABELS: Record<string, string> = {
  student: "طالبة",
  teacher: "معلمة",
  supervisor: "مشرفة",
  track_supervisor: "مسؤولة مسار",
  deputy: "نائبة",
  data_entry: "مدخلة بيانات",
  volunteer: "متطوعة",
  exam_supervisor: "مسؤولة اختبار",
};

interface PendingUser {
  id: number;
  name: string;
  email: string;
  role: string;
  roleLabel: string;
  phone: string | null;
  country: string | null;
  ageRange: string | null;
  educationLevel: string | null;
  track: string | null;
  circleName: string | null;
  circleTrack: string | null;
  createdAt: string;
}

function RoleChip({ role }: { role: string }) {
  const isStudent = role === "student";
  return (
    <Badge variant="outline" className={isStudent ? "border-emerald-400 text-emerald-700 bg-emerald-50" : "border-sky-400 text-sky-700 bg-sky-50"}>
      {ROLE_LABELS[role] ?? role}
    </Badge>
  );
}

function RegistrationCard({
  user,
  onApprove,
  onReject,
  loading,
}: {
  user: PendingUser;
  onApprove: (id: number) => void;
  onReject: (id: number) => void;
  loading: boolean;
}) {
  const track = user.circleTrack ?? user.track;

  return (
    <Card className="border border-border shadow-sm hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
              <User className="w-5 h-5 text-muted-foreground" />
            </div>
            <div>
              <p className="font-bold text-base">{user.name}</p>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <RoleChip role={user.role} />
                {track && (
                  <Badge variant="secondary" className="text-xs">مسار: {track}</Badge>
                )}
                {user.circleName && (
                  <Badge variant="secondary" className="text-xs">حلقة: {user.circleName}</Badge>
                )}
              </div>
            </div>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <Button
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1 text-xs"
              onClick={() => onApprove(user.id)}
              disabled={loading}
            >
              <CheckCircle className="w-3.5 h-3.5" />
              قبول
            </Button>
            <Button
              size="sm"
              variant="destructive"
              className="gap-1 text-xs"
              onClick={() => onReject(user.id)}
              disabled={loading}
            >
              <XCircle className="w-3.5 h-3.5" />
              رفض
            </Button>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
          {user.phone && (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Phone className="w-3.5 h-3.5 flex-shrink-0" />
              <span dir="ltr">{user.phone}</span>
            </div>
          )}
          {user.country && (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Globe className="w-3.5 h-3.5 flex-shrink-0" />
              <span>{user.country}</span>
            </div>
          )}
          {user.ageRange && (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <User className="w-3.5 h-3.5 flex-shrink-0" />
              <span>{user.ageRange}</span>
            </div>
          )}
          {user.educationLevel && (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <BookOpen className="w-3.5 h-3.5 flex-shrink-0" />
              <span>{user.educationLevel}</span>
            </div>
          )}
        </div>

        <p className="text-xs text-muted-foreground mt-2">
          تقدمت بالطلب: {new Date(user.createdAt).toLocaleDateString("ar-SA", { year: "numeric", month: "long", day: "numeric" })}
        </p>
      </CardContent>
    </Card>
  );
}

export default function PendingRegistrationsPage() {
  const [pending, setPending] = useState<PendingUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const { toast } = useToast();

  const fetchPending = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch("/api/registration/pending");
      setPending(data);
    } catch {
      toast({ title: "خطأ في تحميل الطلبات", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { void fetchPending(); }, [fetchPending]);

  const handleApprove = async (id: number) => {
    setActionLoading(true);
    try {
      await apiFetch(`/api/registration/${id}/approve`, { method: "POST" });
      toast({ title: "تم قبول الطلب بنجاح ✓" });
      setPending(prev => prev.filter(u => u.id !== id));
    } catch {
      toast({ title: "خطأ في القبول", variant: "destructive" });
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async (id: number) => {
    setActionLoading(true);
    try {
      await apiFetch(`/api/registration/${id}/reject`, { method: "POST" });
      toast({ title: "تم رفض الطلب" });
      setPending(prev => prev.filter(u => u.id !== id));
    } catch {
      toast({ title: "خطأ في الرفض", variant: "destructive" });
    } finally {
      setActionLoading(false);
    }
  };

  const students = pending.filter(u => u.role === "student");
  const staff = pending.filter(u => u.role !== "student");

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">طلبات التسجيل</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {loading ? "جاري التحميل..." : `${pending.length} طلب بانتظار المراجعة`}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchPending} disabled={loading} className="gap-1.5">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          تحديث
        </Button>
      </div>

      {!loading && pending.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mb-4">
            <CheckCircle className="w-8 h-8 text-emerald-600" />
          </div>
          <p className="text-lg font-semibold text-foreground">لا توجد طلبات معلقة</p>
          <p className="text-muted-foreground text-sm mt-1">جميع طلبات التسجيل قد تمت مراجعتها</p>
        </div>
      )}

      {students.length > 0 && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-500" />
              طلبات الطالبات ({students.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {students.map(u => (
              <RegistrationCard
                key={u.id}
                user={u}
                onApprove={handleApprove}
                onReject={handleReject}
                loading={actionLoading}
              />
            ))}
          </CardContent>
        </Card>
      )}

      {staff.length > 0 && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <Clock className="w-4 h-4 text-sky-500" />
              طلبات الكادر والمتطوعات ({staff.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {staff.map(u => (
              <RegistrationCard
                key={u.id}
                user={u}
                onApprove={handleApprove}
                onReject={handleReject}
                loading={actionLoading}
              />
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
