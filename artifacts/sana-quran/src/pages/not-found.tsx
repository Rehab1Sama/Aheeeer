import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Home } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4" dir="rtl">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-primary mb-4">404</h1>
        <p className="text-xl font-semibold text-foreground mb-2">الصفحة غير موجودة</p>
        <p className="text-muted-foreground mb-6">لم نتمكن من العثور على الصفحة التي تبحث عنها</p>
        <Link href="/">
          <Button className="gap-2">
            <Home className="w-4 h-4" />
            العودة للرئيسية
          </Button>
        </Link>
      </div>
    </div>
  );
}
