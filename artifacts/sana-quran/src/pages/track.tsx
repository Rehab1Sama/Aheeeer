import { useState, useEffect } from "react";
import { useListCircles, useListCircleNames, useGetCurrentUser, useListStudents, useUpdateStudent, useArchiveStudent, useGetMonthlyAttendanceReport, useCreateUser, useListTracks, useListSupervisorNames } from "@workspace/api-client-react";
import MessagesSection from "@/components/MessagesSection";
import MonthlyLeaderboardCard from "@/components/MonthlyLeaderboardCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BookOpen, Users, ChevronDown, ChevronUp, Archive, ArrowLeftRight, Search, UserCircle, BarChart2, Link2, Clock, UserPlus, Settings2, Check, X, Sun, Moon, MessageCircle, ExternalLink } from "lucide-react";
import { makeWhatsAppLink } from "@/lib/utils";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { getToken } from "@/lib/auth";

type CircleItem = { id: number; name: string; track: string };
type Student = { id: number; fullName: string; circleId?: number | null; phone?: string | null };
type EnrichedCircle = {
  id: number; name: string; track: string;
  meetingTime: string | null; whatsappLink: string | null;
  teacherName: string | null; supervisorName: string | null;
  students: { id: number; fullName: string; email: string | null }[];
};

function ClockFace({ time }: { time: string }) {
  const [h, m] = time ? time.split(":").map(Number) : [0, 0];
  const hourAngle = ((h % 12) / 12) * 360 + (m / 60) * 30;
  const minuteAngle = (m / 60) * 360;
  const toXY = (angle: number, r: number) => ({
    x: 20 + r * Math.sin((angle * Math.PI) / 180),
    y: 20 - r * Math.cos((angle * Math.PI) / 180),
  });
  const hEnd = toXY(hourAngle, 9);
  const mEnd = toXY(minuteAngle, 13);
  return (
    <svg viewBox="0 0 40 40" className="w-14 h-14 flex-shrink-0">
      <circle cx="20" cy="20" r="19" fill="white" stroke="#e2e8f0" strokeWidth="1.5" />
      {([12,3,6,9] as number[]).map((n: number, i: number) => {
        const p = toXY(i * 90, 16);
        return <text key={n} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="central" fontSize="4" fill="#94a3b8">{n}</text>;
      })}
      <line x1="20" y1="20" x2={hEnd.x} y2={hEnd.y} stroke="#1e293b" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="20" y1="20" x2={mEnd.x} y2={mEnd.y} stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="20" cy="20" r="1.5" fill="#1e293b" />
    </svg>
  );
}

