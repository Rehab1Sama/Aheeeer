import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle, CheckCircle, Circle, Plus, Trash2, Clock,
  MessageSquare, ChevronDown, ChevronUp, CalendarCheck, Filter, X,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const getToken = () => localStorage.getItem("sana_auth_token");

interface DeputyTask {
  id: number;
  title: string;
  description: string | null;
  taskType: string;
  answerType: string;
  selectOptions: string | null;
  response: string | null;
  isCompleted: boolean;
  completedAt: string | null;
  createdAt: string;
}

interface CircleVisit {
  id: number;
  circleId: number;
  visitDate: string;
  notes: string | null;
  circleName: string;
  circleTrack: string | null;
}

interface DeputyStatus {
  hasDeputy: boolean;
  deputy?: { id: number; name: string; lastLoginAt: string | null };
  daysSinceLogin: number | null;
  inactive: boolean;
  neverLoggedIn: boolean;
  pendingTasksCount: number;
  unansweredQaCount: number;
}

const TASK_TYPE_LABELS: Record<string, string> = {
  general: "عامة",
  optional: "اختيارية",
  qa: "سؤال وجواب",
};

const TASK_TYPE_COLORS: Record<string, string> = {
  general: "bg-slate-100 text-slate-700 border-slate-200",
  optional: "bg-amber-100 text-amber-700 border-amber-200",
  qa: "bg-teal-100 text-teal-700 border-teal-200",
};

const ANSWER_TYPE_LABELS: Record<string, string> = {
  text: "كتابة حرة",
  select: "قائمة منسدلة",
  boolean: "صح / خطأ",
  checklist: "قائمة تحقق",
};

