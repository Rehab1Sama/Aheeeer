import { useState, useEffect, useCallback } from "react";
import { useGetCurrentUser } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  ChevronDown, ChevronUp, Users, Clock, Link2, X,
  Check, Phone, Search, ArrowLeftRight, UserX, BookOpen,
  Archive, PlaneTakeoff, ExternalLink, Pencil,
} from "lucide-react";
import { getToken } from "@/lib/auth";
import { toArabicDigits } from "@/lib/utils";
import { StudentArchiveDialog } from "@/components/StudentArchiveDialog";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type Student = { id: number; fullName: string };

type EnrichedCircle = {
  id: number;
  name: string;
  track: string;
  trackType: string;
  teacherId: number | null;
  supervisorId: number | null;
  meetingTime: string | null;
  whatsappLink: string | null;
  newStudentCapacity: number | null;
  teacherName: string | null;
  teacherPhone: string | null;
  supervisorName: string | null;
  supervisorPhone: string | null;
  students: Student[];
  volunteers: { id: number; name: string; phone: string | null }[];
};

type AllCircleOption = { id: number; name: string; track: string };

const TRACK_COLORS: Record<string, string> = {
  "البهور": "bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200",
  "إشراق": "bg-blue-100 text-blue-700 border-blue-200",
  "قبس": "bg-pink-100 text-pink-700 border-pink-200",
  "ضياء": "bg-amber-100 text-amber-700 border-amber-200",
  "وهج": "bg-rose-100 text-rose-700 border-rose-200",
  "سراج": "bg-emerald-100 text-emerald-700 border-emerald-200",
  "ألق": "bg-cyan-100 text-cyan-700 border-cyan-200",
  "مهج": "bg-orange-100 text-orange-700 border-orange-200",
  "مشكاة نور": "bg-sky-100 text-sky-700 border-sky-200",
};

function whatsappHref(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 7) return null;
  return `https://wa.me/${digits.startsWith("0") ? "966" + digits.slice(1) : digits}`;
}

function TransferModal({
  title,
  studentName,
  circles,
  currentCircleId,
  onConfirm,
  onClose,
  loading,
}: {
  title: string;
  studentName?: string;
  circles: AllCircleOption[];
  currentCircleId: number;
  onConfirm: (targetCircleId: number) => void;
  onClose: () => void;
  loading: boolean;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const [step, setStep] = useState<"select" | "confirm">("select");
  const [search, setSearch] = useState("");
  const options = circles.filter(c => c.id !== currentCircleId && (!search || c.name.includes(search) || c.track.includes(search)));
  const fromCircle = circles.find(c => c.id === currentCircleId);
  const toCircle = circles.find(c => c.id === selected);

  if (step === "confirm" && selected) {
    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" dir="rtl">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <h3 className="font-bold text-base">تأكيد النقل</h3>
            <button onClick={onClose} className="p-1 rounded hover:bg-muted"><X className="w-4 h-4" /></button>
          </div>
          <div className="p-4 space-y-3">
            {studentName && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 text-sm font-semibold text-amber-800 text-center">
                {studentName}
              </div>
            )}
            <div className="flex items-center gap-2 justify-center text-sm">
              <div className="flex-1 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2.5 text-center">
                <p className="text-xs text-rose-500 mb-0.5">من</p>
                <p className="font-semibold text-rose-800 text-xs">{fromCircle?.name ?? "—"}</p>
                <p className="text-xs text-rose-600">{fromCircle?.track ?? ""}</p>
              </div>
              <ArrowLeftRight className="w-4 h-4 text-muted-foreground shrink-0" />
              <div className="flex-1 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2.5 text-center">
                <p className="text-xs text-emerald-500 mb-0.5">إلى</p>
                <p className="font-semibold text-emerald-800 text-xs">{toCircle?.name ?? "—"}</p>
                <p className="text-xs text-emerald-600">{toCircle?.track ?? ""}</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground text-center">ستختفي الطالبة من الحلقة القديمة وتنتقل للجديدة فوراً.</p>
          </div>
          <div className="p-3 flex gap-2 border-t">
            <Button size="sm" className="flex-1" disabled={loading} onClick={() => onConfirm(selected)}>
              {loading ? "جاري النقل..." : "تأكيد النقل"}
            </Button>
            <Button size="sm" variant="outline" className="flex-1" onClick={() => setStep("select")}>رجوع</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" dir="rtl">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h3 className="font-bold text-base">{title}</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-3 border-b">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث..." className="pe-3 pr-9 h-8 text-xs text-right" />
          </div>
        </div>
        <div className="p-3 max-h-64 overflow-y-auto space-y-1">
          {options.map(c => (
            <button
              key={c.id}
              onClick={() => setSelected(c.id)}
              className={`w-full text-right px-3 py-2.5 rounded-xl border-2 transition-all text-sm ${selected === c.id ? "border-primary bg-primary/5 font-semibold" : "border-border hover:border-primary/40"}`}
            >
              {c.name}
              <span className="text-xs text-muted-foreground mr-2">({c.track})</span>
            </button>
          ))}
          {options.length === 0 && <p className="text-center text-sm text-muted-foreground py-4">لا توجد حلقات</p>}
        </div>
        <div className="p-3 flex gap-2 border-t">
          <Button size="sm" className="flex-1" disabled={!selected} onClick={() => selected && setStep("confirm")}>
            التالي
          </Button>
          <Button size="sm" variant="outline" className="flex-1" onClick={onClose}>إلغاء</Button>
        </div>
      </div>
    </div>
  );
}

