import { useState, useEffect, useRef } from "react";
import { useGetRegistrationStatus } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle, XCircle, Search, ChevronDown, ChevronRight } from "lucide-react";
import logoUrl from "@/assets/logo.jpg";
import { Link, useLocation } from "wouter";
import { setToken } from "@/lib/auth";
import { COUNTRIES } from "@/lib/countries";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ── Quran data ────────────────────────────────────────────────────────────
const SURAHS = [
  "الفاتحة","البقرة","آل عمران","النساء","المائدة","الأنعام","الأعراف","الأنفال","التوبة","يونس",
  "هود","يوسف","الرعد","إبراهيم","الحجر","النحل","الإسراء","الكهف","مريم","طه",
  "الأنبياء","الحج","المؤمنون","النور","الفرقان","الشعراء","النمل","القصص","العنكبوت","الروم",
  "لقمان","السجدة","الأحزاب","سبأ","فاطر","يس","الصافات","ص","الزمر","غافر",
  "فصلت","الشورى","الزخرف","الدخان","الجاثية","الأحقاف","محمد","الفتح","الحجرات","ق",
  "الذاريات","الطور","النجم","القمر","الرحمن","الواقعة","الحديد","المجادلة","الحشر","الممتحنة",
  "الصف","الجمعة","المنافقون","التغابن","الطلاق","التحريم","الملك","القلم","الحاقة","المعارج",
  "نوح","الجن","المزمل","المدثر","القيامة","الإنسان","المرسلات","النبأ","النازعات","عبس",
  "التكوير","الانفطار","المطففين","الانشقاق","البروج","الطارق","الأعلى","الغاشية","الفجر","البلد",
  "الشمس","الليل","الضحى","الشرح","التين","العلق","القدر","البينة","الزلزلة","العاديات",
  "القارعة","التكاثر","العصر","الهمزة","الفيل","قريش","الماعون","الكوثر","الكافرون","النصر",
  "المسد","الإخلاص","الفلق","الناس",
];

// ── Types ─────────────────────────────────────────────────────────────────
type QuestionType = "text" | "essay" | "select" | "true_false" | "yesno" | "number" | "country" | "quran_surah" | "quran_juz";

interface WizardTrack { id: string; name: string; description: string; order: number; }
interface WizardCircle {
  circleId: number; name: string; meetingTime?: string | null;
  capacity?: number | null; spotsLeft?: number | null;
}
interface WizardQuestion {
  id: string; label: string; type: QuestionType; options?: string[]; required: boolean;
}
interface WizardConfig {
  tracks: WizardTrack[]; questions: WizardQuestion[]; registrationCircles: WizardCircle[];
}

