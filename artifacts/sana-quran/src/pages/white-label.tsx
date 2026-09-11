import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  Globe, Palette, Zap, CheckSquare, Square, Rocket, Trash2,
  ExternalLink, RefreshCw, Eye, EyeOff, Key, Check, Copy,
  BookOpen, Award, ShoppingBag, Headphones, Calendar, MessageSquare,
  RotateCcw, AlertTriangle, GraduationCap, PlaneTakeoff, ClipboardList,
  Users, UserCheck, ChevronDown, ChevronUp, Plus, X, Building2,
  TrendingUp, BarChart2, BarChart, Bell,
} from "lucide-react";
import { applyThemeFromHex, resetTheme, hslToHex } from "@/components/ThemeProvider";
import { useGetCurrentUser } from "@workspace/api-client-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const getToken = () => localStorage.getItem("sana_auth_token");
const apiHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${getToken()}`,
});

// ── Utilities ──────────────────────────────────────────────────────────────
function hexToHsl(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

// ── Constants ──────────────────────────────────────────────────────────────
const PALETTE_PRESETS = [
  { name: "نيلي (الافتراضي)", primary: "#1e3a5f", secondary: "#2d9b8a", sidebar: "#1e3a5f" },
  { name: "أخضر زمردي", primary: "#1a5c3a", secondary: "#22a776", sidebar: "#1a5c3a" },
  { name: "بنفسجي ملكي", primary: "#3b1f6e", secondary: "#8b5cf6", sidebar: "#3b1f6e" },
  { name: "ذهبي فاخر", primary: "#4a3000", secondary: "#d97706", sidebar: "#4a3000" },
  { name: "وردي عصري", primary: "#5c1a3a", secondary: "#ec4899", sidebar: "#5c1a3a" },
  { name: "رمادي أنيق", primary: "#1f2937", secondary: "#6b7280", sidebar: "#1f2937" },
];

const ALL_ROLES = [
  { key: "teacher", defaultLabel: "معلمة" },
  { key: "supervisor", defaultLabel: "مشرفة" },
  { key: "data_entry", defaultLabel: "مدخلة بيانات" },
  { key: "student", defaultLabel: "طالبة" },
  { key: "leader", defaultLabel: "المشرفة العامة" },
  { key: "deputy", defaultLabel: "النائبة" },
  { key: "track_supervisor", defaultLabel: "مشرفة المسار" },
  { key: "volunteer", defaultLabel: "متطوعة" },
  { key: "exam_supervisor", defaultLabel: "مشرفة الاختبار" },
];

const DATA_ENTRY_ROLES = ["teacher", "supervisor", "data_entry", "student"];

const AVAILABLE_INPUT_FIELDS = [
  { key: "memorize",    label: "الحفظ",             emoji: "📖", description: "حفظ آيات جديدة" },
  { key: "review_near", label: "مراجعة قريبة",      emoji: "🔄", description: "مراجعة الحفظ الجديد" },
  { key: "review_far",  label: "مراجعة بعيدة",      emoji: "📚", description: "مراجعة الحفظ القديم" },
  { key: "review",      label: "مراجعة عامة",       emoji: "📝", description: "مراجعة دون تفصيل" },
  { key: "recitation",  label: "تلاوة",              emoji: "🎙️", description: "تلاوة بدون حفظ" },
  { key: "listen",      label: "سماع للقارئ",        emoji: "🎧", description: "الاستماع لشيخ / قارئ" },
  { key: "repetitions", label: "عدد التكرار",        emoji: "🔁", description: "عدد مرات التكرار" },
  { key: "tafsir",      label: "تفسير / ملاحظات",   emoji: "✏️", description: "ملاحظات وتفسير" },
];

const TRACK_CATEGORIES = ["فتيات", "أمهات", "أطفال", "تصحيح تلاوة", "تثبيت", "رجال", "مختلط"];

const STANDARD_TRACK_PRESETS = [
  { name: "حفظ (قريبة + بعيدة)", category: "فتيات", dataEntryType: "girls",
    inputFields: ["memorize","review_near","review_far","listen"] },
  { name: "حفظ (قريبة فقط)",     category: "فتيات", dataEntryType: "girls_near",
    inputFields: ["memorize","review_near","listen"] },
  { name: "حفظ (بعيدة فقط)",     category: "فتيات", dataEntryType: "girls_far",
    inputFields: ["memorize","review_far","listen"] },
  { name: "حفظ (بدون مراجعة)",   category: "فتيات", dataEntryType: "girls_no_review",
    inputFields: ["memorize","listen"] },
  { name: "تلاوة / مشكاة",       category: "تصحيح تلاوة", dataEntryType: "recitation",
    inputFields: ["recitation","listen"] },
  { name: "مراجعة عامة",         category: "فتيات", dataEntryType: "simple_review",
    inputFields: ["memorize","review"] },
  { name: "تثبيت",               category: "تثبيت", dataEntryType: "fixation",
    inputFields: ["memorize","repetitions","review","listen"] },
];

const FEATURE_GROUPS = [
  {
    label: "📊 الإحصائيات والتقارير",
    features: [
      { key: "stats_general",   label: "الإحصائيات العامة",          icon: BarChart2 },
      { key: "stats_weekly",    label: "التقارير الأسبوعية",           icon: TrendingUp },
      { key: "stats_monthly",   label: "التقرير الشهري",               icon: BarChart },
      { key: "stats_stumbling", label: "تنبيهات التعثر والإشراف",      icon: Bell },
      { key: "shortcomings",    label: "إحصائيات التقصير",             icon: AlertTriangle },
    ],
  },
  {
    label: "📚 الأدوات التعليمية",
    features: [
      { key: "exam",            label: "الاختبارات",                    icon: GraduationCap },
      { key: "teacher_rotation",label: "شقلبة المعلمات",               icon: RotateCcw },
    ],
  },
  {
    label: "💬 التواصل والإدارة",
    features: [
      { key: "messages",        label: "الرسائل",                      icon: MessageSquare },
      { key: "calendar",        label: "التقويم",                       icon: Calendar },
      { key: "registration",    label: "نموذج التسجيل العام",          icon: Globe },
      { key: "leaves",          label: "إجازات الطالبات",              icon: PlaneTakeoff },
      { key: "deputy_tasks",    label: "مهام النائبة",                  icon: ClipboardList },
    ],
  },
  {
    label: "✨ مميزات إضافية",
    features: [
      { key: "badges",          label: "الأوسمة والتحفيز",             icon: Award },
      { key: "audio",           label: "صوتيات المصحف",                icon: Headphones },
      { key: "store",           label: "المتجر",                        icon: ShoppingBag },
    ],
  },
];

const ALL_FEATURES = FEATURE_GROUPS.flatMap(g => g.features);

// ── Packages ────────────────────────────────────────────────────────────────
// store مستبعد من جميع الباقات — يُضاف يدوياً فقط عند الحاجة
const PACKAGES = [
  {
    key: "starter",
    name: "الأساسية",
    tagline: "للمقرأة الصغيرة",
    features: [
      "registration", "messages",
      "stats_general",
    ],
    badge: "🌱",
    color: "border-slate-300 bg-slate-50",
    activeColor: "border-slate-500 bg-slate-100",
    textColor: "text-slate-700",
  },
  {
    key: "pro",
    name: "المتقدمة",
    tagline: "للمقرأة المتوسطة",
    features: [
      "registration", "messages",
      "stats_general", "stats_weekly", "stats_monthly",
      "shortcomings", "badges", "calendar", "leaves",
    ],
    badge: "⭐",
    color: "border-primary/30 bg-primary/5",
    activeColor: "border-primary bg-primary/10",
    textColor: "text-primary",
  },
  {
    key: "enterprise",
    name: "الكاملة",
    tagline: "كل المميزات (بلا متجر)",
    features: ALL_FEATURES.filter(f => f.key !== "store").map(f => f.key),
    badge: "👑",
    color: "border-amber-300 bg-amber-50",
    activeColor: "border-amber-500 bg-amber-100",
    textColor: "text-amber-700",
  },
];

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  draft: { label: "مسودة", color: "bg-gray-100 text-gray-600" },
  deploying: { label: "جارٍ النشر...", color: "bg-amber-100 text-amber-700" },
  deployed: { label: "منشور ✓", color: "bg-emerald-100 text-emerald-700" },
  failed: { label: "فشل النشر", color: "bg-red-100 text-red-700" },
};

interface TrackTypeEntry { name: string; dataEntryType: string; category?: string; inputFields?: string[]; }
interface Config {
  id: number; schoolName: string; schoolTagline: string | null;
  logoUrl: string | null; adminEmail: string | null;
  primaryHsl: string; secondaryHsl: string; sidebarHsl: string;
  enabledFeatures: string; dataEntryRoles: string; roleNames: string;
  trackTypes: string; circleGenders: string;
  customDatabaseUrl: string | null;
  renderServiceId: string | null; renderServiceUrl: string | null;
  deployStatus: string; deployError: string | null; createdAt: string;
}
interface RenderSettings { hasApiKey: boolean; hasRepoUrl: boolean; repoUrl: string | null; }
interface InitialCredentials { email: string; password: string; url: string; }

// ── Section Component ───────────────────────────────────────────────────────
function Section({ title, icon: Icon, children, defaultOpen = false }: {
  title: string; icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card className="border-0 shadow-sm">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 rounded-2xl transition-colors"
      >
        <div className="flex items-center gap-2 font-bold text-sm">
          <Icon className="w-4 h-4 text-primary" />
          {title}
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>
      {open && <CardContent className="pt-0 pb-4 px-4 space-y-3">{children}</CardContent>}
    </Card>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────
export default function WhiteLabelPage() {
  const { data: user } = useGetCurrentUser({ query: { queryKey: ["getCurrentUser"] } });
  const { toast } = useToast();
  const [configs, setConfigs] = useState<Config[]>([]);
  const [renderSettings, setRenderSettings] = useState<RenderSettings | null>(null);
  const [deploying, setDeploying] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState<number | null>(null);
  const [previewActive, setPreviewActive] = useState(false);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expandedConfig, setExpandedConfig] = useState<number | null>(null);
  const [initialCredentials, setInitialCredentials] = useState<InitialCredentials | null>(null);
  const [newTrackName, setNewTrackName] = useState("");
  const [newTrackCategory, setNewTrackCategory] = useState("فتيات");
  const [newTrackFields, setNewTrackFields] = useState<string[]>(["memorize", "review_near", "review_far", "listen"]);

  const [selectedPackage, setSelectedPackage] = useState<string>("custom");

  const applyPackage = (pkg: typeof PACKAGES[number]) => {
    setSelectedPackage(pkg.key);
    setField("enabledFeatures", [...pkg.features]);
  };

  const [form, setForm] = useState({
    schoolName: "",
    schoolTagline: "نظام إدارة المقرأة",
    logoUrl: "",
    adminEmail: "",
    primaryHex: "#1e3a5f",
    secondaryHex: "#2d9b8a",
    sidebarHex: "#1e3a5f",
    enabledFeatures: ALL_FEATURES.map(f => f.key),
    dataEntryRoles: ["teacher", "supervisor", "data_entry"] as string[],
    roleNames: {} as Record<string, string>,
    trackTypes: STANDARD_TRACK_PRESETS.map(t => ({ name: t.name, dataEntryType: t.dataEntryType, category: t.category, inputFields: t.inputFields })) as TrackTypeEntry[],
    circleGenders: ["girls"] as string[],
    customDatabaseUrl: "",
  });

  const role = (user as any)?.role ?? "";

  useEffect(() => {
    if (role !== "leader") return;
    Promise.all([
      fetch(`${BASE}/api/white-label/configs`, { headers: apiHeaders() }).then(r => r.ok ? r.json() : []),
      fetch(`${BASE}/api/white-label/render-settings`, { headers: apiHeaders() }).then(r => r.ok ? r.json() : null),
    ]).then(([cfgs, settings]) => {
      setConfigs(cfgs);
      setRenderSettings(settings);
    });
  }, [role]);

  const setField = <K extends keyof typeof form>(k: K, v: typeof form[K]) =>
    setForm(f => ({ ...f, [k]: v }));

  const toggleFeature = (key: string) =>
    setField("enabledFeatures", form.enabledFeatures.includes(key)
      ? form.enabledFeatures.filter(k => k !== key)
      : [...form.enabledFeatures, key]);

  const toggleDataEntryRole = (key: string) =>
    setField("dataEntryRoles", form.dataEntryRoles.includes(key)
      ? form.dataEntryRoles.filter(k => k !== key)
      : [...form.dataEntryRoles, key]);

  const togglePresetTrack = (preset: typeof STANDARD_TRACK_PRESETS[number]) => {
    const exists = form.trackTypes.some(t => t.dataEntryType === preset.dataEntryType && t.name === preset.name);
    setField("trackTypes", exists
      ? form.trackTypes.filter(t => !(t.dataEntryType === preset.dataEntryType && t.name === preset.name))
      : [...form.trackTypes, { name: preset.name, dataEntryType: preset.dataEntryType, category: preset.category, inputFields: preset.inputFields }]);
  };

  const toggleNewTrackField = (key: string) => {
    setNewTrackFields(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  };

  const addCustomTrack = () => {
    if (!newTrackName.trim() || newTrackFields.length === 0) return;
    const entry: TrackTypeEntry = {
      name: newTrackName.trim(),
      dataEntryType: "custom",
      category: newTrackCategory,
      inputFields: newTrackFields,
    };
    if (!form.trackTypes.some(t => t.name === entry.name)) {
      setField("trackTypes", [...form.trackTypes, entry]);
    }
    setNewTrackName("");
  };

  const handlePreview = () => {
    if (previewActive) { resetTheme(); setPreviewActive(false); }
    else { applyThemeFromHex(form.primaryHex, form.secondaryHex, form.sidebarHex); setPreviewActive(true); }
  };

  const handleSave = async () => {
    if (!form.schoolName.trim()) { toast({ title: "أدخلي اسم المقرأة أولاً", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const body = {
        schoolName: form.schoolName,
        schoolTagline: form.schoolTagline,
        logoUrl: form.logoUrl || null,
        adminEmail: form.adminEmail || null,
        primaryHsl: hexToHsl(form.primaryHex),
        secondaryHsl: hexToHsl(form.secondaryHex),
        sidebarHsl: hexToHsl(form.sidebarHex),
        enabledFeatures: JSON.stringify(form.enabledFeatures),
        dataEntryRoles: JSON.stringify(form.dataEntryRoles),
        roleNames: JSON.stringify(form.roleNames),
        trackTypes: JSON.stringify(form.trackTypes),
        circleGenders: JSON.stringify(form.circleGenders),
        customDatabaseUrl: form.customDatabaseUrl || null,
      };
      const r = await fetch(`${BASE}/api/white-label/configs`, {
        method: "POST", headers: apiHeaders(), body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error((await r.json()).error);
      const cfg: Config = await r.json();
      setConfigs(prev => [cfg, ...prev]);
      setForm(f => ({ ...f, schoolName: "", schoolTagline: "نظام إدارة المقرأة", logoUrl: "", adminEmail: "" }));
      if (previewActive) { resetTheme(); setPreviewActive(false); }
      toast({ title: `✓ تم حفظ إعدادات "${cfg.schoolName}"` });
    } catch (e: any) {
      toast({ title: e?.message ?? "خطأ في الحفظ", variant: "destructive" });
    } finally { setSaving(false); }
  };

  const handleDeploy = async (id: number) => {
    setDeploying(id);
    try {
      const r = await fetch(`${BASE}/api/white-label/configs/${id}/deploy`, { method: "POST", headers: apiHeaders() });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      setConfigs(prev => prev.map(c => c.id === id
        ? { ...c, deployStatus: "deploying", renderServiceUrl: data.serviceUrl }
        : c));
      if (data.initialCredentials?.email && data.initialCredentials?.password) {
        setInitialCredentials({
          email: data.initialCredentials.email,
          password: data.initialCredentials.password,
          url: data.serviceUrl,
        });
      }
      toast({ title: "✓ تم إرسال طلب النشر إلى Render", description: "البناء يستغرق 10–15 دقيقة" });
    } catch (e: any) {
      setConfigs(prev => prev.map(c => c.id === id ? { ...c, deployStatus: "failed", deployError: e?.message } : c));
      toast({ title: e?.message ?? "فشل النشر", variant: "destructive" });
    } finally { setDeploying(null); }
  };

  const handleRefreshStatus = async (id: number) => {
    setRefreshing(id);
    try {
      const r = await fetch(`${BASE}/api/white-label/configs/${id}/deploy-status`, { headers: apiHeaders() });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      setConfigs(prev => prev.map(c => c.id === id
        ? { ...c, deployStatus: data.deployStatus, renderServiceUrl: data.deployUrl ?? c.renderServiceUrl }
        : c));
      const statusLabel = STATUS_MAP[data.deployStatus]?.label ?? data.deployStatus;
      toast({ title: `الحالة: ${statusLabel}`, description: data.renderStatus ? `Render: ${data.renderStatus}` : undefined });
    } catch (e: any) {
      toast({ title: e?.message ?? "خطأ في تحديث الحالة", variant: "destructive" });
    } finally { setRefreshing(null); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("حذف هذا الإعداد نهائيًا؟")) return;
    await fetch(`${BASE}/api/white-label/configs/${id}`, { method: "DELETE", headers: apiHeaders() });
    setConfigs(prev => prev.filter(c => c.id !== id));
    toast({ title: "تم الحذف" });
  };

  if (role !== "leader") return <div className="p-8 text-center text-muted-foreground">غير مصرح</div>;

  return (
    <div className="space-y-4" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold">نسخ المقرأة للبيع</h1>
        <p className="text-muted-foreground text-sm mt-1">خصّصي نسخة كاملة من النظام لمقرأة أخرى بهويتها وإعداداتها المستقلة</p>
      </div>

      {/* Render settings alert */}
      {renderSettings && (!renderSettings.hasApiKey || !renderSettings.hasRepoUrl) && (
        <Card className="border-0 shadow-sm bg-amber-50">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-start gap-3">
              <Key className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
              <div className="text-sm space-y-1.5">
                <p className="font-bold text-amber-800">إعدادات النشر التلقائي مطلوبة</p>
                {!renderSettings.hasApiKey && (
                  <p className="text-amber-700">
                    ① أضيفي <code className="bg-amber-100 px-1 rounded font-mono text-xs">RENDER_API_KEY</code> في Secrets — من
                    <a href="https://dashboard.render.com/u/settings#api-keys" target="_blank" className="underline mr-1">Render Dashboard</a>
                  </p>
                )}
                {!renderSettings.hasRepoUrl && (
                  <p className="text-amber-700">
                    ② أضيفي <code className="bg-amber-100 px-1 rounded font-mono text-xs">RENDER_GITHUB_REPO_URL</code> مثال:
                    <code className="bg-amber-100 px-1 rounded font-mono text-xs mr-1">https://github.com/user/sana-quran</code>
                  </p>
                )}
                <p className="text-amber-600 text-xs">③ تأكدي من مزامنة المشروع مع GitHub من إعدادات Replit</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      {renderSettings?.hasApiKey && renderSettings?.hasRepoUrl && (
        <div className="flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 px-3 py-2 rounded-xl">
          <Check className="w-3.5 h-3.5" />
          Render API + GitHub مضبوطان — يمكن النشر التلقائي ✓
        </div>
      )}
      {initialCredentials && (
        <Card className="border-emerald-200 bg-emerald-50 shadow-sm">
          <CardContent className="pt-4 pb-4 space-y-2 text-sm text-emerald-900">
            <p className="font-bold">احفظي بيانات دخول المشرفة الأولى الآن</p>
            <p className="text-xs text-emerald-800">
              هذه كلمة مرور أولية للنسخة الجديدة. لن نعرضها مرة أخرى بعد مغادرة الصفحة.
            </p>
            <div className="rounded-xl bg-white/70 p-3 space-y-1 font-mono text-xs" dir="ltr">
              <p>URL: {initialCredentials.url}</p>
              <p>Email: {initialCredentials.email}</p>
              <p>Password: {initialCredentials.password}</p>
            </div>
            <button
              onClick={() => navigator.clipboard.writeText(
                `الرابط: ${initialCredentials.url}\nالبريد: ${initialCredentials.email}\nكلمة المرور: ${initialCredentials.password}`,
              )}
              className="rounded-xl border border-emerald-300 px-3 py-1.5 text-xs font-semibold hover:bg-white/70"
            >
              نسخ بيانات الدخول
            </button>
          </CardContent>
        </Card>
      )}

      {/* ── Builder Form ── */}
      <div className="space-y-2">

        {/* Section 1: Identity */}
        <Section title="الهوية البصرية — الاسم والشعار" icon={Building2} defaultOpen>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">اسم المقرأة *</Label>
              <Input value={form.schoolName} onChange={e => setField("schoolName", e.target.value)}
                placeholder="مثال: مقرأة النور" dir="rtl" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">الشعار الفرعي</Label>
              <Input value={form.schoolTagline} onChange={e => setField("schoolTagline", e.target.value)}
                placeholder="نظام إدارة المقرأة" dir="rtl" />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">رابط الشعار (صورة)</Label>
              <Input value={form.logoUrl} onChange={e => setField("logoUrl", e.target.value)}
                placeholder="https://..." dir="ltr" />
              {form.logoUrl && (
                <img src={form.logoUrl} alt="logo preview" onError={e => (e.currentTarget.style.display = "none")}
                  className="w-16 h-16 object-contain rounded-xl border border-border" />
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">بريد المشرفة الأولى (للنشر) *</Label>
              <Input value={form.adminEmail} onChange={e => setField("adminEmail", e.target.value)}
                placeholder="admin@maqraa.com" dir="ltr" type="email" />
              <p className="text-[10px] text-muted-foreground">سيُستخدم لإنشاء حساب المشرفة في النسخة الجديدة</p>
            </div>
          </div>
        </Section>

        {/* Section 2: Colors */}
        <Section title="الألوان والمظهر" icon={Palette}>
          <div className="space-y-2">
            <Label className="text-xs font-semibold">لوحات ألوان جاهزة</Label>
            <div className="flex flex-wrap gap-2">
              {PALETTE_PRESETS.map(p => (
                <button key={p.name}
                  onClick={() => { setField("primaryHex", p.primary); setField("secondaryHex", p.secondary); setField("sidebarHex", p.sidebar); }}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-border hover:bg-muted/40 text-xs font-medium transition-colors">
                  <div className="w-3 h-3 rounded-full" style={{ background: p.primary }} />
                  <div className="w-3 h-3 rounded-full" style={{ background: p.secondary }} />
                  {p.name}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            {[
              { k: "primaryHex" as const, label: "اللون الرئيسي", desc: "الأزرار والعناوين" },
              { k: "secondaryHex" as const, label: "اللون الثانوي", desc: "الشارات والروابط" },
              { k: "sidebarHex" as const, label: "لون الشريط الجانبي", desc: "خلفية القائمة" },
            ].map(({ k, label, desc }) => (
              <div key={k} className="space-y-1.5">
                <p className="text-xs font-semibold">{label}</p>
                <p className="text-[10px] text-muted-foreground">{desc}</p>
                <div className="flex items-center gap-2">
                  <input type="color" value={form[k]}
                    onChange={e => setField(k, e.target.value)}
                    className="w-10 h-10 rounded-xl border border-border cursor-pointer p-0.5" />
                  <div>
                    <div className="w-8 h-4 rounded-lg" style={{ background: form[k] }} />
                    <span className="text-[10px] font-mono text-muted-foreground">{form[k]}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <button onClick={handlePreview}
            className={`flex items-center gap-2 text-xs px-3 py-2 rounded-xl border transition-colors ${
              previewActive ? "bg-amber-50 border-amber-200 text-amber-700" : "border-border hover:bg-muted/40"
            }`}>
            {previewActive ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            {previewActive ? "إلغاء معاينة الألوان على الصفحة" : "معاينة الألوان فوراً على هذه الصفحة"}
          </button>
        </Section>

        {/* Section 3: Data Entry Roles */}
        <Section title="نظام الإدخال — من تُدخل البيانات؟" icon={UserCheck}>
          <p className="text-xs text-muted-foreground">اختاري الأدوار التي يُسمح لها بإدخال بيانات الحلقات اليومية</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {DATA_ENTRY_ROLES.map(roleKey => {
              const info = ALL_ROLES.find(r => r.key === roleKey)!;
              const enabled = form.dataEntryRoles.includes(roleKey);
              return (
                <button key={roleKey} onClick={() => toggleDataEntryRole(roleKey)}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-xs font-semibold transition-colors ${
                    enabled ? "bg-primary/5 border-primary/30 text-primary" : "border-border text-muted-foreground hover:bg-muted/30"
                  }`}>
                  {enabled ? <CheckSquare className="w-3.5 h-3.5 text-primary shrink-0" /> : <Square className="w-3.5 h-3.5 shrink-0" />}
                  <div className="text-right">
                    <p>{form.roleNames[roleKey] || info.defaultLabel}</p>
                    <p className="text-[10px] opacity-60 font-normal">{roleKey}</p>
                  </div>
                </button>
              );
            })}
          </div>
          <div className="bg-blue-50 rounded-xl p-3 text-xs text-blue-700 space-y-0.5">
            <p className="font-semibold">ملاحظات:</p>
            <p>• المشرفة العامة (leader) تستطيع دائماً الإدخال بغض النظر عن هذا الإعداد</p>
            <p>• تفعيل دور "طالبة" يسمح لها بإدخال بياناتها الخاصة فقط</p>
          </div>
        </Section>

        {/* Section 4: Role Names */}
        <Section title="مسميات الأدوار — خصّصي الأسماء" icon={Users}>
          <p className="text-xs text-muted-foreground">غيّري مسمى كل دور ليناسب طبيعة مقرأتك (اتركي الحقل فارغاً للاسم الافتراضي)</p>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {ALL_ROLES.map(r => (
              <div key={r.key} className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">{r.defaultLabel} ({r.key})</Label>
                <Input
                  value={form.roleNames[r.key] ?? ""}
                  onChange={e => setField("roleNames", { ...form.roleNames, [r.key]: e.target.value })}
                  placeholder={r.defaultLabel}
                  dir="rtl"
                  className="h-8 text-sm"
                />
              </div>
            ))}
          </div>
          <div className="text-xs text-muted-foreground bg-muted/30 rounded-xl p-3 space-y-0.5">
            <p className="font-semibold">مثال على الاستخدام:</p>
            <p>• إذا كانت المقرأة للذكور: "معلمة" → "معلّم"، "طالبة" → "طالب"</p>
            <p>• مقرأة مشكاة: "معلمة" → "محفّظة"، "مشرفة" → "مراقبة"</p>
          </div>
        </Section>

        {/* Section 5: Track Types - Flexible Builder */}
        <Section title="أنواع الحلقات ونظام الإدخال" icon={BookOpen}>
          <p className="text-xs text-muted-foreground">حددي لكل نوع حلقة: الاسم والفئة وحقول الإدخال الظاهرة لمُدخلة البيانات</p>

          {/* Quick Presets */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold">أنواع جاهزة — اختاري المناسبة</Label>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {STANDARD_TRACK_PRESETS.map(preset => {
                const enabled = form.trackTypes.some(t => t.dataEntryType === preset.dataEntryType && t.name === preset.name);
                const fieldLabels = preset.inputFields.map(k => AVAILABLE_INPUT_FIELDS.find(f => f.key === k)?.label).filter(Boolean);
                return (
                  <button key={preset.dataEntryType} onClick={() => togglePresetTrack(preset)}
                    className={`flex items-start gap-2.5 px-3 py-2.5 rounded-xl border text-xs text-right transition-colors ${
                      enabled ? "bg-primary/5 border-primary/30" : "border-border hover:bg-muted/30"
                    }`}>
                    {enabled ? <CheckSquare className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" /> : <Square className="w-3.5 h-3.5 mt-0.5 shrink-0 text-muted-foreground" />}
                    <div>
                      <p className={`font-semibold ${enabled ? "text-primary" : "text-foreground"}`}>{preset.name}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5 leading-4">{fieldLabels.join(" · ")}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom Builder */}
          <div className="border border-border/60 rounded-xl p-3 space-y-3 bg-muted/10">
            <Label className="text-xs font-bold">🔧 بناء نوع مخصص</Label>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[10px] text-muted-foreground mb-1 block">اسم النوع</Label>
                <Input value={newTrackName} onChange={e => setNewTrackName(e.target.value)}
                  placeholder="مثال: حلقة الأمهات المتقدمة" dir="rtl" className="h-8 text-xs" />
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground mb-1 block">الفئة المستهدفة</Label>
                <div className="flex flex-wrap gap-1">
                  {TRACK_CATEGORIES.map(cat => (
                    <button key={cat} onClick={() => setNewTrackCategory(cat)}
                      className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border transition-colors ${
                        newTrackCategory === cat ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:bg-muted/30"
                      }`}>{cat}</button>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <Label className="text-[10px] text-muted-foreground mb-1.5 block">حقول الإدخال — اختاري ما يظهر في نموذج إدخال البيانات</Label>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                {AVAILABLE_INPUT_FIELDS.map(field => {
                  const on = newTrackFields.includes(field.key);
                  return (
                    <button key={field.key} onClick={() => toggleNewTrackField(field.key)}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[10px] font-medium transition-colors ${
                        on ? "bg-primary/5 border-primary/30 text-primary" : "border-border text-muted-foreground hover:bg-muted/30"
                      }`}>
                      {on ? <CheckSquare className="w-3 h-3 shrink-0" /> : <Square className="w-3 h-3 shrink-0" />}
                      <span>{field.emoji} {field.label}</span>
                    </button>
                  );
                })}
              </div>
              {newTrackFields.length > 0 && (
                <p className="text-[10px] text-muted-foreground mt-1.5">
                  الحقول المختارة: {newTrackFields.map(k => AVAILABLE_INPUT_FIELDS.find(f => f.key === k)?.label).join(" · ")}
                </p>
              )}
            </div>

            <button onClick={addCustomTrack} disabled={!newTrackName.trim() || newTrackFields.length === 0}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-40">
              <Plus className="w-3.5 h-3.5" /> إضافة النوع المخصص
            </button>
          </div>

          {/* Selected track types summary */}
          {form.trackTypes.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">أنواع الحلقات المحددة ({form.trackTypes.length})</Label>
              <div className="flex flex-wrap gap-1.5">
                {form.trackTypes.map((t, i) => (
                  <div key={i} className="flex items-center gap-1.5 bg-primary/5 text-primary border border-primary/20 px-2.5 py-1 rounded-full text-xs font-medium">
                    {t.category && <span className="text-[9px] bg-primary/10 px-1.5 py-0.5 rounded-full">{t.category}</span>}
                    <span>{t.name}</span>
                    {t.inputFields && <span className="opacity-40 text-[9px]">({t.inputFields.length} حقل)</span>}
                    <button onClick={() => setField("trackTypes", form.trackTypes.filter((_, j) => j !== i))}>
                      <X className="w-3 h-3 text-primary/60 hover:text-primary" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Section>

        {/* Section 5b: Database */}
        <Section title="قاعدة البيانات (Supabase)" icon={Globe}>
          <p className="text-xs text-muted-foreground">
            افتراضياً يُنشئ النظام قاعدة بيانات PostgreSQL مستقلة على Render.
            إذا كنتِ تريدين استخدام Supabase الخاص بك، ضعي رابط الاتصال هنا.
          </p>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">رابط Supabase (اختياري)</Label>
            <Input
              value={form.customDatabaseUrl}
              onChange={e => setField("customDatabaseUrl", e.target.value)}
              placeholder="postgresql://postgres:[password]@[host]:5432/postgres"
              dir="ltr"
              className="h-8 text-xs font-mono"
            />
            <p className="text-[10px] text-muted-foreground">
              تجدين الرابط في: Supabase → Settings → Database → Connection string (URI mode)
            </p>
          </div>
          {form.customDatabaseUrl && (
            <div className="bg-blue-50 rounded-xl p-3 text-xs text-blue-700 space-y-0.5">
              <p className="font-semibold">✓ سيُستخدم هذا الرابط كـ DATABASE_URL بدلاً من إنشاء قاعدة بيانات جديدة</p>
              <p>تأكدي من أن قاعدة البيانات متاحة ولها صلاحيات الكتابة</p>
            </div>
          )}
        </Section>

        {/* Section 6: Package / Features */}
        <Section title="الباقة والمميزات" icon={Zap}>
          <div>
            <p className="text-xs font-semibold mb-2">اختاري الباقة التي تمنحينها للمقرأة</p>
            <div className="grid grid-cols-3 gap-2">
              {PACKAGES.map(pkg => {
                const isActive = selectedPackage === pkg.key;
                return (
                  <button key={pkg.key} onClick={() => applyPackage(pkg)}
                    className={`flex flex-col items-center gap-1 p-3 rounded-2xl border-2 transition-all text-center ${
                      isActive ? pkg.activeColor + " shadow-sm" : pkg.color + " hover:opacity-80"
                    }`}>
                    <span className="text-2xl">{pkg.badge}</span>
                    <span className={`text-sm font-bold ${pkg.textColor}`}>{pkg.name}</span>
                    <span className="text-[10px] text-muted-foreground">{pkg.tagline}</span>
                    <span className={`text-[10px] font-semibold mt-0.5 ${pkg.textColor}`}>
                      {pkg.features.length} ميزة
                    </span>
                  </button>
                );
              })}
            </div>
            <button onClick={() => setSelectedPackage("custom")}
              className={`mt-2 w-full text-xs py-1.5 rounded-xl border transition-colors ${
                selectedPackage === "custom"
                  ? "border-primary/30 bg-primary/5 text-primary font-semibold"
                  : "border-border text-muted-foreground hover:bg-muted/30"
              }`}>
              تخصيص يدوي
            </button>
          </div>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              {selectedPackage !== "custom"
                ? `مميزات باقة "${PACKAGES.find(p => p.key === selectedPackage)?.name}" — يمكنكِ التعديل اليدوي بعد الاختيار`
                : "فعّلي أو أوقفي كل وحدة وظيفية يدوياً"
              }
            </p>
            {FEATURE_GROUPS.map(group => (
              <div key={group.label}>
                <p className="text-[11px] font-bold text-muted-foreground mb-1.5">{group.label}</p>
                <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
                  {group.features.map(({ key, label, icon: Icon }) => {
                    const enabled = form.enabledFeatures.includes(key);
                    const isStore = key === "store";
                    return (
                      <button key={key} onClick={() => { toggleFeature(key); setSelectedPackage("custom"); }}
                        className={`flex items-center gap-1.5 px-2.5 py-2 rounded-xl border text-xs font-medium transition-colors text-right ${
                          enabled
                            ? isStore
                              ? "bg-rose-50 border-rose-200 text-rose-700"
                              : "bg-primary/5 border-primary/20 text-primary"
                            : "border-border text-muted-foreground hover:bg-muted/30"
                        }`}>
                        {enabled ? <CheckSquare className="w-3.5 h-3.5 shrink-0" /> : <Square className="w-3.5 h-3.5 shrink-0" />}
                        <Icon className="w-3 h-3 shrink-0" />
                        <span className="truncate">{label}</span>
                        {isStore && <span className="text-[9px] text-rose-400 mr-auto shrink-0">يدوي فقط</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* Save button */}
        <Button onClick={handleSave} disabled={saving || !form.schoolName.trim()} className="w-full gap-2 h-11 text-base">
          {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
          حفظ الإعدادات وإضافتها للقائمة
        </Button>
      </div>

      {/* ── Saved Configs ── */}
      {configs.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-bold text-muted-foreground">النسخ المحفوظة ({configs.length})</h2>
          {configs.map(cfg => {
            const status = STATUS_MAP[cfg.deployStatus] ?? STATUS_MAP.draft;
            const parsedFeatures: string[] = (() => { try { return JSON.parse(cfg.enabledFeatures); } catch { return []; } })();
            const parsedDataEntryRoles: string[] = (() => { try { return JSON.parse(cfg.dataEntryRoles); } catch { return []; } })();
            const parsedTrackTypes: TrackTypeEntry[] = (() => { try { return JSON.parse(cfg.trackTypes); } catch { return []; } })();
            const parsedRoleNames: Record<string, string> = (() => { try { return JSON.parse(cfg.roleNames); } catch { return {}; } })();
            const isExpanded = expandedConfig === cfg.id;
            const canDeploy = renderSettings?.hasApiKey && renderSettings?.hasRepoUrl;

            return (
              <Card key={cfg.id} className="border-0 shadow-sm">
                <CardContent className="pt-4 space-y-3">
                  {/* Header row */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <p className="font-bold">{cfg.schoolName}</p>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${status.color}`}>{status.label}</span>
                      </div>
                      {cfg.schoolTagline && <p className="text-xs text-muted-foreground">{cfg.schoolTagline}</p>}
                      <div className="flex items-center gap-2 mt-1">
                        <div className="w-4 h-4 rounded-full border border-white/50 shadow-sm shrink-0" style={{ background: `hsl(${cfg.primaryHsl})` }} />
                        <div className="w-4 h-4 rounded-full border border-white/50 shadow-sm shrink-0" style={{ background: `hsl(${cfg.secondaryHsl})` }} />
                        <span className="text-xs text-muted-foreground">{parsedFeatures.length} ميزة · {parsedTrackTypes.length} حلقة</span>
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button onClick={() => setExpandedConfig(isExpanded ? null : cfg.id)}
                        className="text-xs px-2 py-1 rounded-lg border border-border hover:bg-muted/30 text-muted-foreground">
                        {isExpanded ? "طيّ" : "تفاصيل"}
                      </button>
                      <button onClick={() => handleDelete(cfg.id)}
                        className="p-1.5 rounded-lg border border-red-100 text-red-500 hover:bg-red-50">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Expanded details */}
                  {isExpanded && (
                    <div className="space-y-3 pt-2 border-t border-border text-xs">
                      {parsedTrackTypes.length > 0 && (
                        <div>
                          <p className="font-semibold text-muted-foreground mb-1.5">أنواع الحلقات ({parsedTrackTypes.length}):</p>
                          <div className="flex flex-wrap gap-1">
                            {parsedTrackTypes.map((t, i) => {
                              const fieldLabels = (t.inputFields ?? []).map((k: string) => AVAILABLE_INPUT_FIELDS.find(f => f.key === k)?.label).filter(Boolean);
                              return (
                                <span key={i} className="flex items-center gap-1 bg-muted px-2 py-0.5 rounded-full text-[10px]">
                                  {t.category && <span className="text-[9px] opacity-60">{t.category}</span>}
                                  <span>{t.name}</span>
                                  {fieldLabels.length > 0 && <span className="opacity-40">({fieldLabels.join("·")})</span>}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      {parsedDataEntryRoles.length > 0 && (
                        <div>
                          <p className="font-semibold text-muted-foreground mb-1.5">من تُدخل البيانات:</p>
                          <div className="flex flex-wrap gap-1">
                            {parsedDataEntryRoles.map(r => (
                              <span key={r} className="bg-primary/5 text-primary border border-primary/10 px-2 py-0.5 rounded-full text-[10px]">
                                {parsedRoleNames[r] || ALL_ROLES.find(ar => ar.key === r)?.defaultLabel || r}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {Object.keys(parsedRoleNames).filter(k => parsedRoleNames[k]).length > 0 && (
                        <div>
                          <p className="font-semibold text-muted-foreground mb-1.5">مسميات الأدوار المخصصة:</p>
                          <div className="flex flex-wrap gap-1">
                            {Object.entries(parsedRoleNames).filter(([, v]) => v).map(([k, v]) => (
                              <span key={k} className="bg-secondary/10 text-secondary-foreground border border-secondary/20 px-2 py-0.5 rounded-full text-[10px]">
                                {k} → {v}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      <div>
                        <p className="font-semibold text-muted-foreground mb-1.5">المميزات:</p>
                        <div className="space-y-1.5">
                          {FEATURE_GROUPS.map(group => {
                            const groupEnabled = group.features.filter(f => parsedFeatures.includes(f.key));
                            const groupDisabled = group.features.filter(f => !parsedFeatures.includes(f.key));
                            if (groupEnabled.length === 0 && groupDisabled.length === 0) return null;
                            return (
                              <div key={group.label}>
                                <p className="text-[10px] font-bold text-muted-foreground/70 mb-1">{group.label}</p>
                                <div className="flex flex-wrap gap-1">
                                  {groupEnabled.map(f => (
                                    <span key={f.key} className="flex items-center gap-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full text-[10px]">
                                      <span>✓</span> {f.label}
                                    </span>
                                  ))}
                                  {groupDisabled.map(f => (
                                    <span key={f.key} className="flex items-center gap-0.5 bg-muted/40 text-muted-foreground/50 border border-border/30 px-2 py-0.5 rounded-full text-[10px] line-through">
                                      {f.label}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                      {cfg.logoUrl && (
                        <div className="flex items-center gap-2">
                          <img src={cfg.logoUrl} alt="" className="w-10 h-10 object-contain rounded-lg border border-border" onError={e => e.currentTarget.style.display = "none"} />
                          <span className="text-[10px] text-muted-foreground truncate max-w-xs">{cfg.logoUrl}</span>
                        </div>
                      )}
                      {cfg.deployError && (
                        <div className="bg-red-50 rounded-xl p-2.5 text-red-700">
                          <p className="font-semibold mb-0.5">خطأ في النشر:</p>
                          <p className="font-mono text-[10px] break-all">{cfg.deployError}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Service URL */}
                  {cfg.renderServiceUrl && cfg.deployStatus !== "failed" && (
                    <div className="flex items-center gap-2">
                      <a href={cfg.renderServiceUrl} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs text-blue-600 hover:underline min-w-0 truncate">
                        <ExternalLink className="w-3 h-3 shrink-0" />
                        {cfg.renderServiceUrl}
                      </a>
                      <button onClick={() => { navigator.clipboard.writeText(cfg.renderServiceUrl!); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                        className="text-muted-foreground hover:text-foreground shrink-0">
                        {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                      </button>
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => handleDeploy(cfg.id)}
                      disabled={deploying === cfg.id || cfg.deployStatus === "deploying" || !canDeploy}
                      className="flex-1 gap-1.5 text-xs"
                      variant={cfg.deployStatus === "deployed" ? "outline" : "default"}>
                      {deploying === cfg.id || cfg.deployStatus === "deploying"
                        ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> جارٍ النشر...</>
                        : cfg.deployStatus === "deployed"
                        ? <><RefreshCw className="w-3.5 h-3.5" /> إعادة النشر</>
                        : <><Rocket className="w-3.5 h-3.5" /> نشر على Render</>}
                    </Button>
                    {cfg.renderServiceId && (
                      <Button size="sm" variant="outline" onClick={() => handleRefreshStatus(cfg.id)}
                        disabled={refreshing === cfg.id}
                        className="gap-1.5 text-xs px-3">
                        <RefreshCw className={`w-3.5 h-3.5 ${refreshing === cfg.id ? "animate-spin" : ""}`} />
                        تحديث الحالة
                      </Button>
                    )}
                  </div>
                  {!canDeploy && (
                    <p className="text-[10px] text-amber-600 text-center">أضيفي RENDER_API_KEY وREPO_URL في Secrets أولاً</p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
