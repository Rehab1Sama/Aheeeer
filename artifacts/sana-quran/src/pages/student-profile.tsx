import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import {
  useGetStudentProfile,
  useArchiveStudent,
  useRestoreStudent,
  useSetStudentLeave,
  useAddStudentNote,
  useDeleteStudentNote,
  useGetCurrentUser,
  useListStudentGoals,
  useCreateStudentGoal,
  useUpdateStudentGoal,
  useDeleteStudentGoal,
  useListCircleNames,
  useEnrollStudent,
  useCreateStudentMemorization,
  useUpdateStudentMemorization,
  useDeleteStudentMemorization,
  type CreateStudentGoalBody,
  type StudentMemorization,
  type UpdateStudentGoalBody,
  type UpsertStudentMemorizationBody,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  ArrowRight, UserCircle, BookOpen, Calendar, ArrowLeftRight,
  Phone, Globe, GraduationCap, StickyNote, Archive, RotateCcw,
  Plane, MessageSquare, Trash2, Plus, Printer, TrendingUp, ListChecks, AlertTriangle,
  Target, CheckCircle2, Circle, PlaneTakeoff, XCircle, PlusCircle, Layers,
  Mail, MessageCircle, Pencil, Save, X,
} from "lucide-react";
import ReviewPlanSection from "@/components/ReviewPlanSection";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useToast } from "@/hooks/use-toast";