function TransferModal({
  student,
  allCircles,
  currentCircleId,
  onClose,
  onTransfer,
  isLoading,
}: {
  student: Student;
  allCircles: CircleItem[];
  currentCircleId: number;
  onClose: () => void;
  onTransfer: (circleId: number) => void;
  isLoading: boolean;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const otherCircles = allCircles.filter(c => c.id !== currentCircleId);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm" dir="rtl">
        <div className="p-5 border-b border-border">
          <h3 className="font-bold text-base">نقل الطالبة</h3>
          <p className="text-sm text-muted-foreground mt-1">{student.fullName}</p>
        </div>
        <div className="p-4 max-h-64 overflow-y-auto space-y-2">
          {otherCircles.map(c => (
            <button
              key={c.id}
              onClick={() => setSelected(c.id)}
              className={`w-full text-right px-4 py-3 rounded-xl border-2 transition-all ${
                selected === c.id
                  ? "border-primary bg-primary/5 font-semibold"
                  : "border-border hover:border-primary/50"
              }`}
              data-testid={`circle-option-${c.id}`}
            >
              <span className="text-sm">{c.name}</span>
              <span className="text-xs text-muted-foreground mr-2">({c.track})</span>
            </button>
          ))}
          {otherCircles.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-4">لا توجد حلقات أخرى</p>
          )}
        </div>
        <div className="p-4 flex gap-2 border-t border-border">
          <Button
            onClick={() => selected && onTransfer(selected)}
            disabled={!selected || isLoading}
            className="flex-1"
            size="sm"
          >
            {isLoading ? "جاري النقل..." : "نقل"}
          </Button>
          <Button variant="outline" onClick={onClose} size="sm" className="flex-1">
            إلغاء
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function TrackPage() {
  const { data: user } = useGetCurrentUser({ query: { queryKey: ["getCurrentUser"] } });
  const { data: circles } = useListCircles(undefined, { query: { queryKey: ["circles"] } });
  const { data: circleNames } = useListCircleNames({ query: { queryKey: ["circleNames"] } });
  const { data: allStudents } = useListStudents(undefined, { query: { queryKey: ["allStudents"] } });
  const { data: allTracks } = useListTracks({ query: { queryKey: ["tracks"] } });
  const updateStudent = useUpdateStudent();
  const archiveStudent = useArchiveStudent();
  const createUser = useCreateUser();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const [expandedCircle, setExpandedCircle] = useState<number | null>(null);
  const [transferStudent, setTransferStudent] = useState<{ student: Student; circleId: number } | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [archiveRequest, setArchiveRequest] = useState<{ student: Student; circleId: number } | null>(null);
  const [withdrawalPeriod, setWithdrawalPeriod] = useState("");
  const [withdrawalReason, setWithdrawalReason] = useState("");
  const [withdrawalNotes, setWithdrawalNotes] = useState("");

  // نافذة إضافة حساب طالبة (مسؤولة المسار فقط)
  const [addStudentOpen, setAddStudentOpen] = useState(false);
  const [studentForm, setStudentForm] = useState({ name: "", email: "", password: "", circleId: "" });

  // نافذة إضافة دور
  const [addRoleOpen, setAddRoleOpen] = useState(false);
  const [roleLookupEmail, setRoleLookupEmail] = useState("");
  const [roleLookupLoading, setRoleLookupLoading] = useState(false);
  const [roleFoundUser, setRoleFoundUser] = useState<{ id: number; name: string; email: string } | null>(null);
  const [roleNotFound, setRoleNotFound] = useState(false);
  const [roleLookupStep, setRoleLookupStep] = useState<"email" | "details">("email");
  const [roleForm, setRoleForm] = useState({ name: "", email: "", password: "", role: "student" as "student" | "teacher" | "supervisor", track: "", circleId: "" });
  const [roleDialogTab, setRoleDialogTab] = useState<"role" | "transfer">("role");
  const [transferTargetCircleId, setTransferTargetCircleId] = useState("");
  const [transferStudentId, setTransferStudentId] = useState<number | null>(null);
  const [transferring, setTransferring] = useState(false);

  // الحلقات المفصّلة
  const [enrichedCircles, setEnrichedCircles] = useState<EnrichedCircle[]>([]);
  const [editingCircle, setEditingCircle] = useState<number | null>(null);
  const [circleEditData, setCircleEditData] = useState({ name: "", meetingTime: "", period: "am" as "am" | "pm", whatsappLink: "" });
  const [circleSaving, setCircleSaving] = useState(false);

  const myTrack = user?.track;
  const trackCircles = circles?.filter(c => c.track === myTrack) ?? [];
  const stripPrefixForTrackId = (s: string) => s.replace(/^مسار\s+/, "").trim();
  const myTrackId = allTracks?.find(t => stripPrefixForTrackId(t.name) === stripPrefixForTrackId(myTrack ?? ""))?.id ?? null;

  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const { data: trackReport } = useGetMonthlyAttendanceReport(
    { month: currentMonth },
    { query: { queryKey: ["trackReport", currentMonth] } }
  );

  const getCircleStudents = (circleId: number): Student[] =>
    (allStudents ?? [])
      .filter(s => s.circleId === circleId)
      .sort((a, b) => a.fullName.localeCompare(b.fullName, "ar", { sensitivity: "base" }));

  const handleArchive = (student: Student, circleId: number) => {
    setArchiveRequest({ student, circleId });
    setWithdrawalPeriod("");
    setWithdrawalReason("");
    setWithdrawalNotes("");
  };

  const confirmArchive = () => {
    if (!archiveRequest || !withdrawalPeriod || !withdrawalReason.trim()) {
      toast({ title: "اختاري فترة الانسحاب واكتبي السبب", variant: "destructive" }); return;
    }
    archiveStudent.mutate(
      { id: archiveRequest.student.id, data: { circleId: archiveRequest.circleId, withdrawalPeriod, withdrawalReason, withdrawalNotes } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["allStudents"] });
          toast({ title: "تمت الأرشفة", description: `تم إخراج ${archiveRequest.student.fullName} من الحلقة` });
          setArchiveRequest(null);
          navigate("/archived-students");
        },
        onError: (error: any) => toast({
          title: "فشلت عملية الأرشفة",
          description: error?.response?.data?.error ?? error?.message ?? "تحققي من بيانات الطالبة والحلقة",
          variant: "destructive",
        }),
      }
    );
  };

  const handleTransfer = (circleId: number) => {
    if (!transferStudent) return;
    updateStudent.mutate(
        { id: transferStudent.student.id, data: { circleId, fromCircleId: transferStudent.circleId } as any },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["allStudents"] });
          setTransferStudent(null);
          toast({ title: "تم النقل", description: `تم نقل ${transferStudent.student.fullName} بنجاح` });
        },
        onError: (e: any) => {
          toast({ title: "تعذّر النقل", description: e?.message ?? "فشلت عملية النقل", variant: "destructive" });
        },
      }
    );
  };

  const handleTransferInDialog = async () => {
    if (!transferStudentId || !transferTargetCircleId) return;
    setTransferring(true);
    try {
      const token = localStorage.getItem("sana_auth_token");
      const res = await fetch(`/api/students/${transferStudentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          circleId: parseInt(transferTargetCircleId),
          fromCircleId: roleForm.circleId ? parseInt(roleForm.circleId) : undefined,
        }),
      });
      if (!res.ok) throw new Error();
      toast({ title: "تم النقل بنجاح" });
      queryClient.invalidateQueries({ queryKey: ["allStudents"] });
      await fetchEnrichedCircles();
      setAddRoleOpen(false);
    } catch {
      toast({ title: "خطأ في النقل", variant: "destructive" });
    } finally {
      setTransferring(false);
    }
  };

  const fetchEnrichedCircles = async () => {
    const token = localStorage.getItem("sana_auth_token");
    if (!token) return;
    try {
      const res = await fetch("/api/circles/enriched", { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setEnrichedCircles(await res.json());
    } catch {}
  };

  useEffect(() => { fetchEnrichedCircles(); }, []);

  const handleLookupEmail = async () => {
    if (!roleLookupEmail.trim()) return;
    setRoleLookupLoading(true);
    setRoleFoundUser(null);
    setRoleNotFound(false);
    try {
      const token = localStorage.getItem("sana_auth_token");
      const res = await fetch(`/api/users/by-email?email=${encodeURIComponent(roleLookupEmail.trim())}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const u = await res.json();
        setRoleFoundUser(u);
        setRoleForm(f => ({ ...f, name: u.name, email: u.email, password: "__reuse__", track: myTrack ?? "", circleId: "" }));
      } else {
        setRoleNotFound(true);
        setRoleForm(f => ({ ...f, name: "", email: roleLookupEmail.trim(), password: "", track: myTrack ?? "", circleId: "" }));
      }
      setRoleLookupStep("details");
    } catch {
      toast({ title: "خطأ في البحث", variant: "destructive" });
    } finally {
      setRoleLookupLoading(false);
    }
  };

  const handleAddRole = () => {
    const isExisting = !!roleFoundUser;
    if (!roleForm.name || !roleForm.email || !roleForm.circleId || !roleForm.track) return;
    if (!isExisting && !roleForm.password) return;
    const selectedCircle = (circles ?? []).find(c => c.id === parseInt(roleForm.circleId));
    createUser.mutate(
      {
        data: {
          name: roleForm.name,
          email: roleForm.email,
          password: isExisting ? "placeholder_reused" : roleForm.password,
          role: roleForm.role,
          track: roleForm.track,
          circleId: parseInt(roleForm.circleId),
        } as any,
      },
      {
        onSuccess: () => {
          toast({ title: "تم إضافة الدور", description: `${roleForm.name} في ${selectedCircle?.name ?? ""}` });
          queryClient.invalidateQueries({ queryKey: ["allStudents"] });
          setAddRoleOpen(false);
          setRoleLookupStep("email");
          setRoleLookupEmail("");
          setRoleFoundUser(null);
          setRoleNotFound(false);
          setRoleForm({ name: "", email: "", password: "", role: "student", track: "", circleId: "" });
        },
        onError: () => toast({ title: "خطأ في إضافة الدور", variant: "destructive" }),
      }
    );
  };

  const handleSaveCircle = async (circleId: number) => {
    setCircleSaving(true);
    try {
      const token = localStorage.getItem("sana_auth_token");
      let time = circleEditData.meetingTime;
      if (time) {
        const [h] = time.split(":").map(Number);
        if (circleEditData.period === "pm" && h < 12) time = `${h + 12}:${time.split(":")[1]}`;
        if (circleEditData.period === "am" && h === 12) time = `00:${time.split(":")[1]}`;
      }
      const res = await fetch(`/api/circles/${circleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: circleEditData.name.trim(), meetingTime: time || null, whatsappLink: circleEditData.whatsappLink || null }),
      });
      if (!res.ok) throw new Error();
      toast({ title: "تم حفظ إعدادات الحلقة" });
      await fetchEnrichedCircles();
      queryClient.invalidateQueries({ queryKey: ["circles"] });
      setEditingCircle(null);
    } catch {
      toast({ title: "خطأ في الحفظ", variant: "destructive" });
    } finally {
      setCircleSaving(false);
    }
  };

  const startEditCircle = (c: EnrichedCircle) => {
    setEditingCircle(c.id);
    const mt = c.meetingTime ?? "";
    const h = mt ? parseInt(mt.split(":")[0]) : 0;
    setCircleEditData({
      name: c.name,
      meetingTime: mt ? `${String(h > 12 ? h - 12 : h === 0 ? 12 : h).padStart(2,"0")}:${mt.split(":")[1]}` : "",
      period: mt ? (h >= 12 ? "pm" : "am") : "am",
      whatsappLink: c.whatsappLink ?? "",
    });
  };

  const handleAddStudent = () => {
    if (!studentForm.name || !studentForm.email || !studentForm.password || !studentForm.circleId) return;
    const selectedCircle = trackCircles.find(c => c.id === parseInt(studentForm.circleId));
    createUser.mutate(
      {
        data: {
          name: studentForm.name,
          email: studentForm.email,
          password: studentForm.password,
          role: "student",
          track: myTrack ?? undefined,
          circleId: parseInt(studentForm.circleId),
        } as any,
      },
      {
        onSuccess: () => {
          toast({ title: "تم إضافة الطالبة", description: `${studentForm.name} في ${selectedCircle?.name ?? ""}` });
          queryClient.invalidateQueries({ queryKey: ["allStudents"] });
          setAddStudentOpen(false);
          setStudentForm({ name: "", email: "", password: "", circleId: "" });
        },
        onError: () => toast({ title: "خطأ في إضافة الطالبة", variant: "destructive" }),
      }
    );
  };

  const searchResults = searchTerm.trim()
    ? (allStudents ?? []).filter(s =>
        trackCircles.some(c => c.id === s.circleId) &&
        s.fullName.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : [];

  return (
    <div className="space-y-6" dir="rtl">
      <SupervisorHoursTracker trackId={myTrackId} />
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">مساري · {myTrack}</h1>
          <p className="text-muted-foreground text-sm mt-1">{user?.name}</p>
        </div>
        <Button
          size="sm"
          className="gap-1.5 text-xs"
          onClick={() => { setStudentForm({ name: "", email: "", password: "", circleId: "" }); setAddStudentOpen(true); }}
        >
          <UserPlus className="w-4 h-4" />
          إضافة طالبة
        </Button>
      </div>

      {/* Messages from leader */}
      <MonthlyLeaderboardCard userRole={(user as any)?.role} />

      <MessagesSection />

      {/* Track Statistics */}
      {trackReport && trackReport.length > 0 && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <BarChart2 className="w-4 h-4 text-primary" />
              إحصائيات المسار — الشهر الحالي
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-0">
            {/* Summary row */}
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-teal-50 rounded-xl p-3 text-center">
                <p className="text-xl font-bold text-teal-700">
                  {trackReport.reduce((s, c) => s + c.totalStudents, 0)}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">طالبة</p>
              </div>
              <div className="bg-rose-50 rounded-xl p-3 text-center">
                <p className="text-xl font-bold text-rose-600">
                  {trackReport.reduce((s, c) => s + c.totalAbsences, 0)}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">إجمالي الغياب</p>
              </div>
              <div className="bg-emerald-50 rounded-xl p-3 text-center">
                {(() => {
                  const total = trackReport.reduce((s, c) => s + c.totalSessions, 0);
                  const absent = trackReport.reduce((s, c) => s + c.totalAbsences, 0);
                  const rate = total > 0 ? Math.round(((total - absent) / total) * 100) : null;
                  return (
                    <>
                      <p className={`text-xl font-bold ${rate == null ? "text-muted-foreground" : rate >= 80 ? "text-emerald-600" : rate >= 60 ? "text-amber-600" : "text-rose-600"}`}>
                        {rate != null ? `${rate}%` : "—"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">معدل الحضور</p>
                    </>
                  );
                })()}
              </div>
            </div>

            {/* Bar chart comparing circles */}
            {trackReport.filter(c => c.attendanceRate != null).length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground font-medium mb-2">مقارنة الحلقات</p>
                <ResponsiveContainer width="100%" height={Math.max(100, trackReport.length * 30)}>
                  <BarChart
                    data={trackReport
                      .filter(c => c.attendanceRate != null)
                      .sort((a, b) => (b.attendanceRate ?? 0) - (a.attendanceRate ?? 0))
                      .map(c => ({ name: c.circleName, rate: c.attendanceRate, students: c.totalStudents }))}
                    layout="vertical"
                    margin={{ top: 0, right: 40, bottom: 0, left: 4 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 10 }} />
                    <YAxis type="category" dataKey="name" width={70} tick={{ fontSize: 10 }} />
                    <Tooltip
                      formatter={(v: number) => [`${v}%`, "الحضور"]}
                      contentStyle={{ direction: "rtl", fontFamily: "Arial", fontSize: 12 }}
                    />
                    <Bar dataKey="rate" radius={[0, 4, 4, 0]} maxBarSize={18}>
                      {trackReport
                        .filter(c => c.attendanceRate != null)
                        .sort((a, b) => (b.attendanceRate ?? 0) - (a.attendanceRate ?? 0))
                        .map((c, i) => (
                          <Cell
                            key={i}
                            fill={(c.attendanceRate ?? 0) >= 80 ? "#10b981" : (c.attendanceRate ?? 0) >= 60 ? "#f59e0b" : "#ef4444"}
                          />
                        ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          className="pr-9"
          placeholder="بحث عن طالبة بالاسم..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          data-testid="input-student-search"
        />
      </div>

      {searchTerm.trim() && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-bold">نتائج البحث ({searchResults.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {searchResults.length === 0 ? (
              <p className="text-center py-6 text-muted-foreground text-sm">لا توجد نتائج</p>
            ) : (
              <div className="divide-y divide-border/50">
                {searchResults.map(student => {
                  const circle = trackCircles.find(c => c.id === student.circleId);
                  return (
                    <div key={student.id} className="flex items-center justify-between px-4 py-3">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <p className="font-semibold text-sm">{student.fullName}</p>
                          {student.phone && (
                            <a
                              href={makeWhatsAppLink(student.phone)}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={e => e.stopPropagation()}
                              className="text-emerald-500 hover:text-emerald-700 transition-colors"
                              title="واتساب"
                            >
                              <MessageCircle className="w-3.5 h-3.5" />
                            </a>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">{circle?.name ?? "—"}</p>
                      </div>
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => navigate(`/students/${student.id}`)}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-teal-50 text-teal-600 hover:bg-teal-100 transition-colors text-xs font-semibold"
                        >
                          <UserCircle className="w-3 h-3" />
                          ملف
                        </button>
                        <button
                          onClick={() => student.circleId && setTransferStudent({ student, circleId: student.circleId })}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors text-xs font-semibold"
                        >
                          <ArrowLeftRight className="w-3 h-3" />
                          نقل
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-4">
        <Card className="border-0 shadow-sm" data-testid="card-track-circles">
          <CardContent className="p-4 text-center">
            <p className="text-3xl font-bold text-primary">{trackCircles.length}</p>
            <p className="text-xs text-muted-foreground mt-1 font-medium">الحلقات</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm" data-testid="card-track-students">
          <CardContent className="p-4 text-center">
            <p className="text-3xl font-bold text-teal-600">
              {trackCircles.reduce((s, c) => s + getCircleStudents(c.id).length, 0)}
            </p>
            <p className="text-xs text-muted-foreground mt-1 font-medium">الطالبات</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-0 shadow-sm" data-testid="card-track-circles-list">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-bold flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-primary" />
            حلقات المسار
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {trackCircles.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground text-sm">لا توجد حلقات في هذا المسار</p>
          ) : (
            <div className="divide-y divide-border/50">
              {trackCircles.map(circle => {
                const circleStudents = getCircleStudents(circle.id);
                const enriched = enrichedCircles.find(e => e.id === circle.id);
                const isExpanded = expandedCircle === circle.id;
                const isEditingThis = editingCircle === circle.id;
                const displayStudents = enriched ? enriched.students : circleStudents.map(s => ({ id: s.id, fullName: s.fullName, email: null as string | null }));
                const meetingTime = enriched?.meetingTime ?? (circle as any).meetingTime ?? null;
                const whatsappLink = enriched?.whatsappLink ?? (circle as any).whatsappLink ?? null;
                const h24 = meetingTime ? parseInt(meetingTime.split(":")[0]) : null;
                const isPm = h24 !== null && h24 >= 12;
                const displayTime = meetingTime
                  ? `${((h24! % 12) || 12).toString().padStart(2,"0")}:${meetingTime.split(":")[1]} ${isPm ? "م" : "ص"}`
                  : null;

                return (
                  <div key={circle.id} data-testid={`row-circle-${circle.id}`} className="border-b border-border/30 last:border-0">
                    <div className="flex items-center gap-2 px-4 py-3">
                      <button
                        className="flex-1 text-right"
                        onClick={() => setExpandedCircle(isExpanded ? null : circle.id)}
                      >
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold text-sm">{circle.name}</p>
                            {displayTime && (
                              <span className={`text-xs flex items-center gap-1 px-1.5 py-0.5 rounded-full ${isPm ? "bg-indigo-50 text-indigo-600" : "bg-amber-50 text-amber-600"}`}>
                                {isPm ? <Moon className="w-2.5 h-2.5" /> : <Sun className="w-2.5 h-2.5" />}
                                {displayTime}
                              </span>
                            )}
                            {whatsappLink && (
                              <a
                                href={whatsappLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-green-600 hover:text-green-700 flex items-center gap-1 text-xs bg-green-50 px-1.5 py-0.5 rounded-full"
                                onClick={e => e.stopPropagation()}
                              >
                                <Link2 className="w-2.5 h-2.5" />
                                واتساب
                              </a>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground flex-wrap">
                            {enriched?.teacherName && <span>معلمة: {enriched.teacherName}</span>}
                            {enriched?.supervisorName && <span>مشرفة: {enriched.supervisorName}</span>}
                            <span className="text-primary font-medium">{displayStudents.length} طالبة</span>
                          </div>
                        </div>
                      </button>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={e => { e.stopPropagation(); navigate(`/circle/${circle.id}`); }}
                          className="p-1.5 rounded-lg hover:bg-muted transition-colors text-primary"
                          title="عرض صفحة الحلقة الموحّدة"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={e => { e.stopPropagation(); isEditingThis ? setEditingCircle(null) : startEditCircle(enriched ?? { id: circle.id, name: circle.name, track: circle.track, meetingTime, whatsappLink, teacherName: null, supervisorName: null, students: [] }); }}
                          className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground"
                          title="ضبط وقت الحلقة ورابط الواتس"
                        >
                          {isEditingThis ? <X className="w-3.5 h-3.5" /> : <Settings2 className="w-3.5 h-3.5" />}
                        </button>
                        <button onClick={() => setExpandedCircle(isExpanded ? null : circle.id)} className="p-1.5">
                          {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                        </button>
                      </div>
                    </div>

                    {isEditingThis && (
                      <div className="bg-slate-50 border-t border-border/30 px-4 py-3 space-y-3" dir="rtl">
                        <div className="flex items-center gap-3">
                          {circleEditData.meetingTime && (
                            <ClockFace time={circleEditData.period === "pm"
                              ? (() => { const [hh, mm] = circleEditData.meetingTime.split(":").map(Number); return `${String(hh % 12 === 0 && circleEditData.period === "pm" ? 12 : (hh % 12) + (circleEditData.period === "pm" ? 12 : 0)).padStart(2,"0")}:${String(mm).padStart(2,"0")}`; })()
                              : circleEditData.meetingTime}
                            />
                          )}
                          <div className="flex-1 space-y-2">
                            <div className="space-y-1">
                              <Label className="text-xs text-muted-foreground">اسم الحلقة</Label>
                              <Input
                                value={circleEditData.name}
                                onChange={e => setCircleEditData(d => ({ ...d, name: e.target.value }))}
                                className="h-8 text-xs"
                              />
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={() => setCircleEditData(d => ({ ...d, period: "am" }))}
                                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold border-2 transition-all ${circleEditData.period === "am" ? "border-amber-400 bg-amber-50 text-amber-700" : "border-border text-muted-foreground"}`}
                              >
                                <Sun className="w-3.5 h-3.5" /> صباحي
                              </button>
                              <button
                                onClick={() => setCircleEditData(d => ({ ...d, period: "pm" }))}
                                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold border-2 transition-all ${circleEditData.period === "pm" ? "border-indigo-400 bg-indigo-50 text-indigo-700" : "border-border text-muted-foreground"}`}
                              >
                                <Moon className="w-3.5 h-3.5" /> مسائي
                              </button>
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" /> الوقت</Label>
                              <input
                                type="time"
                                value={circleEditData.meetingTime}
                                onChange={e => setCircleEditData(d => ({ ...d, meetingTime: e.target.value }))}
                                className="h-8 text-sm border border-input rounded-md px-2 w-full bg-white"
                              />
                            </div>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground flex items-center gap-1"><Link2 className="w-3 h-3" /> رابط مجموعة الواتساب</Label>
                          <Input
                            value={circleEditData.whatsappLink}
                            onChange={e => setCircleEditData(d => ({ ...d, whatsappLink: e.target.value }))}
                            placeholder="https://chat.whatsapp.com/..."
                            className="h-8 text-xs"
                          />
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => handleSaveCircle(circle.id)} disabled={circleSaving} className="flex-1 h-8 text-xs">
                            <Check className="w-3 h-3 ml-1" />{circleSaving ? "جاري الحفظ..." : "حفظ"}
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setEditingCircle(null)} className="flex-1 h-8 text-xs">إلغاء</Button>
                        </div>
                      </div>
                    )}

                    {isExpanded && (
                      <div className="bg-muted/20 px-4 pb-3">
                        {displayStudents.length === 0 ? (
                          <p className="text-sm text-muted-foreground py-3 text-center">لا توجد طالبات في هذه الحلقة</p>
                        ) : (
                          <div className="space-y-2 pt-2">
                            {displayStudents.map(student => (
                              <div
                                key={student.id}
                                className="flex items-center justify-between bg-white rounded-xl px-3 py-2.5 shadow-sm"
                                data-testid={`student-row-${student.id}`}
                              >
                                <div className="flex items-center gap-1.5">
                                  <span className="text-sm font-medium">{student.fullName}</span>
                                  {(() => { const s = allStudents?.find(x => x.id === student.id); return s?.phone ? (
                                    <a
                                      href={makeWhatsAppLink(s.phone)}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={e => e.stopPropagation()}
                                      className="text-emerald-500 hover:text-emerald-700 transition-colors"
                                      title="واتساب"
                                    >
                                      <MessageCircle className="w-3.5 h-3.5" />
                                    </a>
                                  ) : null; })()}
                                </div>
                                <div className="flex gap-1.5">
                                  <button
                                    onClick={() => navigate(`/students/${student.id}`)}
                                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-teal-50 text-teal-600 hover:bg-teal-100 transition-colors text-xs font-semibold"
                                    title="ملف الطالبة"
                                  >
                                    <UserCircle className="w-3 h-3" />
                                  </button>
                                  <button
                                    onClick={() => { const s = circleStudents.find(x => x.id === student.id); if (s) setTransferStudent({ student: s, circleId: circle.id }); }}
                                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors text-xs font-semibold"
                                    title="نقل لحلقة أخرى"
                                  >
                                    <ArrowLeftRight className="w-3 h-3" />نقل
                                  </button>
                                  <button
                                    onClick={() => { const s = circleStudents.find(x => x.id === student.id); if (s) handleArchive(s, circle.id); }}
                                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100 transition-colors text-xs font-semibold"
                                  >
                                    <Archive className="w-3 h-3" />إخراج
                                  </button>
                                  <button
                                    onClick={() => {
                                      setRoleDialogTab("role");
                                      setTransferTargetCircleId("");
                                      setTransferStudentId(student.id);
                                      if (student.email) {
                                        setRoleFoundUser({ id: student.id, name: student.fullName, email: student.email });
                                        setRoleLookupEmail(student.email);
                                        setRoleNotFound(false);
                                        setRoleLookupStep("details");
                                        setRoleForm({ name: student.fullName, email: student.email, password: "__reuse__", role: "student", track: myTrack ?? "", circleId: circle.id.toString() });
                                      } else {
                                        setRoleLookupStep("email");
                                        setRoleLookupEmail("");
                                        setRoleFoundUser(null);
                                        setRoleNotFound(false);
                                        setRoleForm({ name: student.fullName, email: "", password: "", role: "student", track: myTrack ?? "", circleId: circle.id.toString() });
                                      }
                                      setAddRoleOpen(true);
                                    }}
                                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors text-xs font-semibold"
                                  >
                                    <UserPlus className="w-3 h-3" />دور
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {transferStudent && circleNames && (
        <TransferModal
          student={transferStudent.student}
          allCircles={circleNames}
          currentCircleId={transferStudent.circleId}
          onClose={() => setTransferStudent(null)}
          onTransfer={handleTransfer}
          isLoading={updateStudent.isPending}
        />
      )}

      {/* نافذة إضافة دور */}
      <Dialog open={addRoleOpen} onOpenChange={open => {
        setAddRoleOpen(open);
        if (!open) {
          setRoleLookupStep("email");
          setRoleLookupEmail("");
          setRoleFoundUser(null);
          setRoleNotFound(false);
          setRoleForm({ name: "", email: "", password: "", role: "student", track: "", circleId: "" });
          setRoleDialogTab("role");
          setTransferTargetCircleId("");
          setTransferStudentId(null);
        }
      }}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>إضافة دور</DialogTitle>
          </DialogHeader>

          {roleLookupStep === "email" ? (
            <div className="space-y-4 py-2">
              <p className="text-sm text-muted-foreground">أدخلي البريد الإلكتروني للشخص المراد إضافة دور له</p>
              <div className="space-y-2">
                <Label>البريد الإلكتروني</Label>
                <Input
                  value={roleLookupEmail}
                  onChange={e => setRoleLookupEmail(e.target.value)}
                  placeholder="email@sana.sa"
                  type="email"
                  dir="ltr"
                  className="text-left"
                  onKeyDown={e => e.key === "Enter" && handleLookupEmail()}
                />
              </div>
              <DialogFooter className="gap-2 pt-2">
                <Button variant="outline" onClick={() => setAddRoleOpen(false)}>إلغاء</Button>
                <Button onClick={handleLookupEmail} disabled={!roleLookupEmail.trim() || roleLookupLoading}>
                  {roleLookupLoading ? "جاري البحث..." : "بحث"}
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4 py-2">
              {/* معلومات الطالبة */}
              {roleFoundUser ? (
                <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
                  <p className="text-xs text-emerald-700 font-semibold">الحساب موجود</p>
                </div>
              ) : (
                <div className="rounded-xl bg-amber-50 border border-amber-200 p-3">
                  <p className="text-xs text-amber-700 font-semibold">حساب جديد</p>
                  <p className="text-xs text-amber-600">سيتم إنشاء حساب جديد بهذا البريد</p>
                </div>
              )}

              {/* الاسم دائمًا قابل للتعديل */}
              <div className="space-y-1">
                <Label className="text-xs">الاسم الكامل</Label>
                <Input value={roleForm.name} onChange={e => setRoleForm(f => ({ ...f, name: e.target.value }))} placeholder="الاسم الكامل" />
              </div>

              {/* الإيميل مقفل دائمًا */}
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">البريد الإلكتروني (غير قابل للتعديل)</Label>
                <div className="bg-muted/40 rounded-md px-3 py-2 border border-input text-sm text-foreground dir-ltr text-left">
                  {roleFoundUser ? roleFoundUser.email : roleLookupEmail}
                </div>
              </div>

              {/* تبويبات: إضافة دور / نقل الحلقة */}
              {transferStudentId && (
                <div className="flex rounded-xl overflow-hidden border border-border text-sm font-semibold">
                  <button
                    onClick={() => setRoleDialogTab("role")}
                    className={`flex-1 py-2 transition-colors ${roleDialogTab === "role" ? "bg-primary text-primary-foreground" : "bg-muted/40 text-muted-foreground hover:bg-muted"}`}
                  >
                    إضافة دور
                  </button>
                  <button
                    onClick={() => setRoleDialogTab("transfer")}
                    className={`flex-1 py-2 transition-colors ${roleDialogTab === "transfer" ? "bg-primary text-primary-foreground" : "bg-muted/40 text-muted-foreground hover:bg-muted"}`}
                  >
                    نقل الحلقة
                  </button>
                </div>
              )}

              {roleDialogTab === "role" ? (
                <>
                  {!roleFoundUser && (
                    <div className="space-y-2">
                      <Label>كلمة المرور</Label>
                      <Input type="password" value={roleForm.password} onChange={e => setRoleForm(f => ({ ...f, password: e.target.value }))} placeholder="••••••••" />
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label>الدور</Label>
                    <Select value={roleForm.role} onValueChange={v => setRoleForm(f => ({ ...f, role: v as any }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="student">طالبة</SelectItem>
                        <SelectItem value="teacher">معلمة</SelectItem>
                        <SelectItem value="supervisor">مشرفة</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>المسار</Label>
                    <Select value={roleForm.track} onValueChange={v => setRoleForm(f => ({ ...f, track: v, circleId: "" }))}>
                      <SelectTrigger><SelectValue placeholder="اختيار المسار" /></SelectTrigger>
                      <SelectContent>
                        {(allTracks ?? []).map(t => (
                          <SelectItem key={t.name} value={t.name}>{t.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {roleForm.track && (
                    <div className="space-y-2">
                      <Label>الحلقة</Label>
                      <Select value={roleForm.circleId} onValueChange={v => setRoleForm(f => ({ ...f, circleId: v }))}>
                        <SelectTrigger><SelectValue placeholder="اختيار الحلقة" /></SelectTrigger>
                        <SelectContent>
                          {(circleNames ?? []).filter(c => c.track === roleForm.track).map(c => (
                            <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <DialogFooter className="gap-2 pt-2">
                    <Button variant="outline" onClick={() => { setRoleLookupStep("email"); setRoleFoundUser(null); setRoleNotFound(false); }}>رجوع</Button>
                    <Button
                      onClick={handleAddRole}
                      disabled={!roleForm.name || !roleForm.track || !roleForm.circleId || (!roleFoundUser && !roleForm.password) || createUser.isPending}
                    >
                      {createUser.isPending ? "جاري الإضافة..." : "إضافة الدور"}
                    </Button>
                  </DialogFooter>
                </>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label>الحلقة المراد النقل إليها</Label>
                    <Select value={transferTargetCircleId} onValueChange={setTransferTargetCircleId}>
                      <SelectTrigger><SelectValue placeholder="اختيار الحلقة" /></SelectTrigger>
                      <SelectContent>
                        {(circleNames ?? [])
                          .filter(c => c.id.toString() !== roleForm.circleId)
                          .map(c => (
                            <SelectItem key={c.id} value={c.id.toString()}>
                              {c.name} <span className="text-muted-foreground text-xs">({c.track})</span>
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="rounded-xl bg-blue-50 border border-blue-100 p-3">
                    <p className="text-xs text-blue-700">ستنتقل الطالبة من حلقتها الحالية إلى الحلقة المختارة، وستُحفظ بياناتها كاملاً.</p>
                  </div>
                  <DialogFooter className="gap-2 pt-2">
                    <Button variant="outline" onClick={() => setRoleDialogTab("role")}>رجوع</Button>
                    <Button
                      onClick={handleTransferInDialog}
                      disabled={!transferTargetCircleId || transferring}
                    >
                      {transferring ? "جاري النقل..." : "نقل الطالبة"}
                    </Button>
                  </DialogFooter>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(archiveRequest)} onOpenChange={open => { if (!open) setArchiveRequest(null); }}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader><DialogTitle>بطاقة انسحاب الطالبة</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">الطالبة: <strong>{archiveRequest?.student.fullName}</strong></p>
            <div className="space-y-2">
              <Label>فترة الانسحاب <span className="text-destructive">*</span></Label>
              <Select value={withdrawalPeriod} onValueChange={setWithdrawalPeriod}>
                <SelectTrigger><SelectValue placeholder="اختاري فترة الانسحاب" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="بداية الفصل">بداية الفصل</SelectItem>
                  <SelectItem value="أسابيع التسميع">أسابيع التسميع</SelectItem>
                  <SelectItem value="أسبوع المراجعات">أسبوع المراجعات</SelectItem>
                  <SelectItem value="أسبوع الاختبارات">أسبوع الاختبارات</SelectItem>
                  <SelectItem value="تم حذفها">تم حذفها</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>سبب الانسحاب <span className="text-destructive">*</span></Label>
              <Input value={withdrawalReason} onChange={e => setWithdrawalReason(e.target.value)} placeholder="اكتبي سبب الانسحاب" />
            </div>
            <div className="space-y-2">
              <Label>ملاحظاتك - إن وُجدت -</Label>
              <Input value={withdrawalNotes} onChange={e => setWithdrawalNotes(e.target.value)} placeholder="ملاحظات إضافية" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setArchiveRequest(null)}>إلغاء</Button>
            <Button onClick={confirmArchive} disabled={archiveStudent.isPending} className="bg-amber-600 hover:bg-amber-700">
              {archiveStudent.isPending ? "جاري الأرشفة..." : "تأكيد الأرشفة"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* نافذة إضافة طالبة — مسؤولة المسار */}
      <Dialog open={addStudentOpen} onOpenChange={setAddStudentOpen}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>إضافة حساب طالبة</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>اسم الطالبة</Label>
              <Input
                value={studentForm.name}
                onChange={e => setStudentForm(f => ({ ...f, name: e.target.value }))}
                placeholder="الاسم الكامل"
              />
            </div>
            <div className="space-y-2">
              <Label>البريد الإلكتروني</Label>
              <Input
                value={studentForm.email}
                onChange={e => setStudentForm(f => ({ ...f, email: e.target.value }))}
                placeholder="email@sana.sa"
                type="email"
                dir="ltr"
                className="text-left"
              />
            </div>
            <div className="space-y-2">
              <Label>كلمة المرور</Label>
              <Input
                type="password"
                value={studentForm.password}
                onChange={e => setStudentForm(f => ({ ...f, password: e.target.value }))}
                placeholder="••••••••"
              />
            </div>
            <div className="space-y-2">
              <Label>الحلقة</Label>
              <Select value={studentForm.circleId} onValueChange={v => setStudentForm(f => ({ ...f, circleId: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="اختيار الحلقة" />
                </SelectTrigger>
                <SelectContent>
                  {trackCircles.map(c => (
                    <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="rounded-xl bg-blue-50 border border-blue-200 p-3">
              <p className="text-xs text-blue-700">الدور: <span className="font-semibold">طالبة</span> · المسار: <span className="font-semibold">{myTrack}</span></p>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setAddStudentOpen(false)}>إلغاء</Button>
            <Button
              onClick={handleAddStudent}
              disabled={!studentForm.name || !studentForm.email || !studentForm.password || !studentForm.circleId || createUser.isPending}
            >
              {createUser.isPending ? "جاري الإضافة..." : "إضافة الطالبة"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const HOURS_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const hoursAuthHeader = (): Record<string, string> => {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" };
};

/**
 * سجل ساعات العمل — مسؤولة المسار فقط. أول فتح من جهاز جديد تُسأل "مين أنتِ؟"
 * (نفس آلية daily-tasks.tsx)، الاختيار يُخزَّن محليًا بالجهاز (localStorage) —
 * فتُعرف تلقائيًا كل مرة بعدها من نفس الجهاز بدون سؤال. بعدها heartbeat كل
 * دقيقتين طول ما الصفحة مفتوحة (نفس فترة heartbeat المستخدمة أصلًا لدور
 * data_entry، عشان التناسق).
 */
function SupervisorHoursTracker({ trackId }: { trackId: number | null }) {
  const [supervisorNameId, setSupervisorNameId] = useState<number | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const { data: names } = useListSupervisorNames(trackId ?? 0, {
    query: { queryKey: ["supervisorNames", trackId], enabled: !!trackId },
  });

  useEffect(() => {
    if (!trackId) return;
    const key = `sana_supervisor_identity_${trackId}`;
    const stored = localStorage.getItem(key);
    if (stored) setSupervisorNameId(parseInt(stored, 10));
    else setShowPicker(true);
  }, [trackId]);

  useEffect(() => {
    if (!supervisorNameId) return;
    const beat = () => {
      fetch(`${HOURS_BASE}/api/track-supervisor/session/heartbeat`, {
        method: "POST",
        headers: hoursAuthHeader(),
        body: JSON.stringify({ supervisorNameId }),
      }).catch(() => {});
    };
    beat();
    const interval = setInterval(beat, 2 * 60 * 1000);
    return () => clearInterval(interval);
  }, [supervisorNameId]);

  function choose(id: number) {
    if (!trackId) return;
    localStorage.setItem(`sana_supervisor_identity_${trackId}`, String(id));
    setSupervisorNameId(id);
    setShowPicker(false);
  }

  function resetIdentity() {
    if (!trackId) return;
    localStorage.removeItem(`sana_supervisor_identity_${trackId}`);
    setSupervisorNameId(null);
    setShowPicker(true);
  }

  const currentName = names?.find(n => n.id === supervisorNameId)?.name;

  if (!trackId) return null;

  if (!showPicker) {
    // شريط صغير يبيّن مين المسجّلة الآن + خيار تغييرها لو صار خطأ (جهاز مستعار مثلًا)
    return currentName ? (
      <div className="flex items-center justify-end gap-1.5 text-[12px] text-muted-foreground -mt-2 mb-1">
        <span>مسجّلة كـ: <span className="font-semibold text-foreground">{currentName}</span></span>
        <button onClick={resetIdentity} className="text-primary hover:underline">تغيير الهوية</button>
      </div>
    ) : null;
  }

  return (
    <Dialog open onOpenChange={() => {}}>
      <DialogContent dir="rtl" onInteractOutside={e => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>مين أنتِ؟</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground -mt-2">
          عشان نسجّل ساعات عملك بدقة رغم الحساب المشترك — اختياركِ يُحفظ بهذا الجهاز ومارح يُسأل مرة ثانية.
        </p>
        {!names || names.length === 0 ? (
          <p className="text-sm text-muted-foreground">لم تُضف أسماء المسؤولات بعد — تواصلي مع القائدة</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {names.map(n => (
              <button
                key={n.id}
                onClick={() => choose(n.id)}
                className="px-4 py-2 rounded-xl border-2 border-border text-sm font-semibold hover:border-primary/40 transition-all"
              >
                {n.name}
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
