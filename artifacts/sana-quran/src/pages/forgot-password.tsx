import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mail, ArrowRight, CheckCircle } from "lucide-react";
import logoUrl from "@/assets/logo.jpg";
import { Link } from "wouter";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "sent" | "error">("idle");
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setState("loading");
    setError("");
    try {
      const res = await fetch(`${BASE}/api/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "حدث خطأ");
      setState("sent");
    } catch (err: any) {
      setError(err.message ?? "حدث خطأ غير متوقع");
      setState("error");
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
            <CardTitle className="text-center text-lg font-bold">نسيت كلمة المرور؟</CardTitle>
          </CardHeader>
          <CardContent>
            {state === "sent" ? (
              <div className="text-center py-4">
                <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="w-7 h-7 text-emerald-600" />
                </div>
                <p className="font-semibold text-foreground mb-2">تم إرسال رابط الإعادة</p>
                <p className="text-muted-foreground text-sm mb-1">أُرسل رابط إعادة تعيين كلمة المرور إلى:</p>
                <p className="font-semibold text-primary text-sm mb-4" dir="ltr">{email}</p>
                <p className="text-muted-foreground text-xs leading-relaxed mb-6">
                  اضغطي على الرابط في البريد لاختيار كلمة مرور جديدة.<br />
                  الرابط صالح لمدة ساعة واحدة فقط.
                </p>
                <Link href="/login">
                  <Button variant="outline" className="w-full gap-2">
                    <ArrowRight className="w-4 h-4" />
                    العودة لتسجيل الدخول
                  </Button>
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <p className="text-sm text-muted-foreground text-center leading-relaxed">
                  أدخلي بريدك الإلكتروني المسجل وسنرسل لك رابطًا لإعادة تعيين كلمة المرور.
                </p>
                <div className="space-y-1.5">
                  <Label className="text-sm font-semibold">البريد الإلكتروني</Label>
                  <div className="relative">
                    <Mail className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      type="email"
                      required
                      value={email}
                      onChange={e => { setEmail(e.target.value); setState("idle"); setError(""); }}
                      placeholder="example@email.com"
                      className="pr-9 text-left h-11"
                      dir="ltr"
                      autoFocus
                    />
                  </div>
                </div>
                {state === "error" && (
                  <p className="text-xs text-rose-600 text-center">{error}</p>
                )}
                <Button
                  type="submit"
                  className="w-full h-11 font-bold"
                  disabled={state === "loading"}
                  style={{ background: "linear-gradient(135deg, hsl(210, 51%, 21%) 0%, hsl(177, 35%, 40%) 100%)" }}
                >
                  {state === "loading" ? "جاري الإرسال..." : "إرسال رابط الإعادة"}
                </Button>
                <div className="text-center pt-1">
                  <Link href="/login" className="text-sm text-muted-foreground hover:underline">
                    العودة لتسجيل الدخول
                  </Link>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
