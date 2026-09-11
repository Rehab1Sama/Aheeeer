import { useState } from "react";
import { useCreateUser, useListCircles, useListTracks } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { UserPlus, CheckCircle, Search, ChevronDown } from "lucide-react";
import { useLocation } from "wouter";
import { COUNTRIES } from "@/lib/countries";

const AGE_RANGES = ["أقل من 10 سنوات", "10-15", "16-20", "21-30", "31-40", "41-50", "51+"];

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

const ROLES = [
  { value: "student", label: "طالبة" },
  { value: "teacher", label: "معلمة" },
  { value: "supervisor", label: "مشرفة" },
  { value: "track_supervisor", label: "مسؤولة مسار" },
  { value: "data_entry", label: "مُدخلة بيانات" },
];

interface FormState {
  fullName: string;
  email: string;
  password: string;
  phone: string;
  country: string;
  ageRange: string;
  role: string;
  track: string;
  circleId: string;
}

const empty: FormState = {
  fullName: "", email: "", password: "", phone: "", country: "السعودية",
  ageRange: "", role: "student", track: "", circleId: "",
};

export default function OnboardPage() {
  const { data: circles } = useListCircles(undefined, { query: { queryKey: ["circles"] } });
  const { data: tracks } = useListTracks({ query: { queryKey: ["tracks"] } });
  const createUser = useCreateUser();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const [form, setForm] = useState<FormState>(empty);
  const [addedNames, setAddedNames] = useState<string[]>([]);

  const filteredCircles = circles?.filter(c => !form.track || c.track === form.track) ?? [];

  const needsTrackCircle = ["student", "teacher", "supervisor", "track_supervisor"].includes(form.role);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.fullName || !form.email || !form.password) {
      toast({ title: "يرجى تعبئة الاسم والبريد وكلمة المرور", variant: "destructive" });
      return;
    }
    if (needsTrackCircle && !form.track) {
      toast({ title: "يرجى اختيار المسار", variant: "destructive" });
      return;
    }

    createUser.mutate(
      {
        data: {
          name: form.fullName,
          email: form.email,
          password: form.password,
          role: form.role,
          track: form.track || null,
          circleId: form.circleId ? Number(form.circleId) : null,
          phone: form.phone || null,
          country: form.country || null,
          ageRange: form.ageRange || null,
        },
      },
      {
        onSuccess: () => {
          toast({ title: `تم إضافة ${form.fullName} بنجاح ✓` });
          setAddedNames(n => [form.fullName, ...n]);
          queryClient.invalidateQueries({ queryKey: ["circles"] });
          // Keep track/role to make bulk entry easier, reset personal data
          setForm(f => ({ ...empty, role: f.role, track: f.track, circleId: f.circleId }));
        },
        onError: (err: any) => {
          toast({
            title: "خطأ في الإضافة",
            description: err?.data?.error ?? "تحققي من البيانات",
            variant: "destructive",
          });
        },
      }
    );
  };

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">الإضافة المباشرة للأعضاء</h1>
          <p className="text-muted-foreground text-sm mt-1">
            سجّلي الطالبات والكادر الحاليين وانقليهم مباشرة لحلقاتهم
          </p>
        </div>
        <Button variant="outline" onClick={() => setLocation("/registration")}>
          رجوع
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Form */}
        <div className="lg:col-span-2">
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-4">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-primary" />
                بيانات العضو الجديد
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Role */}
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">الدور *</Label>
                  <Select
                    value={form.role}
                    onValueChange={v => setForm(f => ({ ...f, role: v, circleId: "" }))}
                  >
                    <SelectTrigger data-testid="select-role">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES.map(r => (
                        <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Track + Circle (for roles that need it) */}
                {needsTrackCircle && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label className="text-sm font-semibold">المسار *</Label>
                      <Select
                        value={form.track}
                        onValueChange={v => setForm(f => ({ ...f, track: v, circleId: "" }))}
                      >
                        <SelectTrigger data-testid="select-track">
                          <SelectValue placeholder="اختر المسار" />
                        </SelectTrigger>
                        <SelectContent>
                          {(tracks ?? []).map(t => (
                            <SelectItem key={t.name} value={t.name}>{t.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-semibold">الحلقة</Label>
                      <Select
                        value={form.circleId}
                        onValueChange={v => setForm(f => ({ ...f, circleId: v }))}
                        disabled={!form.track || filteredCircles.length === 0}
                      >
                        <SelectTrigger data-testid="select-circle">
                          <SelectValue placeholder={!form.track ? "اختر المسار أولًا" : "اختر الحلقة"} />
                        </SelectTrigger>
                        <SelectContent>
                          {filteredCircles.map(c => (
                            <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}

                {/* Name */}
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">الاسم الكامل *</Label>
                  <Input
                    required
                    value={form.fullName}
                    onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))}
                    placeholder="الاسم الرباعي"
                    className="text-right"
                    data-testid="input-full-name"
                  />
                </div>

                {/* Email + Password */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold">البريد الإلكتروني *</Label>
                    <Input
                      required type="email"
                      value={form.email}
                      onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                      placeholder="email@example.com"
                      dir="ltr"
                      className="text-left"
                      data-testid="input-email"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold">كلمة المرور *</Label>
                    <Input
                      required type="password"
                      value={form.password}
                      onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                      placeholder="••••••••"
                      data-testid="input-password"
                    />
                  </div>
                </div>

                {/* Phone + Country */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold">الجوال</Label>
                    <Input
                      value={form.phone}
                      onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                      placeholder="05xxxxxxxx"
                      data-testid="input-phone"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold">الدولة</Label>
                    <CountrySelector
                      value={form.country}
                      onChange={v => setForm(f => ({ ...f, country: v }))}
                    />
                  </div>
                </div>

                {/* Age range (for students) */}
                {form.role === "student" && (
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold">الفئة العمرية</Label>
                    <Select value={form.ageRange} onValueChange={v => setForm(f => ({ ...f, ageRange: v }))}>
                      <SelectTrigger data-testid="select-age-range">
                        <SelectValue placeholder="اختر الفئة" />
                      </SelectTrigger>
                      <SelectContent>
                        {AGE_RANGES.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="pt-2">
                  <Button
                    type="submit"
                    className="w-full h-11 font-bold text-base gap-2"
                    disabled={createUser.isPending}
                    style={{ background: "linear-gradient(135deg, hsl(210, 51%, 21%) 0%, hsl(177, 35%, 40%) 100%)" }}
                    data-testid="button-submit-onboard"
                  >
                    <UserPlus className="w-4 h-4" />
                    {createUser.isPending ? "جاري الإضافة..." : "إضافة وتسجيل مباشرة"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* Added members sidebar */}
        <div>
          <Card className="border-0 shadow-sm sticky top-4">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold text-muted-foreground">
                المضافون في هذه الجلسة ({addedNames.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {addedNames.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6">
                  لم تتم إضافة أي عضو بعد
                </p>
              ) : (
                <div className="space-y-2">
                  {addedNames.map((name, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                      <span className="font-medium">{name}</span>
                    </div>
                  ))}
                </div>
              )}

              {addedNames.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full mt-4 text-xs"
                  onClick={() => setLocation("/accounts")}
                >
                  عرض جميع الحسابات
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