// ── Country Selector ──────────────────────────────────────────────────────
function CountrySelector({ value, onChange, onDialCode }: {
  value: string; onChange: (n: string) => void; onDialCode: (c: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const filtered = COUNTRIES.filter(c => c.name.includes(search) || c.dialCode.includes(search));
  const selected = COUNTRIES.find(c => c.name === value);
  const pick = (c: { name: string; dialCode: string }) => { onChange(c.name); onDialCode(c.dialCode); setOpen(false); setSearch(""); };
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-2 h-10 px-3 rounded-md border border-input bg-background text-sm text-right hover:bg-muted/30 transition-colors">
        <span className={value ? "text-foreground" : "text-muted-foreground"}>{value || "اختاري الدولة"}</span>
        <div className="flex items-center gap-1">
          {selected?.dialCode && <span className="text-xs text-muted-foreground font-mono">{selected.dialCode}</span>}
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
        </div>
      </button>
      {open && (
        <div className="absolute z-50 top-full mt-1 w-full bg-white border border-border rounded-xl shadow-xl overflow-hidden" dir="rtl">
          <div className="p-2 border-b">
            <div className="relative">
              <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input autoFocus value={search} onChange={e => setSearch(e.target.value)} placeholder="ابحثي عن دولة..." className="pr-8 h-8 text-xs text-right" />
            </div>
          </div>
          <div className="max-h-48 overflow-y-auto">
            {filtered.map(c => (
              <button key={c.name} type="button" onClick={() => pick(c)}
                className={`w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-muted/40 transition-colors text-right ${value === c.name ? "bg-primary/5 font-semibold" : ""}`}>
                <span>{c.name}</span>
                {c.dialCode && <span className="text-xs text-muted-foreground font-mono">{c.dialCode}</span>}
              </button>
            ))}
            {filtered.length === 0 && <p className="text-xs text-muted-foreground text-center py-3">لا توجد دولة</p>}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Memorized Quran Selector (multi) ──────────────────────────────────────
function MemorizedQuranSelector({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [mode, setMode] = useState<"surah" | "juz">("juz");
  const [selectedJuz, setSelectedJuz] = useState<Set<number>>(new Set());
  const [selectedSurahs, setSelectedSurahs] = useState<Set<number>>(new Set());
  const [surahSearch, setSurahSearch] = useState("");

  const updateParent = (juz: Set<number>, surahs: Set<number>, m: "surah" | "juz") => {
    if (m === "juz") {
      const juzList = Array.from(juz).sort((a, b) => a - b);
      onChange(juzList.length ? `أجزاء: ${juzList.join("، ")}` : "");
    } else {
      const surahList = Array.from(surahs).sort((a, b) => a - b).map(i => SURAHS[i]);
      onChange(surahList.length ? `سور: ${surahList.join("، ")}` : "");
    }
  };
  const toggleJuz = (i: number) => {
    const next = new Set(selectedJuz); next.has(i) ? next.delete(i) : next.add(i);
    setSelectedJuz(next); updateParent(next, selectedSurahs, mode);
  };
  const toggleSurah = (i: number) => {
    const next = new Set(selectedSurahs); next.has(i) ? next.delete(i) : next.add(i);
    setSelectedSurahs(next); updateParent(selectedJuz, next, mode);
  };
  const switchMode = (m: "surah" | "juz") => { setMode(m); updateParent(selectedJuz, selectedSurahs, m); };
  const filteredSurahs = SURAHS.map((name, i) => ({ name, i })).filter(s => !surahSearch || s.name.includes(surahSearch));

  return (
    <div className="space-y-3">
      <div className="flex gap-2 bg-muted rounded-lg p-1">
        <button type="button" onClick={() => switchMode("juz")} className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${mode === "juz" ? "bg-primary text-white" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>بالأجزاء</button>
        <button type="button" onClick={() => switchMode("surah")} className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${mode === "surah" ? "bg-primary text-white" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>بالسور</button>
      </div>
      {mode === "juz" ? (
        <div className="flex flex-wrap gap-1.5">
          {Array.from({ length: 30 }, (_, i) => i + 1).map(j => (
            <button key={j} type="button" onClick={() => toggleJuz(j)}
              className={`w-10 h-8 rounded-lg text-xs font-semibold border transition-all ${selectedJuz.has(j) ? "bg-primary text-white border-primary" : "bg-white text-muted-foreground border-border hover:border-primary/50"}`}>{j}</button>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="relative">
            <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
            <Input value={surahSearch} onChange={e => setSurahSearch(e.target.value)} placeholder="ابحثي عن سورة..." className="pr-7 h-8 text-xs text-right" />
          </div>
          <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
            {filteredSurahs.map(({ name, i }) => (
              <button key={i} type="button" onClick={() => toggleSurah(i)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${selectedSurahs.has(i) ? "bg-primary text-white border-primary" : "bg-white text-muted-foreground border-border hover:border-primary/50"}`}>{name}</button>
            ))}
          </div>
        </div>
      )}
      {value && <p className="text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2 leading-relaxed">{value}</p>}
    </div>
  );
}

// ── Single Juz Selector (for question type quran_juz) ─────────────────────
function JuzSelector({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const selected = value ? Number(value.replace(/\D/g, "")) : 0;
  return (
    <div className="flex flex-wrap gap-1.5">
      {Array.from({ length: 30 }, (_, i) => i + 1).map(j => (
        <button key={j} type="button" onClick={() => onChange(selected === j ? "" : `الجزء ${j}`)}
          className={`w-10 h-8 rounded-lg text-xs font-semibold border transition-all ${selected === j ? "bg-primary text-white border-primary" : "bg-white text-muted-foreground border-border hover:border-primary/50"}`}>{j}</button>
      ))}
    </div>
  );
}

// ── Single Surah Selector (for question type quran_surah) ─────────────────
function SurahSelector({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [search, setSearch] = useState("");
  const filtered = SURAHS.map((name, i) => ({ name, i })).filter(s => !search || s.name.includes(search));
  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="ابحثي عن سورة..." className="pr-7 h-8 text-xs text-right" />
      </div>
      <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto">
        {filtered.map(({ name, i }) => (
          <button key={i} type="button" onClick={() => onChange(value === name ? "" : name)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${value === name ? "bg-primary text-white border-primary" : "bg-white text-muted-foreground border-border hover:border-primary/50"}`}>{name}</button>
        ))}
      </div>
      {value && <p className="text-xs text-emerald-700 bg-emerald-50 rounded-lg px-3 py-1.5">✓ {value}</p>}
    </div>
  );
}

// ── Custom Question Field (all types) ─────────────────────────────────────
function CustomQuestionField({ q, value, onChange }: { q: WizardQuestion; value: string; onChange: (v: string) => void }) {
  if (q.type === "essay") {
    return <Textarea value={value} onChange={e => onChange(e.target.value)} className="text-right min-h-[80px]" required={q.required} />;
  }
  if (q.type === "true_false") {
    return (
      <div className="flex gap-2">
        {["صح", "خطأ"].map(opt => (
          <button key={opt} type="button" onClick={() => onChange(value === opt ? "" : opt)}
            className={`flex-1 py-2 rounded-xl text-sm font-bold border transition-all ${value === opt ? (opt === "صح" ? "bg-emerald-600 text-white border-emerald-600" : "bg-rose-600 text-white border-rose-600") : "bg-white border-border text-muted-foreground hover:border-primary/50"}`}>
            {opt === "صح" ? "✓ صح" : "✗ خطأ"}
          </button>
        ))}
      </div>
    );
  }
  if (q.type === "yesno") {
    return (
      <div className="flex gap-2">
        {["نعم", "لا"].map(opt => (
          <button key={opt} type="button" onClick={() => onChange(value === opt ? "" : opt)}
            className={`flex-1 py-2 rounded-xl text-sm font-bold border transition-all ${value === opt ? "bg-primary text-white border-primary" : "bg-white border-border text-muted-foreground hover:border-primary/50"}`}>{opt}</button>
        ))}
      </div>
    );
  }
  if (q.type === "select" && q.options && q.options.length > 0) {
    return (
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger><SelectValue placeholder="اختاري..." /></SelectTrigger>
        <SelectContent>{q.options.map(opt => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}</SelectContent>
      </Select>
    );
  }
  if (q.type === "number") {
    return <Input type="number" value={value} onChange={e => onChange(e.target.value)} className="text-right" required={q.required} />;
  }
  if (q.type === "country") {
    return <CountrySelector value={value} onChange={onChange} onDialCode={() => {}} />;
  }
  if (q.type === "quran_juz") {
    return <JuzSelector value={value} onChange={onChange} />;
  }
  if (q.type === "quran_surah") {
    return <SurahSelector value={value} onChange={onChange} />;
  }
  return <Input value={value} onChange={e => onChange(e.target.value)} className="text-right" required={q.required} />;
}

// ── Helpers ───────────────────────────────────────────────────────────────
function validate4PartName(name: string): string | null {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 4) return "يجب أن يكون الاسم رباعيًا (٤ كلمات على الأقل)";
  return null;
}
function validatePhone(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 7) return "رقم الجوال قصير جدًا";
  return null;
}

// ── Step Indicator ────────────────────────────────────────────────────────
function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-6">
      {Array.from({ length: total }, (_, i) => i + 1).map(step => (
        <div key={step} className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${step < current ? "bg-emerald-500 text-white" : step === current ? "bg-primary text-white shadow-md" : "bg-muted text-muted-foreground"}`}>
            {step < current ? "✓" : step}
          </div>
          {step < total && <div className={`w-8 h-0.5 ${step < current ? "bg-emerald-400" : "bg-muted"}`} />}
        </div>
      ))}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────
export default function RegisterPage() {
  const { data: status, isLoading: statusLoading } = useGetRegistrationStatus({ query: { queryKey: ["regStatus"] } });
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [wizardConfig, setWizardConfig] = useState<WizardConfig | null>(null);
  const [wizardLoading, setWizardLoading] = useState(true);

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedTrack, setSelectedTrack] = useState<WizardTrack | null>(null);
  const [selectedCircleId, setSelectedCircleId] = useState<number | null>(null);
  const [selectedCircleName, setSelectedCircleName] = useState("");

  const [form, setForm] = useState({
    fullName: "", email: "", password: "",
    phone: "", dialCode: "+966", country: "السعودية",
    birthdate: "", ageRange: "", educationLevel: "", memorizeFrom: "", memorizedQuran: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [customAnswers, setCustomAnswers] = useState<Record<string, string>>({});
  const [hasMemorized, setHasMemorized] = useState<"" | "yes" | "no">("");

  // ── Fetch wizard config
  useEffect(() => {
    fetch(`${BASE}/api/registration/wizard-config`)
      .then(r => r.json())
      .then((data: WizardConfig) => {
        setWizardConfig(data);
        if (!data.tracks || data.tracks.length === 0) setStep(3);
      })
      .catch(() => setStep(3))
      .finally(() => setWizardLoading(false));
  }, []);

  const hasTracks = (wizardConfig?.tracks?.length ?? 0) > 0;
  const totalSteps = hasTracks ? 3 : 1;
  const currentStepDisplay = hasTracks ? step : 1;

  const set = (field: string, val: string) => {
    setForm(f => ({ ...f, [field]: val }));
    setErrors(e => { const next = { ...e }; delete next[field]; return next; });
  };

  const handleTrackSelect = (track: WizardTrack) => {
    setSelectedTrack(track);
    if (track.description?.trim()) setStep(2);
    else setStep(3);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};
    const nameErr = validate4PartName(form.fullName);
    if (nameErr) newErrors.fullName = nameErr;
    const phoneErr = validatePhone(form.phone);
    if (phoneErr) newErrors.phone = phoneErr;
    if (!hasMemorized) newErrors.hasMemorized = "يرجى الإجابة على سؤال الحفظ";
    if (circles.length > 0 && !selectedCircleId) newErrors.circleId = "يرجى اختيار الحلقة";

    const questions = wizardConfig?.questions ?? [];
    for (const q of questions) {
      if (q.required && !customAnswers[q.id]?.trim()) {
        newErrors[`custom_${q.id}`] = `يرجى الإجابة على: ${q.label}`;
      }
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      toast({ title: Object.values(newErrors)[0], variant: "destructive" });
      return;
    }

    const extraData: Record<string, string> = {};
    if (selectedTrack) { extraData.__trackId = selectedTrack.id; extraData.__trackName = selectedTrack.name; }
    if (selectedCircleId) { extraData.__preferredCircleId = String(selectedCircleId); extraData.__preferredCircleName = selectedCircleName; }
    if (form.memorizedQuran) extraData["المحفوظات"] = form.memorizedQuran;
    if (form.birthdate) extraData["تاريخ الميلاد"] = form.birthdate;
    for (const q of questions) {
      if (customAnswers[q.id]?.trim()) extraData[q.label] = customAnswers[q.id];
    }

    const fullPhone = form.phone.startsWith("+") ? form.phone
      : form.dialCode ? `${form.dialCode}${form.phone.replace(/^0/, "")}` : form.phone;

    setSubmitting(true);
    try {
      const res = await fetch(`${BASE}/api/registration/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: form.fullName.trim(),
          email: form.email,
          password: form.password,
          phone: fullPhone,
          country: form.country,
          ageRange: form.ageRange || undefined,
          educationLevel: form.educationLevel || undefined,
          memorizeFrom: form.memorizeFrom || undefined,
          track: selectedTrack?.name ?? "",
          circleId: selectedCircleId ?? undefined,
          role: "student",
          isNewcomer: hasMemorized === "no",
          extraData: Object.keys(extraData).length > 0 ? extraData : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "خطأ في التسجيل");
      if (data.token) {
        setToken(data.token);
        setLocation("/");
      } else {
        setSubmitted(true);
      }
    } catch (err: any) {
      toast({ title: "خطأ في التسجيل", description: err.message ?? "يرجى التحقق من البيانات", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const todayStr = new Date().toISOString().split("T")[0];
  const circles = wizardConfig?.registrationCircles ?? [];

  // ── Wrapper ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col" style={{ background: "linear-gradient(135deg, hsl(180,20%,96%) 0%, hsl(177,40%,93%) 100%)" }} dir="rtl">
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-lg">
          {/* Header */}
          <div className="text-center mb-5">
            <div className="w-20 h-20 rounded-2xl bg-white flex items-center justify-center mx-auto mb-3 shadow-lg overflow-hidden">
              <img src={logoUrl} alt="شعار مقرأة سَنا الآي" className="w-full h-full object-contain" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">مقرأة سَنا الآي</h1>
            <p className="text-muted-foreground text-sm">استمارة التسجيل</p>
          </div>

          {/* Loading */}
          {(statusLoading || wizardLoading) ? (
            <div className="text-center py-12 text-muted-foreground">جاري التحميل...</div>

          /* Registration closed */
          ) : !status?.isOpen ? (
            <Card className="shadow-lg border-0 bg-white/80 backdrop-blur-sm">
              <CardContent className="py-12 text-center">
                <XCircle className="w-14 h-14 text-rose-400 mx-auto mb-3" />
                <p className="text-lg font-bold">التسجيل مغلق حاليًا</p>
                <p className="text-muted-foreground text-sm mt-2">يرجى التواصل مع إدارة المقرأة</p>
                <div className="mt-6">
                  <Link href="/login" className="text-sm text-primary font-semibold hover:underline">تسجيل الدخول</Link>
                </div>
              </CardContent>
            </Card>

          /* Success */
          ) : submitted ? (
            <Card className="shadow-lg border-0 bg-white/80 backdrop-blur-sm">
              <CardContent className="py-10 text-center">
                <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="w-8 h-8 text-emerald-600" />
                </div>
                <p className="text-xl font-bold mb-2">تم التسجيل بنجاح! 🎉</p>
                <p className="text-muted-foreground text-sm leading-relaxed mb-6">
                  {selectedCircleName
                    ? <>تم إضافتك مباشرة لحلقتك 🎉<br /><span className="font-semibold text-primary">حلقة: {selectedCircleName}</span><br /><span className="text-xs">يمكنك تسجيل الدخول الآن والانضمام لحلقتك</span></>
                    : "تم التسجيل بنجاح! سيتواصل معكِ فريق المقرأة قريبًا."
                  }
                </p>
                <Link href="/login">
                  <button className="w-full py-2.5 rounded-xl font-bold text-white text-sm" style={{ background: "linear-gradient(135deg,hsl(210,51%,21%) 0%,hsl(177,35%,40%) 100%)" }}>
                    تسجيل الدخول
                  </button>
                </Link>
              </CardContent>
            </Card>

          /* ══ Step 1: Track Selection ══════════════════════════════════════ */
          ) : step === 1 ? (
            <Card className="shadow-lg border-0 bg-white/80 backdrop-blur-sm">
              <CardContent className="pt-6">
                {hasTracks && <StepIndicator current={1} total={3} />}
                <h2 className="text-center text-lg font-bold mb-1">اختاري مسارك</h2>
                <p className="text-center text-muted-foreground text-sm mb-5">ما الذي تودّين التسجيل فيه؟</p>
                <div className="space-y-3">
                  {(wizardConfig?.tracks ?? [])
                    .slice()
                    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
                    .map(track => (
                      <button key={track.id} type="button" onClick={() => handleTrackSelect(track)}
                        className="w-full text-right p-4 rounded-2xl border-2 border-border hover:border-primary/60 hover:bg-primary/5 transition-all group flex items-center gap-3">
                        <div className="flex-1">
                          <p className="font-bold text-base text-foreground group-hover:text-primary transition-colors">{track.name}</p>
                          {track.description && (
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                              {track.description.slice(0, 90)}{track.description.length > 90 ? "..." : ""}
                            </p>
                          )}
                        </div>
                        <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                      </button>
                    ))}
                </div>
                <div className="mt-5 text-center">
                  <Link href="/login" className="text-xs text-muted-foreground hover:underline">لديكِ حساب؟ تسجيل الدخول</Link>
                </div>
              </CardContent>
            </Card>

          /* ══ Step 2: Track Description ════════════════════════════════════ */
          ) : step === 2 ? (
            <Card className="shadow-lg border-0 bg-white/80 backdrop-blur-sm">
              <CardContent className="pt-6">
                <StepIndicator current={2} total={3} />
                <div className="text-center mb-4">
                  <span className="inline-block bg-primary/10 text-primary text-sm font-bold px-4 py-1.5 rounded-full mb-3">
                    {selectedTrack?.name}
                  </span>
                  <h2 className="text-lg font-bold">نظام المسار</h2>
                </div>
                <div className="bg-muted/30 rounded-2xl p-4 mb-5 text-sm leading-relaxed whitespace-pre-line text-foreground max-h-72 overflow-y-auto">
                  {selectedTrack?.description}
                </div>
                <div className="space-y-2">
                  <button type="button" onClick={() => setStep(3)}
                    className="w-full py-3 rounded-2xl font-bold text-white text-sm flex items-center justify-center gap-2"
                    style={{ background: "linear-gradient(135deg,hsl(210,51%,21%) 0%,hsl(177,35%,40%) 100%)" }}>
                    متابعة — التسجيل
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <button type="button" onClick={() => setStep(1)}
                    className="w-full py-2.5 rounded-2xl text-sm text-muted-foreground hover:text-foreground font-medium transition-colors">
                    ← رجوع لاختيار المسار
                  </button>
                </div>
              </CardContent>
            </Card>

          /* ══ Step 3: Registration Form ════════════════════════════════════ */
          ) : (
            <Card className="shadow-lg border-0 bg-white/80 backdrop-blur-sm">
              <CardContent className="pt-6">
                {hasTracks && <StepIndicator current={3} total={3} />}
                {selectedTrack && (
                  <div className="flex items-center justify-between mb-4 bg-primary/5 rounded-xl px-3 py-2">
                    <span className="text-xs font-semibold text-primary">{selectedTrack.name}</span>
                    <button type="button" onClick={() => setStep(1)} className="text-xs text-muted-foreground hover:text-foreground transition-colors">تغيير</button>
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                  {/* الاسم الرباعي */}
                  <div className="space-y-1.5">
                    <Label className="text-sm font-semibold">الاسم الرباعي *</Label>
                    <Input required value={form.fullName}
                      onChange={e => set("fullName", e.target.value)}
                      onBlur={() => { const err = validate4PartName(form.fullName); if (err) setErrors(e => ({ ...e, fullName: err })); }}
                      placeholder="الاسم الأول والثاني والثالث والرابع"
                      className={`text-right ${errors.fullName ? "border-rose-400" : ""}`} />
                    {errors.fullName && <p className="text-xs text-rose-600">{errors.fullName}</p>}
                  </div>

                  {/* البريد + كلمة المرور */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-sm font-semibold">البريد الإلكتروني *</Label>
                      <Input required type="email" value={form.email} onChange={e => set("email", e.target.value)} placeholder="email@example.com" className="text-left" dir="ltr" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm font-semibold">كلمة المرور *</Label>
                      <Input required type="password" value={form.password} onChange={e => set("password", e.target.value)} placeholder="••••••••" />
                    </div>
                  </div>

                  {/* الدولة */}
                  <div className="space-y-1.5">
                    <Label className="text-sm font-semibold">الدولة *</Label>
                    <CountrySelector value={form.country} onChange={name => set("country", name)} onDialCode={code => setForm(f => ({ ...f, dialCode: code }))} />
                  </div>

                  {/* رقم الجوال */}
                  <div className="space-y-1.5">
                    <Label className="text-sm font-semibold">رقم الجوال / واتساب *</Label>
                    <div className="flex gap-2">
                      {form.dialCode && (
                        <span className="flex items-center justify-center px-3 rounded-md border border-input bg-muted text-sm font-mono text-muted-foreground shrink-0">{form.dialCode}</span>
                      )}
                      <Input required type="tel" value={form.phone}
                        onChange={e => { set("phone", e.target.value); }}
                        onBlur={() => { const err = validatePhone(form.phone); if (err) setErrors(e => ({ ...e, phone: err })); }}
                        placeholder="5XXXXXXXX" dir="ltr"
                        className={`flex-1 text-left ${errors.phone ? "border-rose-400" : ""}`} />
                    </div>
                    {errors.phone && <p className="text-xs text-rose-600">{errors.phone}</p>}
                  </div>

                  {/* تاريخ الميلاد */}
                  <div className="space-y-1.5">
                    <Label className="text-sm font-semibold">تاريخ الميلاد</Label>
                    <Input type="date" value={form.birthdate} onChange={e => set("birthdate", e.target.value)} max={todayStr} className="text-right" />
                  </div>

                  {/* الفئة العمرية */}
                  <div className="space-y-1.5">
                    <Label className="text-sm font-semibold">الفئة العمرية</Label>
                    <Select value={form.ageRange} onValueChange={v => set("ageRange", v)}>
                      <SelectTrigger><SelectValue placeholder="اختاري..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="أقل من 15">أقل من 15</SelectItem>
                        <SelectItem value="15 - 20">15 — 20</SelectItem>
                        <SelectItem value="21 - 30">21 — 30</SelectItem>
                        <SelectItem value="31 - 40">31 — 40</SelectItem>
                        <SelectItem value="41 - 50">41 — 50</SelectItem>
                        <SelectItem value="فوق 50">فوق 50</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* المستوى الدراسي */}
                  <div className="space-y-1.5">
                    <Label className="text-sm font-semibold">المستوى الدراسي</Label>
                    <Select value={form.educationLevel} onValueChange={v => set("educationLevel", v)}>
                      <SelectTrigger><SelectValue placeholder="اختاري..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ابتدائية">ابتدائية</SelectItem>
                        <SelectItem value="متوسطة">متوسطة</SelectItem>
                        <SelectItem value="ثانوية">ثانوية</SelectItem>
                        <SelectItem value="جامعية">جامعية</SelectItem>
                        <SelectItem value="دراسات عليا">دراسات عليا</SelectItem>
                        <SelectItem value="أخرى">أخرى</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* هل حفظتِ شيئًا من القرآن؟ */}
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold">هل حفظتِ شيئًا من القرآن الكريم؟ *</Label>
                    <div className="flex gap-2">
                      {[{ v: "yes", l: "نعم" }, { v: "no", l: "لا" }].map(({ v, l }) => (
                        <button key={v} type="button" onClick={() => { setHasMemorized(v as "yes" | "no"); setErrors(e => { const n = { ...e }; delete n.hasMemorized; return n; }); }}
                          className={`flex-1 py-2 rounded-xl text-sm font-bold border transition-all ${hasMemorized === v ? "bg-primary text-white border-primary" : "bg-white border-border text-muted-foreground hover:border-primary/50"}`}>{l}</button>
                      ))}
                    </div>
                    {errors.hasMemorized && <p className="text-xs text-rose-600">{errors.hasMemorized}</p>}
                  </div>

                  {/* المحفوظات — يظهر فقط إن قالت نعم */}
                  {hasMemorized === "yes" && (
                    <div className="space-y-2 p-3 bg-emerald-50 rounded-2xl border border-emerald-100">
                      <Label className="text-sm font-semibold text-emerald-800">ماذا حفظتِ؟</Label>
                      <MemorizedQuranSelector value={form.memorizedQuran} onChange={v => set("memorizedQuran", v)} />
                    </div>
                  )}

                  {/* الأسئلة المخصصة */}
                  {(wizardConfig?.questions ?? []).map(q => (
                    <div key={q.id} className="space-y-1.5">
                      <Label className="text-sm font-semibold">
                        {q.label}{q.required && " *"}
                      </Label>
                      <CustomQuestionField q={q} value={customAnswers[q.id] ?? ""} onChange={v => setCustomAnswers(a => ({ ...a, [q.id]: v }))} />
                      {errors[`custom_${q.id}`] && <p className="text-xs text-rose-600">{errors[`custom_${q.id}`]}</p>}
                    </div>
                  ))}

                  {/* اختيار الحلقة */}
                  {circles.length > 0 && (
                    <div className="space-y-2">
                      <Label className="text-sm font-semibold">اختاري حلقتك *</Label>
                      <p className="text-xs text-muted-foreground">ستنضمين مباشرة لهذه الحلقة بعد التسجيل</p>
                      <div className="space-y-2">
                        {circles.map(c => (
                          <button key={c.circleId} type="button"
                            onClick={() => { setSelectedCircleId(c.circleId); setSelectedCircleName(c.name); setErrors(e => { const n = { ...e }; delete n.circleId; return n; }); }}
                            className={`w-full text-right px-4 py-3 rounded-xl border-2 transition-all flex items-center justify-between ${selectedCircleId === c.circleId ? "border-primary bg-primary/5" : errors.circleId ? "border-rose-300 hover:border-primary/50" : "border-border hover:border-primary/50"}`}>
                            <div>
                              <p className="font-semibold text-sm">{c.name}</p>
                              {c.meetingTime && <p className="text-xs text-muted-foreground">{c.meetingTime}</p>}
                            </div>
                            <div className="text-left">
                              {c.spotsLeft != null ? (
                                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${c.spotsLeft <= 2 ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>
                                  {c.spotsLeft} {c.spotsLeft === 1 ? "مقعد" : "مقاعد"}
                                </span>
                              ) : (
                                <span className="text-xs text-muted-foreground">متاحة</span>
                              )}
                            </div>
                          </button>
                        ))}
                      </div>
                      {errors.circleId && <p className="text-xs text-rose-600">{errors.circleId}</p>}
                      {selectedCircleId && (
                        <button type="button" onClick={() => { setSelectedCircleId(null); setSelectedCircleName(""); }}
                          className="text-xs text-muted-foreground hover:text-foreground transition-colors">إلغاء الاختيار</button>
                      )}
                    </div>
                  )}

                  {/* Submit */}
                  <button type="submit" disabled={submitting}
                    className="w-full py-3 rounded-2xl font-bold text-white text-sm mt-2 disabled:opacity-60 transition-opacity"
                    style={{ background: "linear-gradient(135deg,hsl(210,51%,21%) 0%,hsl(177,35%,40%) 100%)" }}>
                    {submitting ? "جاري التسجيل..." : "إرسال التسجيل"}
                  </button>

                  {hasTracks && (
                    <button type="button" onClick={() => setStep(selectedTrack?.description ? 2 : 1)}
                      className="w-full py-2 text-xs text-muted-foreground hover:text-foreground transition-colors">
                      ← رجوع
                    </button>
                  )}

                  <div className="text-center pt-1">
                    <Link href="/login" className="text-xs text-muted-foreground hover:underline">لديكِ حساب؟ تسجيل الدخول</Link>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
