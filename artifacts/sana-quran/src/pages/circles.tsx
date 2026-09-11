import { useState } from "react";
import { useListCircles, useUpdateCircle, useListStudents, useRestoreStudent, useGetCurrentUser, useUpdateStudent, useUpdateUser } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Search, Users, BookOpen, Settings2, X, Check, Clock, UserPlus, ChevronDown, ChevronUp, Archive, RotateCcw, UserCircle, Link2, PlaneTakeoff, XCircle, RefreshCw, Sun, Moon, UserX, MoveRight, Crown, Pencil, ArrowRightLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { StudentArchiveDialog } from "@/components/StudentArchiveDialog";

type LeaveModal = {
  studentId: number;
  studentName: string;
  circleId: number;
  currentLeaveStart?: string | null;
  currentLeaveEnd?: string | null;
};

type RemoveStaffModal = {
  circleId: number;
  circleName: string;
  staffRole: "teacher" | "supervisor";
  staffName: string;
};

function CircleStudentsPanel({ circleId, userRole }: { circleId: number; userRole: string }) {
  const [showArchived, setShowArchived] = useState(false);
  const [leaveModal, setLeaveModal] = useState<LeaveModal | null>(null);
  const [leaveStart, setLeaveStart] = useState("");
  const [leaveEnd, setLeaveEnd] = useState("");
  const [leaveReason, setLeaveReason] = useState("");
  const [leaveSaving, setLeaveSaving] = useState(false);
  const [archiveModal, setArchiveModal] = useState<{ studentId: number; studentName: string } | null>(null);

  const [transferModal, setTransferModal] = useState<{ studentId: number; studentName: string } | null>(null);
  const [transferTargetId, setTransferTargetId] = useState<number | null>(null);
  const [transferSearch, setTransferSearch] = useState("");
  const [transferring, setTransferring] = useState(false);

  const [assignRoleModal, setAssignRoleModal] = useState<{ studentId: number; studentName: string } | null>(null);
  const [lookupEmail, setLookupEmail] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [foundUser, setFoundUser] = useState<{ id: number; name: string; email: string } | null>(null);
  const [lookupError, setLookupError] = useState(false);
  const [newRole, setNewRole] = useState("teacher");
  const [newRoleCircleId, setNewRoleCircleId] = useState<number | null>(null);
  const [assignSaving, setAssignSaving] = useState(false);

  const [inlineLeaveId, setInlineLeaveId] = useState<number | null>(null);
  const [ilStart, setIlStart] = useState("");
  const [ilEnd, setIlEnd] = useState("");
  const [ilReason, setIlReason] = useState("");
  const [ilSaving, setIlSaving] = useState(false);
  const [editingPerson, setEditingPerson] = useState<{ id: number; kind: "student" | "staff" } | null>(null);
  const [personName, setPersonName] = useState("");
  const [personSaving, setPersonSaving] = useState(false);

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();

  const isLeaderOrDeputy = ["leader", "deputy"].includes(userRole);
  const isTrackSupervisor = userRole === "track_supervisor";

  const { data: students, isLoading } = useListStudents({ circleId }, { query: { queryKey: ["circle-students", circleId] } });
  const { data: archivedStudents } = useListStudents({ circleId, isArchived: true }, { query: { queryKey: ["circle-students-archived", circleId] } });
  const { data: allCircles } = useListCircles(undefined, { query: { queryKey: ["circles"] } });
  const sortedStudents = [...(students ?? [])].sort((a, b) =>
    a.fullName.localeCompare(b.fullName, "ar", { sensitivity: "base" }),
  );

  const restoreStudent = useRestoreStudent();
  const updateStudent = useUpdateStudent();
  const updateUser = useUpdateUser();

  const startPersonEdit = (id: number, name: string, kind: "student" | "staff") => {
    setEditingPerson({ id, kind });
    setPersonName(name.trim());
  };

  const cancelPersonEdit = () => {
    setEditingPerson(null);
    setPersonName("");
  };

  const savePersonName = async () => {
    if (!editingPerson) return;
    const trimmedName = personName.trim();
    if (trimmedName.length < 2) {
      toast({ title: "اكتبي الاسم كاملًا", variant: "destructive" });
      return;
    }
    setPersonSaving(true);
    try {
      if (editingPerson.kind === "student") {
        await updateStudent.mutateAsync({ id: editingPerson.id, data: { fullName: trimmedName } });
      } else {
        await updateUser.mutateAsync({ id: editingPerson.id, data: { name: trimmedName } });
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["circle-students", circleId] }),
        queryClient.invalidateQueries({ queryKey: ["circles"] }),
        queryClient.invalidateQueries({ queryKey: ["users"] }),
      ]);
      toast({ title: "تم حفظ الاسم بنجاح" });
      cancelPersonEdit();
    } catch (error: any) {
      toast({ title: error?.message ?? "حدث خطأ أثناء حفظ الاسم", variant: "destructive" });
    } finally {
      setPersonSaving(false);
    }
  };

  const handleArchive = (s: any) => {
    setArchiveModal({ studentId: s.id, studentName: s.fullName });
  };

  const handleRestore = (s: any) => {
    if (!confirm(`هل تريدين استرجاع "${s.fullName}" إلى هذه الحلقة؟`)) return;
    restoreStudent.mutate({ id: s.id, data: { circleId } }, {
      onSuccess: () => {
        toast({ title: `تم استرجاع ${s.fullName} إلى الحلقة` });
        queryClient.invalidateQueries({ queryKey: ["circle-students", circleId] });
        queryClient.invalidateQueries({ queryKey: ["circle-students-archived", circleId] });
        queryClient.invalidateQueries({ queryKey: ["circles"] });
      },
      onError: () => toast({ title: "خطأ في الاسترجاع", variant: "destructive" }),
    });
  };

  const openLeaveModal = (s: any) => {
    setLeaveModal({ studentId: s.id, studentName: s.fullName, circleId, currentLeaveStart: s.leaveStart, currentLeaveEnd: s.leaveEnd });
    setLeaveStart(s.leaveStart ?? "");
    setLeaveEnd(s.leaveEnd ?? "");
    setLeaveReason("");
  };

  const handleGrantLeave = async () => {
    if (!leaveModal) return;
    if (!leaveStart || !leaveEnd) { toast({ title: "أدخلي تاريخ البداية والنهاية", variant: "destructive" }); return; }
    if (leaveEnd < leaveStart) { toast({ title: "تاريخ النهاية يجب أن يكون بعد البداية", variant: "destructive" }); return; }
    setLeaveSaving(true);
    try {
      const token = localStorage.getItem("sana_auth_token");
      const res = await fetch(`/api/students/${leaveModal.studentId}/leave`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ circleId: leaveModal.circleId, leaveStart, leaveEnd, reason: leaveReason || null }),
      });
      if (!res.ok) throw new Error();
      toast({ title: `تم تسجيل إجازة ${leaveModal.studentName}` });
      queryClient.invalidateQueries({ queryKey: ["circle-students", circleId] });
      setLeaveModal(null);
    } catch { toast({ title: "خطأ في تسجيل الإجازة", variant: "destructive" }); }
    finally { setLeaveSaving(false); }
  };

  const handleCancelLeave = async (s: any) => {
    if (!confirm(`هل تريدين إلغاء إجازة "${s.fullName}"؟`)) return;
    try {
      const token = localStorage.getItem("sana_auth_token");
      const res = await fetch(`/api/students/${s.id}/leave`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ circleId, leaveStart: null, leaveEnd: null }),
      });
      if (!res.ok) throw new Error();
      toast({ title: `تم إلغاء إجازة ${s.fullName}` });
      queryClient.invalidateQueries({ queryKey: ["circle-students", circleId] });
    } catch { toast({ title: "خطأ في إلغاء الإجازة", variant: "destructive" }); }
  };

  const handleTransfer = () => {
    if (!transferModal || !transferTargetId) return;
    setTransferring(true);
    updateStudent.mutate({ id: transferModal.studentId, data: { circleId: transferTargetId, fromCircleId: circleId } as any }, {
      onSuccess: () => {
        toast({ title: `تم نقل ${transferModal.studentName} بنجاح` });
        queryClient.invalidateQueries({ queryKey: ["circle-students", circleId] });
        queryClient.invalidateQueries({ queryKey: ["circles"] });
        setTransferModal(null);
      },
      onError: () => toast({ title: "خطأ في النقل", variant: "destructive" }),
      onSettled: () => setTransferring(false),
    });
  };

  const handleLookupUser = async () => {
    if (!lookupEmail.trim()) return;
    setLookupLoading(true); setFoundUser(null); setLookupError(false);
    try {
      const token = localStorage.getItem("sana_auth_token");
      const res = await fetch(`/api/users/by-email?email=${encodeURIComponent(lookupEmail.trim())}`, {
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      if (!res.ok) { setLookupError(true); return; }
      setFoundUser(await res.json());
    } catch { setLookupError(true); }
    finally { setLookupLoading(false); }
  };

  const handleAssignRole = async () => {
    if (!foundUser) return;
    setAssignSaving(true);
    try {
      const token = localStorage.getItem("sana_auth_token");
      const body: any = { role: newRole };
      if (newRoleCircleId) body.circleId = newRoleCircleId;
      const res = await fetch(`/api/users/${foundUser.id}/set-role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
      toast({ title: `تم تحديث دور ${foundUser.name} بنجاح` });
      queryClient.invalidateQueries({ queryKey: ["circles"] });
      setAssignRoleModal(null);
    } catch { toast({ title: "حدث خطأ", variant: "destructive" }); }
    finally { setAssignSaving(false); }
  };

  const handleInlineLeave = async (s: any) => {
    if (!ilStart || !ilEnd) { toast({ title: "أدخلي تاريخ البداية والنهاية", variant: "destructive" }); return; }
    setIlSaving(true);
    try {
      const token = localStorage.getItem("sana_auth_token");
      const res = await fetch(`/api/students/${s.id}/leave`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ circleId, leaveStart: ilStart, leaveEnd: ilEnd, reason: ilReason || null }),
      });
      if (!res.ok) throw new Error();
      toast({ title: `تم تسجيل إجازة ${s.fullName}` });
      queryClient.invalidateQueries({ queryKey: ["circle-students", circleId] });
      setInlineLeaveId(null); setIlStart(""); setIlEnd(""); setIlReason("");
    } catch { toast({ title: "خطأ في تسجيل الإجازة", variant: "destructive" }); }
    finally { setIlSaving(false); }
  };

  if (isLoading) return <p className="text-xs text-muted-foreground py-3 text-center">جاري التحميل...</p>;

  const today = new Date().toISOString().slice(0, 10);
  const roleOptions = [
    { value: "teacher", label: "معلمة" },
    { value: "supervisor", label: "مشرفة" },
    { value: "track_supervisor", label: "مسؤولة مسار" },
    { value: "data_entry", label: "مدخلة بيانات" },
  ];

  return (
    <div className="mt-3 pt-3 border-t border-border/50 space-y-2" dir="rtl">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-muted-foreground">الطالبات ({students?.length ?? 0})</p>
        {(archivedStudents?.length ?? 0) > 0 && (
          <button onClick={() => setShowArchived(v => !v)} className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
            <Archive className="w-3 h-3" />المؤرشفات ({archivedStudents?.length})
          </button>
        )}
      </div>

      {(!students || students.length === 0) && <p className="text-xs text-muted-foreground text-center py-2">لا توجد طالبات</p>}

      {sortedStudents.map(s => {
        const sAny = s as any;
        const onLeave = !!(sAny.leaveStart && sAny.leaveEnd && sAny.leaveStart <= today && today <= sAny.leaveEnd);
        const isInlineOpen = inlineLeaveId === s.id;
        return (
          <div key={s.id}>
            <div className={`flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 ${onLeave ? "bg-blue-50 border border-blue-200" : "bg-muted/30"}`}>
              <div className="flex items-center gap-1.5 flex-1 min-w-0">
                {isTrackSupervisor && editingPerson?.kind === "student" && editingPerson.id === s.id ? (
                  <div className="flex items-center gap-1 flex-1 min-w-0">
                    <Input
                      value={personName}
                      onChange={e => setPersonName(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter") void savePersonName();
                        if (e.key === "Escape") cancelPersonEdit();
                      }}
                      className="h-7 text-xs text-right"
                      autoFocus
                    />
                    <button onClick={() => void savePersonName()} disabled={personSaving} className="p-1 rounded bg-emerald-50 text-emerald-600 hover:bg-emerald-100 disabled:opacity-50" title="حفظ الاسم">
                      <Check className="w-3 h-3" />
                    </button>
                    <button onClick={cancelPersonEdit} disabled={personSaving} className="p-1 rounded bg-muted text-muted-foreground hover:bg-muted/80 disabled:opacity-50" title="إلغاء">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <>
                    <span className="text-xs font-medium truncate">{s.fullName}</span>
                    {isTrackSupervisor && (
                      <button
                        onClick={() => startPersonEdit(s.id, s.fullName, "student")}
                        className="p-1 rounded text-muted-foreground/50 hover:text-primary hover:bg-primary/10 transition-colors shrink-0"
                        title="تعديل اسم الطالبة"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                    )}
                  </>
                )}
                {onLeave && <span className="text-[10px] bg-blue-100 text-blue-700 border border-blue-200 rounded-full px-1.5 py-0.5 shrink-0">إجازة</span>}
              </div>
              <div className="flex gap-1 flex-shrink-0">
                <button onClick={() => navigate(`/students/${s.id}`)} className="p-1 rounded bg-teal-50 text-teal-600 hover:bg-teal-100 transition-colors" title="ملف الطالبة">
                  <UserCircle className="w-3 h-3" />
                </button>
                {isLeaderOrDeputy && (
                  <>
                    {onLeave
                      ? <button onClick={() => handleCancelLeave(sAny)} className="p-1 rounded bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors" title="إلغاء الإجازة"><XCircle className="w-3 h-3" /></button>
                      : <button onClick={() => openLeaveModal(sAny)} className="p-1 rounded bg-amber-50 text-amber-600 hover:bg-amber-100 transition-colors" title="إجازة"><PlaneTakeoff className="w-3 h-3" /></button>
                    }
                    <button onClick={() => { setTransferModal({ studentId: s.id, studentName: s.fullName }); setTransferTargetId(null); setTransferSearch(""); }} className="p-1 rounded bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors" title="نقل"><MoveRight className="w-3 h-3" /></button>
                    {["leader", "deputy", "track_supervisor", "data_entry"].includes(userRole) && <button onClick={() => handleArchive(sAny)} className="p-1 rounded bg-rose-50 text-rose-500 hover:bg-rose-100 transition-colors" title="أرشفة مباشرة"><Archive className="w-3 h-3" /></button>}
                    <button onClick={() => { setAssignRoleModal({ studentId: s.id, studentName: s.fullName }); setLookupEmail(""); setFoundUser(null); setLookupError(false); setNewRole("teacher"); setNewRoleCircleId(circleId); }} className="p-1 rounded bg-purple-50 text-purple-600 hover:bg-purple-100 transition-colors" title="إعطاء دور"><Crown className="w-3 h-3" /></button>
                  </>
                )}
                {isTrackSupervisor && (
                  <>
                    <button
                      onClick={() => { if (isInlineOpen) { setInlineLeaveId(null); return; } setInlineLeaveId(s.id); setIlStart(sAny.leaveStart ?? ""); setIlEnd(sAny.leaveEnd ?? ""); setIlReason(""); }}
                      className={`p-1 rounded transition-colors ${isInlineOpen ? "bg-amber-100 text-amber-700" : "bg-amber-50 text-amber-600 hover:bg-amber-100"}`}
                      title="إجازة"
                    ><PlaneTakeoff className="w-3 h-3" /></button>
                    {["leader", "deputy", "track_supervisor", "data_entry"].includes(userRole) && <button onClick={() => handleArchive(sAny)} className="p-1 rounded bg-rose-50 text-rose-500 hover:bg-rose-100 transition-colors" title="أرشفة مباشرة"><Archive className="w-3 h-3" /></button>}
                  </>
                )}
                {userRole === "data_entry" && (
                  <button onClick={() => handleArchive(sAny)} className="p-1 rounded bg-rose-50 text-rose-500 hover:bg-rose-100 transition-colors" title="أرشفة مباشرة"><Archive className="w-3 h-3" /></button>
                )}
              </div>
            </div>
            {isTrackSupervisor && isInlineOpen && (
              <div className="mx-1 mt-1 mb-1 p-2.5 bg-amber-50 border border-amber-200 rounded-lg space-y-2">
                <p className="text-[10px] font-semibold text-amber-700">إجازة: {s.fullName}</p>
                <div className="grid grid-cols-2 gap-2">
                  <div><p className="text-[10px] text-muted-foreground mb-0.5">من</p><input type="date" value={ilStart} onChange={e => setIlStart(e.target.value)} className="h-7 text-xs border border-input rounded px-2 w-full bg-white" /></div>
                  <div><p className="text-[10px] text-muted-foreground mb-0.5">إلى</p><input type="date" value={ilEnd} onChange={e => setIlEnd(e.target.value)} className="h-7 text-xs border border-input rounded px-2 w-full bg-white" /></div>
                </div>
                <input type="text" value={ilReason} onChange={e => setIlReason(e.target.value)} placeholder="السبب (اختياري)" className="h-7 text-xs border border-input rounded px-2 w-full bg-white" />
                <div className="flex gap-1.5">
                  <button onClick={() => handleInlineLeave(sAny)} disabled={ilSaving || !ilStart || !ilEnd} className="flex-1 h-6 text-[10px] font-semibold bg-amber-500 text-white rounded hover:bg-amber-600 disabled:opacity-50 transition-colors">{ilSaving ? "..." : "حفظ"}</button>
                  <button onClick={() => setInlineLeaveId(null)} className="flex-1 h-6 text-[10px] border border-border rounded hover:bg-muted transition-colors">إلغاء</button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {showArchived && archivedStudents && archivedStudents.length > 0 && (
        <div className="border-t border-dashed border-border/50 pt-2 space-y-1.5">
          <p className="text-[10px] text-muted-foreground font-medium">المؤرشفات</p>
          {archivedStudents.map(s => (
            <div key={s.id} className="flex items-center justify-between gap-2 bg-gray-50 rounded-lg px-2.5 py-1.5 opacity-70">
              <span className="text-xs text-muted-foreground truncate flex-1">{s.fullName}</span>
              <button onClick={() => handleRestore(s)} className="p-1 rounded bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors" title="استرجاع للحلقة"><RotateCcw className="w-3 h-3" /></button>
            </div>
          ))}
        </div>
      )}

      {archiveModal && (
        <StudentArchiveDialog
          studentId={archiveModal.studentId}
          studentName={archiveModal.studentName}
          circleId={circleId}
          onClose={() => setArchiveModal(null)}
          onSuccess={async () => {
            setArchiveModal(null);
            await Promise.all([
              queryClient.invalidateQueries({ queryKey: ["circle-students", circleId] }),
              queryClient.invalidateQueries({ queryKey: ["circle-students-archived", circleId] }),
              queryClient.invalidateQueries({ queryKey: ["circles"] }),
              queryClient.invalidateQueries({ queryKey: ["users"] }),
            ]);
          }}
        />
      )}

      {/* Leave Modal */}
      {leaveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" dir="rtl">
          <div className="bg-white rounded-2xl shadow-xl p-5 w-full max-w-sm mx-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base flex items-center gap-2"><PlaneTakeoff className="w-4 h-4 text-amber-500" />منح إجازة</h3>
              <button onClick={() => setLeaveModal(null)} className="p-1 rounded hover:bg-muted"><X className="w-4 h-4 text-muted-foreground" /></button>
            </div>
            <p className="text-sm text-muted-foreground">الطالبة: <span className="font-semibold text-foreground">{leaveModal.studentName}</span></p>
            <div className="space-y-3">
              <div className="space-y-1"><Label className="text-xs font-semibold">تاريخ البداية</Label><input type="date" value={leaveStart} onChange={e => setLeaveStart(e.target.value)} className="h-9 text-sm border border-input rounded-md px-3 w-full bg-background" /></div>
              <div className="space-y-1"><Label className="text-xs font-semibold">تاريخ النهاية</Label><input type="date" value={leaveEnd} onChange={e => setLeaveEnd(e.target.value)} className="h-9 text-sm border border-input rounded-md px-3 w-full bg-background" /></div>
              <div className="space-y-1"><Label className="text-xs font-semibold">السبب (اختياري)</Label><input type="text" value={leaveReason} onChange={e => setLeaveReason(e.target.value)} placeholder="مثال: سفر، مرض..." className="h-9 text-sm border border-input rounded-md px-3 w-full bg-background" /></div>
            </div>
            <div className="flex gap-2 pt-1">
              <Button onClick={handleGrantLeave} disabled={leaveSaving || !leaveStart || !leaveEnd} className="flex-1 text-sm">{leaveSaving ? "جاري الحفظ..." : "تسجيل الإجازة"}</Button>
              <Button variant="outline" onClick={() => setLeaveModal(null)} className="flex-1 text-sm">إلغاء</Button>
            </div>
          </div>
        </div>
      )}

      {/* Transfer Modal */}
      {transferModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" dir="rtl">
          <div className="bg-white rounded-2xl shadow-xl p-5 w-full max-w-sm mx-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base flex items-center gap-2"><MoveRight className="w-4 h-4 text-indigo-500" />نقل الطالبة</h3>
              <button onClick={() => setTransferModal(null)} className="p-1 rounded hover:bg-muted"><X className="w-4 h-4 text-muted-foreground" /></button>
            </div>
            <p className="text-sm text-muted-foreground">الطالبة: <span className="font-semibold text-foreground">{transferModal.studentName}</span></p>
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">اختاري الحلقة المستهدفة:</p>
              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <input type="text" value={transferSearch} onChange={e => setTransferSearch(e.target.value)} placeholder="بحث بالاسم..." className="h-8 text-xs border border-input rounded-md px-3 pe-9 w-full bg-background text-right" />
              </div>
              <div className="max-h-44 overflow-y-auto space-y-1 border border-border rounded-lg p-1.5">
                {(allCircles ?? []).filter(c => c.id !== circleId && (!transferSearch || c.name.includes(transferSearch))).map(c => (
                  <button key={c.id} onClick={() => setTransferTargetId(c.id)} className={`w-full text-right text-xs px-2.5 py-1.5 rounded-lg transition-colors ${transferTargetId === c.id ? "bg-indigo-100 text-indigo-700 font-semibold" : "hover:bg-muted text-foreground"}`}>
                    {c.name}{(c as any).track && <span className="text-muted-foreground mr-1">— {(c as any).track}</span>}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <Button onClick={handleTransfer} disabled={transferring || !transferTargetId} className="flex-1 text-sm bg-indigo-600 hover:bg-indigo-700">{transferring ? "جاري النقل..." : "نقل"}</Button>
              <Button variant="outline" onClick={() => setTransferModal(null)} className="flex-1 text-sm">إلغاء</Button>
            </div>
          </div>
        </div>
      )}

      {/* Assign Role Modal */}
      {assignRoleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" dir="rtl">
          <div className="bg-white rounded-2xl shadow-xl p-5 w-full max-w-sm mx-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base flex items-center gap-2"><Crown className="w-4 h-4 text-purple-500" />إعطاء دور</h3>
              <button onClick={() => setAssignRoleModal(null)} className="p-1 rounded hover:bg-muted"><X className="w-4 h-4 text-muted-foreground" /></button>
            </div>
            <p className="text-sm text-muted-foreground">الطالبة: <span className="font-semibold text-foreground">{assignRoleModal.studentName}</span></p>
            {!foundUser ? (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">أدخلي البريد الإلكتروني لحسابها:</p>
                <div className="flex gap-2">
                  <input type="email" value={lookupEmail} onChange={e => setLookupEmail(e.target.value)} onKeyDown={e => e.key === "Enter" && handleLookupUser()} placeholder="example@email.com" className="flex-1 h-9 text-sm border border-input rounded-md px-3 bg-background text-left" dir="ltr" autoComplete="off" />
                  <Button size="sm" onClick={handleLookupUser} disabled={lookupLoading || !lookupEmail.trim()}>{lookupLoading ? "..." : "بحث"}</Button>
                </div>
                {lookupError && <p className="text-xs text-rose-500">لم يُعثر على حساب بهذا البريد</p>}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 flex items-center justify-between">
                  <div><p className="text-xs font-semibold text-emerald-700">{foundUser.name}</p><p className="text-[10px] text-emerald-600" dir="ltr">{foundUser.email}</p></div>
                  <button onClick={() => { setFoundUser(null); setLookupEmail(""); setLookupError(false); }} className="text-[10px] text-muted-foreground hover:text-foreground">تغيير</button>
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground">الدور الجديد:</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {roleOptions.map(opt => (
                      <button key={opt.value} onClick={() => setNewRole(opt.value)} className={`py-1.5 px-3 rounded-lg border text-xs font-semibold transition-all ${newRole === opt.value ? "border-purple-400 bg-purple-50 text-purple-700" : "border-border text-muted-foreground hover:bg-muted/50"}`}>{opt.label}</button>
                    ))}
                  </div>
                </div>
                {["teacher", "supervisor"].includes(newRole) && (
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-muted-foreground">الحلقة (اختياري):</p>
                    <select value={newRoleCircleId ?? ""} onChange={e => setNewRoleCircleId(e.target.value ? parseInt(e.target.value) : null)} className="h-8 text-xs border border-input rounded-md px-2 w-full bg-background">
                      <option value="">-- بدون حلقة --</option>
                      {(allCircles ?? []).map(c => <option key={c.id} value={c.id}>{c.name}{(c as any).track ? ` — ${(c as any).track}` : ""}</option>)}
                    </select>
                  </div>
                )}
              </div>
            )}
            <div className="flex gap-2 pt-1">
              {foundUser && <Button onClick={handleAssignRole} disabled={assignSaving} className="flex-1 text-sm bg-purple-600 hover:bg-purple-700">{assignSaving ? "جاري الحفظ..." : "حفظ الدور"}</Button>}
              <Button variant="outline" onClick={() => setAssignRoleModal(null)} className="flex-1 text-sm">إلغاء</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const TRACK_COLORS: Record<string, string> = {
  "البهور": "bg-fuchsia-100 text-fuchsia-700",
  "إشراق": "bg-blue-100 text-blue-700",
  "قبس": "bg-pink-100 text-pink-700",
  "ضياء": "bg-amber-100 text-amber-700",
  "وهج": "bg-rose-100 text-rose-700",
  "سراج": "bg-emerald-100 text-emerald-700",
  "ألق": "bg-cyan-100 text-cyan-700",
  "مهج": "bg-orange-100 text-orange-700",
  "مشكاة نور": "bg-sky-100 text-sky-700",
};

export default function CirclesPage() {
  const { data: circles, isLoading, refetch } = useListCircles(undefined, { query: { queryKey: ["circles"] } });
  const { data: currentUser } = useGetCurrentUser({ query: { queryKey: ["getCurrentUser"] } });
  const updateCircle = useUpdateCircle();
  const updateUser = useUpdateUser();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [selectedTrack, setSelectedTrack] = useState<string>("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editData, setEditData] = useState({ name: "", track: "", meetingTime: "", period: "am" as "am" | "pm", newStudentCapacity: "", whatsappLink: "" });
  const [saving, setSaving] = useState(false);
  const [editingCircleNameId, setEditingCircleNameId] = useState<number | null>(null);
  const [circleNameDraft, setCircleNameDraft] = useState("");
  const [circleNameSaving, setCircleNameSaving] = useState(false);
  const [editingStaff, setEditingStaff] = useState<number | null>(null);
  const [staffName, setStaffName] = useState("");
  const [staffSaving, setStaffSaving] = useState(false);
  const [expandedCircle, setExpandedCircle] = useState<number | null>(null);
  const [seeding, setSeeding] = useState(false);

  const [removeStaffModal, setRemoveStaffModal] = useState<RemoveStaffModal | null>(null);
  const [removeAction, setRemoveAction] = useState<"archive" | "transfer">("archive");
  const [targetCircleId, setTargetCircleId] = useState<number | null>(null);
  const [transferSearch, setTransferSearch] = useState("");
  const [removing, setRemoving] = useState(false);

  const isLeader = currentUser?.role === "leader";
  const canEdit = currentUser?.role === "leader" || currentUser?.role === "track_supervisor";
  const canGrantLeave = ["leader", "deputy", "track_supervisor"].includes(currentUser?.role ?? "");
  const canManageStaff = ["leader", "deputy", "track_supervisor"].includes(currentUser?.role ?? "");

  const startStaffEdit = (userId: number, name: string) => {
    setEditingStaff(userId);
    setStaffName(name.trim());
  };

  const startCircleNameEdit = (circleId: number, name: string) => {
    setEditingCircleNameId(circleId);
    setCircleNameDraft(name.trim());
  };

  const cancelCircleNameEdit = () => {
    setEditingCircleNameId(null);
    setCircleNameDraft("");
  };

  const saveCircleName = async () => {
    if (!editingCircleNameId) return;
    const trimmedName = circleNameDraft.trim();
    if (trimmedName.length < 2) {
      toast({ title: "اكتبي اسم الحلقة", variant: "destructive" });
      return;
    }
    setCircleNameSaving(true);
    try {
      await updateCircle.mutateAsync({ id: editingCircleNameId, data: { name: trimmedName } });
      await refetch();
      toast({ title: "تم حفظ اسم الحلقة" });
      cancelCircleNameEdit();
    } catch (error: any) {
      toast({ title: error?.message ?? "تعذر حفظ اسم الحلقة", variant: "destructive" });
    } finally {
      setCircleNameSaving(false);
    }
  };

  const cancelStaffEdit = () => {
    setEditingStaff(null);
    setStaffName("");
  };

  const saveStaffName = async () => {
    if (!editingStaff) return;
    const trimmedName = staffName.trim();
    if (trimmedName.length < 2) {
      toast({ title: "اكتبي الاسم كاملًا", variant: "destructive" });
      return;
    }
    setStaffSaving(true);
    try {
      await updateUser.mutateAsync({ id: editingStaff, data: { name: trimmedName } });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["circles"] }),
        queryClient.invalidateQueries({ queryKey: ["users"] }),
      ]);
      toast({ title: "تم حفظ الاسم بنجاح" });
      cancelStaffEdit();
    } catch (error: any) {
      toast({ title: error?.message ?? "حدث خطأ أثناء حفظ الاسم", variant: "destructive" });
    } finally {
      setStaffSaving(false);
    }
  };

  const openRemoveStaffModal = (circle: (typeof filtered)[0], staffRole: "teacher" | "supervisor", staffName: string) => {
    setRemoveStaffModal({ circleId: circle.id, circleName: circle.name, staffRole, staffName });
    setRemoveAction("archive");
    setTargetCircleId(null);
    setTransferSearch("");
  };

  const handleRemoveStaff = async () => {
    if (!removeStaffModal) return;
    if (removeAction === "transfer" && !targetCircleId) {
      toast({ title: "اختاري الحلقة المستهدفة أولاً", variant: "destructive" });
      return;
    }
    setRemoving(true);
    try {
      const token = localStorage.getItem("sana_auth_token");
      const res = await fetch(`/api/circles/${removeStaffModal.circleId}/remove-staff`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          staffRole: removeStaffModal.staffRole,
          action: removeAction,
          targetCircleId: removeAction === "transfer" ? targetCircleId : undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).error ?? "خطأ");
      }
      toast({
        title: removeAction === "archive"
          ? `تم أرشفة ${removeStaffModal.staffName} وإزالتها من الحلقة`
          : `تم نقل ${removeStaffModal.staffName} للحلقة الجديدة`,
      });
      refetch();
      setRemoveStaffModal(null);
    } catch (e: any) {
      toast({ title: e.message ?? "حدث خطأ", variant: "destructive" });
    } finally {
      setRemoving(false);
    }
  };

  const handleSeedTracks = async () => {
    if (!confirm("سيتم إنشاء ١٠ حلقات لكل مسار (١١ مسار = ١١٠ حلقة) إذا لم تكن موجودة. هل تريدين المتابعة؟")) return;
    setSeeding(true);
    try {
      const token = localStorage.getItem("sana_auth_token");
      const res = await fetch("/api/circles/seed-tracks", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast({ title: data.message });
      refetch();
    } catch (e: any) {
      toast({ title: e.message ?? "خطأ في المزامنة", variant: "destructive" });
    } finally {
      setSeeding(false);
    }
  };

  const _trackSet = new Set<string>();
  (circles ?? []).forEach((c: any) => { if (typeof c.track === "string" && c.track) _trackSet.add(c.track); });
  const tracks: string[] = Array.from(_trackSet).sort();

  const filtered = circles?.filter(c => {
    const matchSearch = !search || c.name.includes(search) || (c as { teacherName?: string }).teacherName?.includes(search);
    const matchTrack = !selectedTrack || c.track === selectedTrack;
    return matchSearch && matchTrack;
  }) ?? [];

  const grouped: Record<string, typeof filtered> = {};
  filtered.forEach(c => {
    const t = c.track ?? "غير محدد";
    if (!grouped[t]) grouped[t] = [];
    grouped[t].push(c);
  });

  const startEdit = (circle: (typeof filtered)[0]) => {
    setEditingId(circle.id);
    const c = circle as { meetingTime?: string | null; newStudentCapacity?: number | null; whatsappLink?: string | null };
    const mt = c.meetingTime ?? "";
    const h = mt ? parseInt(mt.split(":")[0]) : 0;
    const period: "am" | "pm" = h >= 12 ? "pm" : "am";
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    setEditData({
      name: circle.name ?? "",
      track: (circle as any).track ?? "",
      meetingTime: mt ? `${String(h12).padStart(2,"0")}:${mt.split(":")[1]}` : "",
      period,
      newStudentCapacity: c.newStudentCapacity?.toString() ?? "",
      whatsappLink: c.whatsappLink ?? "",
    });
  };

  const saveEdit = async (circleId: number) => {
    setSaving(true);
    try {
      let time = editData.meetingTime;
      if (time) {
        const [hh] = time.split(":").map(Number);
        if (editData.period === "pm" && hh < 12) time = `${hh + 12}:${time.split(":")[1]}`;
        if (editData.period === "am" && hh === 12) time = `00:${time.split(":")[1]}`;
      }
      await updateCircle.mutateAsync({
        id: circleId,
        data: {
          name: editData.name || undefined,
          track: editData.track || undefined,
          meetingTime: time || null,
          newStudentCapacity: editData.newStudentCapacity ? Number(editData.newStudentCapacity) : null,
          whatsappLink: editData.whatsappLink || null,
        },
      });
      await refetch();
      setEditingId(null);
      toast({ title: "تم الحفظ بنجاح" });
    } catch {
      toast({ title: "حدث خطأ أثناء الحفظ", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">الحلقات</h1>
          <p className="text-muted-foreground text-sm mt-1">جميع حلقات المقرأة — يمكن ضبط وقت الاجتماع والسعة لكل حلقة عبر زر الإعدادات</p>
        </div>
        {isLeader && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleSeedTracks}
            disabled={seeding}
            className="flex items-center gap-2 text-sm"
          >
            <RefreshCw className={`w-4 h-4 ${seeding ? "animate-spin" : ""}`} />
            {seeding ? "جاري المزامنة..." : "مزامنة الحلقات"}
          </Button>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="بحث بالاسم أو المعلمة..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="ps-3 pe-10 text-right"
            data-testid="input-search-circles"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setSelectedTrack("")}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${!selectedTrack ? "bg-primary text-white" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
          >
            الكل
          </button>
          {tracks.map((t: string) => (
            <button
              key={t}
              onClick={() => setSelectedTrack(t)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${selectedTrack === t ? "bg-primary text-white" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
              data-testid={`filter-track-${t}`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">جاري التحميل...</div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([track, trackCircles]) => (
            <div key={track}>
              <h2 className="text-base font-bold text-foreground mb-3 flex items-center gap-2">
                <Badge className={`text-sm px-3 py-1 ${TRACK_COLORS[track] ?? "bg-gray-100 text-gray-700"}`}>
                  مسار {track}
                </Badge>
                <span className="text-muted-foreground font-normal text-sm">({trackCircles.length} حلقات)</span>
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {trackCircles.map(circle => {
                  const c = circle as typeof circle & { meetingTime?: string | null; newStudentCapacity?: number | null; teacherName?: string; teacherId?: number | null; supervisorId?: number | null; studentCount?: number; location?: string; description?: string };
                  const isEditing = editingId === circle.id;
                  const isEditingCircleName = editingCircleNameId === circle.id;
                  const editingTeacher = editingStaff === c.teacherId;
                  const editingSupervisor = editingStaff === c.supervisorId;

                  return (
                    <Card key={circle.id} className="border border-border/50 shadow-sm hover:shadow-md transition-all" data-testid={`card-circle-${circle.id}`}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            {isEditingCircleName ? (
                              <div className="flex items-center gap-1">
                                <Input
                                  value={circleNameDraft}
                                  onChange={e => setCircleNameDraft(e.target.value)}
                                  onKeyDown={e => {
                                    if (e.key === "Enter") void saveCircleName();
                                    if (e.key === "Escape") cancelCircleNameEdit();
                                  }}
                                  className="h-8 text-sm font-bold text-right"
                                  autoFocus
                                />
                                <button onClick={() => void saveCircleName()} disabled={circleNameSaving} className="p-1 rounded bg-emerald-50 text-emerald-600 hover:bg-emerald-100 disabled:opacity-50" title="حفظ اسم الحلقة"><Check className="w-3.5 h-3.5" /></button>
                                <button onClick={cancelCircleNameEdit} disabled={circleNameSaving} className="p-1 rounded bg-muted text-muted-foreground hover:bg-muted/80 disabled:opacity-50" title="إلغاء"><X className="w-3.5 h-3.5" /></button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1">
                                <h3 className="font-bold text-base text-foreground">{circle.name}</h3>
                                {canEdit && (
                                  <button onClick={() => startCircleNameEdit(circle.id, circle.name)} className="p-1 rounded text-muted-foreground/50 hover:text-primary hover:bg-primary/10 transition-colors" title="تعديل اسم الحلقة">
                                    <Pencil className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                            )}
                            {c.teacherName && (
                              <div className="flex items-center gap-1 mt-0.5">
                                {editingTeacher ? (
                                  <div className="flex items-center gap-1 flex-1">
                                    <Input value={staffName} onChange={e => setStaffName(e.target.value)} onKeyDown={e => { if (e.key === "Enter") void saveStaffName(); if (e.key === "Escape") cancelStaffEdit(); }} className="h-7 text-xs text-right" autoFocus />
                                    <button onClick={() => void saveStaffName()} disabled={staffSaving} className="p-1 rounded bg-emerald-50 text-emerald-600 hover:bg-emerald-100 disabled:opacity-50" title="حفظ الاسم"><Check className="w-3 h-3" /></button>
                                    <button onClick={cancelStaffEdit} disabled={staffSaving} className="p-1 rounded bg-muted text-muted-foreground hover:bg-muted/80 disabled:opacity-50" title="إلغاء"><X className="w-3 h-3" /></button>
                                  </div>
                                ) : (
                                  <p className="text-xs text-muted-foreground flex-1">معلمة: {c.teacherName}</p>
                                )}
                                {canEdit && c.teacherId && !editingTeacher && (
                                  <button onClick={() => startStaffEdit(c.teacherId!, c.teacherName!)} className="p-0.5 rounded text-muted-foreground/50 hover:text-primary hover:bg-primary/10 transition-colors" title="تعديل اسم المعلمة"><Pencil className="w-3 h-3" /></button>
                                )}
                                {canManageStaff && !editingTeacher && (
                                  <button onClick={() => openRemoveStaffModal(circle, "teacher", c.teacherName!)} className="p-0.5 rounded text-muted-foreground/40 hover:text-rose-500 hover:bg-rose-50 transition-colors" title="إزالة المعلمة من الحلقة"><UserX className="w-3 h-3" /></button>
                                )}
                              </div>
                            )}
                            {(c as any).supervisorName && (
                              <div className="flex items-center gap-1">
                                {editingSupervisor ? (
                                  <div className="flex items-center gap-1 flex-1">
                                    <Input value={staffName} onChange={e => setStaffName(e.target.value)} onKeyDown={e => { if (e.key === "Enter") void saveStaffName(); if (e.key === "Escape") cancelStaffEdit(); }} className="h-7 text-xs text-right" autoFocus />
                                    <button onClick={() => void saveStaffName()} disabled={staffSaving} className="p-1 rounded bg-emerald-50 text-emerald-600 hover:bg-emerald-100 disabled:opacity-50" title="حفظ الاسم"><Check className="w-3 h-3" /></button>
                                    <button onClick={cancelStaffEdit} disabled={staffSaving} className="p-1 rounded bg-muted text-muted-foreground hover:bg-muted/80 disabled:opacity-50" title="إلغاء"><X className="w-3 h-3" /></button>
                                  </div>
                                ) : (
                                  <p className="text-xs text-muted-foreground flex-1">مشرفة: {(c as any).supervisorName}</p>
                                )}
                                {canEdit && c.supervisorId && !editingSupervisor && (
                                  <button onClick={() => startStaffEdit(c.supervisorId!, (c as any).supervisorName)} className="p-0.5 rounded text-muted-foreground/50 hover:text-primary hover:bg-primary/10 transition-colors" title="تعديل اسم المشرفة"><Pencil className="w-3 h-3" /></button>
                                )}
                                {canManageStaff && !editingSupervisor && (
                                  <button onClick={() => openRemoveStaffModal(circle, "supervisor", (c as any).supervisorName)} className="p-0.5 rounded text-muted-foreground/40 hover:text-rose-500 hover:bg-rose-50 transition-colors" title="إزالة المشرفة من الحلقة"><UserX className="w-3 h-3" /></button>
                                )}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            <Badge className={`flex-shrink-0 text-xs ${TRACK_COLORS[track] ?? "bg-gray-100 text-gray-700"}`}>
                              {track}
                            </Badge>
                            {canEdit && (
                            <button
                              onClick={() => isEditing ? setEditingId(null) : startEdit(c)}
                              className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground"
                              title="إعدادات الحلقة"
                            >
                              {isEditing ? <X className="w-3.5 h-3.5" /> : <Settings2 className="w-3.5 h-3.5" />}
                            </button>
                          )}
                          </div>
                        </div>

                        {c.description && (
                          <p className="text-sm text-muted-foreground mt-2 line-clamp-1">{c.description}</p>
                        )}

                        {/* Capacity & time badges */}
                        {!isEditing && (c.meetingTime || c.newStudentCapacity != null || (c as any).whatsappLink) && (
                          <div className="flex flex-wrap gap-2 mt-2">
                            {c.meetingTime && (
                              <span className="inline-flex items-center gap-1 text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">
                                <Clock className="w-3 h-3" />
                                {c.meetingTime}
                              </span>
                            )}
                            {c.newStudentCapacity != null && (
                              <span className="inline-flex items-center gap-1 text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full">
                                <UserPlus className="w-3 h-3" />
                                {c.newStudentCapacity} طالبة جديدة
                              </span>
                            )}
                            {(c as any).whatsappLink && (
                              <a
                                href={(c as any).whatsappLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-full hover:bg-green-100"
                              >
                                <Link2 className="w-3 h-3" />
                                واتساب الحلقة
                              </a>
                            )}
                          </div>
                        )}

                        {/* Inline edit form */}
                        {isEditing && (
                          <div className="mt-3 pt-3 border-t border-border/50 space-y-3">
                            {/* Name + track — leader only */}
                            {canEdit && (
                              <>
                                <div className="space-y-1">
                                  <Label className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                                    <Pencil className="w-3 h-3" />
                                    اسم الحلقة
                                  </Label>
                                  <Input
                                    value={editData.name}
                                    onChange={e => setEditData(d => ({ ...d, name: e.target.value }))}
                                    className="h-8 text-xs text-right"
                                    placeholder="اسم الحلقة"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                                    <ArrowRightLeft className="w-3 h-3" />
                                    نقل إلى مسار
                                  </Label>
                                  <select
                                    className="w-full border border-input rounded-md px-2 py-1.5 text-sm bg-background text-right"
                                    value={editData.track}
                                    onChange={e => setEditData(d => ({ ...d, track: e.target.value }))}
                                  >
                                    {/* ضمان ظهور المسار الحالي للحلقة حتى لو لم يكن في القائمة المشتقة */}
                                    {Array.from(new Set([
                                      ...(editData.track ? [editData.track] : []),
                                      ...tracks,
                                    ])).map(t => (
                                      <option key={t} value={t}>{t}</option>
                                    ))}
                                  </select>
                                  {/* تحذير فقط إذا تغيّر المسار فعلاً — مع تطبيع القيمتين */}
                                  {(editData.track || "") !== ((circle as any).track || "") && editData.track && (
                                    <p className="text-[10px] text-amber-600 font-medium">
                                      ⚠ ستنتقل الحلقة مع معلمتها ومشرفتها وطالباتها إلى مسار «{editData.track}»
                                    </p>
                                  )}
                                </div>
                              </>
                            )}
                            <div className="space-y-2">
                              <Label className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                وقت الاجتماع
                              </Label>
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => setEditData(d => ({ ...d, period: "am" }))}
                                  className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-semibold border-2 transition-all ${editData.period === "am" ? "border-amber-400 bg-amber-50 text-amber-700" : "border-border text-muted-foreground"}`}
                                >
                                  <Sun className="w-3 h-3" /> صباحي
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditData(d => ({ ...d, period: "pm" }))}
                                  className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-semibold border-2 transition-all ${editData.period === "pm" ? "border-indigo-400 bg-indigo-50 text-indigo-700" : "border-border text-muted-foreground"}`}
                                >
                                  <Moon className="w-3 h-3" /> مسائي
                                </button>
                              </div>
                              <input
                                type="time"
                                value={editData.meetingTime}
                                onChange={e => setEditData(d => ({ ...d, meetingTime: e.target.value }))}
                                className="h-8 text-xs border border-input rounded-md px-2 py-1.5 w-full bg-background"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                                <UserPlus className="w-3 h-3" />
                                الحد الأقصى للطالبات الجدد
                              </Label>
                              <Input
                                type="number"
                                min="0"
                                value={editData.newStudentCapacity}
                                onChange={e => setEditData(d => ({ ...d, newStudentCapacity: e.target.value }))}
                                placeholder="اتركي فارغًا = بلا حد"
                                className="h-8 text-xs text-right"
                              />
                              <p className="text-[10px] text-muted-foreground">الحلقة ستختفي من التسجيل بعد اكتمالها</p>
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                                <Link2 className="w-3 h-3" />
                                رابط مجموعة الواتساب
                              </Label>
                              <Input
                                value={editData.whatsappLink}
                                onChange={e => setEditData(d => ({ ...d, whatsappLink: e.target.value }))}
                                placeholder="https://chat.whatsapp.com/..."
                                className="h-8 text-xs text-right"
                              />
                            </div>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                onClick={() => saveEdit(circle.id)}
                                disabled={saving}
                                className="flex-1 h-8 text-xs"
                              >
                                <Check className="w-3 h-3 ml-1" />
                                {saving ? "جاري الحفظ..." : "حفظ"}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setEditingId(null)}
                                className="flex-1 h-8 text-xs"
                              >
                                إلغاء
                              </Button>
                            </div>
                          </div>
                        )}

                        {/* Students count + expand toggle */}
                        <div className="mt-3 pt-3 border-t border-border/50 flex items-center justify-between">
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Users className="w-3.5 h-3.5" />
                              {(c as any).studentCount ?? 0} طالبة
                            </span>
                            {(c as any).location && (
                              <span className="flex items-center gap-1">
                                <BookOpen className="w-3.5 h-3.5" />
                                {(c as any).location}
                              </span>
                            )}
                          </div>
                          <button
                            onClick={() => setExpandedCircle(expandedCircle === circle.id ? null : circle.id)}
                            className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5 transition-colors"
                          >
                            {expandedCircle === circle.id ? (
                              <><ChevronUp className="w-3 h-3" />إخفاء</>
                            ) : (
                              <><ChevronDown className="w-3 h-3" />الطالبات</>
                            )}
                          </button>
                        </div>

                        {expandedCircle === circle.id && (
                          <CircleStudentsPanel circleId={circle.id} userRole={currentUser?.role ?? ""} />
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Remove Staff Modal */}
      {removeStaffModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" dir="rtl">
          <div className="bg-white rounded-2xl shadow-xl p-5 w-full max-w-sm mx-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base flex items-center gap-2">
                <UserX className="w-4 h-4 text-rose-500" />
                إزالة {removeStaffModal.staffRole === "teacher" ? "المعلمة" : "المشرفة"}
              </h3>
              <button onClick={() => setRemoveStaffModal(null)} className="p-1 rounded hover:bg-muted">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>

            <p className="text-sm text-muted-foreground">
              {removeStaffModal.staffRole === "teacher" ? "المعلمة" : "المشرفة"}:{" "}
              <span className="font-semibold text-foreground">{removeStaffModal.staffName}</span>
            </p>
            <p className="text-xs text-muted-foreground">
              الحلقة: <span className="font-medium text-foreground">{removeStaffModal.circleName}</span>
            </p>

            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">اختاري الإجراء:</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setRemoveAction("archive")}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 text-xs font-semibold transition-all ${removeAction === "archive" ? "border-rose-400 bg-rose-50 text-rose-700" : "border-border text-muted-foreground hover:bg-muted/50"}`}
                >
                  <Archive className="w-4 h-4" />
                  أرشفة
                </button>
                <button
                  onClick={() => { setRemoveAction("transfer"); setTargetCircleId(null); }}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 text-xs font-semibold transition-all ${removeAction === "transfer" ? "border-blue-400 bg-blue-50 text-blue-700" : "border-border text-muted-foreground hover:bg-muted/50"}`}
                >
                  <MoveRight className="w-4 h-4" />
                  نقل لحلقة أخرى
                </button>
              </div>
            </div>

            {removeAction === "transfer" && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground">اختاري الحلقة المستهدفة:</p>
                <div className="relative">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <input
                    type="text"
                    value={transferSearch}
                    onChange={e => setTransferSearch(e.target.value)}
                    placeholder="بحث بالاسم..."
                    className="h-8 text-xs border border-input rounded-md px-3 pe-9 w-full bg-background text-right"
                  />
                </div>
                <div className="max-h-40 overflow-y-auto space-y-1 border border-border rounded-lg p-1.5">
                  {(circles ?? [])
                    .filter(c => c.id !== removeStaffModal.circleId && (!transferSearch || c.name.includes(transferSearch)))
                    .map(c => (
                      <button
                        key={c.id}
                        onClick={() => setTargetCircleId(c.id)}
                        className={`w-full text-right text-xs px-2.5 py-1.5 rounded-lg transition-colors ${targetCircleId === c.id ? "bg-blue-100 text-blue-700 font-semibold" : "hover:bg-muted text-foreground"}`}
                      >
                        {c.name}
                        {c.track && <span className="text-muted-foreground mr-1">— {c.track}</span>}
                      </button>
                    ))
                  }
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <Button
                onClick={handleRemoveStaff}
                disabled={removing || (removeAction === "transfer" && !targetCircleId)}
                className={`flex-1 text-sm ${removeAction === "archive" ? "bg-rose-600 hover:bg-rose-700" : ""}`}
              >
                {removing ? "جاري التنفيذ..." : removeAction === "archive" ? "أرشفة" : "نقل"}
              </Button>
              <Button variant="outline" onClick={() => setRemoveStaffModal(null)} className="flex-1 text-sm">
                إلغاء
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
