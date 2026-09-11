import { useState } from "react";
import { useLocation } from "wouter";
import { useLogin, useLoginSelectAccount, useGetRegistrationStatus } from "@workspace/api-client-react";
import { setToken } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Eye, EyeOff, ChevronLeft } from "lucide-react";
import logoUrl from "@/assets/logo.jpg";
import { useToast } from "@/hooks/use-toast";

const ROLE_LABELS: Record<string, string> = {
  leader: "القائدة",
  data_entry: "مُدخلة بيانات",
  teacher: "معلمة",
  supervisor: "مشرفة",
  student: "طالبة",
  track_supervisor: "مسؤولة مسار",
};

type AccountOption = {
  id: number;
  name: string;
  role: string;
  roleLabel?: string;
  track?: string | null;
  circleId?: number | null;
};

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const login = useLogin();
  const selectAccount = useLoginSelectAccount();
  const { data: regStatus } = useGetRegistrationStatus({ query: { queryKey: ["regStatus"] } });
  const staffOpen = regStatus?.staffRegistrationOpen !== false;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    login.mutate(
      { data: { email, password } },
      {
        onSuccess: (data) => {
          if (data.requiresSelection && data.accounts && data.accounts.length > 0) {
            setAccounts(data.accounts as AccountOption[]);
            return;
          }
          if (data.token && data.user) {
            setToken(data.token);
            setLocation("/");
            window.location.reload();
          }
        },
        onError: (error: any) => {
          const message = error?.data?.error ?? error?.message;
          toast({
            title: "خطأ في تسجيل الدخول",
            description: message ?? "البريد الإلكتروني أو كلمة المرور غير صحيحة",
            variant: "destructive",
          });
        },
      }
    );
  };

  const handleSelectAccount = (accountId: number) => {
    selectAccount.mutate(
      { data: { email, password, accountId } },
      {
        onSuccess: (data) => {
          if (data.token && data.user) {
            setToken(data.token);
            setLocation("/");
            window.location.reload();
          }
        },
        onError: (error: any) => {
          const message = error?.data?.error ?? error?.message;
          toast({
            title: "خطأ في تسجيل الدخول",
            description: message ?? "حدث خطأ، يرجى المحاولة مرة أخرى",
            variant: "destructive",
          });
        },
      }
    );
  };

  return (
    <div
      className="min-h-screen sana-main-background flex flex-col"
    >
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="w-32 h-32 rounded-2xl bg-white flex items-center justify-center mx-auto mb-4 shadow-xl overflow-hidden">
              <img src={logoUrl} alt="شعار مقرأة سَنا الآي" className="w-full h-full object-contain" />
            </div>
            <h1 className="text-3xl font-bold text-foreground mb-1">مقرأة سَنا الآي</h1>
            <p className="text-muted-foreground text-sm">نظام إدارة المقرأة</p>
          </div>

          <Card className="shadow-xl border-0 bg-white/80 backdrop-blur-sm">
            <CardHeader className="pb-4">
              <CardTitle className="text-center text-xl font-bold text-foreground">
                {accounts.length > 0 ? "اختاري الدور" : "تسجيل الدخول"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {accounts.length > 0 ? (
                <div className="space-y-3" dir="rtl">
                  <p className="text-sm text-muted-foreground text-center mb-4">
                    لديكِ أكثر من حساب مسجل. اختاري الحساب المطلوب:
                  </p>
                  {accounts.map((account) => (
                    <button
                      key={account.id}
                      onClick={() => handleSelectAccount(account.id)}
                      disabled={selectAccount.isPending}
                      className="w-full flex items-center justify-between p-4 rounded-xl border-2 border-border hover:border-primary hover:bg-primary/5 transition-all text-right group"
                      data-testid={`btn-account-${account.id}`}
                    >
                      <div>
                        <p className="font-bold text-foreground">
                          {account.name}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {account.roleLabel ?? ROLE_LABELS[account.role] ?? account.role}
                          {account.track ? ` — مسار ${account.track}` : ""}
                        </p>
                      </div>
                      <ChevronLeft className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                    </button>
                  ))}
                  <button
                    onClick={() => setAccounts([])}
                    className="w-full text-sm text-muted-foreground hover:text-foreground mt-2 py-2 transition-colors"
                    data-testid="btn-back-login"
                  >
                    رجوع
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-5" noValidate>
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-sm font-semibold">البريد الإلكتروني</Label>
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="example@sana.sa"
                      required
                      className="text-left h-11"
                      dir="ltr"
                      autoComplete="email"
                      data-testid="input-email"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password" className="text-sm font-semibold">كلمة المرور</Label>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        placeholder="••••••••"
                        required
                        className="text-right h-11 ps-10"
                        data-testid="input-password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                        data-testid="button-toggle-password"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <Button
                    type="submit"
                    className="w-full h-11 font-bold text-base"
                    disabled={login.isPending}
                    style={{ background: "linear-gradient(135deg, #1A2260 0%, #2B3784 100%)" }}
                    data-testid="button-login"
                  >
                    {login.isPending ? "جاري التحقق..." : "دخول"}
                  </Button>
                  <div className="text-center">
                    <a
                      href={import.meta.env.BASE_URL.replace(/\/$/, "") + "/forgot-password"}
                      className="text-xs text-muted-foreground hover:text-foreground hover:underline transition-colors"
                    >
                      نسيت كلمة المرور؟
                    </a>
                  </div>
                </form>
              )}

              {accounts.length === 0 && (
                <div className="mt-6 pt-5 border-t border-border space-y-3">
                  <div className="text-center">
                    <a
                      href={import.meta.env.BASE_URL.replace(/\/$/, "") + "/store"}
                      className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-600 hover:text-emerald-700 hover:underline transition-colors"
                      data-testid="link-store"
                    >
                      🛒 تصفحي متجرنا
                    </a>
                  </div>
                  <div className="text-center border-t border-border/60 pt-3">
                    <p className="text-xs text-muted-foreground mb-2">تسجيل طالبة جديدة</p>
                    <a
                      href={import.meta.env.BASE_URL.replace(/\/$/, "") + "/register"}
                      className="text-sm font-semibold text-primary hover:underline"
                      data-testid="link-register"
                    >
                      استمارة تسجيل الطالبات
                    </a>
                  </div>
                  {staffOpen && (
                    <div className="text-center border-t border-border/60 pt-3">
                      <p className="text-xs text-muted-foreground mb-2">تسجيل مدخلة أو مسؤولة مسار</p>
                      <a
                        href={import.meta.env.BASE_URL.replace(/\/$/, "") + "/staff-register"}
                        className="text-sm font-semibold text-blue-600 hover:underline"
                        data-testid="link-staff-register"
                      >
                        تسجيل الموظفات والمشرفات
                      </a>
                    </div>
                  )}
                </div>
              )}
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
