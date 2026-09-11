import {
  useGetRegistrationStatus,
  useOpenRegistration,
  useCloseRegistration,
  useListStudents,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle, XCircle, ClipboardList, Users, Plus, Trash2, GripVertical,
  Settings, BookUser, GraduationCap, Eye, Wand2, ChevronDown, ChevronUp,
} from "lucide-react";
import { useState, useEffect } from "react";
import { Textarea } from "@/components/ui/textarea";

const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, "");
const getToken = () => localStorage.getItem("sana_auth_token");

async function apiPost(path: string, body?: unknown) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ── Types ──────────────────────────────────────────────────────────────────
interface CustomQuestion {
  id: string;
  label: string;
  type: "text" | "select" | "yesno";
  options?: string[];
  required: boolean;
}

interface WizardTrack { id: string; name: string; description: string; order: number; }
type WizardQuestionType = "text" | "essay" | "select" | "true_false" | "yesno" | "number" | "country" | "quran_surah" | "quran_juz";
interface WizardQuestion { id: string; label: string; type: WizardQuestionType; options?: string[]; required: boolean; }
interface WizardRegCircle { circleId: number; capacity: number | null; }
interface AllCircle { id: number; name: string; track: string; meetingTime: string | null; }

const WIZARD_Q_TYPES = [
  { v: "text", l: "نص قصير" }, { v: "essay", l: "نص طويل" }, { v: "select", l: "قائمة اختيارية" },
  { v: "true_false", l: "صح / خطأ" }, { v: "yesno", l: "نعم / لا" }, { v: "number", l: "رقم" },
  { v: "country", l: "اختيار الدولة" }, { v: "quran_surah", l: "اختيار سورة" }, { v: "quran_juz", l: "اختيار جزء" },
] as const;

