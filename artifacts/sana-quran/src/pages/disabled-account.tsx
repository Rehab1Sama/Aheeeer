import { ShieldAlert, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { clearAuth } from "@/lib/auth";

export default function DisabledAccountPage() {
  return (
    <main className="min-h-screen sana-main-background flex items-center justify-center p-6" dir="rtl">
      <div className="w-full max-w-md rounded-3xl bg-card border border-border shadow-xl p-8 text-center">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-100 text-rose-600">
          <ShieldAlert className="h-9 w-9" />
        </div>
        <h1 className="text-2xl font-bold text-foreground">تم تعطيل حسابك</h1>
        <p className="mt-3 text-sm leading-7 text-muted-foreground">
          لا يمكنك الوصول إلى بياناتك أو بيانات الحلقات حاليًا. يرجى التواصل مع إدارة المقرأة إذا كنتِ تعتقدين أن التعطيل تم بالخطأ.
        </p>
        <Button variant="outline" className="mt-6 gap-2" onClick={() => { clearAuth(); window.location.href = "/login"; }}>
          <LogOut className="h-4 w-4" /> تسجيل الخروج
        </Button>
      </div>
    </main>
  );
}