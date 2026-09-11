import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Eye, EyeOff, CheckCircle } from "lucide-react";
import logoUrl from "@/assets/logo.jpg";
import { useToast } from "@/hooks/use-toast";

const COUNTRIES = [
  "المملكة العربية السعودية", "الإمارات العربية المتحدة", "الكويت", "البحرين", "قطر", "عُمان",
  "اليمن", "الأردن", "فلسطين", "لبنان", "سوريا", "العراق", "مصر", "ليبيا", "تونس",
  "الجزائر", "المغرب", "السودان", "الصومال", "موريتانيا", "دول أخرى",
];

const ROLES = [
  { value: "teacher", label: "معلمة" },
  { value: "supervisor", label: "مشرفة" },
  { value: "track_supervisor", label: "مسؤولة مسار" },
  { value: "data_entry", label: "مدخلة بيانات" },
];

interface CircleOption {
  id: number;
  name: string;
  track: string;
  teacherId: number | null;
  supervisorId: number | null;
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function StaffRegisterPage() {
  const [form, setForm] = useState({
    name: "",
    phone: "",
    country: "",
    email: "",
    password: "",
    confirmPassword: "",
    role: "",
    track: "",
    circleId: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [circles, setCircles] = useState<CircleOption[]>([]);
  const [staffCustomQuestions, setStaffCustomQuestions] = useState<any[]>([]);
  const [customAnswers, setCustomAnswers] = useState<Record<string, string>>({});
  const [allowedRoles, setAllowedRoles] = useState<string[] | null>(null);

  useEffect(() => {
    fetch(`${BASE}/api/registration/circles-public`)
      .then(r => r.ok ? r.json() : [])
      .then((data: any[]) => {
        setCircles(data.map((c: any) => ({
          id: c.id,
          name: c.name,
          track: c.track ?? "",
          teacherId: c.teacherId ?? null,
          supervisorId: c.supervisorId ?? null,
        })));
      })
      .catch(() => {});
    fetch(`${BASE}/api/registration/status`)
      .then(r => r.ok ? r.json() : null)
      .then((data: any) => {
        if (data?.staffCustomQuestions) {
          try {
            const parsed = JSON.parse(data.staffCustomQuestions);
            if (Array.isArray(parsed)) setStaffCustomQuestions(parsed);
          } catch { /* ignore */ }
        }
        if (Array.isArray(data?.allowedStaffRoles) && data.allowedStaffRoles.length > 0) {
          setAllowedRoles(data.allowedStaffRoles);
        }
      })
      .catch(() => {});
  }, []);

  const uniqueTracks = Array.from(new Set(circles.map(c => c.track).filter(Boolean)));
  const filteredCircles = circles.filter(c => {
    if (form.track && c.track !== form.track) return false;
    if (form.role === "teacher" && c.teacherId) return false;
    if (form.role === "supervisor" && c.supervisorId) return false;
    return true;
  });
  const needsCircle = form.role === "teacher" || form.role === "supervisor";

  const handleChange = (field: string, value: string) => {
    setForm(prev => {
      const next = { ...prev, [field]: value };
      if (field === "role" && !["teacher", "supervisor"].includes(value)) {
        next.circleId = "";
      }
      if (field === "track") {
        next.circleId = "";
      }
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.role) {
      toast({ title: "خطأ", description: "يرجى اختيار الدور", variant: "destructive" });
      return;
    }
    if (form.password !== form.confirmPassword) {
      toast({ title: "خطأ", description: "كلمتا المرور غير متطابقتين", variant: "destructive" });
      return;
    }
    if (form.password.length < 6) {
      toast({ title: "خطأ", description: "كلمة المرور يجب أن تكون 6 أحرف على الأقل", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const body: Record<string, any> = {
        name: form.name,
        phone: form.phone,
        country: form.country,
        email: form.email,
        password: form.password,
        role: form.role,
      };
      if (form.track) body.track = form.track;
      if (form.circleId) body.circleId = parseInt(form.circleId);
      if (Object.keys(customAnswers).length > 0) body.extraData = customAnswers;

      const res = await fetch(`${BASE}/api/auth/staff-register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.status === 409) {
        toast({ title: "البريد مسجل مسبقًا", description: "هذا البريد الإلكتروني مستخدم بالفعل بنفس الدور", variant: "destructive" });
        return;
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? "حدث خطأ");
      }
      setSuccess(true);
    } catch (err: any) {
      toast({ title: "حدث خطأ", description: err?.message ?? "يرجى المحاولة مرة أخرى", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center p-4"
        style={{ background: "linear-gradient(135deg, hsl(180, 20%, 96%) 0%, hsl(177, 40%, 93%) 100%)" }}
      >
        <div className="w-full max-w-md text-center">
          <Card className="shadow-xl border-0 bg-white/80 backdrop-blur-sm">
            <CardContent className="p-10">
              <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-5">
                <CheckCircle className="w-10 h-10 text-emerald-600" />
              </div>
              <h2 className="text-2xl font-bold text-foreground mb-2">تم التسجيل بنجاح</h2>
              <p className="text-muted-foreground text-sm leading-relaxed mb-6">
                تم إنشاء حسابك بنجاح. يمكنك الآن تسجيل الدخول والانضمام إلى المنصة.
              </p>
              <Button
                className="w-full font-bold"
                style={{ background: "linear-gradient(135deg, hsl(210, 51%, 21%) 0%, hsl(177, 35%, 40%) 100%)" }}
                onClick={() => setLocation("/login")}
                data-testid="button-go-login"
              >
                الذهاب إلى تسجيل الدخول
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: "linear-gradient(135deg, hsl(180, 20%, 96%) 0%, hsl(177, 40%, 93%) 100%)" }}
      dir="rtl"
    >
      <div className="flex-1 flex items-center justify-center p-4 py-8">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="w-32 h-32 rounded-2xl bg-white flex items-center justify-center mx-auto mb-4 shadow-xl overflow-hidden">
            <img src={logoUrl} alt="شعار مقرأة سَنا الآي" className="w-full h-full object-contain" />
          </div>
          <h1 className="text-3xl font-bold text-foreground mb-1">مقرأة سَنا الآي</h1>
          <p className="text-muted-foreground text-sm">تسجيل الموظفات والمشرفات</p>
        </div>

        <Card className="shadow-xl border-0 bg-white/80 backdrop-blur-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-center text-xl font-bold text-foreground">إنشاء حساب جديد</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">

              {/* Role */}
              <div className="space-y-1.5">
                <Label htmlFor="role" className="text-sm font-semibold">
                  الدور <span className="text-destructive">*</span>
                </Label>
                <select
                  id="role"
                  value={form.role}
                  onChange={e => handleChange("role", e.target.value)}
                  required
                  className="w-full h-11 border border-input rounded-md px-3 py-2 text-sm bg-background text-right focus:outline-none focus:ring-2 focus:ring-ring"
                  data-testid="select-role"
                >
                  <option value="">اختاري دورك</option>
                  {(allowedRoles ? ROLES.filter(r => allowedRoles.includes(r.value)) : ROLES).map(r => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>

              {/* Track */}
              {uniqueTracks.length > 0 && (
                <div className="space-y-1.5">
                  <Label htmlFor="track" className="text-sm font-semibold">
                    المسار {needsCircle && <span className="text-destructive">*</span>}
                  </Label>
                  <select
                    id="track"
                    value={form.track}
                    onChange={e => handleChange("track", e.target.value)}
                    required={needsCircle}
                    className="w-full h-11 border border-input rounded-md px-3 py-2 text-sm bg-background text-right focus:outline-none focus:ring-2 focus:ring-ring"
                    data-testid="select-track"
                  >
                    <option value="">اختاري المسار</option>
                    {uniqueTracks.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Circle (only for teacher/supervisor) */}
              {needsCircle && (
                <div className="space-y-1.5">
                  <Label htmlFor="circle" className="text-sm font-semibold">
                    الحلقة <span className="text-destructive">*</span>
                  </Label>
                  <select
                    id="circle"
                    value={form.circleId}
                    onChange={e => handleChange("circleId", e.target.value)}
                    required
                    className="w-full h-11 border border-input rounded-md px-3 py-2 text-sm bg-background text-right focus:outline-none focus:ring-2 focus:ring-ring"
                    data-testid="select-circle"
                  >
                    <option value="">اختاري الحلقة</option>
                    {filteredCircles.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Name */}
              <div className="space-y-1.5">
                <Label htmlFor="name" className="text-sm font-semibold">
                  الاسم الكامل <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="name"
                  type="text"
                  value={form.name}
                  onChange={e => handleChange("name", e.target.value)}
                  placeholder="أدخلي اسمك الكامل"
                  required
                  className="text-right h-11"
                  data-testid="input-name"
                />
              </div>

              {/* Phone */}
              <div className="space-y-1.5">
                <Label htmlFor="phone" className="text-sm font-semibold">
                  رقم الجوال <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="phone"
                  type="tel"
                  value={form.phone}
                  onChange={e => handleChange("phone", e.target.value)}
                  placeholder="05XXXXXXXX"
                  required
                  className="h-11"
                  data-testid="input-phone"
                  dir="ltr"
                />
              </div>

              {/* Country */}
              <div className="space-y-1.5">
                <Label htmlFor="country" className="text-sm font-semibold">
                  الدولة <span className="text-destructive">*</span>
                </Label>
                <select
                  id="country"
                  value={form.country}
                  onChange={e => handleChange("country", e.target.value)}
                  required
                  className="w-full h-11 border border-input rounded-md px-3 py-2 text-sm bg-background text-right focus:outline-none focus:ring-2 focus:ring-ring"
                  data-testid="select-country"
                >
                  <option value="">اختاري الدولة</option>
                  {COUNTRIES.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              {/* Email */}
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-sm font-semibold">
                  البريد الإلكتروني <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={e => handleChange("email", e.target.value)}
                  placeholder="example@gmail.com"
                  required
                  className="h-11"
                  data-testid="input-email"
                  dir="ltr"
                />
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-sm font-semibold">
                  كلمة المرور <span className="text-destructive">*</span>
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={form.password}
                    onChange={e => handleChange("password", e.target.value)}
                    placeholder="6 أحرف على الأقل"
                    required
                    className="h-11 ps-10"
                    data-testid="input-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Confirm Password */}
              <div className="space-y-1.5">
                <Label htmlFor="confirmPassword" className="text-sm font-semibold">
                  تأكيد كلمة المرور <span className="text-destructive">*</span>
                </Label>
                <div className="relative">
                  <Input
                    id="confirmPassword"
                    type={showConfirm ? "text" : "password"}
                    value={form.confirmPassword}
                    onChange={e => handleChange("confirmPassword", e.target.value)}
                    placeholder="أعيدي كتابة كلمة المرور"
                    required
                    className="h-11 ps-10"
                    data-testid="input-confirm-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(!showConfirm)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Dynamic staff questions */}
              {staffCustomQuestions.map((q: any) => (
                <div key={q.id} className="space-y-1.5">
                  <label className="text-sm font-semibold">
                    {q.label}
                    {q.required && <span className="text-destructive mr-1">*</span>}
                  </label>
                  {q.type === "textarea" ? (
                    <textarea
                      value={customAnswers[q.id] ?? ""}
                      onChange={e => setCustomAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                      required={q.required}
                      rows={3}
                      placeholder={q.placeholder ?? ""}
                      className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background text-right resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  ) : q.type === "select" ? (
                    <select
                      value={customAnswers[q.id] ?? ""}
                      onChange={e => setCustomAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                      required={q.required}
                      className="w-full h-11 border border-input rounded-md px-3 py-2 text-sm bg-background text-right focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      <option value="">اختاري...</option>
                      {(q.options ?? []).map((opt: string) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={q.type === "number" ? "number" : "text"}
                      value={customAnswers[q.id] ?? ""}
                      onChange={e => setCustomAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                      required={q.required}
                      placeholder={q.placeholder ?? ""}
                      className="w-full h-11 border border-input rounded-md px-3 py-2 text-sm bg-background text-right focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  )}
                </div>
              ))}

              <Button
                type="submit"
                className="w-full h-11 font-bold text-base mt-2"
                disabled={loading}
                style={{ background: "linear-gradient(135deg, hsl(210, 51%, 21%) 0%, hsl(177, 35%, 40%) 100%)" }}
                data-testid="button-submit"
              >
                {loading ? "جاري التسجيل..." : "تسجيل"}
              </Button>
            </form>

            <div className="mt-5 pt-4 border-t border-border text-center">
              <p className="text-sm text-muted-foreground mb-1">لديك حساب بالفعل؟</p>
              <Link
                href="/login"
                className="text-sm font-semibold text-primary hover:underline"
                data-testid="link-login"
              >
                تسجيل الدخول
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
      </div>
      <footer className="text-center py-3 text-xs text-muted-foreground">
        جميع الحقوق محفوظة لمقرأة سَنا الآي &copy; 2026
      </footer>
    </div>
  );
}