// ── Wizard Builder Section ──────────────────────────────────────────────────
function WizardBuilderSection() {
  const { toast } = useToast();
  const [tracks, setTracks] = useState<WizardTrack[]>([]);
  const [questions, setQuestions] = useState<WizardQuestion[]>([]);
  const [regCircles, setRegCircles] = useState<WizardRegCircle[]>([]);
  const [allCircles, setAllCircles] = useState<AllCircle[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [openSection, setOpenSection] = useState<"tracks" | "circles" | "questions" | null>("tracks");

  useEffect(() => {
    fetch(`${BASE_URL}/api/registration/admin/wizard-config`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
      .then(r => r.json())
      .then((data: any) => {
        setTracks(data.tracks ?? []);
        setQuestions(data.questions ?? []);
        setRegCircles(data.registrationCircles ?? []);
        setAllCircles(data.allCircles ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${BASE_URL}/api/registration/admin/wizard-config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ tracks, questions, registrationCircles: regCircles }),
      });
      if (!res.ok) throw new Error();
      toast({ title: "تم حفظ إعدادات المعالج بنجاح ✓" });
    } catch {
      toast({ title: "خطأ في الحفظ", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const addTrack = () => setTracks(ts => [...ts, { id: `t_${Date.now()}`, name: "", description: "", order: ts.length }]);
  const updateTrack = (idx: number, val: Partial<WizardTrack>) => setTracks(ts => ts.map((t, i) => i === idx ? { ...t, ...val } : t));
  const deleteTrack = (idx: number) => setTracks(ts => ts.filter((_, i) => i !== idx));

  const addQuestion = () => setQuestions(qs => [...qs, { id: `q_${Date.now()}`, label: "", type: "text", required: false }]);
  const updateQuestion = (idx: number, val: Partial<WizardQuestion>) => setQuestions(qs => qs.map((q, i) => i === idx ? { ...q, ...val } : q));
  const deleteQuestion = (idx: number) => setQuestions(qs => qs.filter((_, i) => i !== idx));

  const availableCircles = allCircles.filter(c => !regCircles.some(rc => rc.circleId === c.id));
  const addCircle = (id: number) => setRegCircles(cs => [...cs, { circleId: id, capacity: null }]);
  const updateCircle = (idx: number, capacity: number | null) => setRegCircles(cs => cs.map((c, i) => i === idx ? { ...c, capacity } : c));
  const removeCircle = (idx: number) => setRegCircles(cs => cs.filter((_, i) => i !== idx));

  const SecHeader = ({ title, icon, id, count }: { title: string; icon: React.ReactNode; id: typeof openSection; count: number }) => (
    <button type="button" onClick={() => setOpenSection(openSection === id ? null : id)}
      className="w-full flex items-center justify-between p-3 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors">
      <div className="flex items-center gap-2">
        {icon}
        <span className="font-semibold text-sm">{title}</span>
        <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">{count}</span>
      </div>
      {openSection === id ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
    </button>
  );

  if (loading) return <p className="text-center text-sm text-muted-foreground py-6">جاري التحميل...</p>;

  return (
    <div className="space-y-3">
      {/* ── المسارات ── */}
      <SecHeader title="المسارات" icon={<GraduationCap className="w-4 h-4 text-primary" />} id="tracks" count={tracks.length} />
      {openSection === "tracks" && (
        <div className="space-y-3 px-1">
          {tracks.length === 0
            ? <p className="text-xs text-muted-foreground text-center py-4 border border-dashed rounded-xl">لا توجد مسارات — اضغطي "إضافة مسار"</p>
            : tracks.map((t, idx) => (
              <div key={t.id} className="border border-border rounded-xl p-3 space-y-2 bg-white/60">
                <div className="flex items-center gap-2">
                  <Input value={t.name} onChange={e => updateTrack(idx, { name: e.target.value })}
                    placeholder="اسم المسار (مثل: حفظ 4 أيام، تصحيح تلاوة)" className="flex-1 text-sm font-semibold" />
                  <Button variant="ghost" size="icon" onClick={() => deleteTrack(idx)} className="text-rose-500 hover:bg-rose-50 h-8 w-8 shrink-0">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
                <Textarea value={t.description} onChange={e => updateTrack(idx, { description: e.target.value })}
                  placeholder="اكتبي هنا شرح نظام هذا المسار — سيظهر للطالبة في الخطوة الثانية من معالج التسجيل..."
                  className="text-sm min-h-[100px] text-right" />
              </div>
            ))
          }
          <Button size="sm" variant="outline" onClick={addTrack} className="text-xs w-full gap-1">
            <Plus className="w-3 h-3" />إضافة مسار
          </Button>
        </div>
      )}

      {/* ── الحلقات المتاحة ── */}
      <SecHeader title="الحلقات المتاحة للاختيار" icon={<Users className="w-4 h-4 text-primary" />} id="circles" count={regCircles.length} />
      {openSection === "circles" && (
        <div className="space-y-3 px-1">
          <p className="text-xs text-muted-foreground bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
            جميع الطالبات الجدد يُضافن تلقائيًا لحلقة "تسجيل" للمراجعة. اختيار الحلقة هنا هو تفضيل فقط.
          </p>
          {regCircles.length === 0
            ? <p className="text-xs text-muted-foreground text-center py-4 border border-dashed rounded-xl">لا توجد حلقات — اختاري من القائمة أدناه</p>
            : regCircles.map((rc, idx) => {
              const circle = allCircles.find(c => c.id === rc.circleId);
              return (
                <div key={rc.circleId} className="border border-border rounded-xl p-3 bg-white/60 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{circle?.name ?? `حلقة ${rc.circleId}`}</p>
                    {circle?.meetingTime && <p className="text-xs text-muted-foreground">{circle.meetingTime}</p>}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Label className="text-xs text-muted-foreground whitespace-nowrap">الحد الأقصى</Label>
                    <Input type="number" min={1} value={rc.capacity ?? ""}
                      onChange={e => updateCircle(idx, e.target.value ? Number(e.target.value) : null)}
                      placeholder="∞" className="w-16 text-center text-sm h-8" />
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => removeCircle(idx)} className="text-rose-500 hover:bg-rose-50 h-8 w-8 shrink-0">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              );
            })
          }
          {availableCircles.length > 0 && (
            <Select onValueChange={v => addCircle(Number(v))}>
              <SelectTrigger className="text-xs">
                <SelectValue placeholder="+ اختاري حلقة لإضافتها..." />
              </SelectTrigger>
              <SelectContent>
                {availableCircles.map(c => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.name}{c.meetingTime ? ` — ${c.meetingTime}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      )}

      {/* ── الأسئلة ── */}
      <SecHeader title="أسئلة الاستمارة" icon={<ClipboardList className="w-4 h-4 text-primary" />} id="questions" count={questions.length} />
      {openSection === "questions" && (
        <div className="space-y-3 px-1">
          {questions.length === 0
            ? <p className="text-xs text-muted-foreground text-center py-4 border border-dashed rounded-xl">لا توجد أسئلة — اضغطي "إضافة سؤال"</p>
            : questions.map((q, idx) => (
              <div key={q.id} className="border border-border rounded-xl p-3 space-y-2 bg-white/60">
                <div className="flex items-center gap-2">
                  <GripVertical className="w-4 h-4 text-muted-foreground shrink-0" />
                  <Input value={q.label} onChange={e => updateQuestion(idx, { label: e.target.value })}
                    placeholder="نص السؤال" className="flex-1 text-sm" />
                  <Button variant="ghost" size="icon" onClick={() => deleteQuestion(idx)} className="text-rose-500 hover:bg-rose-50 h-8 w-8 shrink-0">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
                <div className="flex items-center gap-3 pr-6">
                  <Select value={q.type} onValueChange={v => updateQuestion(idx, { type: v as WizardQuestionType, options: [] })}>
                    <SelectTrigger className="flex-1 text-xs h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {WIZARD_Q_TYPES.map(t => <SelectItem key={t.v} value={t.v}>{t.l}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <div className="flex items-center gap-1 shrink-0">
                    <Switch checked={q.required} onCheckedChange={v => updateQuestion(idx, { required: v })} id={`wq-${q.id}`} />
                    <Label htmlFor={`wq-${q.id}`} className="text-xs text-muted-foreground whitespace-nowrap">إلزامي</Label>
                  </div>
                </div>
                {q.type === "select" && (
                  <div className="pr-6">
                    <Input value={(q.options ?? []).join("، ")}
                      onChange={e => updateQuestion(idx, { options: e.target.value.split("،").map(s => s.trim()).filter(Boolean) })}
                      placeholder="الخيارات مفصولة بفاصلة عربية: نعم، لا، أحيانًا" className="text-xs" />
                    <p className="text-[10px] text-muted-foreground mt-1">افصلي بين الخيارات بفاصلة عربية (،)</p>
                  </div>
                )}
              </div>
            ))
          }
          <Button size="sm" variant="outline" onClick={addQuestion} className="text-xs w-full gap-1">
            <Plus className="w-3 h-3" />إضافة سؤال
          </Button>
        </div>
      )}

      <Button onClick={save} disabled={saving} className="w-full mt-1">
        {saving ? "جاري الحفظ..." : "💾 حفظ إعدادات المعالج"}
      </Button>
    </div>
  );
}

// ── Question Editor Row ────────────────────────────────────────────────────
function QuestionRow({
  q, onChange, onDelete,
}: {
  q: CustomQuestion;
  onChange: (q: CustomQuestion) => void;
  onDelete: () => void;
}) {
  const [optionsStr, setOptionsStr] = useState((q.options ?? []).join("، "));

  useEffect(() => {
    if (q.type === "select") {
      const opts = optionsStr.split("،").map(s => s.trim()).filter(Boolean);
      onChange({ ...q, options: opts });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [optionsStr]);

  return (
    <div className="border border-border rounded-xl p-3 space-y-2 bg-muted/20" data-testid="question-row">
      <div className="flex items-center gap-2">
        <GripVertical className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        <Input
          value={q.label}
          onChange={e => onChange({ ...q, label: e.target.value })}
          placeholder="نص السؤال"
          className="flex-1 text-sm min-w-0"
          data-testid="input-question-label"
        />
        <Button variant="ghost" size="icon" onClick={onDelete} className="text-rose-500 hover:bg-rose-50 h-8 w-8 flex-shrink-0">
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
      <div className="flex items-center gap-3 pr-6">
        <Select value={q.type} onValueChange={v => onChange({ ...q, type: v as CustomQuestion["type"], options: [] })}>
          <SelectTrigger className="w-32 text-xs" data-testid="select-question-type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="text">نص حر</SelectItem>
            <SelectItem value="select">قائمة</SelectItem>
            <SelectItem value="yesno">نعم/لا</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1">
          <Switch
            checked={q.required}
            onCheckedChange={v => onChange({ ...q, required: v })}
            id={`req-${q.id}`}
          />
          <Label htmlFor={`req-${q.id}`} className="text-xs text-muted-foreground whitespace-nowrap">إلزامي</Label>
        </div>
      </div>
      {q.type === "select" && (
        <div className="pr-6">
          <Input
            value={optionsStr}
            onChange={e => setOptionsStr(e.target.value)}
            placeholder="الخيارات مفصولة بفاصلة عربية: نعم، لا، أحيانًا"
            className="text-xs"
            data-testid="input-question-options"
          />
          <p className="text-xs text-muted-foreground mt-1">افصلي بين الخيارات بفاصلة عربية (،)</p>
        </div>
      )}
    </div>
  );
}

// ── Custom Questions Section ────────────────────────────────────────────────
function CustomQuestionsEditor({ formType }: { formType: "student" | "staff" }) {
  const { data: status } = useGetRegistrationStatus({ query: { queryKey: ["regStatus"] } });
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [questions, setQuestions] = useState<CustomQuestion[]>([]);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const raw = formType === "staff"
      ? (status as any)?.staffCustomQuestions
      : status?.customQuestions;
    if (raw && !loaded) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setQuestions(parsed);
          setLoaded(true);
        }
      } catch {
        // ignore
      }
    } else if (status && !loaded) {
      setLoaded(true);
    }
  }, [status, loaded, formType]);

  const addQuestion = () => {
    const newQ: CustomQuestion = {
      id: `q_${Date.now()}`,
      label: "",
      type: "text",
      required: false,
    };
    setQuestions(qs => [...qs, newQ]);
  };

  const updateQuestion = (idx: number, q: CustomQuestion) => {
    setQuestions(qs => qs.map((old, i) => (i === idx ? q : old)));
  };

  const deleteQuestion = (idx: number) => {
    setQuestions(qs => qs.filter((_, i) => i !== idx));
  };

  const saveQuestions = async () => {
    const invalid = questions.filter(q => !q.label.trim());
    if (invalid.length > 0) {
      toast({ title: "يرجى تعبئة نص جميع الأسئلة", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await apiPost("/api/registration/save-questions", { formType, questions });
      toast({ title: "تم حفظ الأسئلة بنجاح" });
      queryClient.invalidateQueries({ queryKey: ["regStatus"] });
    } catch {
      toast({ title: "خطأ في الحفظ", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-muted-foreground flex items-center gap-2">
          <Settings className="w-4 h-4" />
          الأسئلة الإضافية في الاستمارة ({questions.length})
        </h3>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={addQuestion}
            className="text-xs"
            data-testid="button-add-question"
          >
            <Plus className="w-3 h-3 me-1" />
            إضافة سؤال
          </Button>
          <Button
            size="sm"
            onClick={saveQuestions}
            disabled={saving}
            className="text-xs"
            data-testid="button-save-questions"
          >
            {saving ? "جاري الحفظ..." : "حفظ الأسئلة"}
          </Button>
        </div>
      </div>

      {questions.length === 0 ? (
        <div className="text-center py-6 text-muted-foreground text-sm border border-dashed border-border rounded-xl">
          لا توجد أسئلة إضافية — اضغطي "إضافة سؤال" لإضافة أسئلة مخصصة
        </div>
      ) : (
        <div className="space-y-2">
          {questions.map((q, idx) => (
            <QuestionRow
              key={q.id}
              q={q}
              onChange={updated => updateQuestion(idx, updated)}
              onDelete={() => deleteQuestion(idx)}
            />
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        ستظهر هذه الأسئلة للطالبة في استمارة التسجيل بعد الحقول الأساسية
      </p>
    </div>
  );
}

// ── Student Answers Dialog ──────────────────────────────────────────────────
function StudentAnswersDialog({
  student,
  questions,
  onClose,
}: {
  student: any;
  questions: { label: string; type: string }[];
  onClose: () => void;
}) {
  let extraData: Record<string, string> = {};
  try {
    if (student.extraData) extraData = JSON.parse(student.extraData);
  } catch {}

  const allKeys = Object.keys(extraData);
  const hasAnswers = allKeys.length > 0;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base font-bold">أجوبة الاستمارة — {student.fullName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-1 text-sm">
          {/* بيانات أساسية */}
          <div className="bg-muted/30 rounded-lg p-3 space-y-1 mb-3">
            {student.phone && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">الجوال</span>
                <span className="font-medium" dir="ltr">{student.phone}</span>
              </div>
            )}
            {student.country && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">الدولة</span>
                <span className="font-medium">{student.country}</span>
              </div>
            )}
            {student.ageRange && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">الفئة العمرية</span>
                <span className="font-medium">{student.ageRange}</span>
              </div>
            )}
          </div>

          {/* أجوبة الأسئلة الإضافية */}
          {hasAnswers ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground font-semibold border-b pb-1">الأسئلة الإضافية</p>
              {allKeys.map(key => (
                <div key={key} className="flex justify-between gap-3 py-1.5 border-b border-border/40 last:border-0">
                  <span className="text-muted-foreground shrink-0">{key}</span>
                  <span className="font-medium text-left">{String(extraData[key]) || "—"}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-4 text-xs">
              لم تُجِب الطالبة على أسئلة إضافية
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────
export default function RegistrationManagePage() {
  const { data: status } = useGetRegistrationStatus({ query: { queryKey: ["regStatus"] } });
  const { data: students } = useListStudents(undefined, { query: { queryKey: ["students"] } });
  const openReg = useOpenRegistration();
  const closeReg = useCloseRegistration();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [staffLoading, setStaffLoading] = useState(false);
  const [viewingStudent, setViewingStudent] = useState<any>(null);
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [periodLoading, setPeriodLoading] = useState(false);
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);

  const handleOpen = () => {
    openReg.mutate(
      { data: {} },
      {
        onSuccess: () => { toast({ title: "تم فتح تسجيل الطالبات" }); queryClient.invalidateQueries({ queryKey: ["regStatus"] }); },
        onError: () => toast({ title: "خطأ", variant: "destructive" }),
      }
    );
  };

  const handleSetPeriod = async () => {
    if (!periodStart || !periodEnd) {
      toast({ title: "يرجى تحديد تاريخ البداية والنهاية", variant: "destructive" });
      return;
    }
    if (new Date(periodEnd) <= new Date(periodStart)) {
      toast({ title: "تاريخ النهاية يجب أن يكون بعد تاريخ البداية", variant: "destructive" });
      return;
    }
    setPeriodLoading(true);
    try {
      const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, "");
      const token = localStorage.getItem("sana_auth_token");
      const res = await fetch(`${BASE_URL}/api/registration/open`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ startDate: periodStart, deadline: periodEnd }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast({ title: `تم تعيين مدة التسجيل من ${periodStart} إلى ${periodEnd}` });
      queryClient.invalidateQueries({ queryKey: ["regStatus"] });
    } catch {
      toast({ title: "خطأ في الحفظ", variant: "destructive" });
    } finally {
      setPeriodLoading(false);
    }
  };

  const handleClose = () => {
    closeReg.mutate(undefined, {
      onSuccess: () => { toast({ title: "تم إغلاق تسجيل الطالبات" }); queryClient.invalidateQueries({ queryKey: ["regStatus"] }); },
      onError: () => toast({ title: "خطأ", variant: "destructive" }),
    });
  };

  const handleStaffToggle = async (open: boolean) => {
    setStaffLoading(true);
    try {
      const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, "");
      const token = localStorage.getItem("sana_auth_token");
      if (open) {
        await fetch(`${BASE_URL}/api/registration/staff-open`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ allowedRoles: selectedRoles.length > 0 ? selectedRoles : undefined }),
        });
      } else {
        await fetch(`${BASE_URL}/api/registration/staff-close`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
      }
      toast({ title: open ? "تم فتح تسجيل الكادر" : "تم إغلاق تسجيل الكادر" });
      queryClient.invalidateQueries({ queryKey: ["regStatus"] });
    } catch {
      toast({ title: "خطأ في الاتصال", variant: "destructive" });
    } finally {
      setStaffLoading(false);
    }
  };

  const staffOpen = status?.staffRegistrationOpen !== false;
  const existingOpen = status?.existingStudentRegOpen === true;

  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">إدارة التسجيل</h1>
        <p className="text-muted-foreground text-sm mt-1">التحكم الكامل في استمارات التسجيل وأسئلتها</p>
      </div>

      {/* ── معالج الاستمارة ── */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-bold flex items-center gap-2">
            <Wand2 className="w-4 h-4 text-primary" />
            معالج استمارة التسجيل
          </CardTitle>
          <p className="text-xs text-muted-foreground">أنشئي مسارات التسجيل وأسئلة الاستمارة والحلقات المتاحة</p>
        </CardHeader>
        <CardContent>
          <WizardBuilderSection />
        </CardContent>
      </Card>

      {/* ── استمارة الطالبات ── */}
      <Card className="border-0 shadow-sm" data-testid="card-student-registration">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-bold flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-primary" />
            استمارة الطالبات الجديدات
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Open/Close */}
          <div className="flex items-center justify-between gap-4 flex-wrap bg-muted/30 rounded-xl p-4">
            <div className="flex items-center gap-3">
              {status?.isOpen ? (
                <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                  <CheckCircle className="w-5 h-5 text-emerald-600" />
                </div>
              ) : (
                <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center">
                  <XCircle className="w-5 h-5 text-rose-600" />
                </div>
              )}
              <div>
                <p className="font-bold">التسجيل {status?.isOpen ? "مفتوح" : "مغلق"}</p>
                <p className="text-xs text-muted-foreground">{students?.length ?? 0} طالبة مسجلة</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleOpen} disabled={status?.isOpen || openReg.isPending}
                className="bg-emerald-600 hover:bg-emerald-700 text-white" data-testid="button-open-registration">
                فتح التسجيل
              </Button>
              <Button onClick={handleClose} disabled={!status?.isOpen || closeReg.isPending}
                variant="destructive" data-testid="button-close-registration">
                إغلاق التسجيل
              </Button>
            </div>
          </div>

          {status?.isOpen && (
            <div className="bg-emerald-50 rounded-lg px-4 py-3">
              <p className="text-sm font-semibold text-emerald-800 mb-1">رابط استمارة تسجيل الطالبات</p>
              <p className="text-xs text-emerald-600 font-mono break-all">{window.location.origin}/register</p>
            </div>
          )}

          {/* Current Period Display */}
          {((status as any)?.startDate || (status as any)?.deadline) && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm">
              <p className="font-semibold text-amber-800 mb-1 flex items-center gap-1">
                <Settings className="w-3.5 h-3.5" />
                المدة الزمنية المحددة
              </p>
              <div className="text-amber-700 space-y-0.5">
                {(status as any).startDate && <p>البداية: {(status as any).startDate}</p>}
                {(status as any).deadline && <p>النهاية: {(status as any).deadline}</p>}
              </div>
            </div>
          )}

          {/* Period Setter */}
          <div className="border border-dashed border-border rounded-xl p-4 space-y-3">
            <p className="text-sm font-bold text-muted-foreground flex items-center gap-2">
              <Settings className="w-4 h-4" />
              تعيين مدة التسجيل (فتح تلقائي وإغلاق تلقائي)
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">تاريخ البداية</Label>
                <Input
                  type="date"
                  value={periodStart}
                  onChange={e => setPeriodStart(e.target.value)}
                  className="text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">تاريخ النهاية</Label>
                <Input
                  type="date"
                  value={periodEnd}
                  onChange={e => setPeriodEnd(e.target.value)}
                  className="text-sm"
                />
              </div>
            </div>
            <Button
              onClick={handleSetPeriod}
              disabled={periodLoading || !periodStart || !periodEnd}
              className="w-full text-sm"
              size="sm"
            >
              {periodLoading ? "جاري الحفظ..." : "تعيين المدة وفتح التسجيل"}
            </Button>
            <p className="text-xs text-muted-foreground">
              سيُفتح التسجيل تلقائياً في تاريخ البداية ويُغلق تلقائياً في تاريخ النهاية
            </p>
          </div>

          {/* Auto-approve toggle */}
          <div className="flex items-center justify-between gap-4 bg-muted/30 rounded-xl p-4">
            <div>
              <p className="font-semibold text-sm">قبول الطالبات تلقائياً</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {(status as any)?.autoApproveStudents
                  ? "الطالبات يُقبلن فور التسجيل بدون مراجعة"
                  : "الطالبات تبقى معلقة حتى يتم قبولهن يدوياً"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {(status as any)?.autoApproveStudents ? "مفعّل" : "معطّل"}
              </span>
              <Switch
                checked={(status as any)?.autoApproveStudents ?? false}
                onCheckedChange={async (checked) => {
                  try {
                    const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, "");
                    const token = localStorage.getItem("sana_auth_token");
                    await fetch(`${BASE_URL}/api/registration/auto-approve-${checked ? "on" : "off"}`, {
                      method: "POST",
                      headers: { Authorization: `Bearer ${token}` },
                    });
                    toast({ title: checked ? "تم تفعيل القبول التلقائي" : "تم إيقاف القبول التلقائي" });
                    queryClient.invalidateQueries({ queryKey: ["regStatus"] });
                  } catch {
                    toast({ title: "خطأ في الاتصال", variant: "destructive" });
                  }
                }}
              />
            </div>
          </div>

          {/* Custom Questions Editor */}
          <div className="border-t border-border/50 pt-4">
            <CustomQuestionsEditor formType="student" />
          </div>
        </CardContent>
      </Card>

      {/* ── استمارة الكادر ── */}
      <Card className="border-0 shadow-sm" data-testid="card-staff-registration">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-bold flex items-center gap-2">
            <Users className="w-4 h-4 text-blue-600" />
            استمارة الكادر (المعلمات والمشرفات والمدخلات)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-4 flex-wrap bg-muted/30 rounded-xl p-4">
            <div className="flex items-center gap-3">
              {staffOpen ? (
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                  <CheckCircle className="w-5 h-5 text-blue-600" />
                </div>
              ) : (
                <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center">
                  <XCircle className="w-5 h-5 text-rose-600" />
                </div>
              )}
              <div>
                <p className="font-bold">تسجيل الكادر {staffOpen ? "مفتوح" : "مغلق"}</p>
                <p className="text-xs text-muted-foreground">
                  {staffOpen ? "الرابط ظاهر في صفحة الدخول" : "الرابط مخفي من صفحة الدخول"}
                </p>
                {staffOpen && (status as any)?.staffAllowedRoles?.length > 0 && (
                  <p className="text-xs text-blue-600 mt-0.5">
                    الأدوار المسموحة: {((status as any).staffAllowedRoles as string[]).map((r: string) => ({ teacher: "معلمة", supervisor: "مشرفة", track_supervisor: "مسؤولة مسار", data_entry: "مدخلة بيانات", deputy: "نائبة" }[r] ?? r)).join("، ")}
                  </p>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => handleStaffToggle(true)} disabled={staffOpen || staffLoading}
                className="bg-blue-600 hover:bg-blue-700 text-white" data-testid="button-open-staff-registration">
                فتح التسجيل
              </Button>
              <Button onClick={() => handleStaffToggle(false)} disabled={!staffOpen || staffLoading}
                variant="destructive" data-testid="button-close-staff-registration">
                إغلاق التسجيل
              </Button>
            </div>
          </div>

          {!staffOpen && (
            <div className="bg-muted/20 rounded-xl p-4 space-y-2 border border-border/40">
              <p className="text-xs font-semibold text-muted-foreground">تحديد الأدوار المسموح بتسجيلها (اختياري — إذا لم تختاري شيئًا ستُسمح كل الأدوار)</p>
              <div className="flex flex-wrap gap-3">
                {[
                  { value: "teacher", label: "معلمة" },
                  { value: "supervisor", label: "مشرفة" },
                  { value: "track_supervisor", label: "مسؤولة مسار" },
                  { value: "data_entry", label: "مدخلة بيانات" },
                  { value: "deputy", label: "نائبة" },
                ].map(r => (
                  <label key={r.value} className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      className="accent-blue-600 w-4 h-4"
                      checked={selectedRoles.includes(r.value)}
                      onChange={e => setSelectedRoles(prev =>
                        e.target.checked ? [...prev, r.value] : prev.filter(v => v !== r.value)
                      )}
                    />
                    <span className="text-sm">{r.label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {staffOpen && (
            <div className="bg-blue-50 rounded-lg px-4 py-3">
              <p className="text-sm font-semibold text-blue-800 mb-1">رابط استمارة تسجيل الكادر</p>
              <p className="text-xs text-blue-600 font-mono break-all">{window.location.origin}/staff-register</p>
            </div>
          )}

          <div className="border-t border-border/50 pt-4">
            <CustomQuestionsEditor formType="staff" />
          </div>
        </CardContent>
      </Card>

      {/* ── استمارة الطالبات الحاليات ── */}
      <Card className="border-0 shadow-sm" data-testid="card-existing-registration">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-bold flex items-center gap-2">
            <GraduationCap className="w-4 h-4 text-teal-600" />
            استمارة الطالبات الحاليات (الموجودات في المقرأة)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">
            للطالبات المنضمات مسبقًا للمقرأة — يختارن حلقتهن مباشرةً وتنتقل بياناتهن لمعلمتهن فورًا
          </p>
          <div className="flex items-center justify-between gap-4 flex-wrap bg-muted/30 rounded-xl p-4">
            <div className="flex items-center gap-3">
              {existingOpen ? (
                <div className="w-10 h-10 rounded-full bg-teal-100 flex items-center justify-center">
                  <CheckCircle className="w-5 h-5 text-teal-600" />
                </div>
              ) : (
                <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center">
                  <XCircle className="w-5 h-5 text-rose-600" />
                </div>
              )}
              <div>
                <p className="font-bold">الاستمارة {existingOpen ? "مفتوحة" : "مغلقة"}</p>
                <p className="text-xs text-muted-foreground">
                  {existingOpen ? "الطالبات يمكنهن التسجيل الآن" : "الاستمارة موقوفة حاليًا"}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => apiPost("/api/registration/existing-open").then(() => { toast({ title: "تم فتح الاستمارة" }); queryClient.invalidateQueries({ queryKey: ["regStatus"] }); }).catch(() => toast({ title: "خطأ", variant: "destructive" }))}
                disabled={existingOpen}
                className="bg-teal-600 hover:bg-teal-700 text-white"
                data-testid="button-open-existing-registration"
              >
                فتح الاستمارة
              </Button>
              <Button
                onClick={() => apiPost("/api/registration/existing-close").then(() => { toast({ title: "تم إغلاق الاستمارة" }); queryClient.invalidateQueries({ queryKey: ["regStatus"] }); }).catch(() => toast({ title: "خطأ", variant: "destructive" }))}
                disabled={!existingOpen}
                variant="destructive"
                data-testid="button-close-existing-registration"
              >
                إغلاق الاستمارة
              </Button>
            </div>
          </div>
          {existingOpen && (
            <div className="bg-teal-50 rounded-lg px-4 py-3">
              <p className="text-sm font-semibold text-teal-800 mb-1">رابط استمارة الطالبات الحاليات</p>
              <p className="text-xs text-teal-600 font-mono break-all">{window.location.origin}/register-existing</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── إضافة عضو مباشرة ── */}
      <Card className="border-0 shadow-sm" data-testid="card-onboard-link">
        <CardContent className="py-4 px-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-bold text-sm">إضافة طالبة أو كادر مباشرة إلى الحلقات</p>
              <p className="text-xs text-muted-foreground mt-0.5">سجّلي الأعضاء الحاليين وانقليهم مباشرة لحلقاتهم</p>
            </div>
            <a href="/onboard">
              <Button className="gap-2" data-testid="button-go-to-onboard">
                <BookUser className="w-4 h-4" />
                إضافة عضو
              </Button>
            </a>
          </div>
        </CardContent>
      </Card>

      {/* ── قائمة الطالبات ── */}
      <Card className="border-0 shadow-sm" data-testid="card-students-list">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-bold flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-primary" />
            الطالبات المسجلات ({students?.length ?? 0})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {(students?.length ?? 0) === 0 ? (
            <p className="text-center text-muted-foreground py-8 text-sm">لا توجد طالبات مسجلات</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b border-border">
                  <tr>
                    <th className="text-right py-3 px-4 font-semibold text-muted-foreground">الاسم</th>
                    <th className="text-right py-3 px-4 font-semibold text-muted-foreground">الجوال</th>
                    <th className="text-right py-3 px-4 font-semibold text-muted-foreground">الفئة العمرية</th>
                    <th className="text-right py-3 px-4 font-semibold text-muted-foreground">الدولة</th>
                    <th className="text-right py-3 px-4 font-semibold text-muted-foreground">الحالة</th>
                    <th className="text-right py-3 px-4 font-semibold text-muted-foreground">الأجوبة</th>
                  </tr>
                </thead>
                <tbody>
                  {students?.map(student => {
                    let hasExtra = false;
                    try { hasExtra = !!(student as any).extraData && Object.keys(JSON.parse((student as any).extraData)).length > 0; } catch {}
                    return (
                      <tr key={student.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors"
                        data-testid={`row-student-${student.id}`}>
                        <td className="py-2.5 px-4 font-semibold">{student.fullName}</td>
                        <td className="py-2.5 px-4 text-muted-foreground text-xs" dir="ltr">{student.phone ?? "—"}</td>
                        <td className="py-2.5 px-4 text-muted-foreground text-xs">{student.ageRange ?? "—"}</td>
                        <td className="py-2.5 px-4 text-muted-foreground text-xs">{student.country ?? "—"}</td>
                        <td className="py-2.5 px-4">
                          <Badge className={`text-xs border-0 ${student.isArchived ? "bg-gray-100 text-gray-500" : "bg-emerald-100 text-emerald-700"}`}>
                            {student.isArchived ? "مؤرشفة" : "نشطة"}
                          </Badge>
                        </td>
                        <td className="py-2.5 px-4">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 gap-1 text-xs text-primary hover:bg-primary/10"
                            onClick={() => setViewingStudent(student)}
                          >
                            <Eye className="w-3.5 h-3.5" />
                            {hasExtra ? "عرض" : "بيانات"}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── حوار عرض أجوبة الطالبة ── */}
      {viewingStudent && (
        <StudentAnswersDialog
          student={viewingStudent}
          questions={(() => {
            try { return JSON.parse(status?.customQuestions ?? "[]"); } catch { return []; }
          })()}
          onClose={() => setViewingStudent(null)}
        />
      )}
    </div>
  );
}