export default function DeputyBoardPage() {
  const [tasks, setTasks] = useState<DeputyTask[]>([]);
  const [visits, setVisits] = useState<CircleVisit[]>([]);
  const [status, setStatus] = useState<DeputyStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [taskType, setTaskType] = useState<"general" | "optional" | "qa">("general");
  const [answerType, setAnswerType] = useState<"text" | "select" | "boolean" | "checklist">("text");
  const [selectOptionInput, setSelectOptionInput] = useState("");
  const [selectOptions, setSelectOptions] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [visitsFilter, setVisitsFilter] = useState<"week" | "month" | "all">("week");
  const [showVisits, setShowVisits] = useState(false);
  const { toast } = useToast();

  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` };

  async function fetchData() {
    try {
      const [tasksRes, statusRes] = await Promise.all([
        fetch(`${BASE}/api/deputy/tasks`, { headers }),
        fetch(`${BASE}/api/deputy/status`, { headers }),
      ]);
      setTasks(tasksRes.ok ? await tasksRes.json() : []);
      setStatus(statusRes.ok ? await statusRes.json() : null);
    } catch {
      toast({ title: "خطأ في تحميل البيانات", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function fetchVisits(filter: string) {
    try {
      const res = await fetch(`${BASE}/api/deputy/circle-visits/history?filter=${filter}`, { headers });
      if (res.ok) setVisits(await res.json());
    } catch {}
  }

  useEffect(() => { fetchData(); }, []);
  useEffect(() => { if (showVisits) fetchVisits(visitsFilter); }, [showVisits, visitsFilter]);

  function resetForm() {
    setTitle(""); setDescription(""); setTaskType("general");
    setAnswerType("text"); setSelectOptionInput(""); setSelectOptions([]);
    setShowForm(false);
  }

  async function handleCreate() {
    if (!title.trim()) return;
    setCreating(true);
    try {
      const res = await fetch(`${BASE}/api/deputy/tasks`, {
        method: "POST", headers,
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          taskType,
          answerType: taskType === "qa" ? answerType : "text",
          selectOptions: taskType === "qa" && (answerType === "select" || answerType === "checklist") ? selectOptions : undefined,
        }),
      });
      if (!res.ok) throw new Error();
      resetForm();
      await fetchData();
      toast({ title: "تم إرسال المهمة للنائبة" });
    } catch {
      toast({ title: "حدث خطأ", variant: "destructive" });
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("هل تريدين حذف هذه المهمة؟")) return;
    setDeleting(id);
    try {
      await fetch(`${BASE}/api/deputy/tasks/${id}`, { method: "DELETE", headers });
      await fetchData();
      toast({ title: "تم حذف المهمة" });
    } catch {
      toast({ title: "حدث خطأ", variant: "destructive" });
    } finally {
      setDeleting(null);
    }
  }

  const pending = tasks.filter(t => !t.isCompleted);
  const completed = tasks.filter(t => t.isCompleted);

  function formatDateAr(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString("ar-SA", { weekday: "short", year: "numeric", month: "short", day: "numeric" });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  function TaskCard({ task }: { task: DeputyTask }) {
    const isExpanded = expandedId === task.id;
    const opts: string[] = task.selectOptions ? (() => { try { return JSON.parse(task.selectOptions!); } catch { return []; } })() : [];
    return (
      <div className={`rounded-xl border bg-card shadow-sm ${task.isCompleted ? "opacity-70" : ""}`}>
        <div className="flex items-start gap-3 p-4 cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : task.id)}>
          {task.isCompleted
            ? <CheckCircle className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
            : <Circle className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />}
          <div className="flex-1 min-w-0">
            <p className={`font-medium text-sm ${task.isCompleted ? "line-through text-muted-foreground" : ""}`}>{task.title}</p>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <Clock className="w-3 h-3 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">{new Date(task.createdAt).toLocaleDateString("ar-SA")}</span>
              <Badge className={`text-[10px] py-0 h-4 border ${TASK_TYPE_COLORS[task.taskType] ?? TASK_TYPE_COLORS.general}`}>
                {TASK_TYPE_LABELS[task.taskType] ?? task.taskType}
              </Badge>
              {task.taskType === "qa" && (
                <Badge className="text-[10px] py-0 h-4 bg-teal-50 text-teal-600 border-teal-200">
                  {ANSWER_TYPE_LABELS[task.answerType] ?? task.answerType}
                </Badge>
              )}
              {task.isCompleted && <Badge className="text-xs py-0 h-4 bg-green-100 text-green-700 border-green-200">منجزة</Badge>}
              {task.response && (
                <Badge variant="secondary" className="text-xs py-0 h-4">
                  <MessageSquare className="w-2.5 h-2.5 ml-1" />يوجد رد
                </Badge>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={(e) => { e.stopPropagation(); handleDelete(task.id); }} disabled={deleting === task.id} className="p-1.5 rounded-lg hover:bg-destructive/10 text-destructive transition-colors">
              <Trash2 className="w-4 h-4" />
            </button>
            {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </div>
        </div>
        {isExpanded && (task.description || task.response || opts.length > 0) && (
          <div className="px-4 pb-4 border-t pt-3 space-y-3">
            {task.description && (
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{task.description}</p>
            )}
            {opts.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">خيارات الإجابة:</p>
                <div className="flex flex-wrap gap-1.5">
                  {opts.map((o, i) => (
                    <span key={i} className="text-xs bg-teal-50 text-teal-700 border border-teal-200 px-2 py-0.5 rounded-full">{o}</span>
                  ))}
                </div>
              </div>
            )}
            {task.response && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-xs font-semibold text-blue-700 mb-1">رد النائبة:</p>
                <p className="text-sm text-blue-800 whitespace-pre-wrap">{task.response}</p>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-6" dir="rtl">
      <div>
        <h1 className="text-xl font-bold">مهام النائبة</h1>
        <p className="text-sm text-muted-foreground mt-1">إرسال مهام ومتابعة النائبة</p>
      </div>

      {/* Deputy status */}
      {status && (
        <div className={`rounded-xl border p-4 ${
          (status.inactive || status.neverLoggedIn || status.unansweredQaCount > 0)
            ? "border-red-300 bg-red-50"
            : "border-green-300 bg-green-50"
        }`}>
          {!status.hasDeputy ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <AlertTriangle className="w-5 h-5" />
              <span className="text-sm">لا يوجد حساب نائبة مسجّل</span>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  {(status.inactive || status.neverLoggedIn || status.unansweredQaCount > 0)
                    ? <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
                    : <CheckCircle className="w-5 h-5 text-green-600 shrink-0" />}
                  <div>
                    <p className="font-medium text-sm">{status.deputy?.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {status.neverLoggedIn ? "لم تدخل النظام بعد"
                        : status.daysSinceLogin === 0 ? "دخلت اليوم"
                        : `آخر دخول منذ ${status.daysSinceLogin} ${status.daysSinceLogin === 1 ? "يوم" : "أيام"}`}
                    </p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  {(status.inactive || status.neverLoggedIn) && (
                    <Badge className="bg-red-100 text-red-700 border-red-300 text-xs">
                      {status.neverLoggedIn ? "لم تدخل بعد" : "غير نشطة (3+ أيام)"}
                    </Badge>
                  )}
                  {status.pendingTasksCount > 0 && (
                    <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-xs">
                      {status.pendingTasksCount} مهمة معلقة
                    </Badge>
                  )}
                  {status.unansweredQaCount > 0 && (
                    <Badge className="bg-teal-100 text-teal-700 border-teal-200 text-xs">
                      {status.unansweredQaCount} سؤال بلا إجابة (+3 أيام)
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Add task form */}
      {!showForm ? (
        <Button onClick={() => setShowForm(true)} className="w-full gap-2">
          <Plus className="w-4 h-4" />
          إرسال مهمة جديدة
        </Button>
      ) : (
        <div className="rounded-xl border bg-card p-4 space-y-3 shadow-sm">
          <h2 className="font-semibold text-sm">مهمة جديدة</h2>

          {/* Task type */}
          <div>
            <p className="text-xs text-muted-foreground mb-1.5">نوع المهمة</p>
            <div className="flex gap-2 flex-wrap">
              {(["general", "optional", "qa"] as const).map(type => (
                <button key={type} onClick={() => { setTaskType(type); if (type !== "qa") setAnswerType("text"); }}
                  className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
                    taskType === type ? TASK_TYPE_COLORS[type] : "bg-white text-muted-foreground border-border hover:bg-muted/30"
                  }`}>
                  {TASK_TYPE_LABELS[type]}
                </button>
              ))}
            </div>
          </div>

          {/* Answer type — only for qa */}
          {taskType === "qa" && (
            <div>
              <p className="text-xs text-muted-foreground mb-1.5">طريقة الإجابة</p>
              <div className="flex gap-2 flex-wrap">
                {(["text", "select", "boolean", "checklist"] as const).map(at => (
                  <button key={at} onClick={() => { setAnswerType(at); setSelectOptions([]); setSelectOptionInput(""); }}
                    className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
                      answerType === at
                        ? "bg-teal-100 text-teal-800 border-teal-300"
                        : "bg-white text-muted-foreground border-border hover:bg-muted/30"
                    }`}>
                    {ANSWER_TYPE_LABELS[at]}
                  </button>
                ))}
              </div>
              {/* Select / checklist items input */}
              {(answerType === "select" || answerType === "checklist") && (
                <div className="mt-2 space-y-2">
                  {answerType === "checklist" && (
                    <p className="text-xs text-muted-foreground">أضيفي عناصر القائمة (مثل: حلقة ١، حلقة ٢...):</p>
                  )}
                  <div className="flex gap-2">
                    <Input
                      value={selectOptionInput}
                      onChange={e => setSelectOptionInput(e.target.value)}
                      placeholder={answerType === "checklist" ? "مثال: حلقة ١" : "أضيفي خيارًا..."}
                      className="text-sm flex-1"
                      onKeyDown={e => {
                        if (e.key === "Enter" && selectOptionInput.trim()) {
                          setSelectOptions(prev => [...prev, selectOptionInput.trim()]);
                          setSelectOptionInput("");
                        }
                      }}
                    />
                    <Button size="sm" variant="outline" onClick={() => {
                      if (selectOptionInput.trim()) {
                        setSelectOptions(prev => [...prev, selectOptionInput.trim()]);
                        setSelectOptionInput("");
                      }
                    }}>
                      <Plus className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                  {selectOptions.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {selectOptions.map((opt, i) => (
                        <span key={i} className="flex items-center gap-1 text-xs bg-teal-50 text-teal-800 border border-teal-200 px-2 py-0.5 rounded-full">
                          {opt}
                          <button onClick={() => setSelectOptions(prev => prev.filter((_, j) => j !== i))}>
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <Input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder={taskType === "qa" ? "اكتبي سؤالك هنا *" : "عنوان المهمة *"}
            className="text-sm"
            onKeyDown={e => e.key === "Enter" && handleCreate()}
          />
          <Textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="تفاصيل إضافية (اختياري)"
            rows={2}
            className="text-sm resize-none"
          />
          <div className="flex gap-2">
            <Button onClick={handleCreate} disabled={creating || !title.trim()} size="sm">
              {creating ? "جاري الإرسال..." : "إرسال"}
            </Button>
            <Button variant="outline" size="sm" onClick={resetForm}>إلغاء</Button>
          </div>
        </div>
      )}

      {tasks.length === 0 && !showForm && (
        <div className="text-center py-12 text-muted-foreground">
          <Circle className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>لم يتم إرسال أي مهام بعد</p>
        </div>
      )}

      {pending.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">قيد التنفيذ ({pending.length})</h2>
          {pending.map(task => <TaskCard key={task.id} task={task} />)}
        </section>
      )}

      {completed.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">المنجزة ({completed.length})</h2>
          {completed.map(task => <TaskCard key={task.id} task={task} />)}
        </section>
      )}

      {/* Circle visits */}
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <button className="w-full flex items-center justify-between p-4 hover:bg-muted/30 transition-colors" onClick={() => setShowVisits(p => !p)}>
          <div className="flex items-center gap-2">
            <CalendarCheck className="w-4 h-4 text-blue-600" />
            <span className="font-semibold text-sm">زيارات النائبة للحلقات</span>
          </div>
          {showVisits ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </button>
        {showVisits && (
          <div className="border-t">
            <div className="flex items-center gap-2 px-4 pt-3 pb-2 border-b bg-muted/20">
              <Filter className="w-3.5 h-3.5 text-muted-foreground" />
              {(["week", "month", "all"] as const).map(f => (
                <button key={f} onClick={() => setVisitsFilter(f)}
                  className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                    visitsFilter === f ? "bg-primary text-white border-primary" : "bg-white text-muted-foreground border-border hover:bg-muted/30"
                  }`}>
                  {f === "week" ? "هذا الأسبوع" : f === "month" ? "هذا الشهر" : "الكل"}
                </button>
              ))}
            </div>
            {visits.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-6">لا توجد زيارات مسجلة</p>
            ) : (
              <div className="divide-y divide-border/30 max-h-72 overflow-y-auto">
                {visits.sort((a, b) => b.visitDate.localeCompare(a.visitDate)).map(visit => (
                  <div key={visit.id} className="px-4 py-3 bg-blue-50/30">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium text-sm">{visit.circleName}</p>
                        {visit.circleTrack && <p className="text-[11px] text-muted-foreground">{visit.circleTrack}</p>}
                        {visit.notes && <p className="text-xs text-muted-foreground mt-1 italic">{visit.notes}</p>}
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0">{formatDateAr(visit.visitDate)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