export default function LeaderCirclesPage() {
  const { data: user } = useGetCurrentUser({ query: { queryKey: ["getCurrentUser"] } });
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const isLeader = user?.role === "leader";
  const isDeputy = (user?.role as string | undefined) === "deputy";
  const isTrackSup = user?.role === "track_supervisor";
  const canManage = isLeader || isDeputy || isTrackSup;

  const [circles, setCircles] = useState<EnrichedCircle[]>([]);
  const [allCircles, setAllCircles] = useState<AllCircleOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expandedTracks, setExpandedTracks] = useState<Set<string>>(new Set());
  const [expandedCircles, setExpandedCircles] = useState<Set<number>>(new Set());

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editData, setEditData] = useState({ name: "", meetingTime: "", whatsappLink: "", newStudentCapacity: "" });
  const [saving, setSaving] = useState(false);

  const [leaveModal, setLeaveModal] = useState<{ studentId: number; studentName: string; circleId: number } | null>(null);
  const [leaveStart, setLeaveStart] = useState("");
  const [leaveEnd, setLeaveEnd] = useState("");
  const [leaveReason, setLeaveReason] = useState("");
  const [leaveSaving, setLeaveSaving] = useState(false);
  const [archiveModal, setArchiveModal] = useState<{
    studentId: number;
    studentName: string;
    circleId: number;
    circleName: string;
  } | null>(null);

  const [transferModal, setTransferModal] = useState<{
    type: "teacher" | "supervisor" | "student" | "volunteer";
    circleId: number;
    label: string;
    studentId?: number;
    studentName?: string;
    userId?: number;
  } | null>(null);
  const [transferLoading, setTransferLoading] = useState(false);

  const token = getToken();
  const headers = useCallback(() => ({ "Content-Type": "application/json", Authorization: `Bearer ${token}` }), [token]);

  const handleArchiveStudent = (studentId: number, studentName: string, circleId: number, circleName: string) => {
    setArchiveModal({ studentId, studentName, circleId, circleName });
  };

  const handleSetLeave = async () => {
    if (!leaveModal || !leaveStart || !leaveEnd) {
      toast({ title: "أدخلي تاريخ البداية والنهاية", variant: "destructive" }); return;
    }
    setLeaveSaving(true);
    try {
      const res = await fetch(`${BASE}/api/students/${leaveModal.studentId}/leave`, {
        method: "PATCH",
        headers: headers(),
        body: JSON.stringify({ circleId: leaveModal.circleId, leaveStart, leaveEnd, reason: leaveReason || null }),
      });
      if (!res.ok) throw new Error();
      toast({ title: `تم منح إجازة لـ ${leaveModal.studentName}` });
      setLeaveModal(null); setLeaveStart(""); setLeaveEnd(""); setLeaveReason("");
      await load();
    } catch {
      toast({ title: "فشل تسجيل الإجازة", variant: "destructive" });
    } finally {
      setLeaveSaving(false);
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [enrichRes, namesRes] = await Promise.all([
        fetch(`${BASE}/api/circles/enriched`, { headers: headers() }),
        fetch(`${BASE}/api/circles/names`, { headers: headers() }),
      ]);
      if (enrichRes.ok) setCircles(await enrichRes.json());
      if (namesRes.ok) setAllCircles(await namesRes.json());
    } catch {
      toast({ title: "فشل تحميل البيانات", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [headers, toast]);

  useEffect(() => { load(); }, [load]);

  const toggleTrack = (track: string) => {
    setExpandedTracks(prev => {
      const next = new Set(prev);
      next.has(track) ? next.delete(track) : next.add(track);
      return next;
    });
  };

  const toggleCircle = (id: number) => {
    setExpandedCircles(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const startEdit = (c: EnrichedCircle) => {
    setEditingId(c.id);
    setEditData({
      name: c.name,
      meetingTime: c.meetingTime ?? "",
      whatsappLink: c.whatsappLink ?? "",
      newStudentCapacity: c.newStudentCapacity?.toString() ?? "",
    });
  };

  const saveEdit = async (id: number) => {
    setSaving(true);
    try {
      if (!editData.name.trim()) {
        toast({ title: "اكتبي اسم الحلقة", variant: "destructive" });
        return;
      }
      const body: Record<string, unknown> = {
        name: editData.name.trim(),
        meetingTime: editData.meetingTime || null,
        whatsappLink: editData.whatsappLink || null,
      };
      if (isLeader) body.newStudentCapacity = editData.newStudentCapacity ? Number(editData.newStudentCapacity) : null;
      const res = await fetch(`${BASE}/api/circles/${id}`, {
        method: "PATCH",
        headers: headers(),
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
      toast({ title: "تم الحفظ بنجاح" });
      setEditingId(null);
      await load();
    } catch {
      toast({ title: "حدث خطأ أثناء الحفظ", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleTransfer = async (targetCircleId: number) => {
    if (!transferModal) return;
    setTransferLoading(true);
    try {
      if (transferModal.type === "student" && transferModal.studentId != null) {
        const res = await fetch(`${BASE}/api/students/${transferModal.studentId}`, {
          method: "PATCH",
          headers: headers(),
          body: JSON.stringify({ circleId: targetCircleId, fromCircleId: transferModal.circleId }),
        });
        if (!res.ok) throw new Error();
        toast({ title: "تم نقل الطالبة بنجاح" });
      } else if (transferModal.type === "volunteer" && transferModal.userId != null) {
        const res = await fetch(`${BASE}/api/users/${transferModal.userId}`, {
          method: "PATCH",
          headers: headers(),
          body: JSON.stringify({ circleId: targetCircleId }),
        });
        if (!res.ok) throw new Error();
        toast({ title: "تم نقل المتطوعة بنجاح" });
      } else if (transferModal.type === "teacher" || transferModal.type === "supervisor") {
        const res = await fetch(`${BASE}/api/circles/${transferModal.circleId}/remove-staff`, {
          method: "POST",
          headers: headers(),
          body: JSON.stringify({
            staffRole: transferModal.type,
            action: "transfer",
            targetCircleId,
          }),
        });
        if (!res.ok) throw new Error();
        toast({ title: `تم نقل ${transferModal.type === "teacher" ? "المعلمة" : "المشرفة"} بنجاح` });
      }
      setTransferModal(null);
      await load();
    } catch {
      toast({ title: "فشل نقل العضو", variant: "destructive" });
    } finally {
      setTransferLoading(false);
    }
  };

  const archiveStaffFromCircle = async (circleId: number, type: "teacher" | "supervisor") => {
    if (!confirm(`هل تريدين إزالة ${type === "teacher" ? "المعلمة" : "المشرفة"} من الحلقة؟`)) return;
    try {
      const res = await fetch(`${BASE}/api/circles/${circleId}/remove-staff`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ staffRole: type, action: "archive" }),
      });
      if (!res.ok) throw new Error();
      toast({ title: "تم الإزالة بنجاح" });
      await load();
    } catch {
      toast({ title: "فشلت الإزالة", variant: "destructive" });
    }
  };

  const archiveVolunteer = async (userId: number, name: string) => {
    if (!confirm(`هل تريدين أرشفة المتطوعة ${name}؟`)) return;
    try {
      const res = await fetch(`${BASE}/api/users/${userId}`, { method: "DELETE", headers: headers() });
      if (!res.ok) throw new Error();
      toast({ title: "تمت أرشفة المتطوعة" });
      await load();
    } catch {
      toast({ title: "فشلت أرشفة المتطوعة", variant: "destructive" });
    }
  };

  const filtered = circles.filter(c =>
    !search || c.name.includes(search) || (c.teacherName ?? "").includes(search) || (c.supervisorName ?? "").includes(search)
  );

  const naturalSort = (a: string, b: string) => a.localeCompare(b, 'ar', { numeric: true, sensitivity: 'base' });

  const tracks = Array.from(new Set(filtered.map(c => c.track))).sort(naturalSort);
  const grouped: Record<string, EnrichedCircle[]> = {};
  filtered.forEach(c => {
    if (!grouped[c.track]) grouped[c.track] = [];
    grouped[c.track].push(c);
  });
  // Sort circles within each track ascending by name (وهج 1, وهج 2, وهج 10 ...)
  Object.keys(grouped).forEach(track => {
    grouped[track].sort((a, b) => naturalSort(a.name, b.name));
  });

  // Deputy view: group by time period
  const isFixationCircle = (c: EnrichedCircle) =>
    c.trackType === "fixation" || c.track.includes("تثبيت") || c.track.includes("fixation");

  const sortCircles = (arr: EnrichedCircle[]) => [...arr].sort((a, b) => naturalSort(a.name, b.name));

  const deputyPeriods = isDeputy ? (() => {
    const fixation = filtered.filter(isFixationCircle);
    const regular = filtered.filter(c => !isFixationCircle(c));
    const morning = regular.filter(c => c.meetingTime && c.meetingTime < "12:00");
    const afternoon = regular.filter(c => c.meetingTime && c.meetingTime >= "12:00" && c.meetingTime < "16:00");
    const evening = regular.filter(c => c.meetingTime && c.meetingTime >= "16:00");
    const noTime = regular.filter(c => !c.meetingTime);
    return [
      { key: "morning", label: "الفترة الصباحية", emoji: "🌅", colorClass: "bg-amber-50 border-amber-200 text-amber-800", circles: sortCircles(morning) },
      { key: "afternoon", label: "الفترة الظهيرة", emoji: "☀️", colorClass: "bg-orange-50 border-orange-200 text-orange-800", circles: sortCircles(afternoon) },
      { key: "evening", label: "الفترة المسائية", emoji: "🌙", colorClass: "bg-indigo-50 border-indigo-200 text-indigo-800", circles: sortCircles(evening) },
      { key: "notime", label: "غير محدد الوقت", emoji: "🕐", colorClass: "bg-gray-50 border-gray-200 text-gray-700", circles: sortCircles(noTime) },
      { key: "fixation", label: "حلقات التثبيت", emoji: "📚", colorClass: "bg-emerald-50 border-emerald-200 text-emerald-800", circles: sortCircles(fixation), isFixation: true },
    ].filter(p => p.circles.length > 0);
  })() : [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-teal-50/20 pb-20" dir="rtl">
      <div className="max-w-3xl mx-auto px-4 pt-6 space-y-4">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-primary" />
            الحلقات
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {isLeader ? "جميع حلقات المقرأة" : `مسار ${user?.track ?? ""}`}
          </p>
        </div>

        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="بحث بالاسم أو المعلمة أو المشرفة..."
            className="pe-3 pr-10 text-right"
          />
        </div>

        {loading ? (
          <div className="text-center py-10 text-muted-foreground text-sm">جاري التحميل...</div>
        ) : isDeputy ? (
          /* ── عرض النائبة: مقسّم بالفترات الزمنية ── */
          <div className="space-y-3">
            {deputyPeriods.map(period => {
              const isOpen = expandedTracks.has(period.key);
              return (
                <div key={period.key} className="bg-white rounded-2xl shadow-sm border border-border/50 overflow-hidden">
                  <button
                    onClick={() => toggleTrack(period.key)}
                    className="w-full flex items-center justify-between p-4 hover:bg-muted/20 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-lg">{period.emoji}</span>
                      <span className={`text-sm font-bold px-3 py-1 rounded-full border ${period.colorClass}`}>{period.label}</span>
                      <span className="text-xs text-muted-foreground">{toArabicDigits(period.circles.length)} حلقة</span>
                      <span className="text-xs text-muted-foreground">· {toArabicDigits(period.circles.reduce((n, c) => n + c.students.length, 0))} طالبة</span>
                    </div>
                    {isOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                  </button>
                  {isOpen && (
                    <div className="border-t border-border/30 divide-y divide-border/30">
                      {period.circles.map(circle => {
                        const isExpanded = expandedCircles.has(circle.id);
                        return (
                          <div key={circle.id} className="p-4">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <h3 className="font-bold text-base flex items-center gap-1">
                                  {circle.name}
                                  <Pencil className="w-3 h-3 text-muted-foreground/50" />
                                </h3>
                                <div className="flex flex-wrap gap-3 mt-1 text-xs text-muted-foreground">
                                  {circle.meetingTime && <span className="flex items-center gap-1 text-blue-700"><Clock className="w-3 h-3" />{circle.meetingTime}</span>}
                                  <span className="text-muted-foreground">{circle.track}</span>
                                  {(period as {isFixation?: boolean}).isFixation && (
                                    <span className="bg-emerald-100 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full text-[10px] font-semibold">
                                      الطالبات يكتبن خططهن بأنفسهن
                                    </span>
                                  )}
                                </div>
                              </div>
                              <button
                                onClick={() => navigate(`/circle/${circle.id}`)}
                                className="shrink-0 flex items-center gap-1 text-xs font-semibold text-primary hover:underline px-2 py-1"
                                title="عرض صفحة الحلقة الموحّدة"
                              >
                                <ExternalLink className="w-3.5 h-3.5" /> عرض الحلقة
                              </button>
                            </div>
                            {/* Teacher */}
                            {circle.teacherName && (
                              <div className="mt-2 rounded-xl bg-rose-50/60 border border-rose-100 px-3 py-2 flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-semibold text-rose-700">م.</span>
                                  <span className="text-sm">{circle.teacherName}</span>
                                </div>
                                {circle.teacherPhone && (
                                  <a href={whatsappHref(circle.teacherPhone) ?? `tel:${circle.teacherPhone}`} target="_blank" rel="noopener noreferrer" className="p-1 rounded bg-green-50 text-green-600 hover:bg-green-100"><Phone className="w-3 h-3" /></a>
                                )}
                              </div>
                            )}
                            {/* Supervisor */}
                            {circle.supervisorName && (
                              <div className="mt-1.5 rounded-xl bg-blue-50/60 border border-blue-100 px-3 py-2 flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-semibold text-blue-700">مش.</span>
                                  <span className="text-sm">{circle.supervisorName}</span>
                                </div>
                                {circle.supervisorPhone && (
                                  <a href={whatsappHref(circle.supervisorPhone) ?? `tel:${circle.supervisorPhone}`} target="_blank" rel="noopener noreferrer" className="p-1 rounded bg-green-50 text-green-600 hover:bg-green-100"><Phone className="w-3 h-3" /></a>
                                )}
                              </div>
                            )}
                            {/* Students */}
                            <div className="mt-2 rounded-xl bg-amber-50/60 border border-amber-100 p-3">
                              <button onClick={() => toggleCircle(circle.id)} className="w-full flex items-center justify-between">
                                <p className="text-xs font-semibold text-amber-800">الطالبات ({toArabicDigits(circle.students.length)})</p>
                                {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-amber-700" /> : <ChevronDown className="w-3.5 h-3.5 text-amber-700" />}
                              </button>
                              {isExpanded && (
                                <div className="mt-2 space-y-1.5">
                                  {circle.students.length === 0 ? (
                                    <p className="text-xs text-muted-foreground">لا توجد طالبات</p>
                                  ) : [...circle.students].sort((a, b) => a.fullName.localeCompare(b.fullName, "ar")).map(s => (
                                    <div key={s.id} className="flex items-center justify-between gap-2 py-0.5">
                                      <button onClick={() => navigate(`/students/${s.id}`)} className="text-sm text-primary hover:underline text-right flex-1 min-w-0 truncate">{s.fullName}</button>
                                      <div className="flex gap-1 shrink-0">
                                        <button onClick={() => navigate(`/students/${s.id}`)} className="p-1 rounded bg-muted/60 hover:bg-muted text-muted-foreground" title="ملف الطالبة"><ExternalLink className="w-3 h-3" /></button>
                                        {!isTrackSup && <button onClick={() => setTransferModal({ type: "student", circleId: circle.id, label: "نقل طالبة", studentId: s.id, studentName: s.fullName })} className="p-1 rounded bg-blue-50 text-blue-600 hover:bg-blue-100" title="نقل"><ArrowLeftRight className="w-3 h-3" /></button>}
                                        <button onClick={() => { setLeaveModal({ studentId: s.id, studentName: s.fullName, circleId: circle.id }); setLeaveStart(""); setLeaveEnd(""); setLeaveReason(""); }} className="p-1 rounded bg-amber-50 text-amber-600 hover:bg-amber-100" title="إجازة"><PlaneTakeoff className="w-3 h-3" /></button>
                                        <button onClick={() => handleArchiveStudent(s.id, s.fullName, circle.id, circle.name)} className="p-1 rounded bg-rose-50 text-rose-600 hover:bg-rose-100" title="أرشفة مباشرة"><Archive className="w-3 h-3" /></button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
            {deputyPeriods.length === 0 && <div className="text-center py-12 text-muted-foreground">لا توجد حلقات</div>}
          </div>
        ) : (
          /* ── عرض القائدة ومشرفة المسار: مقسّم بالمسارات ── */
          <div className="space-y-3">
            {tracks.map(track => {
              const trackCircles = grouped[track] ?? [];
              const isOpen = expandedTracks.has(track);
              const colorClass = TRACK_COLORS[track] ?? "bg-gray-100 text-gray-700 border-gray-200";

              return (
                <div key={track} className="bg-white rounded-2xl shadow-sm border border-border/50 overflow-hidden">
                  <button
                    onClick={() => toggleTrack(track)}
                    className="w-full flex items-center justify-between p-4 hover:bg-muted/20 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <Badge className={`text-sm px-3 py-1 border ${colorClass}`}>مسار {track}</Badge>
                      <span className="text-sm text-muted-foreground">{toArabicDigits(trackCircles.length)} حلقات</span>
                      <span className="text-xs text-muted-foreground">
                        · {toArabicDigits(trackCircles.reduce((n, c) => n + c.students.length, 0))} طالبة
                      </span>
                    </div>
                    {isOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                  </button>

                  {isOpen && (
                    <div className="border-t border-border/30 divide-y divide-border/30">
                      {trackCircles.map(circle => {
                        const isEditing = editingId === circle.id;
                        const isExpanded = expandedCircles.has(circle.id);

                        return (
                          <div key={circle.id} className="p-4">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <h3 className="font-bold text-base">{circle.name}</h3>
                                <div className="flex flex-wrap gap-3 mt-1.5 text-xs text-muted-foreground">
                                  {circle.meetingTime && (
                                    <span className="flex items-center gap-1 text-blue-700">
                                      <Clock className="w-3 h-3" />{circle.meetingTime}
                                    </span>
                                  )}
                                  {circle.whatsappLink && (
                                    <a href={circle.whatsappLink} target="_blank" rel="noopener noreferrer"
                                      className="flex items-center gap-1 text-green-700 hover:underline">
                                      <Link2 className="w-3 h-3" />واتساب الحلقة
                                    </a>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => isEditing ? setEditingId(null) : startEdit(circle)}
                                  className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground"
                                   title={isEditing ? "إلغاء التعديل" : "تعديل اسم الحلقة وبياناتها"}
                                >
                                   {isEditing ? <X className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}
                                </button>
                              </div>
                            </div>

                            {/* Edit form */}
                            {isEditing && (
                              <div className="mt-3 pt-3 border-t border-border/50 space-y-3">
                                <div className="space-y-1">
                                  <Label className="text-xs font-semibold text-muted-foreground">اسم الحلقة</Label>
                                  <Input
                                    value={editData.name}
                                    onChange={e => setEditData(d => ({ ...d, name: e.target.value }))}
                                    placeholder="اسم الحلقة"
                                    className="h-8 text-xs text-right"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs font-semibold text-muted-foreground">وقت الاجتماع</Label>
                                  <input
                                    type="time"
                                    value={editData.meetingTime}
                                    onChange={e => setEditData(d => ({ ...d, meetingTime: e.target.value }))}
                                    className="h-8 text-xs border border-input rounded-md px-2 py-1.5 w-full bg-background"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs font-semibold text-muted-foreground">رابط واتساب الحلقة</Label>
                                  <Input
                                    value={editData.whatsappLink}
                                    onChange={e => setEditData(d => ({ ...d, whatsappLink: e.target.value }))}
                                    placeholder="https://chat.whatsapp.com/..."
                                    className="h-8 text-xs"
                                    dir="ltr"
                                  />
                                </div>
                                {isLeader && (
                                  <div className="space-y-1">
                                    <Label className="text-xs font-semibold text-muted-foreground">الحد الأقصى للطالبات الجدد</Label>
                                    <Input
                                      type="number" min="0"
                                      value={editData.newStudentCapacity}
                                      onChange={e => setEditData(d => ({ ...d, newStudentCapacity: e.target.value }))}
                                      placeholder="اتركي فارغًا = بلا حد"
                                      className="h-8 text-xs text-right"
                                    />
                                  </div>
                                )}
                                <Button size="sm" className="w-full h-8 text-xs" onClick={() => saveEdit(circle.id)} disabled={saving}>
                                  <Check className="w-3.5 h-3.5 ml-1" />حفظ
                                </Button>
                              </div>
                            )}

                            {/* Teacher */}
                            <div className="mt-3 rounded-xl bg-rose-50/60 border border-rose-100 p-3">
                              <p className="text-xs font-semibold text-rose-800 mb-1.5">المعلمة</p>
                              {circle.teacherName ? (
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium">{circle.teacherName}</span>
                                    {circle.teacherPhone && (
                                      <a href={whatsappHref(circle.teacherPhone) ?? `tel:${circle.teacherPhone}`}
                                        target="_blank" rel="noopener noreferrer"
                                        className="p-1 rounded bg-green-50 text-green-600 hover:bg-green-100">
                                        <Phone className="w-3 h-3" />
                                      </a>
                                    )}
                                  </div>
                                  {canManage && (
                                    <div className="flex items-center gap-1">
                                      {!isTrackSup && (
                                        <button
                                          onClick={() => setTransferModal({ type: "teacher", circleId: circle.id, label: `نقل المعلمة: ${circle.teacherName}` })}
                                          className="p-1 rounded bg-blue-50 text-blue-600 hover:bg-blue-100" title="نقل لحلقة أخرى"
                                        >
                                          <ArrowLeftRight className="w-3 h-3" />
                                        </button>
                                      )}
                                      <button
                                        onClick={() => archiveStaffFromCircle(circle.id, "teacher")}
                                        className="p-1 rounded bg-rose-50 text-rose-600 hover:bg-rose-100" title="إزالة من الحلقة"
                                      >
                                        <UserX className="w-3 h-3" />
                                      </button>
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <p className="text-xs text-muted-foreground">لا توجد معلمة معيّنة</p>
                              )}
                            </div>

                            {/* Supervisor */}
                            <div className="mt-2 rounded-xl bg-blue-50/60 border border-blue-100 p-3">
                              <p className="text-xs font-semibold text-blue-800 mb-1.5">المشرفة</p>
                              {circle.supervisorName ? (
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium">{circle.supervisorName}</span>
                                    {circle.supervisorPhone && (
                                      <a href={whatsappHref(circle.supervisorPhone) ?? `tel:${circle.supervisorPhone}`}
                                        target="_blank" rel="noopener noreferrer"
                                        className="p-1 rounded bg-green-50 text-green-600 hover:bg-green-100">
                                        <Phone className="w-3 h-3" />
                                      </a>
                                    )}
                                  </div>
                                  {canManage && (
                                    <div className="flex items-center gap-1">
                                      {!isTrackSup && (
                                        <button
                                          onClick={() => setTransferModal({ type: "supervisor", circleId: circle.id, label: `نقل المشرفة: ${circle.supervisorName}` })}
                                          className="p-1 rounded bg-blue-50 text-blue-600 hover:bg-blue-100"
                                        >
                                          <ArrowLeftRight className="w-3 h-3" />
                                        </button>
                                      )}
                                      <button
                                        onClick={() => archiveStaffFromCircle(circle.id, "supervisor")}
                                        className="p-1 rounded bg-rose-50 text-rose-600 hover:bg-rose-100"
                                      >
                                        <UserX className="w-3 h-3" />
                                      </button>
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <p className="text-xs text-muted-foreground">لا توجد مشرفة معيّنة</p>
                              )}
                            </div>

                            {/* Volunteers */}
                            <div className="mt-2 rounded-xl bg-violet-50/60 border border-violet-100 p-3">
                              <p className="text-xs font-semibold text-violet-800 mb-1.5">
                                الكادر والمتطوعات ({
                                  circle.volunteers.length +
                                  (circle.teacherName ? 1 : 0) +
                                  (circle.supervisorName ? 1 : 0)
                                })
                              </p>
                              {circle.volunteers.length === 0 ? (
                                <p className="text-xs text-muted-foreground">المعلمة والمشرفة موضحتان أعلاه، ولا توجد متطوعات إضافيات مسندات لهذه الحلقة</p>
                              ) : (
                                <div className="space-y-1.5">
                                  {circle.volunteers.map(volunteer => (
                                    <div key={volunteer.id} className="flex items-center justify-between gap-2">
                                      <div className="flex items-center gap-2">
                                        <span className="text-sm font-medium">{volunteer.name}</span>
                                        {volunteer.phone && (
                                          <a href={whatsappHref(volunteer.phone) ?? `tel:${volunteer.phone}`} target="_blank" rel="noopener noreferrer" className="p-1 rounded bg-green-50 text-green-600 hover:bg-green-100">
                                            <Phone className="w-3 h-3" />
                                          </a>
                                        )}
                                      </div>
                                      {canManage && (
                                        <div className="flex items-center gap-1">
                                          {!isTrackSup && (
                                            <button
                                              onClick={() => setTransferModal({ type: "volunteer", circleId: circle.id, label: `نقل المتطوعة: ${volunteer.name}`, studentName: volunteer.name, userId: volunteer.id })}
                                              className="p-1 rounded bg-blue-50 text-blue-600 hover:bg-blue-100"
                                              title="نقل لحلقة أخرى"
                                            >
                                              <ArrowLeftRight className="w-3 h-3" />
                                            </button>
                                          )}
                                          <button
                                            onClick={() => archiveVolunteer(volunteer.id, volunteer.name)}
                                            className="p-1 rounded bg-rose-50 text-rose-600 hover:bg-rose-100"
                                            title="أرشفة المتطوعة"
                                          >
                                            <Archive className="w-3 h-3" />
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>

                            {/* Students */}
                            <div className="mt-2 rounded-xl bg-amber-50/60 border border-amber-100 p-3">
                              <button
                                onClick={() => toggleCircle(circle.id)}
                                className="w-full flex items-center justify-between"
                              >
                                <p className="text-xs font-semibold text-amber-800">
                                  الطالبات ({toArabicDigits(circle.students.length)})
                                </p>
                                {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-amber-700" /> : <ChevronDown className="w-3.5 h-3.5 text-amber-700" />}
                              </button>
                              {isExpanded && (
                                <div className="mt-2 space-y-1.5">
                                  {circle.students.length === 0 ? (
                                    <p className="text-xs text-muted-foreground">لا توجد طالبات</p>
                                  ) : [...circle.students].sort((a, b) => a.fullName.localeCompare(b.fullName, "ar")).map(s => (
                                    <div key={s.id} className="flex items-center justify-between gap-2 py-0.5">
                                      <button
                                        onClick={() => navigate(`/students/${s.id}`)}
                                        className="text-sm text-primary hover:underline text-right flex-1 min-w-0 truncate"
                                      >
                                        {s.fullName}
                                      </button>
                                      <div className="flex gap-1 shrink-0">
                                        <button
                                          onClick={() => navigate(`/students/${s.id}`)}
                                          className="p-1 rounded bg-muted/60 hover:bg-muted text-muted-foreground"
                                          title="فتح الملف الشخصي"
                                        >
                                          <ExternalLink className="w-3 h-3" />
                                        </button>
                                        {canManage && (
                                          <>
                                            {!isTrackSup && (
                                              <button
                                                onClick={() => setTransferModal({ type: "student", circleId: circle.id, label: `نقل طالبة`, studentId: s.id, studentName: s.fullName })}
                                                className="p-1 rounded bg-blue-50 text-blue-600 hover:bg-blue-100"
                                                title="نقل لحلقة أخرى"
                                              >
                                                <ArrowLeftRight className="w-3 h-3" />
                                              </button>
                                            )}
                                            <button
                                              onClick={() => { setLeaveModal({ studentId: s.id, studentName: s.fullName, circleId: circle.id }); setLeaveStart(""); setLeaveEnd(""); setLeaveReason(""); }}
                                              className="p-1 rounded bg-amber-50 text-amber-600 hover:bg-amber-100"
                                              title="منح إجازة"
                                            >
                                              <PlaneTakeoff className="w-3 h-3" />
                                            </button>
                                            <button
                                              onClick={() => handleArchiveStudent(s.id, s.fullName, circle.id, circle.name)}
                                              className="p-1 rounded bg-rose-50 text-rose-600 hover:bg-rose-100"
                                              title="إخراج من الحلقة"
                                            >
                                              <Archive className="w-3 h-3" />
                                            </button>
                                          </>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>

                            <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                              <Users className="w-3 h-3" />
                              <span>{toArabicDigits(circle.students.length)} طالبة</span>
                              {circle.newStudentCapacity != null && (
                                <span>· الحد الأقصى للجدد: {toArabicDigits(circle.newStudentCapacity)}</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            {tracks.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">لا توجد حلقات مطابقة</div>
            )}
          </div>
        )}
      </div>

      {transferModal && (
        <TransferModal
          title={transferModal.label}
          studentName={transferModal.studentName}
          circles={allCircles}
          currentCircleId={transferModal.circleId}
          onConfirm={handleTransfer}
          onClose={() => setTransferModal(null)}
          loading={transferLoading}
        />
      )}

      {leaveModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" dir="rtl">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <h3 className="font-bold text-base flex items-center gap-2">
                <PlaneTakeoff className="w-4 h-4 text-amber-500" />
                منح إجازة
              </h3>
              <button onClick={() => setLeaveModal(null)} className="p-1 rounded hover:bg-muted"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-4 space-y-3">
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-sm font-semibold text-amber-800 text-center">
                {leaveModal.studentName}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">تاريخ البداية</p>
                  <Input type="date" value={leaveStart} onChange={e => setLeaveStart(e.target.value)} className="text-sm" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">تاريخ النهاية</p>
                  <Input type="date" value={leaveEnd} onChange={e => setLeaveEnd(e.target.value)} className="text-sm" />
                </div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">سبب الإجازة (اختياري)</p>
                <textarea
                  value={leaveReason}
                  onChange={e => setLeaveReason(e.target.value)}
                  placeholder="مثال: مرض، سفر، ظروف عائلية..."
                  rows={2}
                  className="w-full border border-input rounded-xl px-3 py-2 text-sm bg-background resize-none focus:outline-none focus:ring-1 focus:ring-primary/30 text-right"
                />
              </div>
            </div>
            <div className="p-3 flex gap-2 border-t">
              <Button size="sm" className="flex-1" disabled={leaveSaving} onClick={handleSetLeave}>
                {leaveSaving ? "جاري الحفظ..." : "تأكيد الإجازة"}
              </Button>
              <Button size="sm" variant="outline" className="flex-1" onClick={() => setLeaveModal(null)}>إلغاء</Button>
            </div>
          </div>
        </div>
      )}
      {archiveModal && (
        <StudentArchiveDialog
          {...archiveModal}
          onClose={() => setArchiveModal(null)}
          onSuccess={async () => {
            setArchiveModal(null);
            await load();
          }}
        />
      )}
    </div>
  );
}
