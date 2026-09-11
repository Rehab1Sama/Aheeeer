import { useState, useEffect } from "react";
import {
  useListExamRotations, useCreateExamRotation, useUpdateExamRotation, useDeleteExamRotation,
  useListExamAssignments, useSaveExamAssignments,
  useListUsers, useListCircles, useListTracks,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Plus, Trash2, Pencil, RefreshCw, Shuffle, ChevronDown, ChevronUp,
  Save, Check, X, Phone,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface RotationPageProps { userRole?: string; userId?: number; }

function toWhatsApp(phone: string): string {
  const d = phone.replace(/\D/g, "");
  if (d.startsWith("966")) return `https://wa.me/${d}`;
  if (d.startsWith("0")) return `https://wa.me/966${d.slice(1)}`;
  return `https://wa.me/${d}`;
}

export default function TeacherRotationPage({ userRole, userId }: RotationPageProps) {
  const [showDialog, setShowDialog] = useState(false);
  const [editingRotation, setEditingRotation] = useState<any>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [form, setForm] = useState({
    name: "", startDate: "", endDate: "", isActive: true,
    teacherScope: "girls" as "girls" | "selected_tracks",
    selectedTracks: [] as string[],
  });
  const [editingAssignments, setEditingAssignments] = useState<any[]>([]);
  const [assigningId, setAssigningId] = useState<number | null>(null);
  const { toast } = useToast();
  const qc = useQueryClient();

  const isLeader    = userRole === "leader";
  const isDeputy    = userRole === "deputy";
  const isTrackSup  = userRole === "track_supervisor";
  const isTeacher   = userRole === "teacher";
  const canSummary  = isLeader || isDeputy || isTrackSup;

  const { data: rotations = [] } = useListExamRotations({});
  const { data: users = [] }     = useListUsers({});
  const { data: circles = [] }   = useListCircles({});
  const { data: tracks = [] }    = useListTracks({ query: { queryKey: ["tracks"] } });

  const { data: currentAssignments = [], isFetched: assignmentsFetched } = useListExamAssignments(
    expandedId ?? 0,
    { query: { enabled: expandedId != null, queryKey: ["listExamAssignments", expandedId] } }
  );

  const createRot   = useCreateExamRotation();
  const updateRot   = useUpdateExamRotation();
  const deleteRot   = useDeleteExamRotation();
  const saveMutation = useSaveExamAssignments();

  function inv() { qc.invalidateQueries({ queryKey: ["listExamRotations"] }); }

  function openNew() {
    setEditingRotation(null);
    setForm({ name: "", startDate: "", endDate: "", isActive: true, teacherScope: "girls", selectedTracks: [] });
    setShowDialog(true);
  }
  function openEdit(r: any) {
    setEditingRotation(r);
    setForm({
      name: r.name, startDate: r.startDate, endDate: r.endDate, isActive: r.isActive,
      teacherScope: r.teacherScope ?? "girls", selectedTracks: r.selectedTracks ?? [],
    });
    setShowDialog(true);
  }

  async function handleSave() {
    if (!form.name || !form.startDate || !form.endDate) {
      toast({ title: "أدخل جميع الحقول", variant: "destructive" }); return;
    }
    if (form.teacherScope === "selected_tracks" && form.selectedTracks.length === 0) {
      toast({ title: "اختاري مسارًا واحدًا على الأقل", variant: "destructive" }); return;
    }
    try {
      if (editingRotation) await updateRot.mutateAsync({ id: editingRotation.id, data: form });
      else await createRot.mutateAsync({ data: form });
      inv(); setShowDialog(false); toast({ title: "تم الحفظ" });
    } catch { toast({ title: "حدث خطأ", variant: "destructive" }); }
  }

  async function handleDelete(id: number) {
    if (!confirm("حذف هذه الشقلبة؟")) return;
    await deleteRot.mutateAsync({ id }); inv();
    if (expandedId === id) setExpandedId(null);
    toast({ title: "تم الحذف" });
  }

  function toggleExpand(id: number) {
    if (expandedId === id) { setExpandedId(null); setEditingAssignments([]); }
    else { setExpandedId(id); setAssigningId(id); }
  }

  useEffect(() => {
    if (expandedId == null) { setEditingAssignments([]); return; }
    if (!assignmentsFetched) return;
    const seen = new Set<number>();
    const deduped = currentAssignments
      .filter(a => { if (seen.has(a.teacherId)) return false; seen.add(a.teacherId); return true; })
      .map(a => ({
        teacherId: a.teacherId, originalCircleId: a.originalCircleId, examCircleId: a.examCircleId,
        teacherName: a.teacherName, originalCircleName: a.originalCircleName, examCircleName: a.examCircleName,
        confirmed: true,
      }));
    setEditingAssignments(deduped);
  }, [currentAssignments, expandedId, assignmentsFetched]);

  // ─── computed from expanded rotation ────────────────────────────────────────
  const expandedRotation = rotations.find(r => r.id === expandedId);
  const rotationScope    = expandedRotation?.teacherScope ?? "girls";
  const rotationTracks   = expandedRotation?.selectedTracks ?? [];
  const isGirlsCircle   = (c: any) => c.trackType === "girls" || String(c.trackType ?? "").startsWith("girls_");
  const isCircleInScope  = (c: any) => rotationScope === "girls" ? isGirlsCircle(c) : rotationTracks.includes(c.track);
  const scopedCircles    = circles.filter(isCircleInScope);
  const scopedCircleIds  = new Set(scopedCircles.map(c => c.id));
  const teachers         = users.filter(u => u.role === "teacher" && !u.isArchived && u.circleId != null && scopedCircleIds.has(u.circleId));
  const availableTracks  = Array.from(new Set([...tracks.map(t => t.name), ...circles.map(c => c.track)])).filter(Boolean);

  // phone lookup
  const phoneByUserId: Record<number, string | null> = {};
  for (const u of users) { phoneByUserId[u.id] = (u as any).phone ?? null; }

  // student count per circle
  const studentCountByCircle: Record<number, number> = {};
  for (const u of users) {
    if (u.role === "student" && !u.isArchived && u.circleId != null) {
      studentCountByCircle[u.circleId] = (studentCountByCircle[u.circleId] ?? 0) + 1;
    }
  }

  // summary data
  const confirmedAssignments = editingAssignments.filter(a => a.confirmed);
  // أي معلمة لها صف في القائمة (غير الصفر/الفارغ) تختفي من "غير الموزعات"
  const assignedTeacherIds   = new Set(editingAssignments.map(a => a.teacherId).filter(id => id && id > 0));
  // أي حلقة مأخوذة كحلقة اختبار (معتمدة أو لا) تختفي من القوائم المنسدلة
  const coveredExamCircleIds = new Set(editingAssignments.map(a => a.examCircleId).filter(id => id && id > 0));
  const byTeacherId: Record<number, any[]> = {};
  for (const a of confirmedAssignments) {
    if (!byTeacherId[a.teacherId]) byTeacherId[a.teacherId] = [];
    byTeacherId[a.teacherId].push(a);
  }
  const unassignedTeachers = teachers.filter(t => !assignedTeacherIds.has(t.id));
  const uncoveredCircles   = scopedCircles.filter(c => !coveredExamCircleIds.has(c.id));

  // ─── assignment helpers ──────────────────────────────────────────────────────
  function autoDistribute() {
    const withCircles = teachers.filter(t => t.circleId != null);
    if (withCircles.length === 0) { toast({ title: "لا توجد معلمات بحلقات", variant: "destructive" }); return; }
    const grouped: Record<string, typeof withCircles> = {};
    withCircles.forEach(t => {
      const time = scopedCircles.find(c => c.id === t.circleId)?.meetingTime ?? "غير محدد";
      if (!grouped[time]) grouped[time] = [];
      grouped[time].push(t);
    });
    const seen = new Set<number>();
    const assignments: any[] = [];
    Object.values(grouped).forEach(group => {
      if (group.length < 2) return;
      for (let i = 0; i < group.length; i++) {
        if (seen.has(group[i].id)) continue;
        seen.add(group[i].id);
        const next = group[(i + 1) % group.length];
        assignments.push({
          teacherId: group[i].id, teacherName: group[i].name,
          originalCircleId: group[i].circleId!, originalCircleName: scopedCircles.find(c => c.id === group[i].circleId)?.name ?? "",
          examCircleId: next.circleId!, examCircleName: scopedCircles.find(c => c.id === next.circleId)?.name ?? "",
          confirmed: false,
        });
      }
    });
    if (assignments.length === 0) { toast({ title: "لا توجد معلمات بنفس وقت الحلقة", variant: "destructive" }); return; }
    setEditingAssignments(assignments);
    toast({ title: `تم توزيع ${assignments.length} معلمة تلقائيًا` });
  }

  async function handleSaveAssignments() {
    if (!expandedId) return;
    try {
      const payload = editingAssignments
        .filter(a => a.confirmed && a.teacherId && a.originalCircleId && a.examCircleId)
        .map(a => ({ teacherId: a.teacherId, originalCircleId: a.originalCircleId, examCircleId: a.examCircleId }));
      await saveMutation.mutateAsync({ id: expandedId, data: { assignments: payload } });
      await qc.invalidateQueries({ queryKey: ["listExamAssignments"] });
      toast({ title: `تم حفظ التوزيع (${payload.length} معلمة)` });
    } catch (e: any) {
      toast({ title: e?.response?.data?.error ?? e?.message ?? "حدث خطأ", variant: "destructive" });
    }
  }

  function toggleConfirm(index: number) {
    setEditingAssignments(prev => prev.map((a, i) => i === index ? { ...a, confirmed: !a.confirmed } : a));
  }
  function removeAssignment(index: number) {
    setEditingAssignments(prev => prev.filter((_, i) => i !== index));
  }
  function updateAssignmentExamCircle(index: number, circleId: number) {
    setEditingAssignments(prev => prev.map((a, i) =>
      i === index ? { ...a, examCircleId: circleId, examCircleName: circles.find(c => c.id === circleId)?.name ?? "" } : a
    ));
  }
  function assignSoloTeacher(teacher: { id: number; name: string; circleId?: number | null }, examCircleId: number) {
    const origCircle = scopedCircles.find(c => c.id === teacher.circleId);
    const examCircle = scopedCircles.find(c => c.id === examCircleId);
    setEditingAssignments(prev => {
      const idx = prev.findIndex(a => a.teacherId === teacher.id);
      const entry = {
        teacherId: teacher.id, teacherName: teacher.name,
        originalCircleId: teacher.circleId ?? 0, originalCircleName: origCircle?.name ?? "—",
        examCircleId, examCircleName: examCircle?.name ?? "—",
        confirmed: idx >= 0 ? prev[idx].confirmed : false,
      };
      if (idx >= 0) { const next = [...prev]; next[idx] = entry; return next; }
      return [...prev, entry];
    });
  }
  function addManualAssignment() {
    setEditingAssignments(prev => [...prev, {
      teacherId: 0, teacherName: "", originalCircleId: 0, originalCircleName: "",
      examCircleId: 0, examCircleName: "", confirmed: false,
    }]);
  }
  function updateManualAssignment(index: number, field: string, value: any) {
    setEditingAssignments(prev => prev.map((a, i) => {
      if (i !== index) return a;
      if (field === "teacherId") {
        const t = teachers.find(x => x.id === parseInt(value));
        return { ...a, teacherId: parseInt(value), teacherName: t?.name ?? "", originalCircleId: t?.circleId ?? 0, originalCircleName: circles.find(c => c.id === t?.circleId)?.name ?? "" };
      }
      if (field === "examCircleId") {
        return { ...a, examCircleId: parseInt(value), examCircleName: circles.find(c => c.id === parseInt(value))?.name ?? "" };
      }
      return { ...a, [field]: value };
    }));
  }

  // ─── render helpers ──────────────────────────────────────────────────────────

  /** ملخص التوزيع — عرض المديرة / النائبة: يُجمع حسب المعلمة */
  function SummaryByTeacher() {
    const rows = Object.entries(byTeacherId);
    if (rows.length === 0)
      return <p className="text-sm text-muted-foreground text-center py-4">لا يوجد توزيع معتمد بعد</p>;
    return (
      <div className="overflow-x-auto">
        {/* header */}
        <div className="grid text-xs font-semibold text-muted-foreground bg-muted/40 px-3 py-2 border-b"
          style={{ gridTemplateColumns: "1.4fr 1.2fr 0.8fr 1.2fr 0.8fr 0.6fr" }}>
          <span>المعلمة</span>
          <span>حلقتها الأصلية</span>
          <span>الوقت</span>
          <span>تراقب في حلقة</span>
          <span>الوقت</span>
          <span>الطالبات</span>
        </div>
        {rows.map(([tid, list]) => {
          const origTime = circles.find(c => c.id === list[0].originalCircleId)?.meetingTime;
          return (
            <div key={tid}
              className="grid items-start px-3 py-2.5 border-b last:border-0 hover:bg-muted/20"
              style={{ gridTemplateColumns: "1.4fr 1.2fr 0.8fr 1.2fr 0.8fr 0.6fr" }}>
              <div className="font-medium text-sm">{list[0].teacherName}</div>
              <div className="text-sm text-muted-foreground">{list[0].originalCircleName}</div>
              <div className="text-xs text-muted-foreground">{origTime ?? "—"}</div>
              {/* حلقات الاختبار — قد تكون أكثر من واحدة */}
              <div className="space-y-1">
                {list.map((a, i) => (
                  <div key={i} className="text-sm font-semibold text-primary">{a.examCircleName}</div>
                ))}
              </div>
              <div className="space-y-1">
                {list.map((a, i) => {
                  const et = circles.find(c => c.id === a.examCircleId)?.meetingTime;
                  return <div key={i} className="text-xs text-muted-foreground">{et ?? "—"}</div>;
                })}
              </div>
              <div className="space-y-1">
                {list.map((a, i) => {
                  const cnt = studentCountByCircle[a.examCircleId];
                  return <div key={i} className="text-xs font-medium">{cnt != null ? `${cnt}` : "—"}</div>;
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  /** ملخص التوزيع — عرض مسؤولة المسار: يُجمع حسب الحلقة */
  function SummaryByCircle() {
    return (
      <div className="divide-y">
        {scopedCircles.map(c => {
          const examTeachers = confirmedAssignments.filter(a => a.examCircleId === c.id);
          const cnt = studentCountByCircle[c.id];
          const isCovered = examTeachers.length > 0;
          return (
            <div key={c.id}
              className={`flex items-start gap-3 px-3 py-3 ${isCovered ? "" : "bg-red-50/50"}`}>
              {/* الحلقة */}
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate">{c.name}</div>
                {(c as any).meetingTime && <div className="text-xs text-muted-foreground">{(c as any).meetingTime}</div>}
                {cnt != null && <div className="text-xs text-muted-foreground">{cnt} طالبة</div>}
              </div>
              {/* المعلمة/ات */}
              <div className="text-right space-y-1.5 flex-shrink-0">
                {isCovered ? examTeachers.map((a, i) => {
                  const phone = phoneByUserId[a.teacherId];
                  return (
                    <div key={i} className="flex items-center gap-2 justify-end">
                      <div className="text-right">
                        <span className="text-sm font-medium block">{a.teacherName}</span>
                        {phone && <span className="text-xs text-muted-foreground" dir="ltr">{phone}</span>}
                      </div>
                      {phone ? (
                        <a href={toWhatsApp(phone)} target="_blank" rel="noopener noreferrer"
                          title={phone}
                          className="flex items-center justify-center w-7 h-7 rounded-full bg-green-100 text-green-700 hover:bg-green-200 transition-colors flex-shrink-0">
                          <Phone className="w-3.5 h-3.5" />
                        </a>
                      ) : null}
                    </div>
                  );
                }) : (
                  <span className="text-xs text-red-500 italic">لا توجد معلمة مكلفة</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // ─── JSX ────────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 max-w-5xl mx-auto" dir="rtl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-primary flex items-center gap-2">
          <Shuffle className="w-6 h-6" />شقلبة المعلمات
        </h1>
        {isLeader && <Button size="sm" onClick={openNew}><Plus className="w-4 h-4 ml-1" />شقلبة جديدة</Button>}
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6 text-sm text-blue-700">
        💡 الشقلبة تعني توزيع المعلمات على حلقات غير حلقاتهن أثناء الاختبارات. يتم التوزيع التلقائي بناءً على وقت الحلقة المتشابه.
      </div>

      <div className="space-y-4">
        {rotations.map(rotation => {
          const isExpanded = expandedId === rotation.id;
          return (
            <div key={rotation.id} className="rounded-xl border bg-card overflow-hidden">
              {/* ─── رأس الشقلبة ─── */}
              <div className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-lg">{rotation.name}</span>
                      {rotation.isActive
                        ? <Badge className="bg-green-100 text-green-700 text-xs">نشطة</Badge>
                        : <Badge variant="secondary" className="text-xs">منتهية</Badge>}
                    </div>
                    <div className="text-sm text-muted-foreground">{rotation.startDate} — {rotation.endDate}</div>
                    <div className="text-xs text-primary mt-1">
                      {rotation.teacherScope === "selected_tracks"
                        ? `المسارات: ${(rotation.selectedTracks ?? []).join("، ")}`
                        : "معلمات مسارات الفتيات فقط"}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    {isLeader && (
                      <>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(rotation)}><Pencil className="w-3.5 h-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(rotation.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                      </>
                    )}
                    <Button variant="outline" size="sm" onClick={() => toggleExpand(rotation.id)}>
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      التوزيع
                    </Button>
                  </div>
                </div>
              </div>

              {/* ─── محتوى التوسعة ─── */}
              {isExpanded && (
                <div className="border-t p-4 bg-muted/30 space-y-5">

                  {/* ① LEADER: أزرار التحكم + منطقة التعديل */}
                  {isLeader && (() => {
                    const grouped: Record<string, typeof teachers> = {};
                    teachers.filter(t => t.circleId != null).forEach(t => {
                      const time = scopedCircles.find(c => c.id === t.circleId)?.meetingTime ?? "غير محدد";
                      if (!grouped[time]) grouped[time] = [];
                      grouped[time].push(t);
                    });
                    const soloTeachers = teachers.filter(t => {
                      const time = scopedCircles.find(c => c.id === t.circleId)?.meetingTime ?? "غير محدد";
                      return (grouped[time]?.length ?? 0) === 1;
                    });
                    const assignedIds = new Set(editingAssignments.map(a => a.teacherId).filter(Boolean));
                    return (
                      <div className="space-y-4">
                        {/* أزرار */}
                        <div className="flex gap-2 flex-wrap">
                          <Button size="sm" variant="outline" onClick={autoDistribute}>
                            <RefreshCw className="w-3.5 h-3.5 ml-1" />توزيع تلقائي
                          </Button>
                          <Button size="sm" variant="outline" onClick={addManualAssignment}>
                            <Plus className="w-3.5 h-3.5 ml-1" />إضافة يدوية
                          </Button>
                          <Button size="sm" onClick={handleSaveAssignments} disabled={saveMutation.isPending}>
                            <Save className="w-3.5 h-3.5 ml-1" />حفظ التوزيع
                          </Button>
                        </div>

                        {/* شبكة التعديل */}
                        {editingAssignments.length === 0 ? (
                          <p className="text-center py-4 text-muted-foreground text-sm">اضغطي «توزيع تلقائي» أو أضيفي يدويًا</p>
                        ) : (
                          <div className="space-y-2">
                            <div className="grid gap-2 text-xs font-semibold text-muted-foreground px-2"
                              style={{ gridTemplateColumns: "1fr 1fr auto auto" }}>
                              <span>المعلمة / حلقتها الأصلية</span>
                              <span>تراقب في حلقة</span>
                              <span className="text-center">✓</span>
                              <span />
                            </div>

                            {editingAssignments.map((a, rawIdx) => {
                              const origTime = circles.find(c => c.id === a.originalCircleId)?.meetingTime;
                              const examCount = a.examCircleId ? studentCountByCircle[a.examCircleId] : undefined;
                              return (
                                <div key={rawIdx}
                                  className={`grid gap-2 items-start rounded-lg p-2 border transition-colors ${a.confirmed ? "bg-green-50/60 border-green-200" : "bg-background"}`}
                                  style={{ gridTemplateColumns: "1fr 1fr auto auto" }}>
                                  {/* المعلمة + حلقتها الأصلية */}
                                  <div className="space-y-1 min-w-0">
                                    <Select value={a.teacherId ? String(a.teacherId) : ""}
                                      onValueChange={v => updateManualAssignment(rawIdx, "teacherId", v)}>
                                      <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="اختاري معلمة..." /></SelectTrigger>
                                      <SelectContent>
                                        {teachers.filter(t => t.id === a.teacherId || !assignedIds.has(t.id))
                                          .map(t => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}
                                      </SelectContent>
                                    </Select>
                                    {a.originalCircleName && <div className="text-xs text-muted-foreground px-1 truncate">{a.originalCircleName}</div>}
                                    {origTime && <div className="text-xs text-muted-foreground/70 px-1">{origTime}</div>}
                                  </div>
                                  {/* حلقة الاختبار */}
                                  <div className="space-y-1 min-w-0">
                                    <Select value={a.examCircleId ? String(a.examCircleId) : ""}
                                      onValueChange={v => updateAssignmentExamCircle(rawIdx, parseInt(v))}>
                                      <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="حلقة الاختبار..." /></SelectTrigger>
                                      <SelectContent>
                                        {scopedCircles
                                          .filter(c => c.id === a.examCircleId || !coveredExamCircleIds.has(c.id))
                                          .map(c => (
                                            <SelectItem key={c.id} value={String(c.id)}>
                                              {c.name}{(c as any).meetingTime ? ` — ${(c as any).meetingTime}` : ""}
                                            </SelectItem>
                                          ))}
                                      </SelectContent>
                                    </Select>
                                    {examCount != null && a.examCircleId
                                      ? <div className="text-xs text-muted-foreground px-1">{examCount} طالبة</div>
                                      : null}
                                  </div>
                                  {/* زر الاعتماد */}
                                  <button type="button"
                                    title={a.confirmed ? "إلغاء الاعتماد" : "اعتماد"}
                                    onClick={() => toggleConfirm(rawIdx)}
                                    className={`mt-1 flex items-center justify-center w-8 h-8 rounded-full border-2 transition-colors flex-shrink-0 ${a.confirmed ? "border-green-500 bg-green-500 text-white" : "border-muted-foreground/30 text-muted-foreground/40 hover:border-green-400 hover:text-green-500"}`}>
                                    <Check className="w-4 h-4" />
                                  </button>
                                  {/* زر الحذف */}
                                  <button type="button" onClick={() => removeAssignment(rawIdx)}
                                    className="mt-1 flex items-center justify-center w-8 h-8 rounded-full text-destructive/50 hover:text-destructive hover:bg-destructive/10 transition-colors flex-shrink-0">
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              );
                            })}

                            <div className="text-xs text-muted-foreground text-left pt-1 px-1">
                              {editingAssignments.filter(a => a.confirmed).length} معتمدة من أصل {editingAssignments.length} — سيتم حفظ المعتمدات فقط
                            </div>
                          </div>
                        )}

                        {/* حلقات منفردة */}
                        {soloTeachers.length > 0 && (
                          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                            <p className="text-xs font-semibold text-amber-700 mb-2">
                              ⚠️ حلقات بلا شريك للتبادل — يمكنك تعيينهن يدويًا
                            </p>
                            <div className="space-y-2">
                              {soloTeachers.map(t => {
                                const circle = scopedCircles.find(c => c.id === t.circleId);
                                const assigned = editingAssignments.find(a => a.teacherId === t.id);
                                const cnt = t.circleId != null ? (studentCountByCircle[t.circleId] ?? 0) : 0;
                                return (
                                  <div key={t.id} className="flex items-center gap-2 flex-wrap">
                                    <div className="min-w-0 flex-shrink-0">
                                      <span className="text-xs font-medium text-amber-800">{t.name}</span>
                                      <span className="text-xs text-amber-500 mr-1">({circle?.name ?? "—"}{(circle as any)?.meetingTime ? ` · ${(circle as any).meetingTime}` : ""})</span>
                                      <span className="text-xs text-muted-foreground">· {cnt} طالبة</span>
                                    </div>
                                    <Select value={assigned ? String(assigned.examCircleId) : ""} onValueChange={v => assignSoloTeacher(t, parseInt(v))}>
                                      <SelectTrigger className="h-7 text-xs flex-1 border-amber-300 bg-white min-w-[140px]">
                                        <SelectValue placeholder="اختاري حلقة..." />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {scopedCircles.map(c => (
                                          <SelectItem key={c.id} value={String(c.id)}>
                                            {c.name}{(c as any).meetingTime ? ` — ${(c as any).meetingTime}` : ""}
                                            {studentCountByCircle[c.id] != null ? ` · ${studentCountByCircle[c.id]} طالبة` : ""}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* ② TEACHER: بطاقة حلقتها في الاختبار */}
                  {isTeacher && userId != null && (
                    <div className={`rounded-xl border p-4 ${
                      confirmedAssignments.some(a => a.teacherId === userId)
                        ? "bg-primary/10 border-primary/30"
                        : "bg-amber-50 border-amber-200"
                    }`}>
                      <p className="text-xs font-semibold text-muted-foreground mb-1">حلقتك في الاختبار</p>
                      {(() => {
                        const mine = confirmedAssignments.filter(a => a.teacherId === userId);
                        if (mine.length === 0) return <p className="text-sm text-amber-700 italic">لم يتم تعيينك بعد في هذه الشقلبة</p>;
                        return (
                          <div className="space-y-2">
                            {mine.map((a, i) => {
                              const cnt = studentCountByCircle[a.examCircleId];
                              const et = circles.find(c => c.id === a.examCircleId)?.meetingTime;
                              return (
                                <div key={i}>
                                  <p className="text-lg font-bold text-primary">{a.examCircleName}</p>
                                  {et && <p className="text-sm text-muted-foreground">{et}</p>}
                                  {cnt != null && <p className="text-sm text-muted-foreground">{cnt} طالبة</p>}
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  {/* ③ ملخص التوزيع المعتمد — مسؤولة المسار: تعرض حسب الحلقة */}
                  {isTrackSup && (
                    <div className="rounded-xl border bg-background overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/20">
                        <span className="font-semibold text-sm">ملخص التوزيع — حسب الحلقة</span>
                        <Badge variant="outline">{confirmedAssignments.length} تعيين</Badge>
                      </div>
                      <SummaryByCircle />
                    </div>
                  )}

                  {/* ④ ملخص التوزيع المعتمد — مديرة / نائبة: تعرض حسب المعلمة */}
                  {(isLeader || isDeputy) && (
                    <div className="rounded-xl border bg-background overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/20">
                        <span className="font-semibold text-sm">ملخص التوزيع المعتمد</span>
                        <Badge variant="outline">{confirmedAssignments.length} معلمة</Badge>
                      </div>
                      <SummaryByTeacher />
                    </div>
                  )}

                  {/* ⑤ المعلمات غير الموزعات */}
                  {(isLeader || isTrackSup) && unassignedTeachers.length > 0 && (
                    <div className="rounded-xl border border-orange-200 bg-orange-50 p-4">
                      <p className="text-xs font-semibold text-orange-700 mb-3">
                        👩‍🏫 معلمات لم يُعيَّن لهن دور ({unassignedTeachers.length})
                      </p>
                      <div className="space-y-2">
                        {unassignedTeachers.map(t => {
                          const c = scopedCircles.find(x => x.id === t.circleId);
                          const cnt = t.circleId != null ? studentCountByCircle[t.circleId] : undefined;
                          return (
                            <div key={t.id} className="flex items-center gap-2 bg-white border border-orange-200 rounded-lg px-3 py-2">
                              <div className="min-w-0 flex-shrink-0">
                                <span className="text-sm font-medium text-amber-800">{t.name}</span>
                                {c && <span className="text-xs text-orange-500 mr-1">({c.name}{(c as any).meetingTime ? ` · ${(c as any).meetingTime}` : ""}{cnt != null ? ` · ${cnt} ط` : ""})</span>}
                              </div>
                              {isLeader && (
                                <Select
                                  value=""
                                  onValueChange={v => assignSoloTeacher(t, parseInt(v))}
                                >
                                  <SelectTrigger className="h-7 text-xs flex-1 border-orange-300 bg-orange-50 min-w-[140px]">
                                    <SelectValue placeholder="عيّني حلقة اختبار..." />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {scopedCircles
                                      .filter(sc => !coveredExamCircleIds.has(sc.id))
                                      .map(sc => (
                                        <SelectItem key={sc.id} value={String(sc.id)}>
                                          {sc.name}{(sc as any).meetingTime ? ` — ${(sc as any).meetingTime}` : ""}
                                          {studentCountByCircle[sc.id] != null ? ` · ${studentCountByCircle[sc.id]} ط` : ""}
                                        </SelectItem>
                                      ))}
                                  </SelectContent>
                                </Select>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* ⑥ الحلقات غير المغطاة */}
                  {(isLeader || isTrackSup) && uncoveredCircles.length > 0 && (
                    <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                      <p className="text-xs font-semibold text-red-700 mb-3">
                        🔴 حلقات لا توجد لها معلمة اختبار ({uncoveredCircles.length})
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {uncoveredCircles.map(c => {
                          const cnt = studentCountByCircle[c.id];
                          return (
                            <span key={c.id} className="text-xs bg-white border border-red-200 rounded-full px-3 py-1.5">
                              {c.name}
                              {(c as any).meetingTime ? ` · ${(c as any).meetingTime}` : ""}
                              {cnt != null ? ` · ${cnt} ط` : ""}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}

                </div>
              )}
            </div>
          );
        })}

        {rotations.length === 0 && (
          <div className="text-center py-16">
            <Shuffle className="w-14 h-14 mx-auto mb-3 text-muted-foreground/30" />
            <p className="text-muted-foreground">{isLeader ? "لا توجد شقلبات بعد — أضف أولى!" : "لا توجد شقلبات نشطة"}</p>
          </div>
        )}
      </div>

      {/* ─── نافذة إنشاء / تعديل الشقلبة (native modal) ─── */}
      {showDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => setShowDialog(false)}>
          <div className="bg-background rounded-xl border shadow-xl w-full max-w-lg mx-4 p-6 space-y-4"
            dir="rtl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">{editingRotation ? "تعديل الشقلبة" : "شقلبة جديدة"}</h2>
              <button type="button" onClick={() => setShowDialog(false)}
                className="rounded-sm opacity-70 hover:opacity-100 transition-opacity">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div><Label>الاسم *</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="اختبارات المراجعة العامة..." />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>من تاريخ *</Label><Input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} /></div>
              <div><Label>إلى تاريخ *</Label><Input type="date" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} /></div>
            </div>

            <div className="space-y-2">
              <Label>نطاق الشقلبة *</Label>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setForm(f => ({ ...f, teacherScope: "girls" }))}
                  className={`rounded-lg border p-3 text-right text-sm transition-colors ${form.teacherScope === "girls" ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted"}`}>
                  <span className="font-semibold block">معلمات الفتيات فقط</span>
                  <span className="text-xs text-muted-foreground">بين حلقات مسارات الفتيات</span>
                </button>
                <button type="button" onClick={() => setForm(f => ({ ...f, teacherScope: "selected_tracks" }))}
                  className={`rounded-lg border p-3 text-right text-sm transition-colors ${form.teacherScope === "selected_tracks" ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted"}`}>
                  <span className="font-semibold block">مسارات محددة</span>
                  <span className="text-xs text-muted-foreground">الشقلبة بين المسارات المختارة فقط</span>
                </button>
              </div>
              {form.teacherScope === "selected_tracks" && (
                <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                  <p className="text-xs text-muted-foreground">اختاري المسارات التي تتبادل معلماتها:</p>
                  <div className="grid grid-cols-2 gap-2 max-h-36 overflow-y-auto">
                    {availableTracks.map(track => (
                      <label key={track} className="flex items-center gap-2 text-sm cursor-pointer">
                        <input type="checkbox" checked={form.selectedTracks.includes(track)}
                          onChange={() => setForm(f => ({
                            ...f,
                            selectedTracks: f.selectedTracks.includes(track)
                              ? f.selectedTracks.filter(i => i !== track)
                              : [...f.selectedTracks, track],
                          }))}
                          className="accent-primary" />
                        <span>{track}</span>
                      </label>
                    ))}
                  </div>
                  {availableTracks.length === 0 && <p className="text-xs text-muted-foreground">لا توجد مسارات متاحة.</p>}
                </div>
              )}
            </div>

            <div className="flex items-center gap-3">
              <Switch checked={form.isActive} onCheckedChange={v => setForm(f => ({ ...f, isActive: v }))} />
              <Label>نشطة</Label>
            </div>

            <div className="flex gap-2 justify-start pt-2">
              <Button onClick={handleSave}>حفظ</Button>
              <Button variant="outline" onClick={() => setShowDialog(false)}>إلغاء</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
