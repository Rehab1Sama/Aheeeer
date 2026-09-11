import { useState, useEffect } from "react";
import { getToken } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Loader2, PlaneTakeoff, CheckCircle2, XCircle,
  AlertTriangle, RefreshCw, Clock, Minus,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const PLAN_TRACK_TYPES = ["girls", "fixation", "simple_review"];

type TodayStatus = "full" | "partial" | "none" | null;

type OnLeaveStudent = {
  id: number;
  fullName: string;
  circleId: number | null;
  circleName: string | null;
  track: string | null;
  trackType: string | null;
  leaveStart: string;
  leaveEnd: string;
  hasPlan: boolean;
  leaveDaysCount: number;
  enteredDays: number;
  enteredToday: boolean;
  todayStatus: TodayStatus;
};

const TODAY_STATUS_CONFIG: Record<
  "full" | "partial" | "none",
  { label: string; Icon: any; badgeClass: string }
> = {
  full:    { label: "منتظمة",    Icon: CheckCircle2, badgeClass: "bg-emerald-100 text-emerald-700" },
  partial: { label: "متأخرة",    Icon: Clock,        badgeClass: "bg-amber-100 text-amber-700"   },
  none:    { label: "ما أنجزت", Icon: XCircle,      badgeClass: "bg-rose-100 text-rose-700"     },
};

export default function StudentLeavesPage() {
  const [students, setStudents] = useState<OnLeaveStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  function load() {
    setLoading(true);
    setError(false);
    const token = getToken();
    fetch(`${BASE}/api/students/on-leave`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(setStudents)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  function formatDate(d: string) {
    return new Date(d).toLocaleDateString("ar-SA", { day: "numeric", month: "short", year: "numeric" });
  }

  function getCommitmentPct(s: OnLeaveStudent) {
    if (!s.hasPlan || s.leaveDaysCount === 0) return null;
    return Math.round((s.enteredDays / s.leaveDaysCount) * 100);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-16 text-sm text-muted-foreground space-y-3" dir="rtl">
        <AlertTriangle className="w-8 h-8 text-rose-400 mx-auto" />
        <p>تعذّر تحميل البيانات</p>
        <button onClick={load} className="text-primary underline text-xs flex items-center gap-1 mx-auto">
          <RefreshCw className="w-3 h-3" /> إعادة المحاولة
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">طالبات الإجازة</h1>
          <p className="text-muted-foreground text-sm mt-1">
            الطالبات في إجازة حاليًا
          </p>
        </div>
        <button
          onClick={load}
          className="p-2 rounded-lg border hover:bg-muted/50 transition-colors"
          title="تحديث"
        >
          <RefreshCw className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      {students.length === 0 ? (
        <Card className="border-0 shadow-sm">
          <CardContent className="py-16 text-center space-y-3">
            <PlaneTakeoff className="w-10 h-10 mx-auto text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground font-medium">لا توجد طالبات في إجازة حاليًا</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {students.map(s => {
            const showPlan = PLAN_TRACK_TYPES.includes(s.trackType ?? "girls");
            const pct = showPlan ? getCommitmentPct(s) : null;
            const pctColor = pct === null ? "" : pct >= 80 ? "text-emerald-600" : pct >= 50 ? "text-amber-600" : "text-rose-600";
            const pctBg   = pct === null ? "" : pct >= 80 ? "bg-emerald-50 border-emerald-200" : pct >= 50 ? "bg-amber-50 border-amber-200" : "bg-rose-50 border-rose-200";

            return (
              <Card key={s.id} className="border-0 shadow-sm">
                <CardContent className="p-4 space-y-3">

                  {/* رأس البطاقة */}
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-bold text-base">{s.fullName}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {s.circleName ?? "—"}
                        {s.track ? ` · مسار ${s.track}` : ""}
                      </p>
                    </div>
                    <div className="shrink-0 flex flex-col items-end gap-1">
                      <Badge className="bg-blue-100 text-blue-700 border-0 text-xs">
                        {formatDate(s.leaveStart)} – {formatDate(s.leaveEnd)}
                      </Badge>
                      {/* حالة اليوم — تظهر فقط لمسارات البنات والتثبيت */}
                      {showPlan && s.hasPlan && (() => {
                        if (s.todayStatus && s.todayStatus in TODAY_STATUS_CONFIG) {
                          const cfg = TODAY_STATUS_CONFIG[s.todayStatus];
                          return (
                            <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full ${cfg.badgeClass}`}>
                              <cfg.Icon className="w-3 h-3 shrink-0" />
                              {cfg.label}
                            </span>
                          );
                        }
                        return (
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground px-2 py-0.5 rounded-full bg-muted/40">
                            <Minus className="w-3 h-3 shrink-0" />
                            لم تُدخل بعد
                          </span>
                        );
                      })()}
                    </div>
                  </div>

                  {/* قسم متابعة الخطة — فقط لمسارات البنات + التثبيت */}
                  {showPlan && (
                    s.hasPlan ? (
                      <div className={`rounded-xl border p-3 space-y-2 ${pctBg || "bg-muted/20 border-border/50"}`}>
                        <div className="flex items-center justify-between gap-2">
                          <p className={`text-sm font-bold ${pctColor || "text-foreground"}`}>
                            خطة المراجعة
                          </p>
                          <span className={`text-xs font-bold ${pctColor}`}>
                            {s.enteredDays} / {s.leaveDaysCount} يوم
                            {pct !== null && ` (${pct}%)`}
                          </span>
                        </div>

                        {s.leaveDaysCount > 0 && (
                          <div className="w-full bg-white/60 rounded-full h-2 overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                pct !== null && pct >= 80 ? "bg-emerald-500"
                                  : pct !== null && pct >= 50 ? "bg-amber-500"
                                  : "bg-rose-500"
                              }`}
                              style={{ width: `${pct ?? 0}%` }}
                            />
                          </div>
                        )}

                        <div className="flex items-center gap-1.5">
                          {s.enteredToday ? (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                              <span className="text-xs text-emerald-700 font-medium">أدخلت إنجازها اليوم</span>
                            </>
                          ) : (
                            <>
                              <XCircle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                              <span className="text-xs text-rose-700">لم تُدخل إنجازها اليوم</span>
                            </>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-xl border border-border/50 bg-muted/30 p-3">
                        <p className="text-xs text-muted-foreground">لا توجد خطة مراجعة مُعيَّنة</p>
                      </div>
                    )
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