function AttendanceHeatmap({ heatmapData }: { heatmapData: Array<{ date: string; status: string }> }) {
  const meccaMs = Date.now() + 3 * 60 * 60 * 1000;
  const meccaToday = new Date(meccaMs);
  if (meccaToday.getUTCHours() < 5) meccaToday.setUTCDate(meccaToday.getUTCDate() - 1);
  const todayStr = meccaToday.toISOString().slice(0, 10);

  const recordMap = new Map(heatmapData.map(r => [r.date, r.status]));

  const startDate = new Date(meccaToday);
  startDate.setUTCDate(meccaToday.getUTCDate() - 181);
  while (startDate.getUTCDay() !== 0) startDate.setDate(startDate.getDate() - 1);

  const weeks: Array<Array<string | null>> = [];
  let currentWeek: Array<string | null> = [];
  const cur = new Date(startDate);
  while (cur.toISOString().slice(0, 10) <= todayStr) {
    const dateStr = cur.toISOString().slice(0, 10);
    currentWeek.push(dateStr);
    if (currentWeek.length === 7) { weeks.push(currentWeek); currentWeek = []; }
    cur.setDate(cur.getDate() + 1);
  }
  if (currentWeek.length) {
    while (currentWeek.length < 7) currentWeek.push(null);
    weeks.push(currentWeek);
  }

  function getColor(dateStr: string | null): string {
    if (!dateStr || dateStr > todayStr) return "bg-transparent";
    const status = recordMap.get(dateStr);
    if (!status) return "bg-muted/30 dark:bg-muted/20";
    if (status === "absent") return "bg-rose-400";
    if (status === "present") return "bg-emerald-500";
    if (status === "low") return "bg-yellow-400";
    return "bg-emerald-200";
  }

  function getTitle(dateStr: string | null): string {
    if (!dateStr || dateStr > todayStr) return "";
    const status = recordMap.get(dateStr);
    const label = new Date(dateStr).toLocaleDateString("ar-SA", { month: "short", day: "numeric", weekday: "short" });
    if (!status) return label + " — لا إدخال";
    if (status === "absent") return label + " — غائبة";
    if (status === "present") return label + " — حضرت وأنجزت";
    if (status === "low") return label + " — حضرت (ناقص)";
    return label + " — حضرت";
  }

  const dayLabels = ["أح", "", "ثل", "", "خم", "", "سب"];

  return (
    <div className="space-y-2">
      <div className="flex gap-0.5 overflow-x-auto pb-1">
        <div className="flex flex-col gap-0.5 ml-0.5 shrink-0">
          {dayLabels.map((d, i) => (
            <div key={i} className="w-3 h-3 flex items-center justify-end">
              <span className="text-[8px] text-muted-foreground leading-none">{d}</span>
            </div>
          ))}
        </div>
        {weeks.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-0.5 shrink-0">
            {week.map((day, di) => (
              <div
                key={di}
                className={`w-3 h-3 rounded-[2px] ${day && day <= todayStr ? getColor(day) : "bg-transparent"}`}
                title={getTitle(day)}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3 text-[10px] text-muted-foreground flex-wrap">
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" />حضرت وأنجزت</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-yellow-400 inline-block" />حضرت ناقص</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-rose-400 inline-block" />غائبة</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-muted/30 border inline-block" />لا إدخال</span>
      </div>
    </div>
  );
}
import { useQueryClient } from "@tanstack/react-query";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("ar-SA", { year: "numeric", month: "short", day: "numeric" });
}
function formatDateShort(iso: string) {
  return new Date(iso).toLocaleDateString("ar-SA", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function getMakkahDay(): string {
  const meccaMs = Date.now() + 3 * 60 * 60 * 1000;
  const d = new Date(meccaMs);
  if (d.getUTCHours() < 5) d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function isOnLeave(leaveStart?: string | null, leaveEnd?: string | null): boolean {
  if (!leaveStart || !leaveEnd) return false;
  const today = getMakkahDay();
  return leaveStart <= today && today <= leaveEnd;
}

export default function StudentProfilePage({ id }: { id: number }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [location, navigate] = useLocation();

  const { data: profile, isLoading } = useGetStudentProfile(id, { query: { queryKey: ["studentProfile", id] } });
  const { data: user } = useGetCurrentUser({ query: { queryKey: ["getCurrentUser"] } });

  const archiveStudent = useArchiveStudent();
  const restoreStudent = useRestoreStudent();
  const setLeave = useSetStudentLeave();
  const addNote = useAddStudentNote();
  const deleteNote = useDeleteStudentNote();

  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
  const [leaveStart, setLeaveStart] = useState("");
  const [leaveEnd, setLeaveEnd] = useState("");
  const [noteContent, setNoteContent] = useState("");

  // Goals state
  const [goalFormOpen, setGoalFormOpen] = useState(false);
  const [editingGoalId, setEditingGoalId] = useState<number | null>(null);
  const [goalTitle, setGoalTitle] = useState("");
  const [goalDate, setGoalDate] = useState("");
  const [goalNotes, setGoalNotes] = useState("");
  const [goalMessage, setGoalMessage] = useState("");

  const goals = useListStudentGoals(id);
  const createGoal = useCreateStudentGoal();
  const updateGoal = useUpdateStudentGoal();
  const deleteGoal = useDeleteStudentGoal();
  const createMemorization = useCreateStudentMemorization();
  const updateMemorization = useUpdateStudentMemorization();
  const deleteMemorization = useDeleteStudentMemorization();

  const { data: allCircleNames } = useListCircleNames({ query: { queryKey: ["circleNames"] } });

  const [enrollDialogOpen, setEnrollDialogOpen] = useState(false);
  const [enrollCircleId, setEnrollCircleId] = useState("");
  const [perCircleLeaveOpen, setPerCircleLeaveOpen] = useState<number | null>(null);
  const [perCircleLeaveStart, setPerCircleLeaveStart] = useState("");
  const [perCircleLeaveEnd, setPerCircleLeaveEnd] = useState("");
  const [archiveRequest, setArchiveRequest] = useState<{ circleId?: number; circleName?: string } | null>(null);
  const [withdrawalPeriod, setWithdrawalPeriod] = useState("");
  const [withdrawalReason, setWithdrawalReason] = useState("");
  const [withdrawalNotes, setWithdrawalNotes] = useState("");
  const [memorizationEditorOpen, setMemorizationEditorOpen] = useState(false);
  const [editingMemorizationId, setEditingMemorizationId] = useState<number | null>(null);
  const [memorizationLabel, setMemorizationLabel] = useState("");
  const [memorizationPages, setMemorizationPages] = useState("");
  const [memorizationJuzNumbers, setMemorizationJuzNumbers] = useState<number[]>([]);

  useEffect(() => {
    if (!profile || archiveRequest) return;
    const query = new URLSearchParams(location.split("?")[1] ?? "");
    if (query.get("archive") !== "1") return;
    const circleId = Number(query.get("circleId"));
    const enrollment = Number.isFinite(circleId)
      ? ((profile as any).enrollments ?? []).find((item: any) => item.circleId === circleId && !item.isArchived)
      : null;
    if (enrollment) {
      setArchiveRequest({ circleId: enrollment.circleId, circleName: enrollment.circleName });
    } else {
      setArchiveRequest({});
    }
    setWithdrawalPeriod("");
    setWithdrawalReason("");
    setWithdrawalNotes("");
  }, [location, profile, archiveRequest]);

  const canEdit = ["leader", "deputy", "track_supervisor"].includes(user?.role ?? "");
  const canNote = ["leader", "deputy", "track_supervisor", "teacher", "supervisor"].includes(user?.role ?? "");

  const profileTrackType: string = (profile?.circle as any)?.trackType ?? "";

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["studentProfile", id] });
  const invalidateGoals = () => queryClient.invalidateQueries({ queryKey: ["studentGoals", id] });
  const invalidateArchiveViews = async (circleId?: number) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["circles"] }),
      queryClient.invalidateQueries({ queryKey: ["circles-all"] }),
      queryClient.invalidateQueries({ queryKey: ["users"] }),
      queryClient.invalidateQueries({ queryKey: ["listStudents"] }),
      ...(circleId ? [
        queryClient.invalidateQueries({ queryKey: ["circle-students", circleId] }),
        queryClient.invalidateQueries({ queryKey: ["circle-students-archived", circleId] }),
      ] : []),
    ]);
  };

  // openNewGoal removed — students create their own goals from my-progress.tsx
  const openEditGoal = (g: { id: number; title: string; targetDate?: string | null; notes?: string | null; motivationalMessage?: string | null }) => {
    setEditingGoalId(g.id);
    setGoalTitle(g.title);
    setGoalDate(g.targetDate ?? "");
    setGoalNotes(g.notes ?? "");
    setGoalMessage(g.motivationalMessage ?? "");
    setGoalFormOpen(true);
  };
  const handleSaveGoal = () => {
    if (editingGoalId === null) return;
    const updateData: UpdateStudentGoalBody = { motivationalMessage: goalMessage.trim() || "" };
    updateGoal.mutate({ id, goalId: editingGoalId, data: updateData }, {
      onSuccess: () => { toast({ title: "تم حفظ الرسالة ✨" }); invalidateGoals(); setGoalFormOpen(false); setGoalMessage(""); setEditingGoalId(null); },
    });
  };
  const handleDeleteGoal = (goalId: number) => {
    if (!confirm("هل تريدين حذف هذا الهدف؟")) return;
    deleteGoal.mutate({ id, goalId }, {
      onSuccess: () => { toast({ title: "تم حذف الهدف" }); invalidateGoals(); },
    });
  };

  const closeMemorizationEditor = () => {
    setMemorizationEditorOpen(false);
    setEditingMemorizationId(null);
    setMemorizationLabel("");
    setMemorizationPages("");
    setMemorizationJuzNumbers([]);
  };

  const openNewMemorization = () => {
    closeMemorizationEditor();
    setMemorizationEditorOpen(true);
  };

  const openEditMemorization = (memorization: StudentMemorization) => {
    setEditingMemorizationId(memorization.id);
    setMemorizationLabel(memorization.label);
    setMemorizationPages(String(memorization.pages));
    setMemorizationJuzNumbers(memorization.juzNumbers ?? []);
    setMemorizationEditorOpen(true);
  };

  const toggleMemorizationJuz = (juz: number) => {
    setMemorizationJuzNumbers(current =>
      current.includes(juz) ? current.filter(item => item !== juz) : [...current, juz].sort((a, b) => a - b),
    );
  };

  const handleSaveMemorization = async () => {
    const pages = Number(memorizationPages);
    if (!memorizationLabel.trim() && memorizationJuzNumbers.length === 0) {
      toast({ title: "أدخلي وصف المحفوظة أو اختاري أجزاءً", variant: "destructive" });
      return;
    }
    if (memorizationJuzNumbers.length === 0 && (!Number.isFinite(pages) || pages < 0 || pages > 604)) {
      toast({ title: "أدخلي رصيد صفحات بين 0 و604", variant: "destructive" });
      return;
    }
    const data: UpsertStudentMemorizationBody = {
      label: memorizationLabel.trim() || undefined,
      juzNumbers: memorizationJuzNumbers.length ? memorizationJuzNumbers : undefined,
      pages: memorizationJuzNumbers.length ? 0 : Math.round(pages * 2) / 2,
    };
    try {
      if (editingMemorizationId !== null) {
        await updateMemorization.mutateAsync({ id, memorizationId: editingMemorizationId, data });
        toast({ title: "تم تحديث المحفوظة" });
      } else {
        await createMemorization.mutateAsync({ id, data });
        toast({ title: "تمت إضافة المحفوظة" });
      }
      closeMemorizationEditor();
      invalidate();
    } catch (error: any) {
      toast({ title: "تعذر حفظ المحفوظة", description: error?.message ?? "تحققي من البيانات", variant: "destructive" });
    }
  };

  const handleDeleteMemorization = async (memorizationId: number) => {
    if (!confirm("هل تريدين حذف هذه المحفوظة؟ لن تتأثر سجلات الإدخال أو الاختبارات.")) return;
    try {
      await deleteMemorization.mutateAsync({ id, memorizationId });
      toast({ title: "تم حذف المحفوظة" });
      invalidate();
    } catch (error: any) {
      toast({ title: "تعذر حذف المحفوظة", description: error?.message ?? "حاولي مرة أخرى", variant: "destructive" });
    }
  };
  const handleToggleGoal = (goalId: number, current: boolean) => {
    updateGoal.mutate({ id, goalId, data: { isCompleted: !current } }, {
      onSuccess: () => invalidateGoals(),
    });
  };

  const handlePrint = () => {
    if (!profile) return;
    const lines = [
      `<h2 style="margin:0 0 8px">${profile.fullName}</h2>`,
      profile.circle ? `<p>الحلقة: ${profile.circle.name} — مسار ${profile.circle.track}</p>` : "",
      profile.phone ? `<p>الجوال: ${profile.phone}</p>` : "",
      profile.country ? `<p>الدولة: ${profile.country}</p>` : "",
      profile.educationLevel ? `<p>المستوى التعليمي: ${profile.educationLevel}</p>` : "",
      profile.memorizeFrom ? `<p>تحفظ من: ${profile.memorizeFrom}</p>` : "",
      `<p>إجمالي الحفظ المعتمد: ${profile.totalMemorizePages} صفحة</p>`,
      `<p>تاريخ الانضمام: ${formatDate(profile.createdAt)}</p>`,
      `<hr/>`,
      `<h3>ملخص الحضور</h3>`,
      `<p>إجمالي الجلسات: ${profile.attendanceSummary.totalSessions}</p>`,
      `<p>مرات الغياب: ${profile.attendanceSummary.totalAbsences}</p>`,
      profile.attendanceSummary.attendanceRate != null
        ? `<p>نسبة الحضور: ${profile.attendanceSummary.attendanceRate}%</p>`
        : "",
      profile.recentAbsences.length > 0
        ? `<p>آخر غيابات: ${profile.recentAbsences.join("، ")}</p>`
        : "",
      profile.notes && profile.notes.length > 0 ? `<hr/><h3>الملاحظات</h3>` : "",
      ...(profile.notes ?? []).map(n => `<p>• ${n.content} (${n.authorName} — ${formatDateShort(n.createdAt)})</p>`),
    ].filter(Boolean).join("\n");

    const w = window.open("", "_blank", "width=800,height=600");
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html lang="ar" dir="rtl">
<head><title>ملف ${profile.fullName}</title>
<style>body{font-family:Arial,sans-serif;padding:24px;font-size:14px;line-height:1.6;color:#111}h2{color:#5b21b6}h3{color:#374151;margin-top:16px}p{margin:4px 0}hr{border:none;border-top:1px solid #e5e7eb;margin:12px 0}</style>
</head><body>${lines}</body></html>`);
    w.document.close();
    w.print();
  };

  const handleArchive = () => {
    setWithdrawalPeriod("");
    setWithdrawalReason("");
    setWithdrawalNotes("");
    setArchiveRequest({});
  };

  const enrollStudentMutation = useEnrollStudent();

  const handleArchiveFromCircle = (circleId: number, circleName: string) => {
    setArchiveRequest({ circleId, circleName });
    setWithdrawalPeriod("");
    setWithdrawalReason("");
    setWithdrawalNotes("");
  };

  const confirmArchiveFromCircle = () => {
    if (!archiveRequest || !withdrawalPeriod || !withdrawalReason.trim()) {
      toast({ title: "اختاري فترة الانسحاب واكتبي السبب", variant: "destructive" });
      return;
    }
    archiveStudent.mutate(
      {
        id,
        data: {
          ...(archiveRequest.circleId ? { circleId: archiveRequest.circleId } : {}),
          withdrawalPeriod,
          withdrawalReason: withdrawalReason.trim(),
          withdrawalNotes: withdrawalNotes.trim() || null,
        },
      },
      {
        onSuccess: async () => {
          toast({ title: "تم الإخراج من الحلقة", description: `تم حفظ بطاقة انسحاب ${profile?.fullName}` });
          await invalidateArchiveViews(archiveRequest.circleId);
          setArchiveRequest(null);
          invalidate();
          const returnTo = new URLSearchParams(location.split("?")[1] ?? "").get("returnTo");
          if (returnTo === "/leader-circles" || returnTo === "/circles") {
            navigate(returnTo);
          }
        },
        onError: (error: any) => toast({
          title: "فشلت عملية الإخراج",
          description: error?.message ?? "تحققي من بيانات الانسحاب",
          variant: "destructive",
        }),
      }
    );
  };

  const handleEnrollInCircle = () => {
    if (!enrollCircleId) return;
    enrollStudentMutation.mutate(
      { id, data: { circleId: parseInt(enrollCircleId) } },
      {
        onSuccess: () => { toast({ title: "تم تسجيل الطالبة في الحلقة الجديدة" }); invalidate(); setEnrollDialogOpen(false); setEnrollCircleId(""); },
        onError: () => toast({ title: "خطأ في التسجيل", variant: "destructive" }),
      }
    );
  };

  const handlePerCircleLeave = (circleId: number) => {
    if (!perCircleLeaveStart || !perCircleLeaveEnd) { toast({ title: "أدخلي تاريخ البداية والنهاية", variant: "destructive" }); return; }
    const token = localStorage.getItem("sana_auth_token");
    fetch(`/api/students/${id}/leave`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ circleId, leaveStart: perCircleLeaveStart, leaveEnd: perCircleLeaveEnd }),
    })
      .then(r => { if (!r.ok) throw new Error(); toast({ title: "تم تسجيل الإجازة" }); invalidate(); setPerCircleLeaveOpen(null); })
      .catch(() => toast({ title: "خطأ في تسجيل الإجازة", variant: "destructive" }));
  };

  const handleClearPerCircleLeave = (circleId: number) => {
    const token = localStorage.getItem("sana_auth_token");
    fetch(`/api/students/${id}/leave`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ circleId, leaveStart: null, leaveEnd: null }),
    })
      .then(r => { if (!r.ok) throw new Error(); toast({ title: "تم إلغاء الإجازة" }); invalidate(); })
      .catch(() => toast({ title: "خطأ في إلغاء الإجازة", variant: "destructive" }));
  };

  const handleRestore = () => {
    restoreStudent.mutate({ id, data: {} }, {
      onSuccess: async () => {
        toast({ title: "تم استرجاع الطالبة" });
        await invalidateArchiveViews();
        invalidate();
      },
    });
  };

  const handleSetLeave = () => {
    if (!leaveStart || !leaveEnd) { toast({ title: "أدخلي تاريخ البداية والنهاية", variant: "destructive" }); return; }
    setLeave.mutate(
      { id, data: { leaveStart, leaveEnd } },
      {
        onSuccess: () => {
          toast({ title: "تم تسجيل الإجازة" });
          setLeaveDialogOpen(false);
          invalidate();
        },
      }
    );
  };

  const handleClearLeave = () => {
    setLeave.mutate(
      { id, data: { leaveStart: null, leaveEnd: null } },
      { onSuccess: () => { toast({ title: "تم إلغاء الإجازة" }); invalidate(); } }
    );
  };

  const handleAddNote = () => {
    if (!noteContent.trim()) return;
    addNote.mutate(
      { id, data: { content: noteContent.trim() } },
      {
        onSuccess: () => {
          toast({ title: "تمت إضافة الملاحظة" });
          setNoteContent("");
          invalidate();
        },
      }
    );
  };

  const handleDeleteNote = (noteId: number) => {
    deleteNote.mutate(
      { id, noteId },
      { onSuccess: () => { toast({ title: "تم حذف الملاحظة" }); invalidate(); } }
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12 text-muted-foreground" dir="rtl">
        جاري التحميل...
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-muted-foreground gap-4" dir="rtl">
        <p>لم يتم العثور على الطالبة</p>
        <Button variant="outline" onClick={() => window.history.back()}>رجوع</Button>
      </div>
    );
  }

  const attendanceRateColor =
    profile.attendanceSummary.attendanceRate == null ? "text-muted-foreground"
    : profile.attendanceSummary.attendanceRate >= 80 ? "text-emerald-600"
    : profile.attendanceSummary.attendanceRate >= 60 ? "text-amber-600"
    : "text-rose-600";

  const onLeave = isOnLeave(profile.leaveStart, profile.leaveEnd);

  return (
    <div className="space-y-5" dir="rtl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => window.history.back()} className="p-2">
          <ArrowRight className="w-4 h-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2 flex-wrap">
            <UserCircle className="w-5 h-5 text-primary shrink-0" />
            {profile.fullName}
          </h1>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {profile.isArchived && <Badge className="bg-gray-100 text-gray-600 text-xs">مؤرشفة</Badge>}
            {onLeave && <Badge className="bg-amber-100 text-amber-700 text-xs">في إجازة حتى {profile.leaveEnd}</Badge>}
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handlePrint}
          className="gap-1.5 text-xs shrink-0"
          title="طباعة ملف الطالبة"
        >
          <Printer className="w-3.5 h-3.5" />
          طباعة
        </Button>
      </div>

      {/* Actions for leader/track_supervisor */}
      {canEdit && (
        <div className="flex flex-wrap gap-2">
          {!profile.isArchived && !onLeave && (
            <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => {
              setLeaveStart(profile.leaveStart ?? "");
              setLeaveEnd(profile.leaveEnd ?? "");
              setLeaveDialogOpen(true);
            }}>
              <Plane className="w-3.5 h-3.5" />
              منح إجازة
            </Button>
          )}
          {onLeave && (
            <Button size="sm" variant="outline" className="gap-1.5 text-xs text-amber-700" onClick={handleClearLeave}>
              <Plane className="w-3.5 h-3.5" />
              إلغاء الإجازة
            </Button>
          )}
          {!profile.isArchived ? (
            <Button size="sm" variant="outline" className="gap-1.5 text-xs text-gray-600" onClick={handleArchive}>
              <Archive className="w-3.5 h-3.5" />
              أرشفة
            </Button>
          ) : user?.role === "leader" ? (
            <Button size="sm" variant="outline" className="gap-1.5 text-xs text-emerald-700" onClick={handleRestore}>
              <RotateCcw className="w-3.5 h-3.5" />
              استرجاع بيانات الطالبة
            </Button>
          ) : null}
        </div>
      )}

      {/* Leave dialog */}
      {leaveDialogOpen && (
        <Card className="border border-amber-200 shadow-sm bg-amber-50/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold text-amber-700 flex items-center gap-2">
              <Plane className="w-4 h-4" /> تسجيل إجازة
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
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
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSetLeave} className="flex-1">تأكيد</Button>
              <Button size="sm" variant="outline" onClick={() => setLeaveDialogOpen(false)} className="flex-1">إلغاء</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Basic Info */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-bold text-muted-foreground">معلومات عامة</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 pt-0">
          {profile.circle && (
            <div className="flex items-start gap-2">
              <BookOpen className="w-4 h-4 text-primary mt-0.5 shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">الحلقة</p>
                <p className="text-sm font-semibold">{profile.circle.name}</p>
                <p className="text-xs text-muted-foreground">{profile.circle.track}</p>
              </div>
            </div>
          )}
          {profile.phone && (
            <div className="flex items-start gap-2">
              <Phone className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">الجوال</p>
                <p className="text-sm font-semibold" dir="ltr">{profile.phone}</p>
              </div>
            </div>
          )}
          {profile.country && (
            <div className="flex items-start gap-2">
              <Globe className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">الدولة</p>
                <p className="text-sm font-semibold">{profile.country}</p>
              </div>
            </div>
          )}
          {profile.educationLevel && (
            <div className="flex items-start gap-2">
              <GraduationCap className="w-4 h-4 text-teal-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">المستوى التعليمي</p>
                <p className="text-sm font-semibold">{profile.educationLevel}</p>
              </div>
            </div>
          )}
          {profile.memorizeFrom && (
            <div className="col-span-2 flex items-start gap-2">
              <BookOpen className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">تحفظ من</p>
                <p className="text-sm font-semibold">{profile.memorizeFrom}</p>
              </div>
            </div>
          )}
          <div className="col-span-2 flex items-start gap-2">
            <Calendar className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">تاريخ الانضمام</p>
              <p className="text-sm font-semibold">{formatDate(profile.createdAt)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Registration Data */}
      {(() => {
        const extraRaw: string | null = (profile as any).extraData ?? null;
        let extra: Record<string, unknown> = {};
        try { if (extraRaw) extra = JSON.parse(extraRaw); } catch { /* ignore */ }

        const email = (extra["__email"] as string | undefined) ?? null;
        const preferredCircle = (extra["__preferredCircleName"] as string | undefined) ?? null;
        const track = (extra["__trackName"] as string | undefined) ?? null;

        // Quran memorization keys
        const QURAN_KEYS = ["المحفوظات", "المسموع", "ما حفظتِ", "المحفوظ", "الأجزاء المحفوظة", "السور المحفوظة"];
        const quranFields = Object.entries(extra).filter(([k]) =>
          (k !== "المحفوظات" || ((profile as any).memorizations ?? []).length === 0) &&
          (QURAN_KEYS.includes(k) || k.includes("حفظ") || k.includes("سورة") || k.includes("جزء") || k.includes("مسموع"))
        );
        const otherFields = Object.entries(extra).filter(([k]) => !k.startsWith("__") && !quranFields.find(([qk]) => qk === k));

        // WhatsApp link from phone
        const waPhone = profile.phone ? profile.phone.replace(/[\s\-\(\)\+]/g, "") : null;
        const waLink = waPhone ? `https://wa.me/${waPhone}` : null;

        const hasAny = email || preferredCircle || track || waLink || (profile as any).ageRange || quranFields.length > 0 || otherFields.length > 0 || (profile as any).memorizeFrom;
        if (!hasAny) return null;

        return (
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold text-muted-foreground flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-primary" />
                بيانات التسجيل
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-3">
              {/* Contact */}
              <div className="space-y-2">
                {email && (
                  <div className="flex items-start gap-2">
                    <Mail className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[11px] text-muted-foreground">البريد الإلكتروني</p>
                      <p className="text-sm font-semibold break-all" dir="ltr">{email}</p>
                    </div>
                  </div>
                )}
                {waLink && (
                  <div className="flex items-start gap-2">
                    <MessageCircle className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-[11px] text-muted-foreground">واتساب</p>
                      <a href={waLink} target="_blank" rel="noopener noreferrer"
                        className="text-sm font-semibold text-emerald-600 hover:underline" dir="ltr">
                        {profile.phone}
                      </a>
                    </div>
                  </div>
                )}
              </div>

              {/* Registration fields */}
              <div className="grid grid-cols-2 gap-2">
                {(profile as any).ageRange && (
                  <div className="bg-muted/40 rounded-lg px-3 py-2">
                    <p className="text-[11px] text-muted-foreground">الفئة العمرية</p>
                    <p className="text-sm font-semibold">{(profile as any).ageRange}</p>
                  </div>
                )}
                {preferredCircle && (
                  <div className="bg-muted/40 rounded-lg px-3 py-2">
                    <p className="text-[11px] text-muted-foreground">الحلقة المفضلة</p>
                    <p className="text-sm font-semibold">{preferredCircle}</p>
                  </div>
                )}
                {track && (
                  <div className="col-span-2 bg-muted/40 rounded-lg px-3 py-2">
                    <p className="text-[11px] text-muted-foreground">المسار المختار</p>
                    <p className="text-sm font-semibold">{track}</p>
                  </div>
                )}
              </div>

              {/* ── Quran Memorization — highlighted section ── */}
              {((profile as any).memorizeFrom || quranFields.length > 0) && (
                <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 space-y-2">
                  <p className="text-xs font-bold text-emerald-800 flex items-center gap-1.5">
                    <span>📖</span> المحفوظات القرآنية
                  </p>
                  {(profile as any).memorizeFrom && (
                    <div className="bg-white rounded-lg px-3 py-2 border border-emerald-100">
                      <p className="text-[11px] text-emerald-600 mb-0.5">تحفظ من</p>
                      <p className="text-sm font-bold text-emerald-900">{(profile as any).memorizeFrom}</p>
                    </div>
                  )}
                  {quranFields.map(([key, val]) => (
                    <div key={key} className="bg-white rounded-lg px-3 py-2 border border-emerald-100">
                      <p className="text-[11px] text-emerald-600 mb-0.5">{key}</p>
                      <p className="text-sm font-bold text-emerald-900 leading-relaxed">{String(val)}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Other answers from registration form */}
              {otherFields.length > 0 && (
                <div className="pt-2 border-t border-border space-y-1.5">
                  <p className="text-[11px] font-semibold text-muted-foreground">إجابات الاستمارة</p>
                  {otherFields.map(([key, val]) => (
                    <div key={key} className="bg-muted/40 rounded-lg px-3 py-2 flex gap-2 flex-wrap">
                      <span className="text-[11px] text-muted-foreground font-medium">{key}:</span>
                      <span className="text-[11px] text-foreground break-all">{String(val)}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })()}

      {/* Historical memorization */}
      {(() => {
        const memorizations: StudentMemorization[] = (profile.memorizations ?? []);
        const isSavingMemorization = createMemorization.isPending || updateMemorization.isPending;
        return (
          <Card className="border-emerald-200 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-emerald-600" />
                  المحفوظات المعتمدة
                </CardTitle>
                {canEdit && !profile.isArchived && (
                  <Button size="sm" className="h-7 px-2 gap-1 text-xs bg-emerald-600 hover:bg-emerald-700" onClick={openNewMemorization}>
                    <Plus className="w-3.5 h-3.5" /> إضافة محفوظة
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                تُضاف هذه المحفوظات إلى نصاب الاختبار دون تغيير سجل الإدخال اليومي.
              </p>
            </CardHeader>
            <CardContent className="pt-0 space-y-2.5">
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2">
                  <p className="text-[11px] text-emerald-700">رصيد المحفوظات</p>
                  <p className="text-base font-bold text-emerald-800">{profile.memorizationCreditPages} صفحة</p>
                </div>
                <div className="rounded-lg bg-teal-50 border border-teal-100 px-3 py-2">
                  <p className="text-[11px] text-teal-700">إجمالي الحفظ المعتمد</p>
                  <p className="text-base font-bold text-teal-800">{profile.totalMemorizePages} صفحة</p>
                </div>
              </div>

              {memorizationEditorOpen && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-bold text-emerald-900">{editingMemorizationId === null ? "إضافة محفوظة" : "تعديل محفوظة"}</p>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={closeMemorizationEditor} disabled={isSavingMemorization}>
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">الوصف</p>
                    <Input value={memorizationLabel} onChange={event => setMemorizationLabel(event.target.value)}
                      placeholder="مثال: حفظ سابق من سورة الملك إلى الناس" className="h-9 text-sm" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1.5">الأجزاء الكاملة (اختياري)</p>
                    <div className="flex flex-wrap gap-1">
                      {Array.from({ length: 30 }, (_, index) => index + 1).map(juz => (
                        <button key={juz} type="button" onClick={() => toggleMemorizationJuz(juz)}
                          className={`w-8 h-7 rounded-md text-[11px] font-semibold border transition-colors ${
                            memorizationJuzNumbers.includes(juz)
                              ? "bg-emerald-600 border-emerald-600 text-white"
                              : "bg-white border-emerald-200 text-emerald-800 hover:border-emerald-500"
                          }`}>
                          {juz}
                        </button>
                      ))}
                    </div>
                    {memorizationJuzNumbers.length > 0 && (
                      <p className="text-[11px] text-emerald-700 mt-1.5">يُحسب الرصيد تلقائيًا من الأجزاء المختارة.</p>
                    )}
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">رصيد الصفحات {memorizationJuzNumbers.length > 0 ? "(يُحسب تلقائيًا)" : ""}</p>
                    <Input type="number" min="0" max="604" step="0.5" value={memorizationPages}
                      disabled={memorizationJuzNumbers.length > 0}
                      onChange={event => setMemorizationPages(event.target.value)}
                      placeholder="مثال: 20" className="h-9 text-sm" />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button size="sm" variant="outline" onClick={closeMemorizationEditor} disabled={isSavingMemorization}>إلغاء</Button>
                    <Button size="sm" className="gap-1 bg-emerald-600 hover:bg-emerald-700" onClick={handleSaveMemorization} disabled={isSavingMemorization}>
                      <Save className="w-3.5 h-3.5" />{isSavingMemorization ? "جاري الحفظ..." : "حفظ"}
                    </Button>
                  </div>
                </div>
              )}

              {memorizations.length === 0 ? (
                <p className="text-sm text-center text-muted-foreground rounded-lg border border-dashed py-4">
                  لا توجد محفوظات معتمدة بعد.
                </p>
              ) : (
                <div className="space-y-2">
                  {memorizations.map(memorization => (
                    <div key={memorization.id} className="rounded-lg border bg-white px-3 py-2.5 flex items-start gap-2">
                      <BookOpen className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold">{memorization.label}</p>
                        <div className="flex flex-wrap gap-x-2 gap-y-1 mt-1 text-[11px] text-muted-foreground">
                          <span>{memorization.pages} صفحة معتمدة</span>
                          {memorization.juzNumbers.length > 0 && <span>الأجزاء: {memorization.juzNumbers.join("، ")}</span>}
                        </div>
                      </div>
                      {canEdit && !profile.isArchived && (
                        <div className="flex shrink-0">
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEditMemorization(memorization)} title="تعديل المحفوظة">
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-rose-600 hover:text-rose-700" onClick={() => handleDeleteMemorization(memorization.id)} title="حذف المحفوظة"
                            disabled={deleteMemorization.isPending}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })()}

      {/* Enrollments (multi-circle) */}
      {(() => {
        const enrollments: Array<{ circleId: number; circleName: string; circleTrack: string; isArchived: boolean; leaveStart?: string | null; leaveEnd?: string | null }> = (profile as any).enrollments ?? [];
        if (enrollments.length === 0) return null;
        const today = getMakkahDay();
        return (
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-bold text-muted-foreground flex items-center gap-2">
                  <Layers className="w-4 h-4" />
                  الحلقات المسجّلة ({enrollments.filter(e => !e.isArchived).length})
                </CardTitle>
                {canEdit && !profile.isArchived && (
                  <Button size="sm" variant="outline" className="gap-1 text-xs h-7 px-2" onClick={() => { setEnrollCircleId(""); setEnrollDialogOpen(true); }}>
                    <PlusCircle className="w-3.5 h-3.5" />
                    تسجيل في حلقة
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-0 space-y-2">
              {enrollments.map(en => {
                const onEnrollLeave = !!(en.leaveStart && en.leaveEnd && en.leaveStart <= today && today <= en.leaveEnd);
                return (
                  <div key={en.circleId} className={`rounded-xl border px-3 py-2.5 ${en.isArchived ? "bg-gray-50 opacity-60" : "bg-white"}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">{en.circleName}</p>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          <span className="text-xs text-muted-foreground">{en.circleTrack}</span>
                          {en.isArchived && <Badge className="bg-gray-100 text-gray-600 text-[10px] py-0 px-1.5">مؤرشفة</Badge>}
                          {onEnrollLeave && <Badge className="bg-amber-100 text-amber-700 text-[10px] py-0 px-1.5">إجازة حتى {en.leaveEnd}</Badge>}
                        </div>
                      </div>
                      {canEdit && !en.isArchived && (
                        <div className="flex gap-1 shrink-0">
                          {onEnrollLeave ? (
                            <button
                              onClick={() => handleClearPerCircleLeave(en.circleId)}
                              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100 text-[11px] font-semibold"
                            >
                              <XCircle className="w-3 h-3" />
                              إلغاء الإجازة
                            </button>
                          ) : (
                            <button
                              onClick={() => { setPerCircleLeaveOpen(en.circleId); setPerCircleLeaveStart(""); setPerCircleLeaveEnd(""); }}
                              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100 text-[11px] font-semibold"
                            >
                              <Plane className="w-3 h-3" />
                              إجازة
                            </button>
                          )}
                          <button
                            onClick={() => handleArchiveFromCircle(en.circleId, en.circleName)}
                            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100 text-[11px] font-semibold"
                          >
                            <Archive className="w-3 h-3" />
                            إخراج
                          </button>
                        </div>
                      )}
                    </div>
                    {perCircleLeaveOpen === en.circleId && (
                      <div className="mt-2 pt-2 border-t border-amber-100">
                        <div className="grid grid-cols-2 gap-2 mb-2">
                          <div>
                            <p className="text-[10px] text-muted-foreground mb-1">البداية</p>
                            <Input type="date" value={perCircleLeaveStart} onChange={e => setPerCircleLeaveStart(e.target.value)} className="h-7 text-xs" />
                          </div>
                          <div>
                            <p className="text-[10px] text-muted-foreground mb-1">النهاية</p>
                            <Input type="date" value={perCircleLeaveEnd} onChange={e => setPerCircleLeaveEnd(e.target.value)} className="h-7 text-xs" />
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" className="flex-1 h-7 text-xs" onClick={() => handlePerCircleLeave(en.circleId)}>تأكيد</Button>
                          <Button size="sm" variant="outline" className="flex-1 h-7 text-xs" onClick={() => setPerCircleLeaveOpen(null)}>إلغاء</Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        );
      })()}

      {/* Enroll in new circle dialog */}
      {enrollDialogOpen && canEdit && (
        <Card className="border border-teal-200 shadow-sm bg-teal-50/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold text-teal-700 flex items-center gap-2">
              <PlusCircle className="w-4 h-4" /> تسجيل في حلقة جديدة
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <select
              value={enrollCircleId}
              onChange={e => setEnrollCircleId(e.target.value)}
              className="w-full border border-input rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">— اختاري الحلقة —</option>
              {(allCircleNames ?? []).map((c: any) => (
                <option key={c.id} value={c.id}>{c.name} ({c.track})</option>
              ))}
            </select>
            <div className="flex gap-2">
              <Button size="sm" className="flex-1" onClick={handleEnrollInCircle} disabled={!enrollCircleId || enrollStudentMutation.isPending}>
                {enrollStudentMutation.isPending ? "جاري التسجيل..." : "تسجيل"}
              </Button>
              <Button size="sm" variant="outline" className="flex-1" onClick={() => setEnrollDialogOpen(false)}>إلغاء</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Review Plan Sections — per girls/fixation circle */}
      {(() => {
        const enrollments: Array<{ circleId: number; circleName: string; circleTrack: string; circleTrackType?: string; isArchived: boolean }> = (profile as any).enrollments ?? [];
        const canCreatePlan = ["leader", "deputy", "track_supervisor", "teacher", "supervisor", "student"].includes(user?.role ?? "");
        const canForceDeletePlan = ["leader", "deputy", "track_supervisor"].includes(user?.role ?? "");
        const planEnrollments = enrollments.filter(en => !en.isArchived && (en.circleTrackType === "girls" || en.circleTrackType === "fixation"));
        if (planEnrollments.length === 0) {
          const primaryTrack = (profile.circle as any)?.trackType ?? "";
          if ((primaryTrack === "girls" || primaryTrack === "fixation") && profile.circle) {
            return (
              <ReviewPlanSection
                studentId={id}
                circleId={(profile.circle as any).id}
                trackType={primaryTrack}
                canCreate={canCreatePlan}
                canForceDelete={canForceDeletePlan}
              />
            );
          }
          return null;
        }
        return planEnrollments.map(en => (
          <ReviewPlanSection
            key={en.circleId}
            studentId={id}
            circleId={en.circleId}
            trackType={en.circleTrackType!}
            canCreate={canCreatePlan}
            canForceDelete={canForceDeletePlan}
          />
        ));
      })()}

      {/* Attendance Summary */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-bold text-muted-foreground">ملخص الحضور</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-muted/50 rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-foreground">{profile.attendanceSummary.totalSessions}</p>
              <p className="text-xs text-muted-foreground mt-0.5">إجمالي الجلسات</p>
            </div>
            <div className="bg-rose-50 rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-rose-600">{profile.attendanceSummary.totalAbsences}</p>
              <p className="text-xs text-muted-foreground mt-0.5">مرات الغياب</p>
            </div>
            <div className="bg-emerald-50 rounded-xl p-3 text-center">
              <p className={`text-2xl font-bold ${attendanceRateColor}`}>
                {profile.attendanceSummary.attendanceRate != null
                  ? `${profile.attendanceSummary.attendanceRate}%`
                  : "—"}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">نسبة الحضور</p>
            </div>
            <div className="bg-orange-50 rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-orange-600">{(profile as any).totalShortcomings ?? 0}</p>
              <p className="text-xs text-muted-foreground mt-0.5">مرات التقصير</p>
            </div>
          </div>
          {profile.recentAbsences.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-semibold text-muted-foreground mb-2">آخر غيابات (30 يوم)</p>
              <div className="flex flex-wrap gap-1.5">
                {profile.recentAbsences.map(date => (
                  <span key={date} className="bg-rose-50 text-rose-600 text-xs font-medium px-2.5 py-1 rounded-lg">
                    {new Date(date).toLocaleDateString("ar-SA", { month: "short", day: "numeric" })}
                  </span>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Attendance Heatmap */}
      {(profile as any).heatmapData && (profile as any).heatmapData.length > 0 && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold text-muted-foreground flex items-center gap-2">
              <Calendar className="w-4 h-4 text-primary" />
              سجل الحضور (6 أشهر)
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <AttendanceHeatmap heatmapData={(profile as any).heatmapData} />
          </CardContent>
        </Card>
      )}

      {/* Monthly Attendance Trend Chart */}
      {profile.monthlyTrend && profile.monthlyTrend.some(m => m.sessions > 0) && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold text-muted-foreground flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" />
              تطور الحضور (6 أشهر)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 pb-3">
            <ResponsiveContainer width="100%" height={140}>
              <AreaChart
                data={profile.monthlyTrend.map(m => ({
                  name: new Date(m.month + "-01").toLocaleDateString("ar-SA", { month: "short" }),
                  rate: m.attendanceRate,
                  sessions: m.sessions,
                  absences: m.absences,
                }))}
                margin={{ top: 8, right: 16, bottom: 0, left: -24 }}
              >
                <defs>
                  <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#7c3aed" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 10 }} />
                <Tooltip
                  formatter={(v: any) => v != null ? [`${v}%`, "نسبة الحضور"] : ["—", "نسبة الحضور"]}
                  contentStyle={{ direction: "rtl", fontFamily: "Arial", fontSize: 12 }}
                />
                <Area
                  type="monotone"
                  dataKey="rate"
                  stroke="#7c3aed"
                  strokeWidth={2}
                  fill="url(#trendGrad)"
                  dot={{ r: 3, fill: "#7c3aed" }}
                  connectNulls
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Achievements & Sessions */}
      {profile.recentRecords && profile.recentRecords.length > 0 && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold text-muted-foreground flex items-center gap-2">
              <ListChecks className="w-4 h-4 text-primary" />
              إنجازات التلاوة
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-3">
            {/* Totals */}
            <div className="grid grid-cols-3 gap-2">
              {profile.totalMemorizePages > 0 && (
                <div className="bg-teal-50 rounded-xl p-2.5 text-center">
                  <p className="text-lg font-bold text-teal-700">{profile.totalMemorizePages}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">صفحات حفظ</p>
                </div>
              )}
              {profile.totalReviewPages > 0 && (
                <div className="bg-blue-50 rounded-xl p-2.5 text-center">
                  <p className="text-lg font-bold text-blue-700">{profile.totalReviewPages}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">صفحات مراجعة</p>
                </div>
              )}
              {profile.totalRecitationPages > 0 && (
                <div className="bg-amber-50 rounded-xl p-2.5 text-center">
                  <p className="text-lg font-bold text-amber-700">{profile.totalRecitationPages}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">صفحات تلاوة</p>
                </div>
              )}
            </div>

            {/* Recent sessions list */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-2">آخر الجلسات</p>
              <div className="space-y-1.5">
                {profile.recentRecords.map(r => (
                  <div
                    key={r.id}
                    className={`rounded-xl px-3 py-2 ${r.isAbsent ? "bg-rose-50/70" : "bg-muted/30"}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground font-medium">
                        {new Date(r.date).toLocaleDateString("ar-SA", { year: "numeric", month: "short", day: "numeric" })}
                      </span>
                      {r.isAbsent ? (
                        <Badge className="text-[10px] bg-rose-100 text-rose-600 border-0 px-1.5">غائبة</Badge>
                      ) : (
                        <div className="flex flex-wrap gap-1 justify-end">
                          {(r.memorizePages ?? 0) > 0 && (
                            <Badge className="text-[10px] bg-teal-100 text-teal-700 border-0 px-1.5">
                              حفظ {r.memorizePages}ص
                              {r.memorizeSurahStart && r.memorizeSurahEnd && (
                                <span className="opacity-70 mr-0.5">· {r.memorizeSurahStart}→{r.memorizeSurahEnd}</span>
                              )}
                            </Badge>
                          )}
                          {(r.reviewNearPages ?? 0) > 0 && (
                            <Badge className="text-[10px] bg-blue-100 text-blue-700 border-0 px-1.5">
                              مراجعة قريبة {r.reviewNearPages}ص
                            </Badge>
                          )}
                          {(r.reviewFarPages ?? 0) > 0 && (
                            <Badge className="text-[10px] bg-sky-100 text-sky-700 border-0 px-1.5">
                              مراجعة بعيدة {r.reviewFarPages}ص
                            </Badge>
                          )}
                          {(r.reviewPages ?? 0) > 0 && (
                            <Badge className="text-[10px] bg-teal-100 text-teal-600 border-0 px-1.5">
                              مراجعة {r.reviewPages}ص
                            </Badge>
                          )}
                          {(r.recitationPages ?? 0) > 0 && (
                            <Badge className="text-[10px] bg-amber-100 text-amber-700 border-0 px-1.5">
                              تلاوة {r.recitationPages}ص
                            </Badge>
                          )}
                          {!(r.memorizePages ?? 0) && !(r.reviewNearPages ?? 0) && !(r.reviewFarPages ?? 0) && !(r.reviewPages ?? 0) && !(r.recitationPages ?? 0) && (
                            <span className="text-[10px] text-muted-foreground">حضرت — بلا تسجيل</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Shortcomings (التقصير) */}
      {(() => {
        const trackType: string = (profile.circle as any)?.trackType ?? "girls";
        const isRecitation = trackType === "recitation";

        function computeProfileShortcoming(r: any): { isShortcoming: boolean; reasons: string[] } {
          if (r.isAbsent) return { isShortcoming: false, reasons: [] };
          if (r.shortcomingOverride === true) return { isShortcoming: true, reasons: ["تقصير يدوي"] };
          if (r.shortcomingOverride === false) return { isShortcoming: false, reasons: [] };
          const res: string[] = [];
          if (!isRecitation) {
            const noReview =
              (r.reviewNearPages ?? 0) === 0 &&
              (r.reviewFarPages ?? 0) === 0 &&
              (r.reviewPages ?? 0) === 0;
            if (noReview) res.push("بلا مراجعة");
          }
          if (r.listenedToReciter === false) res.push("لم تسمع للمقرئ");
          return { isShortcoming: res.length > 0, reasons: res };
        }

        const shortcomingItems = (profile.recentRecords ?? [])
          .map((r: any) => ({ r, ...computeProfileShortcoming(r) }))
          .filter(x => x.isShortcoming);
        const shortcomings = shortcomingItems;
        return (
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold text-muted-foreground flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                التقصير (آخر 20 جلسة)
                {shortcomings.length > 0 && (
                  <Badge className="bg-amber-100 text-amber-700 border-0 text-xs mr-auto">
                    {shortcomings.length} جلسة
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {shortcomings.length === 0 ? (
                <div className="flex items-center gap-2 py-2 text-emerald-600">
                  <span className="text-base">✅</span>
                  <span className="text-sm font-medium">لا تقصير مسجّل</span>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {shortcomings.map(({ r, reasons }: { r: any; reasons: string[] }) => (
                    <div key={r.id} className="rounded-xl px-3 py-2 bg-amber-50/80 border border-amber-100">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="text-xs font-medium text-amber-800">
                          {new Date(r.date).toLocaleDateString("ar-SA", { year: "numeric", month: "short", day: "numeric" })}
                        </span>
                        <div className="flex flex-wrap gap-1">
                          {reasons.map((reason: string) => (
                            <span key={reason} className="text-[10px] bg-amber-200 text-amber-800 rounded-full px-2 py-0.5 font-medium">
                              {reason}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })()}

      {/* Messages from leader */}
      {profile.messages && profile.messages.length > 0 && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold text-muted-foreground flex items-center gap-2">
              <MessageSquare className="w-4 h-4" />
              رسائل القائدة ({profile.messages.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-2">
            {profile.messages.map(msg => (
              <div key={msg.id} className="bg-primary/5 border border-primary/10 rounded-xl p-3">
                <div className="flex items-center justify-between mb-1">
                  <Badge className="text-xs bg-primary/10 text-primary">
                    {msg.targetType === "student" ? "شخصية" : msg.targetType === "circle" ? "للحلقة" : "للمسار"}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{formatDateShort(msg.createdAt)}</span>
                </div>
                <p className="text-sm text-foreground leading-relaxed">{msg.content}</p>
                <p className="text-xs text-muted-foreground mt-1">{msg.senderName}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {archiveRequest && (
        <Card className="border border-rose-200 shadow-sm bg-rose-50/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold text-rose-700 flex items-center gap-2">
              <Archive className="w-4 h-4" /> بطاقة انسحاب الطالبة
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {archiveRequest.circleId && archiveRequest.circleName ? (
                <>الحلقة: <strong>{archiveRequest.circleName}</strong></>
              ) : (
                <>أرشفة الطالبة من جميع الحلقات</>
              )}
            </p>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold">
                فترة الانسحاب <span className="text-destructive">*</span>
              </label>
              <select
                value={withdrawalPeriod}
                onChange={e => setWithdrawalPeriod(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">اختاري فترة الانسحاب</option>
                <option value="بداية الفصل">بداية الفصل</option>
                <option value="أسابيع التسميع">أسابيع التسميع</option>
                <option value="أسبوع المراجعات">أسبوع المراجعات</option>
                <option value="أسبوع الاختبارات">أسبوع الاختبارات</option>
                <option value="تم حذفها">تم حذفها</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold">
                سبب الانسحاب <span className="text-destructive">*</span>
              </label>
              <Input
                value={withdrawalReason}
                onChange={e => setWithdrawalReason(e.target.value)}
                placeholder="اكتبي سبب الانسحاب"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold">ملاحظات إضافية</label>
              <Input
                value={withdrawalNotes}
                onChange={e => setWithdrawalNotes(e.target.value)}
                placeholder="ملاحظات — إن وُجدت"
              />
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={confirmArchiveFromCircle}
                disabled={archiveStudent.isPending}
                className="flex-1 bg-rose-600 hover:bg-rose-700"
              >
                {archiveStudent.isPending ? "جاري الحفظ..." : "تأكيد الإخراج"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setArchiveRequest(null)} className="flex-1">
                إلغاء
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Notes */}
      {canNote && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold text-muted-foreground flex items-center gap-2">
              <StickyNote className="w-4 h-4" />
              الملاحظات ({profile.notes?.length ?? 0})
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-3">
            {/* Add note */}
            <div className="flex gap-2">
              <Input
                value={noteContent}
                onChange={e => setNoteContent(e.target.value)}
                placeholder="أضيفي ملاحظة..."
                className="text-sm flex-1"
                dir="rtl"
                onKeyDown={e => e.key === "Enter" && handleAddNote()}
              />
              <Button size="sm" onClick={handleAddNote} disabled={!noteContent.trim()} className="gap-1">
                <Plus className="w-3.5 h-3.5" />
                إضافة
              </Button>
            </div>

            {/* Notes list */}
            {(profile.notes ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-2">لا توجد ملاحظات بعد</p>
            ) : (
              <div className="space-y-2">
                {(profile.notes ?? []).map(note => (
                  <div key={note.id} className="bg-muted/40 rounded-xl p-3 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm text-foreground">{note.content}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {note.authorName} · {formatDateShort(note.createdAt)}
                      </p>
                    </div>
                    <button
                      onClick={() => handleDeleteNote(note.id)}
                      className="p-1 rounded text-muted-foreground hover:text-rose-600 hover:bg-rose-50 transition-colors shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Goals Section */}
      {canNote && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold text-muted-foreground flex items-center gap-2">
              <Target className="w-4 h-4" />
              أهداف الطالبة
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {goalFormOpen && (
              <div className="bg-teal-50/60 rounded-xl p-3 space-y-2 border border-teal-100">
                <p className="text-xs font-semibold text-teal-700">رسالة تحفيزية للطالبة</p>
                <textarea
                  placeholder="اكتبي رسالة تحفيزية..."
                  value={goalMessage}
                  onChange={e => setGoalMessage(e.target.value)}
                  className="w-full text-sm border rounded-lg px-3 py-2 resize-none h-20 focus:outline-none focus:ring-2 focus:ring-teal-400 bg-white"
                />
                <div className="flex gap-2 justify-end">
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setGoalFormOpen(false); setEditingGoalId(null); setGoalMessage(""); }}>
                    إلغاء
                  </Button>
                  <Button size="sm" className="h-7 text-xs bg-teal-600 hover:bg-teal-700" onClick={handleSaveGoal}
                    disabled={updateGoal.isPending}>
                    حفظ الرسالة
                  </Button>
                </div>
              </div>
            )}
            {(goals.data ?? []).length === 0 ? (
              <p className="text-xs text-center text-muted-foreground py-2">لا توجد أهداف بعد — الطالبة تضيف أهدافها من صفحتها الشخصية</p>
            ) : (
              (goals.data ?? []).map((g: any) => (
                <div key={g.id}
                  className={`rounded-xl p-3 border transition-colors ${g.isCompleted ? "bg-green-50/60 border-green-100" : "bg-muted/20 border-border/30"}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2 flex-1 min-w-0">
                      <button onClick={() => handleToggleGoal(g.id, g.isCompleted)} className="mt-0.5 flex-shrink-0">
                        {g.isCompleted
                          ? <CheckCircle2 className="w-4 h-4 text-green-600" />
                          : <Circle className="w-4 h-4 text-muted-foreground" />}
                      </button>
                      <div className="min-w-0 flex-1">
                        <p className={`text-sm font-medium leading-tight ${g.isCompleted ? "line-through text-muted-foreground" : ""}`}>
                          {g.title}
                        </p>
                        {g.targetDate && (
                          <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {new Date(g.targetDate).toLocaleDateString("ar-SA")}
                          </p>
                        )}
                        {g.notes && (
                          <p className="text-xs text-muted-foreground mt-0.5">{g.notes}</p>
                        )}
                        {g.motivationalMessage && (
                          <p className="text-xs text-teal-700 mt-1.5 italic bg-teal-50 rounded-lg px-2 py-1">✨ {g.motivationalMessage}</p>
                        )}
                      </div>
                    </div>
                    {canEdit && (
                      <button
                        onClick={() => {
                          setEditingGoalId(g.id);
                          setGoalTitle(g.title);
                          setGoalMessage(g.motivationalMessage ?? "");
                          setGoalFormOpen(true);
                        }}
                        className="p-1.5 rounded-lg hover:bg-teal-100 text-teal-500 hover:text-teal-700 transition-colors flex-shrink-0"
                        title="إضافة رسالة تحفيزية"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      )}

      {profile.transfers.length > 0 && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold text-muted-foreground flex items-center gap-2">
              <ArrowLeftRight className="w-4 h-4" />
              سجل التحويلات
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-2">
            {profile.transfers.map(t => (
              <div key={t.id} className="bg-muted/40 rounded-xl px-3 py-2.5">
                <div className="flex items-center justify-between">
                  <div className="text-sm">
                    {t.fromCircle && (
                      <span className="text-muted-foreground">{t.fromCircle} ← </span>
                    )}
                    <span className="font-semibold text-foreground">{t.toCircle}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{formatDate(t.transferredAt)}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">بواسطة: {t.transferredBy}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Leave History */}
      {((profile as any).leaveHistory?.length > 0 || onLeave) && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold text-muted-foreground flex items-center gap-2">
              <PlaneTakeoff className="w-4 h-4" />
              سجل الإجازات
              <span className="text-xs font-normal bg-muted px-1.5 py-0.5 rounded-md">
                {(profile as any).leaveHistory?.length ?? 0} إجازة
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-2">
            {((profile as any).leaveHistory ?? []).map((l: any) => {
              const start = new Date(l.leaveStart);
              const end = new Date(l.leaveEnd);
              const days = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
              const isCancelled = !!l.cancelledAt;
              return (
                <div key={l.id} className={`rounded-xl px-3 py-2.5 border ${isCancelled ? "bg-muted/30 border-border/40" : "bg-amber-50 border-amber-200"}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-0.5 flex-1 min-w-0">
                      <p className="text-sm font-semibold">
                        {new Date(l.leaveStart).toLocaleDateString("ar-SA", { day: "numeric", month: "short", year: "numeric" })}
                        {" – "}
                        {new Date(l.leaveEnd).toLocaleDateString("ar-SA", { day: "numeric", month: "short", year: "numeric" })}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {days} يوم
                        {l.grantedBy && ` · مُنحت بواسطة: ${l.grantedBy}`}
                      </p>
                      {isCancelled && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <XCircle className="w-3 h-3 text-rose-400 shrink-0" />
                          أُلغيت
                          {l.cancelledBy && ` بواسطة ${l.cancelledBy}`}
                          {l.cancelledAt && ` — ${new Date(l.cancelledAt).toLocaleDateString("ar-SA", { day: "numeric", month: "short", year: "numeric" })}`}
                        </p>
                      )}
                    </div>
                    <div>
                      {isCancelled ? (
                        <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">ملغاة</span>
                      ) : (
                        <span className="text-xs text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full font-medium">فعّالة</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            {((profile as any).leaveHistory?.length ?? 0) === 0 && onLeave && (
              <p className="text-xs text-muted-foreground">الإجازة الحالية لم تُسجَّل بعد في السجل</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
