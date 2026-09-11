import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, Circle, MessageSquare, ChevronDown, ChevronUp, Clock, HelpCircle, Star } from "lucide-react";

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

const TASK_TYPE_LABELS: Record<string, string> = { general: "عامة", optional: "اختيارية", qa: "سؤال وجواب" };
const TASK_TYPE_COLORS: Record<string, string> = {
  general: "bg-slate-100 text-slate-700 border-slate-200",
  optional: "bg-amber-100 text-amber-700 border-amber-200",
  qa: "bg-teal-100 text-teal-700 border-teal-200",
};
const TASK_TYPE_ICONS: Record<string, React.ElementType> = { general: Circle, optional: Star, qa: HelpCircle };

export default function DeputyTasksPage() {
  const [tasks, setTasks] = useState<DeputyTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [responseText, setResponseText] = useState<Record<number, string>>({});
  const [booleanResponse, setBooleanResponse] = useState<Record<number, boolean | null>>({});
  const [checklistState, setChecklistState] = useState<Record<number, Record<number, boolean | null>>>({});
  const [saving, setSaving] = useState<number | null>(null);
  const { toast } = useToast();

  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` };

  async function fetchTasks() {
    try {
      const res = await fetch(`${BASE}/api/deputy/tasks`, { headers });
      if (!res.ok) throw new Error();
      setTasks(await res.json());
    } catch {
      toast({ title: "خطأ في تحميل المهام", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchTasks(); }, []);

  function buildResponse(task: DeputyTask): string | null {
    if (task.answerType === "boolean") {
      const val = booleanResponse[task.id];
      if (val === null || val === undefined) return task.response;
      return val ? "صح ✓" : "خطأ ✗";
    }
    if (task.answerType === "checklist") {
      const opts: string[] = task.selectOptions ? (() => { try { return JSON.parse(task.selectOptions!); } catch { return []; } })() : [];
      const state = checklistState[task.id] ?? {};
      if (opts.length === 0) return task.response;
      const answered = opts.every((_, i) => state[i] !== null && state[i] !== undefined);
      if (!answered) return task.response;
      return JSON.stringify(opts.map((item, i) => ({ item, checked: state[i] ?? false })));
    }
    if (task.answerType === "select") {
      return responseText[task.id]?.trim() || task.response || null;
    }
    return responseText[task.id]?.trim() || task.response || null;
  }

  async function handleComplete(task: DeputyTask) {
    setSaving(task.id);
    const response = buildResponse(task);
    try {
      const res = await fetch(`${BASE}/api/deputy/tasks/${task.id}/complete`, {
        method: "PATCH", headers, body: JSON.stringify({ response }),
      });
      if (!res.ok) throw new Error();
      await fetchTasks();
      toast({ title: "تم تحديد المهمة كمنجزة" });
    } catch {
      toast({ title: "حدث خطأ", variant: "destructive" });
    } finally { setSaving(null); }
  }

  async function handleUncomplete(task: DeputyTask) {
    setSaving(task.id);
    try {
      await fetch(`${BASE}/api/deputy/tasks/${task.id}/uncomplete`, { method: "PATCH", headers, body: JSON.stringify({}) });
      await fetchTasks();
      toast({ title: "تم إلغاء إنجاز المهمة" });
    } catch {
      toast({ title: "حدث خطأ", variant: "destructive" });
    } finally { setSaving(null); }
  }

  async function handleSaveResponse(task: DeputyTask) {
    setSaving(task.id);
    const response = buildResponse(task);
    if (!response) return;
    try {
      await fetch(`${BASE}/api/deputy/tasks/${task.id}/respond`, {
        method: "PATCH", headers, body: JSON.stringify({ response }),
      });
      await fetchTasks();
      setResponseText(prev => ({ ...prev, [task.id]: "" }));
      toast({ title: "تم حفظ الرد" });
    } catch {
      toast({ title: "حدث خطأ", variant: "destructive" });
    } finally { setSaving(null); }
  }

  const pending = tasks.filter(t => !t.isCompleted);
  const completed = tasks.filter(t => t.isCompleted);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  function ChecklistResponse({ task }: { task: DeputyTask }) {
    const opts: string[] = task.selectOptions ? (() => { try { return JSON.parse(task.selectOptions!); } catch { return []; } })() : [];
    const state = checklistState[task.id] ?? {};
    const allAnswered = opts.length > 0 && opts.every((_, i) => state[i] !== null && state[i] !== undefined);

    return (
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">ضعي علامة صح أو خطأ لكل بند:</p>
        <div className="space-y-2">
          {opts.map((item, i) => {
            const val = state[i];
            return (
              <div key={i} className="flex items-center gap-2 bg-muted/20 rounded-lg px-3 py-2">
                <span className="flex-1 text-sm">{item}</span>
                <button
                  onClick={() => setChecklistState(prev => ({ ...prev, [task.id]: { ...(prev[task.id] ?? {}), [i]: true } }))}
                  className={`px-3 py-1 rounded-lg text-xs font-bold border-2 transition-all ${val === true ? "border-emerald-500 bg-emerald-100 text-emerald-700" : "border-border text-muted-foreground hover:border-emerald-300"}`}
                >✓ صح</button>
                <button
                  onClick={() => setChecklistState(prev => ({ ...prev, [task.id]: { ...(prev[task.id] ?? {}), [i]: false } }))}
                  className={`px-3 py-1 rounded-lg text-xs font-bold border-2 transition-all ${val === false ? "border-rose-500 bg-rose-100 text-rose-700" : "border-border text-muted-foreground hover:border-rose-300"}`}
                >✗ خطأ</button>
              </div>
            );
          })}
        </div>
        {allAnswered && (
          <div className="flex gap-2">
            {!task.isCompleted && (
              <Button size="sm" onClick={() => handleComplete(task)} disabled={saving === task.id} className="bg-green-600 hover:bg-green-700">
                <CheckCircle className="w-4 h-4 ml-1" />تأكيد الإجابة
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => handleSaveResponse(task)} disabled={saving === task.id}>
              <MessageSquare className="w-4 h-4 ml-1" />حفظ الرد
            </Button>
          </div>
        )}
      </div>
    );
  }

  function ResponseInput({ task }: { task: DeputyTask }) {
    const opts: string[] = task.selectOptions ? (() => { try { return JSON.parse(task.selectOptions!); } catch { return []; } })() : [];

    if (task.answerType === "checklist") {
      return <ChecklistResponse task={task} />;
    }

    if (task.answerType === "boolean") {
      const currentBool = booleanResponse[task.id];
      return (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">اختاري الإجابة:</p>
          <div className="flex gap-3">
            <button
              onClick={() => setBooleanResponse(prev => ({ ...prev, [task.id]: true }))}
              className={`flex-1 py-3 rounded-xl text-sm font-bold border-2 transition-all ${
                currentBool === true ? "border-emerald-500 bg-emerald-100 text-emerald-700" : "border-border text-muted-foreground hover:border-emerald-300"
              }`}
            >
              ✓ صح
            </button>
            <button
              onClick={() => setBooleanResponse(prev => ({ ...prev, [task.id]: false }))}
              className={`flex-1 py-3 rounded-xl text-sm font-bold border-2 transition-all ${
                currentBool === false ? "border-rose-500 bg-rose-100 text-rose-700" : "border-border text-muted-foreground hover:border-rose-300"
              }`}
            >
              ✗ خطأ
            </button>
          </div>
          <div className="flex gap-2">
            {!task.isCompleted && currentBool !== null && currentBool !== undefined && (
              <Button size="sm" onClick={() => handleComplete(task)} disabled={saving === task.id} className="bg-green-600 hover:bg-green-700">
                <CheckCircle className="w-4 h-4 ml-1" />
                تأكيد الإجابة
              </Button>
            )}
            {currentBool !== null && currentBool !== undefined && (
              <Button size="sm" variant="outline" onClick={() => handleSaveResponse(task)} disabled={saving === task.id}>
                <MessageSquare className="w-4 h-4 ml-1" />
                حفظ الرد
              </Button>
            )}
          </div>
        </div>
      );
    }

    if (task.answerType === "select" && opts.length > 0) {
      return (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">اختاري الإجابة:</p>
          <div className="flex flex-wrap gap-2">
            {opts.map((opt, i) => (
              <button
                key={i}
                onClick={() => setResponseText(prev => ({ ...prev, [task.id]: opt }))}
                className={`text-sm px-4 py-2 rounded-xl border-2 font-medium transition-all ${
                  responseText[task.id] === opt
                    ? "border-teal-500 bg-teal-100 text-teal-800"
                    : "border-border text-muted-foreground hover:border-teal-300"
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            {!task.isCompleted && responseText[task.id] && (
              <Button size="sm" onClick={() => handleComplete(task)} disabled={saving === task.id} className="bg-green-600 hover:bg-green-700">
                <CheckCircle className="w-4 h-4 ml-1" />
                تأكيد الإجابة
              </Button>
            )}
            {responseText[task.id] && (
              <Button size="sm" variant="outline" onClick={() => handleSaveResponse(task)} disabled={saving === task.id}>
                <MessageSquare className="w-4 h-4 ml-1" />
                حفظ الرد
              </Button>
            )}
          </div>
        </div>
      );
    }

    // Default: text
    return (
      <div className="space-y-2">
        <Textarea
          value={responseText[task.id] ?? ""}
          onChange={e => setResponseText(prev => ({ ...prev, [task.id]: e.target.value }))}
          placeholder={task.taskType === "qa" ? "اكتبي إجابتك هنا..." : "أضيفي ردًا أو ملاحظة..."}
          rows={3}
          className="text-sm resize-none"
        />
        <div className="flex gap-2">
          {!task.isCompleted && (
            <Button size="sm" onClick={() => handleComplete(task)} disabled={saving === task.id} className="bg-green-600 hover:bg-green-700">
              <CheckCircle className="w-4 h-4 ml-1" />
              {task.taskType === "qa" ? "تأكيد الإجابة" : "تحديد كمنجزة"}
            </Button>
          )}
          {responseText[task.id]?.trim() && (
            <Button size="sm" variant="outline" onClick={() => handleSaveResponse(task)} disabled={saving === task.id}>
              <MessageSquare className="w-4 h-4 ml-1" />
              حفظ الرد
            </Button>
          )}
        </div>
      </div>
    );
  }

  function TaskCard({ task }: { task: DeputyTask }) {
    const isExpanded = expandedId === task.id;
    const TypeIcon = TASK_TYPE_ICONS[task.taskType] ?? Circle;
    return (
      <div className={`rounded-xl border bg-card shadow-sm ${task.isCompleted ? "opacity-70" : ""}`}>
        <div className="flex items-start gap-3 p-4 cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : task.id)}>
          <button className="mt-0.5 shrink-0" onClick={(e) => {
            e.stopPropagation();
            task.isCompleted ? handleUncomplete(task) : handleComplete(task);
          }} disabled={saving === task.id}>
            {task.isCompleted ? <CheckCircle className="w-6 h-6 text-green-500" /> : <Circle className="w-6 h-6 text-muted-foreground" />}
          </button>
          <div className="flex-1 min-w-0">
            <p className={`font-medium text-sm leading-snug ${task.isCompleted ? "line-through text-muted-foreground" : ""}`}>{task.title}</p>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <Clock className="w-3 h-3 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">{new Date(task.createdAt).toLocaleDateString("ar-SA")}</span>
              <Badge className={`text-[10px] py-0 h-4 border flex items-center gap-0.5 ${TASK_TYPE_COLORS[task.taskType] ?? TASK_TYPE_COLORS.general}`}>
                <TypeIcon className="w-2.5 h-2.5" />
                {TASK_TYPE_LABELS[task.taskType] ?? task.taskType}
              </Badge>
              {task.response && (
                <Badge variant="secondary" className="text-xs py-0 h-4">
                  <MessageSquare className="w-2.5 h-2.5 ml-1" />لديك رد
                </Badge>
              )}
              {task.isCompleted && <Badge className="text-xs py-0 h-4 bg-green-100 text-green-700 border-green-200">منجزة</Badge>}
            </div>
          </div>
          {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
        </div>

        {isExpanded && (
          <div className="px-4 pb-4 space-y-3 border-t pt-3">
            {task.description && <p className="text-sm text-muted-foreground whitespace-pre-wrap">{task.description}</p>}
            {task.response && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                <p className="text-xs font-medium text-green-700 mb-1">ردك:</p>
                {task.answerType === "checklist" && (() => {
                  try {
                    const items = JSON.parse(task.response!) as { item: string; checked: boolean }[];
                    return (
                      <div className="space-y-1">
                        {items.map((it, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <span className={`text-xs font-bold ${it.checked ? "text-emerald-700" : "text-rose-600"}`}>{it.checked ? "✓" : "✗"}</span>
                            <span className="text-sm text-green-800">{it.item}</span>
                          </div>
                        ))}
                      </div>
                    );
                  } catch { return <p className="text-sm text-green-800 whitespace-pre-wrap">{task.response}</p>; }
                })()}
                {task.answerType !== "checklist" && <p className="text-sm text-green-800 whitespace-pre-wrap">{task.response}</p>}
              </div>
            )}
            {!task.isCompleted && <ResponseInput task={task} />}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-6" dir="rtl">
      <div>
        <h1 className="text-xl font-bold">مهامي</h1>
        <p className="text-sm text-muted-foreground mt-1">المهام المرسلة من القائدة</p>
      </div>
      {tasks.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <Circle className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>لا توجد مهام حاليًا</p>
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
    </div>
  );
}
