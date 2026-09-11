import { useState } from "react";
import {
  useListTracks, useListCircles,
  useListDailyCircleTasks, useListSupervisorNames,
  useListCustomQuestions, useCreateCustomQuestion, useDeleteCustomQuestion,
  useCreateSupervisorName, useDeleteSupervisorName,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  CheckCircle2, AlertCircle, Users, ClipboardList,
  Trash2, Plus, ChevronDown, ChevronUp, CalendarDays,
} from "lucide-react";

const today = (() => { const d = new Date(Date.now() + 3*60*60*1000); if(d.getUTCHours()<5) d.setUTCDate(d.getUTCDate()-1); return d.toISOString().slice(0,10); })();
const fmtDate = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("ar-SA", { day: "2-digit", month: "long", year: "numeric" });

type Track = { id: number; name: string };

function TrackSection({ track, date }: { track: Track; date: string }) {
  const { data: circles } = useListCircles(undefined, { query: { queryKey: ["circles"] } });
  const { data: names } = useListSupervisorNames(track.id, { query: { queryKey: ["supervisorNames", track.id] } });
  const { data: tasks } = useListDailyCircleTasks({ date }, { query: { queryKey: ["dailyCircleTasks", date] } });

  const [expanded, setExpanded] = useState(true);
  const [addName, setAddName] = useState("");
  const [addingName, setAddingName] = useState(false);
  const qc = useQueryClient();
  const { toast } = useToast();
  const createName = useCreateSupervisorName();
  const deleteName = useDeleteSupervisorName();

  const trackCircles = circles?.filter(c => c.trackId === track.id && !c.isArchived) ?? [];
  const trackTasks = tasks?.filter(t => trackCircles.some(c => c.id === t.circleId)) ?? [];

  // group tasks by circle
  const circleTaskMap: Record<number, typeof trackTasks> = {};
  trackTasks.forEach(t => {
    if (!circleTaskMap[t.circleId]) circleTaskMap[t.circleId] = [];
    circleTaskMap[t.circleId].push(t);
  });

  const coveredCircles = Object.keys(circleTaskMap).length;
  const totalCircles = trackCircles.length;
  const pendingCircles = trackCircles.filter(c => !circleTaskMap[c.id]);

  const teacherLabel = (v: string) => ({ on_time: "بالوقت ✓", late: "تأخرت", absent: "غائبة ✗" }[v] ?? v);
  const prepLabel = (v: string) => ({ on_time: "بالوقت ✓", late: "تأخرت", not_done: "لم تحضر ✗" }[v] ?? v);
  const motivLabel = (v: string) => ({ done: "حفّزت ✓", not_done: "لم تحفز ✗" }[v] ?? v);
  const reportLabel = (v: string) => ({ on_time: "بالوقت ✓", late: "تأخرت", not_done: "لم ترسل ✗" }[v] ?? v);
  const statusColor = (v: string) => v.includes("on_time") || v === "done" ? "text-green-700" : v === "late" ? "text-yellow-700" : "text-red-700";

  const handleAddName = async () => {
    if (!addName.trim()) return;
    await createName.mutateAsync({ id: track.id, data: { name: addName.trim() } });
    setAddName(""); setAddingName(false);
    qc.invalidateQueries({ queryKey: ["supervisorNames", track.id] });
    toast({ title: "تمت الإضافة" });
  };

  const handleDeleteName = async (nameId: number) => {
    await deleteName.mutateAsync({ id: nameId });
    qc.invalidateQueries({ queryKey: ["supervisorNames", track.id] });
    toast({ title: "تم الحذف" });
  };

  return (
    <Card className="border-2 border-border shadow-sm">
      <button
        className="w-full px-4 py-3 flex items-center justify-between"
        onClick={() => setExpanded(p => !p)}
      >
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-primary" />
          <span className="font-bold text-sm">{track.name}</span>
          <Badge className={`text-xs ${coveredCircles === totalCircles ? "bg-green-100 text-green-800" : "bg-orange-100 text-orange-800"}`}>
            {coveredCircles}/{totalCircles} حلقة
          </Badge>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      {expanded && (
        <CardContent className="px-4 pb-4 border-t border-border/50">
          {/* Supervisor names management */}
          <div className="mt-3 mb-4">
            <p className="text-xs font-semibold text-muted-foreground mb-2">مسؤولات المسار:</p>
            <div className="flex flex-wrap gap-2 mb-2">
              {names?.map(n => (
                <div key={n.id} className="flex items-center gap-1 bg-primary/10 text-primary px-3 py-1 rounded-full text-xs font-semibold">
                  {n.name}
                  <button onClick={() => handleDeleteName(n.id)} className="hover:text-red-600 transition-colors mr-1">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
              {!addingName && (
                <button
                  onClick={() => setAddingName(true)}
                  className="flex items-center gap-1 border-2 border-dashed border-primary/40 text-primary/70 px-3 py-1 rounded-full text-xs hover:border-primary hover:text-primary transition-colors"
                >
                  <Plus className="w-3 h-3" /> إضافة مسؤولة
                </button>
              )}
            </div>
            {addingName && (
              <div className="flex gap-2 items-center">
                <Input
                  value={addName} onChange={e => setAddName(e.target.value)}
                  placeholder="اسم المسؤولة" className="h-8 text-sm"
                  onKeyDown={e => e.key === "Enter" && handleAddName()}
                  autoFocus
                />
                <Button size="sm" className="h-8 text-xs" onClick={handleAddName}>إضافة</Button>
                <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => { setAddingName(false); setAddName(""); }}>إلغاء</Button>
              </div>
            )}
          </div>

          {/* Pending circles alert */}
          {pendingCircles.length > 0 && (
            <div className="bg-orange-50 border border-orange-200 rounded-xl px-3 py-2 mb-3">
              <div className="flex items-center gap-1.5 mb-1">
                <AlertCircle className="w-4 h-4 text-orange-600" />
                <p className="text-xs font-semibold text-orange-700">لم تتم متابعتها اليوم:</p>
              </div>
              <div className="flex flex-wrap gap-1">
                {pendingCircles.map(c => (
                  <span key={c.id} className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">{c.name}</span>
                ))}
              </div>
            </div>
          )}

          {/* Completed circles */}
          {trackCircles.map(circle => {
            const circleTasks = circleTaskMap[circle.id] ?? [];
            if (circleTasks.length === 0) return null;
            return (
              <div key={circle.id} className="mb-3 bg-green-50/60 border border-green-200 rounded-xl p-3">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
                  <span className="font-semibold text-sm">{circle.name}</span>
                </div>
                {circleTasks.map(task => (
                  <div key={task.id} className="mb-2 last:mb-0">
                    <p className="text-xs font-bold text-primary mb-1">
                      ملأتها: <span className="text-foreground">{task.supervisorName}</span>
                    </p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
                      <span className="text-muted-foreground">المعلمة:</span>
                      <span className={statusColor(task.teacherAttendance)}>{teacherLabel(task.teacherAttendance)}</span>
                      <span className="text-muted-foreground">التحضير:</span>
                      <span className={statusColor(task.prepStatus)}>{prepLabel(task.prepStatus)}</span>
                      <span className="text-muted-foreground">التحفيز:</span>
                      <span className={statusColor(task.motivationStatus)}>{motivLabel(task.motivationStatus)}</span>
                      <span className="text-muted-foreground">الكشف:</span>
                      <span className={statusColor(task.reportStatus)}>{reportLabel(task.reportStatus)}</span>
                      {task.circleAbsenceCount > 0 && (
                        <>
                          <span className="text-muted-foreground">الغياب:</span>
                          <span className="text-red-700 font-semibold">{task.circleAbsenceCount}</span>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </CardContent>
      )}
    </Card>
  );
}

function CustomQuestionsPanel({ date }: { date: string }) {
  const { data: questions } = useListCustomQuestions({ date: undefined }, { query: { queryKey: ["customQuestionsAll"] } });
  const createQ = useCreateCustomQuestion();
  const deleteQ = useDeleteCustomQuestion();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({
    question: "", dateFrom: date, dateTo: date,
    questionType: "individual", answerType: "text", answerOptions: "",
  });

  const handleAdd = async () => {
    if (!form.question.trim()) return;
    const optionsJson = form.answerType === "dropdown" && form.answerOptions.trim()
      ? JSON.stringify(form.answerOptions.split(/[،,]/).map(s => s.trim()).filter(Boolean))
      : null;
    await createQ.mutateAsync({
      data: {
        question: form.question.trim(),
        dateFrom: form.dateFrom,
        dateTo: form.dateTo,
        questionType: form.questionType,
        answerType: form.answerType,
        answerOptions: optionsJson,
      } as any,
    });
    setAdding(false);
    setForm({ question: "", dateFrom: date, dateTo: date, questionType: "individual", answerType: "text", answerOptions: "" });
    qc.invalidateQueries({ queryKey: ["customQuestionsAll"] });
    toast({ title: "تمت إضافة السؤال" });
  };

  const handleDelete = async (id: number) => {
    await deleteQ.mutateAsync({ id });
    qc.invalidateQueries({ queryKey: ["customQuestionsAll"] });
    toast({ title: "تم حذف السؤال" });
  };

  return (
    <Card className="border-2 border-primary/20 shadow-sm">
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <ClipboardList className="w-4 h-4 text-primary" />
          الأسئلة المخصصة
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <div className="space-y-2 mb-3">
          {!questions || questions.length === 0 ? (
            <p className="text-xs text-muted-foreground">لا توجد أسئلة مخصصة بعد</p>
          ) : (
            questions.map(q => (
              <div key={q.id} className="flex items-start justify-between bg-muted/30 rounded-xl px-3 py-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{q.question}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{fmtDate(q.dateFrom)} ← {fmtDate(q.dateTo)}</p>
                  <div className="flex gap-1 flex-wrap mt-1">
                    <span className={`text-xs inline-block px-2 py-0.5 rounded-full font-medium ${q.questionType === "collective" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"}`}>
                      {q.questionType === "collective" ? "عام (مسار)" : "فردي (مسؤولة)"}
                    </span>
                    <span className={`text-xs inline-block px-2 py-0.5 rounded-full font-medium ${
                      (q as any).answerType === "yesno" ? "bg-amber-100 text-amber-700"
                      : (q as any).answerType === "dropdown" ? "bg-teal-100 text-teal-700"
                      : (q as any).answerType === "checklist" ? "bg-indigo-100 text-indigo-700"
                      : "bg-gray-100 text-gray-600"
                    }`}>
                      {(q as any).answerType === "yesno" ? "نعم / لا"
                        : (q as any).answerType === "dropdown" ? "قائمة خيارات"
                        : (q as any).answerType === "checklist" ? "قائمة تحقق"
                        : "نص حر"}
                    </span>
                    {((q as any).answerType === "dropdown" || (q as any).answerType === "checklist") && (q as any).answerOptions && (
                      <span className="text-xs text-muted-foreground">
                        ({(() => { try { return (JSON.parse((q as any).answerOptions) as string[]).join(" · "); } catch { return (q as any).answerOptions; } })()})
                      </span>
                    )}
                  </div>
                </div>
                <button onClick={() => handleDelete(q.id)} className="text-muted-foreground hover:text-red-600 transition-colors mt-0.5 mr-2 shrink-0">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>

        {adding ? (
          <div className="space-y-2 bg-muted/20 rounded-xl p-3">
            <textarea
              className="w-full border border-border rounded-lg px-3 py-2 text-sm resize-none"
              rows={2}
              placeholder="اكتبي السؤال..."
              value={form.question}
              onChange={e => setForm(p => ({ ...p, question: e.target.value }))}
            />
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-xs text-muted-foreground mb-1">من تاريخ:</p>
                <input type="date" className="border border-border rounded-lg px-2 py-1.5 text-xs w-full"
                  value={form.dateFrom} onChange={e => setForm(p => ({ ...p, dateFrom: e.target.value }))} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">إلى تاريخ:</p>
                <input type="date" className="border border-border rounded-lg px-2 py-1.5 text-xs w-full"
                  value={form.dateTo} onChange={e => setForm(p => ({ ...p, dateTo: e.target.value }))} />
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1.5 font-medium">نوع السؤال:</p>
              <div className="flex gap-3 flex-wrap">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="radio" name="qtype" value="individual" checked={form.questionType === "individual"} onChange={() => setForm(p => ({ ...p, questionType: "individual" }))} className="accent-primary" />
                  <span className="text-xs">فردي — كل مسؤولة تجاوب باسمها</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="radio" name="qtype" value="collective" checked={form.questionType === "collective"} onChange={() => setForm(p => ({ ...p, questionType: "collective" }))} className="accent-primary" />
                  <span className="text-xs">عام — الإجابة باسم المسار</span>
                </label>
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1.5 font-medium">نوع الإجابة:</p>
              <div className="flex gap-3 flex-wrap">
                {[
                  { value: "text", label: "نص حر" },
                  { value: "yesno", label: "نعم / لا" },
                  { value: "dropdown", label: "قائمة خيارات" },
                  { value: "checklist", label: "قائمة تحقق" },
                ].map(opt => (
                  <label key={opt.value} className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio" name="atype" value={opt.value}
                      checked={form.answerType === opt.value}
                      onChange={() => setForm(p => ({ ...p, answerType: opt.value, answerOptions: "" }))}
                      className="accent-primary"
                    />
                    <span className="text-xs">{opt.label}</span>
                  </label>
                ))}
              </div>
              {form.answerType === "dropdown" && (
                <div className="mt-2">
                  <p className="text-xs text-muted-foreground mb-1">الخيارات (افصلي بفاصلة):</p>
                  <input
                    type="text"
                    className="border border-border rounded-lg px-2 py-1.5 text-xs w-full"
                    placeholder="مثال: ممتاز، جيد، ضعيف"
                    value={form.answerOptions}
                    onChange={e => setForm(p => ({ ...p, answerOptions: e.target.value }))}
                    dir="rtl"
                  />
                </div>
              )}
              {form.answerType === "checklist" && (
                <div className="mt-2">
                  <p className="text-xs text-muted-foreground mb-1">العناصر (افصلي بفاصلة)، مثال: حلقة ١، حلقة ٢، حلقة ٣</p>
                  <input
                    type="text"
                    className="border border-border rounded-lg px-2 py-1.5 text-xs w-full"
                    placeholder="حلقة ١، حلقة ٢، حلقة ٣"
                    value={form.answerOptions}
                    onChange={e => setForm(p => ({ ...p, answerOptions: e.target.value }))}
                    dir="rtl"
                  />
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <Button size="sm" className="text-xs h-8" onClick={handleAdd}>إضافة السؤال</Button>
              <Button size="sm" variant="ghost" className="text-xs h-8" onClick={() => setAdding(false)}>إلغاء</Button>
            </div>
          </div>
        ) : (
          <Button size="sm" variant="outline" className="text-xs h-8 gap-1" onClick={() => setAdding(true)}>
            <Plus className="w-3 h-3" /> سؤال مخصص جديد
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export default function LeaderTasksPage() {
  const { data: tracks } = useListTracks({ query: { queryKey: ["tracks"] } });
  const [viewDate, setViewDate] = useState(today);

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-4" dir="rtl">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <ClipboardList className="text-primary w-6 h-6" />
          <h1 className="text-xl font-bold text-primary">متابعة المهام اليومية</h1>
        </div>
        <div className="flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-muted-foreground" />
          <input
            type="date"
            className="border border-border rounded-lg px-2 py-1.5 text-sm"
            value={viewDate}
            onChange={e => setViewDate(e.target.value)}
          />
        </div>
      </div>

      <CustomQuestionsPanel date={viewDate} />

      <div className="space-y-3">
        {tracks?.map(track => (
          <TrackSection key={track.id} track={track} date={viewDate} />
        ))}
      </div>
    </div>
  );
}
