import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { FileDown, Users, UserCheck, ClipboardList, Loader2, History, Calendar, ClipboardCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useGetCurrentUser } from "@workspace/api-client-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const getToken = () => localStorage.getItem("sana_auth_token");

type ExportType = "students" | "staff" | "records" | "registrations" | "track-report" | "withdrawal-cards";

export default function ExportPage() {
  const { toast } = useToast();
  const { data: currentUser } = useGetCurrentUser({ query: { queryKey: ["getCurrentUser"] } });
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const download = async (type: ExportType) => {
    setLoading(l => ({ ...l, [type]: true }));
    try {
      let url = `${BASE}/api/export/${type}`;
      if (type === "records") {
        const params = new URLSearchParams();
        if (dateFrom) params.set("from", dateFrom);
        if (dateTo) params.set("to", dateTo);
        if (params.toString()) url += `?${params}`;
      }

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });

      if (!res.ok) {
        toast({ title: "حدث خطأ أثناء التصدير", variant: "destructive" });
        return;
      }

      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const nameMatch = disposition.match(/filename\*=UTF-8''(.+)/);
      const filename = nameMatch ? decodeURIComponent(nameMatch[1]) : `${type}.xlsx`;

      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);

      toast({ title: "تم تنزيل الملف بنجاح ✓" });
    } catch {
      toast({ title: "حدث خطأ أثناء التصدير", variant: "destructive" });
    } finally {
      setLoading(l => ({ ...l, [type]: false }));
    }
  };

  if (currentUser?.role === "track_supervisor") {
    return (
      <div className="space-y-6 max-w-2xl mx-auto" dir="rtl">
        <div>
          <h1 className="text-2xl font-bold text-foreground">تصدير بيانات المسار</h1>
          <p className="text-muted-foreground text-sm mt-1">
            تحميل بيانات مسار {currentUser.track ?? ""} فقط، مرتبة حسب اسم الحلقة
          </p>
        </div>

        <Card className="border-2 border-primary/30 shadow-sm bg-primary/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
                <ClipboardCheck className="w-4 h-4 text-primary" />
              </div>
              تقرير الحلقات والطالبات والنصاب
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              ملف Excel يحتوي على ملخص الحلقات، أسماء المعلمات والمشرفات، وبيانات الطالبات المسجلة في قائمة التسجيل.
            </p>
            <div className="space-y-2 text-sm">
              <div className="p-2.5 rounded-lg bg-teal-50/80 border border-teal-100 text-teal-800">
                <span className="font-semibold">ورقة ١ — ملخص الحلقات</span>
                <p className="text-teal-700/80 text-xs mt-0.5">اسم الحلقة · المعلمة · المشرفة · بيانات التواصل · عدد الطالبات</p>
              </div>
              <div className="p-2.5 rounded-lg bg-blue-50/80 border border-blue-100 text-blue-800">
                <span className="font-semibold">ورقة ٢ — الطالبات والنصاب</span>
                <p className="text-blue-700/80 text-xs mt-0.5">بيانات التسجيل الإضافية · بداية الحفظ · آخر نصاب · تاريخ إدخاله · اسم المدخلة</p>
              </div>
            </div>
            <Button
              onClick={() => download("track-report")}
              disabled={loading["track-report"]}
              className="w-full gap-2"
            >
              {loading["track-report"]
                ? <><Loader2 className="w-4 h-4 animate-spin" /> جاري التصدير...</>
                : <><FileDown className="w-4 h-4" /> تحميل تقرير المسار (.xlsx)</>
              }
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              يحدد النظام مسارك تلقائيًا ولا يمكن تحميل بيانات مسار آخر
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">تصدير البيانات</h1>
        <p className="text-muted-foreground text-sm mt-1">
          تحميل بيانات المقرأة بصيغة Excel جاهزة للمراجعة والأرشفة
        </p>
      </div>

      {/* Students Export */}
      <Card className="border border-border/50 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-bold flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-teal-100 flex items-center justify-center">
              <Users className="w-4 h-4 text-teal-600" />
            </div>
            سجل الطالبات الكامل
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            ملف Excel بثلاثة أوراق شاملة لجميع الطالبات (نشطات ومؤرشفات):
          </p>
          <div className="space-y-2 text-sm">
            <div className="flex items-start gap-2 p-2.5 rounded-lg bg-teal-50/60 border border-teal-100">
              <Users className="w-4 h-4 text-teal-500 mt-0.5 flex-shrink-0" />
              <div>
                <span className="font-semibold text-teal-800">ورقة ١ — الطالبات</span>
                <p className="text-teal-700/80 text-xs mt-0.5">الاسم · الجوال · الدولة · المسار · الحلقة · الحالة · تاريخ التسجيل · تاريخ الأرشفة</p>
              </div>
            </div>
            <div className="flex items-start gap-2 p-2.5 rounded-lg bg-blue-50/60 border border-blue-100">
              <History className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
              <div>
                <span className="font-semibold text-blue-800">ورقة ٢ — تاريخ التنقلات</span>
                <p className="text-blue-700/80 text-xs mt-0.5">كل تنقل من حلقة لأخرى مع التاريخ والمسؤولة</p>
              </div>
            </div>
            <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-50/60 border border-amber-100">
              <Calendar className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
              <div>
                <span className="font-semibold text-amber-800">ورقة ٣ — أحداث الأرشفة والاسترجاع</span>
                <p className="text-amber-700/80 text-xs mt-0.5">تاريخ كل أرشفة واسترجاع مع الحلقة وقت الحدث</p>
              </div>
            </div>
          </div>
          <Button
            onClick={() => download("students")}
            disabled={loading["students"]}
            className="w-full gap-2"
            variant="outline"
          >
            {loading["students"]
              ? <><Loader2 className="w-4 h-4 animate-spin" /> جاري التصدير...</>
              : <><FileDown className="w-4 h-4" /> تحميل سجل الطالبات (.xlsx)</>
            }
          </Button>
        </CardContent>
      </Card>

      <Card className="border border-amber-200 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-bold flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
              <ClipboardCheck className="w-4 h-4 text-amber-600" />
            </div>
            بطاقات انسحاب الطالبات
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">تصدير بطاقات الانسحاب مع الاسم والرقم والحلقة والفترة والسبب والملاحظات.</p>
          <Button onClick={() => download("withdrawal-cards")} disabled={loading["withdrawal-cards"]} className="w-full gap-2" variant="outline">
            {loading["withdrawal-cards"] ? <><Loader2 className="w-4 h-4 animate-spin" /> جاري التصدير...</> : <><FileDown className="w-4 h-4" /> تحميل بطاقات الانسحاب (.xlsx)</>}
          </Button>
        </CardContent>
      </Card>

      {/* Staff Export */}
      <Card className="border border-border/50 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-bold flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
              <UserCheck className="w-4 h-4 text-blue-600" />
            </div>
            سجل المتطوعات الكامل
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            ملف Excel بثلاثة أوراق لجميع المتطوعات بأدوارهن:
          </p>
          <div className="flex flex-wrap gap-1.5 mb-1">
            {["معلمات", "مشرفات", "مسؤولات مسارات", "نائبات", "مدخلات بيانات"].map(r => (
              <Badge key={r} variant="secondary" className="text-xs">{r}</Badge>
            ))}
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex items-start gap-2 p-2.5 rounded-lg bg-blue-50/60 border border-blue-100">
              <UserCheck className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
              <div>
                <span className="font-semibold text-blue-800">ورقة ١ — المتطوعات</span>
                <p className="text-blue-700/80 text-xs mt-0.5">الاسم · البريد · الدور · المسار · الحلقة · آخر دخول · تاريخ الانضمام</p>
              </div>
            </div>
            <div className="flex items-start gap-2 p-2.5 rounded-lg bg-red-50/60 border border-red-100">
              <History className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
              <div>
                <span className="font-semibold text-red-800">ورقة ٢ — غيابات المعلمات</span>
                <p className="text-red-700/80 text-xs mt-0.5">كل يوم غياب مع اسم الحلقة والمسار والمُبلِّغة</p>
              </div>
            </div>
            <div className="flex items-start gap-2 p-2.5 rounded-lg bg-emerald-50/60 border border-emerald-100">
              <Calendar className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
              <div>
                <span className="font-semibold text-emerald-800">ورقة ٣ — الحضور اليومي للمعلمات</span>
                <p className="text-emerald-700/80 text-xs mt-0.5">حضور/غياب/تأخر المعلمة + التحضير + التحفيز + التقرير + عدد الغائبات يوميًا</p>
              </div>
            </div>
          </div>
          <Button
            onClick={() => download("staff")}
            disabled={loading["staff"]}
            className="w-full gap-2"
            variant="outline"
          >
            {loading["staff"]
              ? <><Loader2 className="w-4 h-4 animate-spin" /> جاري التصدير...</>
              : <><FileDown className="w-4 h-4" /> تحميل سجل المتطوعات (.xlsx)</>
            }
          </Button>
        </CardContent>
      </Card>

      {/* Records Export */}
      <Card className="border border-border/50 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-bold flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
              <ClipboardList className="w-4 h-4 text-emerald-600" />
            </div>
            سجلات الحفظ والمتابعة اليومية
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            مدخلات المعلمات اليومية: حفظ — مراجعة قريبة — مراجعة بعيدة — تلاوة — حضور وغياب — مع أرقام الصفحات والسور
          </p>
          <div className="flex gap-3">
            <div className="flex-1 space-y-1">
              <Label className="text-xs font-semibold">من تاريخ</Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
            <div className="flex-1 space-y-1">
              <Label className="text-xs font-semibold">إلى تاريخ</Label>
              <Input
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">اتركي الفترة فارغة لتصدير جميع السجلات</p>
          <Button
            onClick={() => download("records")}
            disabled={loading["records"]}
            className="w-full gap-2"
            variant="outline"
          >
            {loading["records"]
              ? <><Loader2 className="w-4 h-4 animate-spin" /> جاري التصدير...</>
              : <><FileDown className="w-4 h-4" /> تحميل سجلات الحفظ (.xlsx)</>
            }
          </Button>
        </CardContent>
      </Card>

      {/* Registration Export */}
      <Card className="border-2 border-primary/30 shadow-sm bg-primary/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-bold flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
              <ClipboardCheck className="w-4 h-4 text-primary" />
            </div>
            بيانات التسجيل — طالبات ومتطوعات
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            ملف Excel بورقتين: كل من سجّل عبر الموقع تظهر بياناتها فوراً هنا
          </p>
          <div className="space-y-2 text-sm">
            <div className="flex items-start gap-2 p-2.5 rounded-lg bg-teal-50/80 border border-teal-100">
              <Users className="w-4 h-4 text-teal-500 mt-0.5 flex-shrink-0" />
              <div>
                <span className="font-semibold text-teal-800">ورقة ١ — طلبات تسجيل الطالبات</span>
                <p className="text-teal-700/80 text-xs mt-0.5">الاسم · الجوال · الدولة · المسار · الحلقة · تاريخ التسجيل</p>
              </div>
            </div>
            <div className="flex items-start gap-2 p-2.5 rounded-lg bg-blue-50/80 border border-blue-100">
              <UserCheck className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
              <div>
                <span className="font-semibold text-blue-800">ورقة ٢ — طلبات تسجيل المتطوعات</span>
                <p className="text-blue-700/80 text-xs mt-0.5">الاسم · البريد · الدور · المسار · الجوال · تاريخ التسجيل</p>
              </div>
            </div>
          </div>
          <Button
            onClick={() => download("registrations")}
            disabled={loading["registrations"]}
            className="w-full gap-2"
          >
            {loading["registrations"]
              ? <><Loader2 className="w-4 h-4 animate-spin" /> جاري التصدير...</>
              : <><FileDown className="w-4 h-4" /> تحميل بيانات التسجيل (.xlsx)</>
            }
          </Button>
        </CardContent>
      </Card>

      <p className="text-center text-xs text-muted-foreground pb-4">
        جميع الملفات تُصدَّر بصيغة Excel مباشرةً من قاعدة البيانات — البيانات محدّثة فوريًا
      </p>
    </div>
  );
}
