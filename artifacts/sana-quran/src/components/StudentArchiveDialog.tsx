import { useEffect, useState } from "react";
import { Archive, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { getToken } from "@/lib/auth";

type StudentArchiveDialogProps = {
  studentId: number;
  studentName: string;
  circleId: number;
  circleName?: string;
  onClose: () => void;
  onSuccess: () => void | Promise<void>;
};

export function StudentArchiveDialog({
  studentId,
  studentName,
  circleId,
  circleName,
  onClose,
  onSuccess,
}: StudentArchiveDialogProps) {
  const { toast } = useToast();
  const [withdrawalPeriod, setWithdrawalPeriod] = useState("");
  const [withdrawalReason, setWithdrawalReason] = useState("");
  const [withdrawalNotes, setWithdrawalNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setWithdrawalPeriod("");
    setWithdrawalReason("");
    setWithdrawalNotes("");
  }, [studentId, circleId]);

  const submit = async () => {
    if (!withdrawalPeriod || !withdrawalReason.trim()) {
      toast({ title: "اختاري فترة الانسحاب واكتبي السبب", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(`/api/students/${studentId}/archive`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({
          circleId,
          withdrawalPeriod,
          withdrawalReason: withdrawalReason.trim(),
          withdrawalNotes: withdrawalNotes.trim() || null,
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "تعذر أرشفة الطالبة");
      }
      toast({ title: `تمت أرشفة ${studentName} من الحلقة` });
      await onSuccess();
    } catch (error: any) {
      toast({ title: error?.message || "تعذر إتمام الأرشفة", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" dir="rtl">
      <div className="w-full max-w-sm rounded-2xl bg-background shadow-xl">
        <div className="flex items-center justify-between border-b p-4">
          <h3 className="flex items-center gap-2 font-bold">
            <Archive className="h-4 w-4 text-rose-600" />
            بطاقة انسحاب الطالبة
          </h3>
          <button onClick={onClose} className="rounded p-1 hover:bg-muted" aria-label="إغلاق">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-3 p-4">
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-800">
            {studentName}
            {circleName && <span className="mr-1 text-xs font-normal">— {circleName}</span>}
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold">
              فترة الانسحاب <span className="text-destructive">*</span>
            </label>
            <select
              value={withdrawalPeriod}
              onChange={event => setWithdrawalPeriod(event.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">اختاري فترة الانسحاب</option>
              <option value="بداية الفصل">بداية الفصل</option>
              <option value="أسابيع التسميع">أسابيع التسميع</option>
              <option value="أسبوع المراجعات">أسبوع المراجعات</option>
              <option value="أسبوع الاختبارات">أسبوع الاختبارات</option>
              <option value="تم حذفها">تم حذفها</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold">
              سبب الانسحاب <span className="text-destructive">*</span>
            </label>
            <Input
              value={withdrawalReason}
              onChange={event => setWithdrawalReason(event.target.value)}
              placeholder="اكتبي سبب الانسحاب"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold">ملاحظات إضافية</label>
            <Input
              value={withdrawalNotes}
              onChange={event => setWithdrawalNotes(event.target.value)}
              placeholder="ملاحظات — إن وُجدت"
            />
          </div>
        </div>
        <div className="flex gap-2 border-t p-3">
          <Button
            size="sm"
            onClick={() => void submit()}
            disabled={saving}
            className="flex-1 bg-rose-600 hover:bg-rose-700"
          >
            {saving ? "جاري الحفظ..." : "تأكيد الأرشفة"}
          </Button>
          <Button size="sm" variant="outline" onClick={onClose} disabled={saving} className="flex-1">
            إلغاء
          </Button>
        </div>
      </div>
    </div>
  );
}