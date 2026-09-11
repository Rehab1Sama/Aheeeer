import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";
import logoUrl from "@/assets/logo.jpg";
import { Link } from "wouter";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function ActivatePage() {
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");

    if (!token) {
      setError("رابط التفعيل غير صحيح — لا يوجد رمز تفعيل");
      setStatus("error");
      return;
    }

    fetch(`${BASE}/api/registration/activate?token=${encodeURIComponent(token)}`)
      .then(async res => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "فشل التفعيل");
        setName(data.name ?? "");
        setStatus("success");
      })
      .catch(err => {
        setError(err.message ?? "حدث خطأ أثناء التفعيل");
        setStatus("error");
      });
  }, []);

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
          <CardContent className="py-10 text-center">
            {status === "loading" && (
              <>
                <Loader2 className="w-12 h-12 text-primary mx-auto mb-4 animate-spin" />
                <p className="text-base font-semibold text-foreground">جاري تفعيل حسابك...</p>
              </>
            )}

            {status === "success" && (
              <>
                <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="w-9 h-9 text-emerald-600" />
                </div>
                <p className="text-xl font-bold text-foreground mb-2">
                  أهلاً {name && <span className="text-primary">{name}</span>}! 🎉
                </p>
                <p className="text-muted-foreground text-sm mb-6 leading-relaxed">
                  تم تفعيل حسابك بنجاح.<br />
                  يمكنك الآن تسجيل الدخول والانضمام إلى المنصة.
                </p>
                <Link href="/login">
                  <Button
                    className="w-full font-bold"
                    style={{ background: "linear-gradient(135deg, hsl(210, 51%, 21%) 0%, hsl(177, 35%, 40%) 100%)" }}
                  >
                    تسجيل الدخول
                  </Button>
                </Link>
              </>
            )}

            {status === "error" && (
              <>
                <div className="w-16 h-16 rounded-full bg-rose-50 flex items-center justify-center mx-auto mb-4">
                  <XCircle className="w-9 h-9 text-rose-500" />
                </div>
                <p className="text-lg font-bold text-foreground mb-2">تعذّر التفعيل</p>
                <p className="text-muted-foreground text-sm mb-6 leading-relaxed">{error}</p>
                <p className="text-xs text-muted-foreground mb-4">
                  ربما انتهت صلاحية الرابط أو تم استخدامه مسبقاً.
                </p>
                <Link href="/login">
                  <Button variant="outline" className="w-full">
                    العودة لتسجيل الدخول
                  </Button>
                </Link>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
