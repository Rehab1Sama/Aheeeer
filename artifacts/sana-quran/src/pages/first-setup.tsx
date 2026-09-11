import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  CheckCircle, BookOpen, Plus, X, Users, Globe, Lock,
  ChevronRight, ChevronLeft, Sparkles, Settings, Calendar,
} from "lucide-react";
import { useGetCurrentUser } from "@workspace/api-client-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const tok = () => localStorage.getItem("sana_auth_token");
const api = (path: string, opts?: RequestInit) =>
  fetch(`${BASE}/api${path}`, { ...opts, headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok()}`, ...(opts?.headers ?? {}) } });

const ENTRY_TYPES = [
  { key: "girls", label: "حفظ + مراجعة قريبة وبعيدة" },
  { key: "recitation", label: "تلاوة فقط" },
  { key: "simple_review", label: "مراجعة عامة" },
  { key: "fixation", label: "تثبيت" },
];

interface TrackSetup {
  id: string;
  name: string;
  dataEntryType: string;
  circleCount: number;
}

const STEPS = [
  { id: 1, label: "مرحباً", icon: Sparkles },
  { id: 2, label: "المسارات", icon: BookOpen },
  { id: 3, label: "التسجيل", icon: Globe },
  { id: 4, label: "الحساب", icon: Settings },
  { id: 5, label: "مكتمل!", icon: CheckCircle },
];

export default function FirstSetupPage() {
  const [, setLocation] = useLocation();
  const { data: user, refetch } = useGetCurrentUser({ query: { queryKey: ["getCurrentUser"] } });
  const { toast } = useToast();

  const [step, setStep] = useState(1);
  const [setupInfo, setSetupInfo] = useState<{
    schoolName: string | null; schoolTagline: string | null;
    logoUrl: string | null; suggestedTracks: { name: string; dataEntryType: string }[];
  } | null>(null);
  const [saving, setSaving] = useState(false);

  // Step 2: tracks
  const [tracks, setTracks] = useState<TrackSetup[]>([]);
  const [newTrackName, setNewTrackName] = useState("");
  const [newTrackType, setNewTrackType] = useState("girls");

  // Step 3: registration
  const [regOpen, setRegOpen] = useState(false);
  const [regDeadline, setRegDeadline] = useState("");

  // Step 4: admin name
  const [adminName, setAdminName] = useState((user as any)?.name ?? "");

  const schoolName = setupInfo?.schoolName ?? "مقرأتي";
  const logoUrl = setupInfo?.logoUrl;

  useEffect(() => {
    api("/setup/status").then(r => r.json()).then(data => {
      if (!data.isNeeded) { setLocation("/"); return; }
      setSetupInfo(data);
      if (data.suggestedTracks?.length > 0) {
        setTracks(data.suggestedTracks.map((t: any, i: number) => ({
          id: String(i),
          name: t.name,
          dataEntryType: t.dataEntryType,
          circleCount: 3,
        })));
      }
    }).catch(() => setLocation("/"));
  }, []);

  const addTrack = () => {
    if (!newTrackName.trim()) return;
    setTracks(prev => [...prev, {
      id: String(Date.now()),
      name: newTrackName.trim(),
      dataEntryType: newTrackType,
      circleCount: 3,
    }]);
    setNewTrackName("");
  };

  const removeTrack = (id: string) => setTracks(prev => prev.filter(t => t.id !== id));

  const handleComplete = async () => {
    setSaving(true);
    try {
      const payload = {
        tracks: tracks.map(t => ({
          name: t.name,
          dataEntryType: t.dataEntryType,
          circleNames: Array.from({ length: t.circleCount }, (_, i) => `${t.name} ${i + 1}`),
        })),
        registrationOpen: regOpen,
        registrationDeadline: regDeadline || undefined,
        adminName: adminName || undefined,
      };
      const r = await api("/setup/complete", { method: "POST", body: JSON.stringify(payload) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      setStep(5);
    } catch (e: any) {
      toast({ title: e?.message ?? "حدث خطأ", variant: "destructive" });
    } finally { setSaving(false); }
  };

  const progress = Math.round(((step - 1) / (STEPS.length - 1)) * 100);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/30 flex items-center justify-center p-4" dir="rtl">
      <div className="w-full max-w-lg space-y-4">

        {/* Header */}
        <div className="text-center space-y-2">
          {logoUrl && (
            <img src={logoUrl} alt="logo" className="w-16 h-16 object-contain rounded-2xl mx-auto shadow-sm" />
          )}
          <h1 className="text-2xl font-bold">{schoolName}</h1>
          <p className="text-muted-foreground text-sm">إعداد النظام لأول مرة</p>
        </div>

        {/* Step progress */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              const done = step > s.id;
              const active = step === s.id;
              return (
                <div key={s.id} className="flex flex-col items-center gap-1 flex-1">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                    done ? "bg-primary text-primary-foreground" :
                    active ? "bg-primary/10 text-primary border-2 border-primary" :
                    "bg-muted text-muted-foreground"
                  }`}>
                    {done ? <CheckCircle className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                  </div>
                  <span className={`text-[10px] font-semibold hidden sm:block ${active ? "text-primary" : "text-muted-foreground"}`}>
                    {s.label}
                  </span>
                  {i < STEPS.length - 1 && (
                    <div className="absolute" style={{ display: "none" }} />
                  )}
                </div>
              );
            })}
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-primary transition-all duration-500 rounded-full" style={{ width: `${progress}%` }} />
          </div>
        </div>

        {/* Step content */}
        <Card className="border-0 shadow-md">
          <CardContent className="pt-6 pb-6 space-y-4">

            {/* Step 1: Welcome */}
            {step === 1 && (
              <div className="space-y-4 text-center">
                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
                  <Sparkles className="w-8 h-8 text-primary" />
                </div>
                <div>
                  <h2 className="text-xl font-bold mb-2">أهلاً بكِ في {schoolName}!</h2>
                  <p className="text-muted-foreground text-sm">
                    سيأخذ الإعداد أقل من دقيقتين. ستُضبطين المسارات والتسجيل وإعدادات حسابك.
                  </p>
                </div>
                {setupInfo && (
                  <div className="bg-muted/30 rounded-2xl p-4 text-right space-y-2 text-sm">
                    <p><span className="text-muted-foreground">الاسم: </span><strong>{setupInfo.schoolName ?? "—"}</strong></p>
                    {setupInfo.schoolTagline && <p><span className="text-muted-foreground">الشعار: </span>{setupInfo.schoolTagline}</p>}
                    {setupInfo.suggestedTracks?.length > 0 && (
                      <p><span className="text-muted-foreground">مسارات مُعدّة مسبقاً: </span>
                        <strong>{setupInfo.suggestedTracks.length} مسار</strong></p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Step 2: Tracks */}
            {step === 2 && (
              <div className="space-y-4">
                <div>
                  <h2 className="text-lg font-bold">المسارات والحلقات</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">أضيفي المسارات التي ستعمل بها المقرأة وعدد حلقات كل مسار</p>
                </div>

                {tracks.length > 0 && (
                  <div className="space-y-2">
                    {tracks.map(t => (
                      <div key={t.id} className="flex items-center gap-2 bg-muted/30 rounded-xl px-3 py-2.5">
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm">{t.name}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {ENTRY_TYPES.find(e => e.key === t.dataEntryType)?.label}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <label className="text-[10px] text-muted-foreground">حلقات:</label>
                          <input
                            type="number" min={0} max={50} value={t.circleCount}
                            onChange={e => setTracks(prev => prev.map(tr => tr.id === t.id ? { ...tr, circleCount: parseInt(e.target.value) || 0 } : tr))}
                            className="w-12 h-7 border border-input rounded-lg text-center text-sm bg-background"
                          />
                        </div>
                        <button onClick={() => removeTrack(t.id)} className="text-muted-foreground hover:text-destructive">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="space-y-2 border-t pt-3">
                  <p className="text-xs font-semibold">إضافة مسار جديد</p>
                  <div className="flex gap-2">
                    <Input value={newTrackName} onChange={e => setNewTrackName(e.target.value)}
                      placeholder="اسم المسار" dir="rtl" className="flex-1 h-9 text-sm"
                      onKeyDown={e => e.key === "Enter" && addTrack()} />
                    <select value={newTrackType} onChange={e => setNewTrackType(e.target.value)}
                      className="border border-input rounded-xl px-2 py-1 text-xs bg-background h-9">
                      {ENTRY_TYPES.map(e => <option key={e.key} value={e.key}>{e.label}</option>)}
                    </select>
                    <button onClick={addTrack} className="px-3 h-9 rounded-xl bg-primary text-primary-foreground text-sm font-semibold">
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                {tracks.length === 0 && (
                  <p className="text-xs text-amber-600 text-center bg-amber-50 rounded-xl p-2">
                    أضيفي مسار واحد على الأقل للمتابعة
                  </p>
                )}
              </div>
            )}

            {/* Step 3: Registration */}
            {step === 3 && (
              <div className="space-y-4">
                <div>
                  <h2 className="text-lg font-bold">إعدادات التسجيل</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">هل تريدين فتح باب التسجيل الآن؟ يمكن تغييره في أي وقت من الإعدادات</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <button onClick={() => setRegOpen(true)}
                    className={`flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all ${
                      regOpen ? "border-emerald-500 bg-emerald-50" : "border-border hover:border-muted-foreground/30"
                    }`}>
                    <Globe className={`w-6 h-6 ${regOpen ? "text-emerald-600" : "text-muted-foreground"}`} />
                    <span className={`text-sm font-bold ${regOpen ? "text-emerald-700" : ""}`}>مفتوح</span>
                    <span className="text-[10px] text-muted-foreground text-center">الطالبات يمكنهن التسجيل الآن</span>
                  </button>
                  <button onClick={() => setRegOpen(false)}
                    className={`flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all ${
                      !regOpen ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/30"
                    }`}>
                    <Lock className={`w-6 h-6 ${!regOpen ? "text-primary" : "text-muted-foreground"}`} />
                    <span className={`text-sm font-bold ${!regOpen ? "text-primary" : ""}`}>مغلق</span>
                    <span className="text-[10px] text-muted-foreground text-center">أفتحيه لاحقاً من الإعدادات</span>
                  </button>
                </div>
                {regOpen && (
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5" />
                      آخر موعد للتسجيل (اختياري)
                    </Label>
                    <input type="date" value={regDeadline} onChange={e => setRegDeadline(e.target.value)}
                      className="w-full border border-input rounded-xl px-3 py-2 text-sm bg-background h-10" />
                    <p className="text-[10px] text-muted-foreground">سيُغلق التسجيل تلقائياً بعد هذا التاريخ</p>
                  </div>
                )}
              </div>
            )}

            {/* Step 4: Admin account */}
            {step === 4 && (
              <div className="space-y-4">
                <div>
                  <h2 className="text-lg font-bold">حسابك كمشرفة عامة</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">لكِ صلاحية كاملة على جميع إعدادات المقرأة</p>
                </div>
                <div className="bg-primary/5 rounded-2xl p-4 space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-600" />
                    <span>إدارة جميع الحسابات والأدوار</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-600" />
                    <span>فتح وإغلاق التسجيل في أي وقت</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-600" />
                    <span>إضافة وتعديل المسارات والحلقات</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-600" />
                    <span>الوصول لجميع التقارير والإحصائيات</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-600" />
                    <span>إدارة المتجر والأوسمة والرسائل</span>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">اسمك (يظهر للمستخدمين)</Label>
                  <Input value={adminName} onChange={e => setAdminName(e.target.value)}
                    placeholder="مثال: أ. فاطمة" dir="rtl" className="h-10" />
                </div>
              </div>
            )}

            {/* Step 5: Complete */}
            {step === 5 && (
              <div className="text-center space-y-4 py-4">
                <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
                  <CheckCircle className="w-10 h-10 text-emerald-600" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-emerald-700 mb-2">مكتمل! 🎉</h2>
                  <p className="text-muted-foreground text-sm">
                    تم إعداد {schoolName} بنجاح. يمكنكِ الآن البدء باستخدام النظام.
                  </p>
                </div>
                <div className="bg-muted/30 rounded-2xl p-4 text-right text-sm space-y-1.5">
                  <p><span className="text-muted-foreground">المسارات: </span><strong>{tracks.length} مسار</strong></p>
                  <p><span className="text-muted-foreground">الحلقات: </span><strong>{tracks.reduce((s, t) => s + t.circleCount, 0)} حلقة</strong></p>
                  <p><span className="text-muted-foreground">التسجيل: </span><strong className={regOpen ? "text-emerald-600" : ""}>{regOpen ? "مفتوح" : "مغلق"}</strong></p>
                </div>
                <Button onClick={() => { refetch(); setLocation("/"); }} className="w-full gap-2 h-11 text-base">
                  <Users className="w-5 h-5" />
                  الذهاب للوحة التحكم
                </Button>
              </div>
            )}

            {/* Navigation */}
            {step < 5 && (
              <div className="flex gap-3 pt-2">
                {step > 1 && (
                  <Button variant="outline" onClick={() => setStep(s => s - 1)} className="gap-1.5">
                    <ChevronRight className="w-4 h-4" />
                    السابق
                  </Button>
                )}
                <div className="flex-1" />
                {step < 4 && (
                  <Button
                    onClick={() => setStep(s => s + 1)}
                    disabled={step === 2 && tracks.length === 0}
                    className="gap-1.5"
                  >
                    التالي
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                )}
                {step === 4 && (
                  <Button onClick={handleComplete} disabled={saving} className="gap-1.5">
                    {saving ? "جارٍ الحفظ..." : "إتمام الإعداد ✓"}
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
