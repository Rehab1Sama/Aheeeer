import { useState, useEffect, useMemo } from "react";
import { useGetRegistrationStatus } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle, XCircle, BookOpen, Search, ChevronDown } from "lucide-react";
import logoUrl from "@/assets/logo.jpg";
import { Link, useLocation } from "wouter";
import { setToken } from "@/lib/auth";
import { COUNTRIES } from "@/lib/countries";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const AGE_RANGES = ["أقل من 10 سنوات", "10-15", "16-20", "21-30", "31-40", "41-50", "51+"];

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
        <button type="button" onClick={() => switchMode("juz")}
          className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${mode === "juz" ? "bg-primary text-white" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
          بالأجزاء
        </button>
        <button type="button" onClick={() => switchMode("surah")}
          className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${mode === "surah" ? "bg-primary text-white" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
          بالسور
        </button>
      </div>
      {mode === "juz" ? (
        <div className="flex flex-wrap gap-1.5">
          {Array.from({ length: 30 }, (_, i) => i + 1).map(j => (
            <button key={j} type="button" onClick={() => toggleJuz(j)}
              className={`w-10 h-8 rounded-lg text-xs font-semibold border transition-all ${selectedJuz.has(j) ? "bg-primary text-white border-primary" : "bg-white text-muted-foreground border-border hover:border-primary/50"}`}>
              {j}
            </button>
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
                className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${selectedSurahs.has(i) ? "bg-primary text-white border-primary" : "bg-white text-muted-foreground border-border hover:border-primary/50"}`}>
                {name}
              </button>
            ))}
          </div>
        </div>
      )}
      {value && <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 leading-relaxed">{value}</p>}
    </div>
  );
}

function CountrySelector({ value, onChange }: { value: string; onChange: (name: string) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const filtered = COUNTRIES.filter(c => c.name.includes(search));
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-2 h-10 px-3 rounded-md border border-input bg-background text-sm text-right hover:bg-muted/30 transition-colors"
      >
        <span className={value ? "text-foreground" : "text-muted-foreground"}>{value || "اختاري الدولة"}</span>
        <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
      </button>
      {open && (
        <div className="absolute z-50 top-full mt-1 w-full bg-white border border-border rounded-xl shadow-xl overflow-hidden" dir="rtl">
          <div className="p-2 border-b">
            <div className="relative">
              <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input autoFocus value={search} onChange={e => setSearch(e.target.value)} placeholder="ابحثي..." className="pr-8 h-8 text-xs text-right" />
            </div>
          </div>
          <div className="max-h-48 overflow-y-auto">
            {filtered.map(c => (
              <button key={c.name} type="button" onClick={() => { onChange(c.name); setOpen(false); setSearch(""); }}
                className={`w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-muted/40 text-right ${value === c.name ? "bg-primary/5 font-semibold" : ""}`}>
                <span>{c.name}</span>
                {c.dialCode && <span className="text-xs text-muted-foreground font-mono">{c.dialCode}</span>}
              </button>
            ))}
            {filtered.length === 0 && <p className="text-xs text-muted-foreground text-center py-3">لا توجد نتائج</p>}
          </div>
        </div>
      )}
    </div>
  );
}

interface Circle { id: number; name: string; track: string; }

export default function RegisterExistingPage() {
  const { data: status, isLoading: statusLoading } = useGetRegistrationStatus({
    query: { queryKey: ["regStatus"] },
  });
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [submitted, setSubmitted] = useState(false);
  const [circles, setCircles] = useState<Circle[]>([]);
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    fullName: "",
    email: "",
    password: "",
    phone: "",
    country: "السعودية",
    ageRange: "",
    track: "",
    circleId: "",
    memorizeFrom: "",
    birthdate: "",
    hasMemorized: "" as "" | "yes" | "no",
    memorizedQuran: "",
  });

  const set = <K extends keyof typeof form>(k: K, v: typeof form[K]) =>
    setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    fetch(`${BASE}/api/registration/circles-public`)
      .then(r => r.json())
      .then((data: Circle[]) => setCircles(data))
      .catch(() => {});
  }, []);

  const trackNames = useMemo(
    () => [...new Set(circles.map(c => c.track))].filter(Boolean).sort((a, b) => a.localeCompare(b, "ar")),
    [circles]
  );
  const filteredCircles = circles.filter(c => !form.track || c.track === form.track);

  const todayStr = new Date().toISOString().split("T")[0];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.circleId) {
      toast({ title: "يرجى اختيار اسم الحلقة", variant: "destructive" });
      return;
    }
    if (!form.ageRange) {
      toast({ title: "يرجى اختيار الفئة العمرية", variant: "destructive" });
      return;
    }
    if (!form.hasMemorized) {
      toast({ title: "يرجى الإجابة على سؤال الحفظ السابق", variant: "destructive" });
      return;
    }

    const extraData: Record<string, string> = {};
    if (form.birthdate) extraData["تاريخ الميلاد"] = form.birthdate;
    if (form.hasMemorized === "yes" && form.memorizedQuran) extraData["المحفوظات"] = form.memorizedQuran;

    setLoading(true);
    try {
      const res = await fetch(`${BASE}/api/registration/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: form.fullName,
          email: form.email,
          password: form.password,
          phone: form.phone,
          country: form.country,
          ageRange: form.ageRange,
          track: form.track || undefined,
          circleId: Number(form.circleId),
          memorizeFrom: form.memorizeFrom || undefined,
          role: "student",
          extraData: Object.keys(extraData).length > 0 ? extraData : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "خطأ");
      if (data.token) {
        setToken(data.token);
        setLocation("/");
      } else {
        setSubmitted(true);
      }
    } catch (err: any) {
      toast({ title: "خطأ في التسجيل", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const isOpen = status?.existingStudentRegOpen === true;

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: "linear-gradient(135deg, hsl(180, 20%, 96%) 0%, hsl(177, 40%, 93%) 100%)" }}
      dir="rtl"
    >
      <div className="flex-1 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-6">
          <div className="w-24 h-24 rounded-2xl bg-white flex items-center justify-center mx-auto mb-3 shadow-lg overflow-hidden">
            <img src={logoUrl} alt="شعار مقرأة سَنا الآي" className="w-full h-full object-contain" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">مقرأة سَنا الآي</h1>
          <p className="text-muted-foreground text-sm">تسجيل الطالبات الحاليات</p>
        </div>

        {statusLoading ? (
          <div className="text-center py-8 text-muted-foreground">جاري التحميل...</div>
        ) : !isOpen ? (
          <Card className="shadow-lg border-0 bg-white/80 backdrop-blur-sm" data-testid="card-closed">
            <CardContent className="py-12 text-center">
              <XCircle className="w-14 h-14 text-rose-400 mx-auto mb-3" />
              <p className="text-lg font-bold text-foreground">التسجيل مغلق حاليًا</p>
              <p className="text-muted-foreground text-sm mt-2">يرجى التواصل مع إدارة المقرأة</p>
              <div className="mt-6">
                <Link href="/login" className="text-sm text-primary font-semibold hover:underline">تسجيل الدخول</Link>
              </div>
            </CardContent>
          </Card>
        ) : submitted ? (
          <Card className="shadow-lg border-0 bg-white/80 backdrop-blur-sm" data-testid="card-success">
            <CardContent className="py-12 text-center">
              <CheckCircle className="w-14 h-14 text-emerald-500 mx-auto mb-3" />
              <p className="text-lg font-bold text-foreground">تم التسجيل بنجاح!</p>
              <p className="text-muted-foreground text-sm mt-2">
                ظهرت بياناتك عند معلمتك — يمكنك الدخول بالبريد وكلمة المرور
              </p>
              <div className="mt-6">
                <Link href="/login"
                  className="inline-block bg-primary text-white px-6 py-2 rounded-lg font-semibold hover:opacity-90 transition">
                  تسجيل الدخول الآن
                </Link>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="shadow-lg border-0 bg-white/80 backdrop-blur-sm" data-testid="card-form">
            <CardHeader className="pb-4">
              <CardTitle className="text-center text-lg font-bold flex items-center justify-center gap-2">
                <BookOpen className="w-5 h-5 text-primary" />
                استمارة تسجيل الطالبة الحالية
              </CardTitle>
              <p className="text-center text-xs text-muted-foreground mt-1">
                للطالبات المنضمات مسبقًا للمقرأة — ستنتقلين مباشرة لحلقتك
              </p>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">

                {/* المسار والحلقة */}
                <div className="bg-primary/5 rounded-xl p-4 space-y-3 border border-primary/10">
                  <p className="text-sm font-bold text-primary">أولًا: حددي مسارك وحلقتك</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label className="text-sm font-semibold">المسار *</Label>
                      <Select value={form.track} onValueChange={v => setForm(f => ({ ...f, track: v, circleId: "" }))}>
                        <SelectTrigger data-testid="select-track">
                          <SelectValue placeholder="اختري المسار" />
                        </SelectTrigger>
                        <SelectContent>
                          {trackNames.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-semibold">الحلقة *</Label>
                      <Select value={form.circleId} onValueChange={v => setForm(f => ({ ...f, circleId: v }))} disabled={!form.track}>
                        <SelectTrigger data-testid="select-circle">
                          <SelectValue placeholder={form.track ? "اختري الحلقة" : "اختري المسار أولًا"} />
                        </SelectTrigger>
                        <SelectContent>
                          {filteredCircles.length === 0
                            ? <SelectItem value="__none" disabled>لا توجد حلقات</SelectItem>
                            : filteredCircles.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)
                          }
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                {/* الاسم */}
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">الاسم الكامل *</Label>
                  <Input required value={form.fullName}
                    onChange={e => set("fullName", e.target.value)}
                    placeholder="الاسم الرباعي" className="text-right"
                    data-testid="input-full-name" />
                </div>

                {/* البريد + كلمة المرور */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold">البريد الإلكتروني *</Label>
                    <Input required type="email" value={form.email}
                      onChange={e => set("email", e.target.value)}
                      placeholder="email@example.com" dir="ltr" className="text-left"
                      data-testid="input-email" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold">كلمة المرور *</Label>
                    <Input required type="password" value={form.password}
                      onChange={e => set("password", e.target.value)}
                      placeholder="••••••••" data-testid="input-password" />
                  </div>
                </div>

                {/* الجوال + الدولة */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold">رقم الجوال *</Label>
                    <Input required value={form.phone}
                      onChange={e => set("phone", e.target.value)}
                      placeholder="05xxxxxxxx" data-testid="input-phone" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold">الدولة *</Label>
                    <CountrySelector value={form.country} onChange={v => set("country", v)} />
                  </div>
                </div>

                {/* تاريخ الميلاد */}
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">تاريخ الميلاد (اختياري)</Label>
                  <Input
                    type="date"
                    value={form.birthdate}
                    onChange={e => set("birthdate", e.target.value)}
                    max={todayStr}
                    className="text-right"
                    data-testid="input-birthdate"
                  />
                </div>

                {/* اتجاه الحفظ */}
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">اتجاه الحفظ (اختياري)</Label>
                  <Select value={form.memorizeFrom ?? ""} onValueChange={v => set("memorizeFrom", v)}>
                    <SelectTrigger data-testid="select-memorize-from">
                      <SelectValue placeholder="اختري اتجاه الحفظ" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="من البقرة">من البقرة</SelectItem>
                      <SelectItem value="من الناس">من الناس</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* الفئة العمرية */}
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">الفئة العمرية *</Label>
                  <Select value={form.ageRange} onValueChange={v => set("ageRange", v)}>
                    <SelectTrigger data-testid="select-age-range">
                      <SelectValue placeholder="اختري فئتك العمرية" />
                    </SelectTrigger>
                    <SelectContent>
                      {AGE_RANGES.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                {/* هل لديك محفوظ سابق؟ */}
                <div className="space-y-3">
                  <Label className="text-sm font-semibold">هل لديكِ محفوظ سابق من القرآن الكريم؟ *</Label>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => { set("hasMemorized", "yes"); if (form.hasMemorized === "no") set("memorizedQuran", ""); }}
                      className={`flex-1 h-10 rounded-xl text-sm font-semibold border-2 transition-all ${
                        form.hasMemorized === "yes"
                          ? "bg-emerald-600 text-white border-emerald-600"
                          : "bg-white text-muted-foreground border-border hover:border-emerald-400"
                      }`}
                    >
                      نعم
                    </button>
                    <button
                      type="button"
                      onClick={() => { set("hasMemorized", "no"); set("memorizedQuran", ""); }}
                      className={`flex-1 h-10 rounded-xl text-sm font-semibold border-2 transition-all ${
                        form.hasMemorized === "no"
                          ? "bg-rose-500 text-white border-rose-500"
                          : "bg-white text-muted-foreground border-border hover:border-rose-300"
                      }`}
                    >
                      لا
                    </button>
                  </div>

                  {/* محدد الأجزاء والسور — يظهر عند اختيار نعم */}
                  {form.hasMemorized === "yes" && (
                    <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 space-y-2">
                      <p className="text-xs font-semibold text-emerald-800">📖 حددي ما حفظتِه:</p>
                      <MemorizedQuranSelector
                        value={form.memorizedQuran}
                        onChange={v => set("memorizedQuran", v)}
                      />
                    </div>
                  )}
                </div>

                <Button
                  type="submit"
                  className="w-full h-11 font-bold text-base"
                  disabled={loading}
                  style={{ background: "linear-gradient(135deg, hsl(210, 51%, 21%) 0%, hsl(177, 35%, 40%) 100%)" }}
                  data-testid="button-submit"
                >
                  {loading ? "جاري التسجيل..." : "تسجيل والانضمام لحلقتي"}
                </Button>
              </form>

              <div className="mt-4 text-center">
                <Link href="/login" className="text-xs text-muted-foreground hover:text-primary">
                  لديك حساب؟ تسجيل الدخول
                </Link>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
      </div>
      <footer className="text-center py-3 text-xs text-muted-foreground">
        جميع الحقوق محفوظة لمقرأة سَنا الآي &copy; 2026
      </footer>
    </div>
  );
}
