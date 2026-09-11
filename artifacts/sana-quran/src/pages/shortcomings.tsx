import { useState } from "react";
import {
  useListShortcomings,
  useUpdateShortcomingOverride,
  useGetCurrentUser,
  useListCircles,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertTriangle, CheckCircle, XCircle, RotateCcw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

function reasonLabel(r: string): string {
  if (r === "review") return "لم تراجع";
  if (r === "listen") return "لم تسمع القارئ";
  return r;
}

function formatDate(d: string) {
  const date = new Date(d);
  return date.toLocaleDateString("ar-SA", { weekday: "short", year: "numeric", month: "short", day: "numeric" });
}

export default function ShortcomingsPage() {
  const { data: currentUser } = useGetCurrentUser({ query: { queryKey: ["getCurrentUser"] } });
  const role = currentUser?.role;
  const isStudent = role === "student";

  const [filterCircleId, setFilterCircleId] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const params: Record<string, string | number> = {};
  if (filterCircleId !== "all") params.circleId = parseInt(filterCircleId);
  if (dateFrom) params.dateFrom = dateFrom;
  if (dateTo) params.dateTo = dateTo;

  const { data: items = [], isLoading } = useListShortcomings(
    Object.keys(params).length > 0 ? params : {},
    { query: { queryKey: ["listShortcomings", params] } }
  );
  const studentVisibleItems = isStudent ? (items as any[]).filter(item => {
    // Defense in depth: the API also applies this filter for student accounts.
    const archiveFrom = "2026-06-28";
    const archiveTo = "2026-08-22";
    return !(item.date >= archiveFrom && item.date <= archiveTo);
  }) : items;

  const { data: circles = [] } = useListCircles(undefined, {
    query: { queryKey: ["listCircles"] },
  });

  const updateMut = useUpdateShortcomingOverride({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["listShortcomings"] });
      },
    },
  });

  function handleOverride(recordId: number, value: boolean | null) {
    updateMut.mutate(
      { id: recordId, data: { shortcomingOverride: value } },
      {
        onSuccess: () => {
          toast({
            title: value === false ? "تم العذر ✅" : value === true ? "تم تثبيت التقصير" : "تم إعادة الحساب التلقائي",
          });
        },
        onError: (e: any) => {
          const msg = e?.response?.data?.error ?? "خطأ في التعديل";
          toast({ title: msg, variant: "destructive" });
        },
      }
    );
  }

  const canEditShortcomings = role === "leader" || role === "track_supervisor";

  // Filter circles by track for track_supervisor
  const visibleCircles = circles;

  return (
    <div className="space-y-5 pb-10">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="bg-red-100 rounded-xl p-2.5">
          <AlertTriangle className="w-5 h-5 text-red-600" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-foreground">{isStudent ? "تقصيري" : "التقصير"}</h1>
          <p className="text-xs text-muted-foreground">الجلسات التي لم تُراجَع فيها أو لم يُسمع فيها القارئ</p>
        </div>
      </div>

      {/* Filters */}
      <Card className="border-0 shadow-sm">
        <CardContent className="pt-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">من تاريخ</label>
              <input
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                className="w-full text-sm border border-border rounded-md px-3 py-1.5 bg-background text-right"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">إلى تاريخ</label>
              <input
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                className="w-full text-sm border border-border rounded-md px-3 py-1.5 bg-background text-right"
              />
            </div>
          </div>

          {!isStudent && visibleCircles.length > 0 && (
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">الحلقة</label>
              <Select value={filterCircleId} onValueChange={setFilterCircleId}>
                <SelectTrigger className="text-sm h-9">
                  <SelectValue placeholder="كل الحلقات" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الحلقات</SelectItem>
                  {visibleCircles.map((c: any) => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Summary */}
      {!isLoading && (
        <div className="flex items-center gap-2 px-1">
          <span className="text-sm font-semibold text-foreground">{studentVisibleItems.length}</span>
          <span className="text-sm text-muted-foreground">حالة تقصير</span>
          {studentVisibleItems.filter((i: any) => i.shortcomingOverride === false).length > 0 && (
            <Badge variant="outline" className="text-green-700 border-green-200 bg-green-50 text-xs mr-auto">
              {studentVisibleItems.filter((i: any) => i.shortcomingOverride === false).length} معذورة
            </Badge>
          )}
        </div>
      )}

      {/* List */}
      {isLoading ? (
        <div className="text-center text-muted-foreground py-10 text-sm">جاري التحميل...</div>
      ) : studentVisibleItems.length === 0 ? (
        <Card className="border-0 shadow-sm">
          <CardContent className="py-12 text-center">
            <CheckCircle className="w-10 h-10 text-green-400 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">لا توجد حالات تقصير في الفترة المحددة 🎉</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {studentVisibleItems.map((item: any) => (
            <Card key={item.recordId} className={`border-0 shadow-sm ${item.shortcomingOverride === false ? "opacity-60" : ""}`}>
              <CardContent className="py-3 px-4">
                <div className="flex items-start justify-between gap-3">
                  {/* Left: student info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-semibold text-sm text-foreground truncate">{item.studentName}</span>
                      {item.shortcomingOverride === false && (
                        <Badge className="bg-green-100 text-green-700 border-0 text-xs">معذورة</Badge>
                      )}
                      {item.shortcomingOverride === true && (
                        <Badge className="bg-red-100 text-red-700 border-0 text-xs">تقصير مثبّت</Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mb-1.5">
                      {item.circleName} · {item.trackName} · {formatDate(item.date)}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {item.reasons.map((r: string) => (
                        <span key={r} className="inline-flex items-center gap-1 bg-red-50 text-red-700 text-xs px-2 py-0.5 rounded-full">
                          <XCircle className="w-3 h-3" />
                          {reasonLabel(r)}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Right: action buttons */}
                  {canEditShortcomings && item.canEdit && (
                    <div className="flex flex-col gap-1 shrink-0">
                      {item.shortcomingOverride !== false && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs h-7 border-green-300 text-green-700 hover:bg-green-50"
                          onClick={() => handleOverride(item.recordId, false)}
                          disabled={updateMut.isPending}
                        >
                          عذر ✅
                        </Button>
                      )}
                      {item.shortcomingOverride === false && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs h-7 border-gray-300 text-gray-600 hover:bg-gray-50"
                          onClick={() => handleOverride(item.recordId, null)}
                          disabled={updateMut.isPending}
                        >
                          <RotateCcw className="w-3 h-3 ml-1" />
                          استرجع
                        </Button>
                      )}
                    </div>
                  )}
                  {canEditShortcomings && !item.canEdit && (
                    <span className="text-xs text-muted-foreground shrink-0 mt-1">انتهت 48س</span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Note */}
      <p className="text-xs text-muted-foreground text-center px-4">
        * تحسب تقصيرًا: عدم المراجعة بكل أنواعها أو عدم السماع للقارئ
        {canEditShortcomings && " · يمكن التعديل خلال 48 ساعة من وقت الإدخال"}
      </p>
    </div>
  );
}
