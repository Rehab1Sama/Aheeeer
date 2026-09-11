import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle, XCircle, Eye, EyeOff, Loader2 } from "lucide-react";
import logoUrl from "@/assets/logo.jpg";
import { Link } from "wouter";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function ResetPasswordPage() {
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [state, setState] = useState<"form" | "loading" | "success" | "error">("form");
  const [error, setError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("token") ?? "";
    if (!t) {
      setState("error");
      setError("رابط إعادة التعيين غير صحيح — لا يوجد رمز");
    } else {
      setToken(t);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) { setError("كلمة المرور قصيرة جدًا (٦ أحرف على الأقل)"); return; }
    if (password !== confirm) { setError("كلمتا المرور غير متطابقتين"); return; }
    setError("");
    setState("loading");
    try {
      const res = await fetch(`${BASE}/api/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "فشل تعيين كلمة المرور");
      setState("success");
    } catch (err: any) {
      setError(err.message ?? "حدث خطأ غير متوقع");
      setState("form");
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-4"
      style={{ background: "linear-gradient(135deg, hsl(180, 20%, 96%) 0%, hsl(177, 40%, 93%) 100%)" }}
      dir="rtl"
    >
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="w-20 h-20 rounded-2xl bg-white flex items-center justify-center mx-auto mb-3 shadow-lg overflow-hidden">
            <img src={logoUrl} alt="مقرأة سَنا الآي" className="w-full h-full object-contain" />
          </div>
          <h1 className="text-xl font-bold text-foreground">مقرأة سَنا الآي</h1>
        </div>

        <Card className="shadow-lg border-0 bg-white/90 backdrop-blur-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-center text-lg font-bold">تعيين كلمة مرور جديدة</CardTitle>
          </CardHeader>
          <CardContent>
            {state === "success" && (
              <div className="text-center py-4">
                <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="w-7 h-7 text-emerald-600" />
                </div>
                <p className="font-semibold text-foreground mb-2">تم تعيين كلمة المرور بنجاح ✓</p>
                <p className="text-muted-foreground text-sm mb-6">يمكنك الآن تسجيل الدخول بكلمة المرور الجديدة.</p>
                <Link href="/login">
                  <Button
                    className="w-full font-bold"
                    style={{ background: "linear-gradient(135deg, hsl(210, 51%, 21%) 0%, hsl(177, 35%, 40%) 100%)" }}
                  >
                    تسجيل الدخول
                  </Button>
                </Link>
              </div>
            )}

            {state === "error" && (
              <div className="text-center py-4">
                <div className="w-14 h-14 rounded-full bg-rose-50 flex items-center justify-center mx-auto mb-4">
                  <XCircle className="w-7 h-7 text-rose-500" />
                </div>
                <p className="font-semibold text-foreground mb-2">رابط غير صالح</p>
                <p className="text-muted-foreground text-sm mb-6 leading-relaxed">
                  {error || "انتهت صلاحية الرابط أو تم استخدامه مسبقًا."}
                </p>
                <Link href="/forgot-password">
                  <Button variant="outline" className="w-full">
                    طلب رابط جديد
                  </Button>
                </Link>
              </div>
            )}

            {(state === "form" || state === "loading") && (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-sm font-semibold">كلمة المرور الجديدة</Label>
                  <div className="relative">
                    <Input
                      type={showPw ? "text" : "password"}
                      required
                      value={password}
                      onChange={e => { setPassword(e.target.value); setError(""); }}
                      placeholder="••••••••"
                      className="ps-10 h-11"
                      minLength={6}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw(v => !v)}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-semibold">تأكيد كلمة المرور</Label>
                  <div className="relative">
                    <Input
                      type={showConfirm ? "text" : "password"}
                      required
                      value={confirm}
                      onChange={e => { setConfirm(e.target.value); setError(""); }}
                      placeholder="••••••••"
                      className="ps-10 h-11"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirm(v => !v)}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                {error && <p className="text-xs text-rose-600 text-center">{error}</p>}
                <Button
                  type="submit"
                  className="w-full h-11 font-bold gap-2"
                  disabled={state === "loading"}
                  style={{ background: "linear-gradient(135deg, hsl(210, 51%, 21%) 0%, hsl(177, 35%, 40%) 100%)" }}
                >
                  {state === "loading" && <Loader2 className="w-4 h-4 animate-spin" />}
                  {state === "loading" ? "جاري الحفظ..." : "حفظ كلمة المرور الجديدة"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
