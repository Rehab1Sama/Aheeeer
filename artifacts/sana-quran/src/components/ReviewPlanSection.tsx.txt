import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { SURAHS, calculatePages, computeDayRanges, juzListToQuotaRanges, type DayQuotaRange, type DayRangeSegment } from "@/lib/quran";
import { BookOpen, Plus, Trash2, RefreshCw, Loader2, AlertCircle, ChevronRight, ChevronLeft, CalendarDays, CheckCircle2, X, Lock, Printer } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const getToken = () => localStorage.getItem("sana_auth_token");
const authHeader = () => {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  const t = getToken();
  if (t) h["Authorization"] = `Bearer ${t}`;
  return h;
};

export const PLAN_COLORS = [
  { color: "#FFD6E0", name: "وردي" },
  { color: "#E8D5F5", name: "بنفسجي" },
  { color: "#D4EDFF", name: "سماوي" },
  { color: "#D4F5E9", name: "نعناعي" },
  { color: "#FFE8D4", name: "خوخي" },
  { color: "#FFF5CC", name: "ليموني" },
  { color: "#DDF0DD", name: "أخضر" },
  { color: "#EDD4F5", name: "ليلكي" },
  { color: "#FFD8CC", name: "مرجاني" },
  { color: "#D4DCF5", name: "رمادي-أزرق" },
];

const SURAH_OPTIONS = SURAHS.map(s => ({ value: s.name, label: `${s.number}. ${s.name}`, number: s.number, ayahs: s.ayahs }));

export function getMeccaToday(): string {
  const meccaMs = Date.now() + 3 * 60 * 60 * 1000;
  const d = new Date(meccaMs);
  if (d.getUTCHours() < 5) d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export function getDayDates(startDate: string, totalDays: number, mode: "girls" | "fixation"): string[] {
  const dates: string[] = [];
  const cur = new Date(startDate + "T12:00:00Z");
  const firstDow = cur.getUTCDay();
  const firstValid = mode === "girls" ? firstDow !== 5 : firstDow <= 3;
  if (firstValid) dates.push(cur.toISOString().slice(0, 10));
  while (dates.length < totalDays) {
    cur.setDate(cur.getDate() + 1);
    const dow = cur.getUTCDay();
    const valid = mode === "girls" ? dow !== 5 : dow >= 0 && dow <= 3;
    if (valid) dates.push(cur.toISOString().slice(0, 10));
  }
  return dates;
}

export function getCurrentPlanDay(startDate: string, totalDays: number, mode: "girls" | "fixation"): number {
  const today = getMeccaToday();
  const dates = getDayDates(startDate, totalDays, mode);
  const idx = dates.findIndex(d => d === today);
  if (idx >= 0) return idx + 1;
  if (today < dates[0]) return 0;
  if (today > dates[dates.length - 1]) return totalDays + 1;
  return dates.filter(d => d <= today).length;
}

export function formatArDate(dateStr: string): string {
  const dow = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
  const d = new Date(dateStr + "T12:00:00Z");
  return `${dow[d.getUTCDay()]} ${d.toLocaleDateString("ar-SA", { day: "numeric", month: "short" })}`;
}

function distribute(total: number, parts: number): number[] {
  const perDay = total / parts;
  const arr: number[] = [];
  let accumulated = 0;
  for (let i = 0; i < parts; i++) {
    accumulated += perDay;
    const val = Math.round(accumulated * 2) / 2 - Math.round((accumulated - perDay) * 2) / 2;
    arr.push(Math.round(val * 2) / 2);
  }
  return arr;
}

export interface DayEntry {
  dayNumber: number;
  surahStart?: string;
  ayahStart?: number;
  surahEnd?: string;
  ayahEnd?: number;
  pages?: number;
}

export interface ReviewPlan {
  id: number;
  planType: string;
  quotaType?: string;
  quotaJuz?: number;
  quotaSurahStart?: string;
  quotaAyahStart?: number;
  quotaSurahEnd?: string;
  quotaAyahEnd?: number;
  extraRanges?: string | null;
  reviewSourceSnapshot?: string | null;
  planMode?: string;
  totalPages?: number;
  quantity?: string;
  startDate: string;
  themeColor: string;
  status: string;
  approvalStatus?: string | null;
  days: DayEntry[];
  studentName?: string;
  studentId?: number;
  circleId?: number;
  cycleInfo?: {
    cycleStartDate: string;
    cycleEndDate: string;
    currentDay: number;
    isCompleted: boolean;
    isLocked: boolean;
  };
  dayRecords?: Record<string, {
    reviewFarPages: number | null; reviewPages: number | null; isAbsent: boolean;
    reviewFarSurahEnd: string | null; reviewFarAyahEnd: number | null;
    reviewSurahEnd: string | null; reviewAyahEnd: number | null;
  }>;
}

interface SurahRange {
  surahStart: string;
  ayahStart: number;
  surahEnd: string;
  ayahEnd: number;
}

interface GirlsReviewSourceSnapshot {
  version: 1;
  dailyRecordCount: number;
  dailyRecordPages: number;
  approvedMemorizationCount: number;
  approvedMemorizationPages: number;
  manualApprovedPages: number;
  approvedJuzNumbers: number[];
  recordRanges: DayQuotaRange[];
}

function getGirlsSourceSnapshot(plan: ReviewPlan): GirlsReviewSourceSnapshot | null {
  if (!plan.reviewSourceSnapshot) return null;
  try {
    const parsed = JSON.parse(plan.reviewSourceSnapshot) as Partial<GirlsReviewSourceSnapshot>;
    if (parsed.version !== 1 || !Array.isArray(parsed.recordRanges) || !Array.isArray(parsed.approvedJuzNumbers)) {
      return null;
    }
    return {
      version: 1,
      dailyRecordCount: Number(parsed.dailyRecordCount) || 0,
      dailyRecordPages: Number(parsed.dailyRecordPages) || 0,
      approvedMemorizationCount: Number(parsed.approvedMemorizationCount) || 0,
      approvedMemorizationPages: Number(parsed.approvedMemorizationPages) || 0,
      manualApprovedPages: Number(parsed.manualApprovedPages) || 0,
      approvedJuzNumbers: parsed.approvedJuzNumbers.filter(juz => Number.isInteger(juz) && juz >= 1 && juz <= 30),
      recordRanges: parsed.recordRanges.filter(range =>
        typeof range?.surahStart === "string" &&
        typeof range?.surahEnd === "string" &&
        typeof range?.ayahStart === "number" &&
        typeof range?.ayahEnd === "number",
      ),
    };
  } catch {
    return null;
  }
}

export function getPlanRanges(plan: ReviewPlan): DayQuotaRange[] {
  const sourceSnapshot = getGirlsSourceSnapshot(plan);
  if (sourceSnapshot) {
    return [
      ...juzListToQuotaRanges(sourceSnapshot.approvedJuzNumbers),
      ...sourceSnapshot.recordRanges,
    ];
  }

  const ranges: DayQuotaRange[] = [];
  if (plan.quotaType === "juz") {
    if (plan.extraRanges) {
      try {
        const juzList = JSON.parse(plan.extraRanges) as number[];
        if (Array.isArray(juzList) && juzList.length > 0 && typeof juzList[0] === "number") {
          ranges.push(...juzListToQuotaRanges(juzList));
        }
      } catch {}
    }
    if (ranges.length === 0 && plan.quotaJuz && plan.quotaJuz > 0) {
      ranges.push(...juzListToQuotaRanges(
        Array.from({ length: Math.min(plan.quotaJuz, 30) }, (_, index) => index + 1),
      ));
    }
  } else if (plan.quotaType === "surah" && plan.quotaSurahStart && plan.quotaAyahStart && plan.quotaSurahEnd && plan.quotaAyahEnd) {
    ranges.push({
      surahStart: plan.quotaSurahStart,
      ayahStart: plan.quotaAyahStart,
      surahEnd: plan.quotaSurahEnd,
      ayahEnd: plan.quotaAyahEnd,
    });
    if (plan.extraRanges) {
      try {
        const extraParsed = JSON.parse(plan.extraRanges) as DayQuotaRange[];
        if (Array.isArray(extraParsed) && extraParsed.length > 0 && typeof extraParsed[0] === "object") {
          ranges.push(...extraParsed);
        }
      } catch {}
    }
  }
  return ranges;
}

function getSourceSummary(plan: ReviewPlan): string | null {
  const sourceSnapshot = getGirlsSourceSnapshot(plan);
  if (!sourceSnapshot) return null;
  const parts: string[] = [];
  if (sourceSnapshot.dailyRecordCount > 0) {
    parts.push(`${sourceSnapshot.dailyRecordCount} سجل حفظ للحلقة (${sourceSnapshot.dailyRecordPages} صفحة)`);
  }
  if (sourceSnapshot.approvedMemorizationCount > 0) {
    parts.push(`${sourceSnapshot.approvedMemorizationCount} محفوظات معتمدة (${sourceSnapshot.approvedMemorizationPages} صفحة)`);
  }
  return parts.length > 0 ? parts.join(" + ") : "لا توجد مصادر حفظ مسجلة";
}

interface Props {
  studentId: number;
  circleId: number;
  trackType: string;
  canCreate: boolean;
  canForceDelete?: boolean;
  /** true only on the student's own "خطتي" page (my-progress) */
  studentSelf?: boolean;
}

export default function ReviewPlanSection({ studentId, circleId, trackType, canCreate, canForceDelete, studentSelf }: Props) {
  const [plan, setPlan] = useState<ReviewPlan | null | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [cycleStartDate, setCycleStartDate] = useState<string | null>(null);
  const [studentCanEditPlan, setStudentCanEditPlan] = useState(false);

  // When the viewer is the student herself, gate create/cancel on the global toggle
  const effectiveCanCreate = studentSelf ? studentCanEditPlan : canCreate;
  const { toast } = useToast();

  const isGirls = trackType === "girls";
  const isFixation = trackType === "fixation";
  const planTitle = isFixation ? "خطة التثبيت" : "خطة المراجعة";
  const totalDays = isFixation ? 24 : 21;
  const planMode: "girls" | "fixation" = isFixation ? "fixation" : "girls";

  const fetchPlan = useCallback(async () => {
    setLoading(true);
    try {
      const [planRes, settingsRes] = await Promise.all([
        fetch(`${BASE}/api/students/${studentId}/review-plan?circleId=${circleId}`, { headers: authHeader() }),
        fetch(`${BASE}/api/review-plans/settings`, { headers: authHeader() }),
      ]);
      if (!planRes.ok) { setPlan(null); } else { setPlan(await planRes.json()); }
      if (settingsRes.ok) {
        const s = await settingsRes.json();
        setCycleStartDate((isFixation ? s.fixationCycleStartDate : s.cycleStartDate) ?? null);
        setStudentCanEditPlan(s.studentCanEditPlan === true);
      }
    } catch { setPlan(null); }
    finally { setLoading(false); }
  }, [studentId, circleId]);

  useEffect(() => { fetchPlan(); }, [fetchPlan]);

  const handleCancel = async () => {
    if (!plan || !confirm("هل تريدين إلغاء الخطة الحالية؟")) return;
    const res = await fetch(`${BASE}/api/students/${studentId}/review-plan/${plan.id}`, { method: "DELETE", headers: authHeader() });
    if (res.status === 202) {
      toast({ title: "تم إرسال طلب الإلغاء", description: "ستظهر إمكانية إنشاء خطة جديدة بعد موافقة القائدة" });
      fetchPlan();
      return;
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast({ title: "لا يمكن الإلغاء", description: err?.error ?? "الخطة مقفلة حتى انتهاء الـ٢١ يوم", variant: "destructive" });
      return;
    }
    fetchPlan();
    toast({ title: "تم إلغاء الخطة" });
  };

  if (!isGirls && !isFixation) return null;

  if (loading) {
    return (
      <Card className="border-0 shadow-sm">
        <CardContent className="py-8 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const isLocked = Boolean(plan?.cycleInfo?.isLocked);
  const canCancelPlan = Boolean(plan && (studentSelf || effectiveCanCreate));
  const needsCancellationApproval = Boolean(isLocked && studentSelf && !studentCanEditPlan);

  return (
    <>
      <Card className="border-0 shadow-sm overflow-hidden" style={plan ? { borderTop: `4px solid ${plan.themeColor}` } : {}}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-primary" />
              {planTitle}
            </CardTitle>
            <div className="flex gap-2 items-center">
              {/* Lock badge when plan is locked */}
              {isLocked && plan?.cycleInfo && (
                <div className="flex items-center gap-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded-lg">
                  <Lock className="w-3 h-3" />
                  <span>مقفلة حتى {formatArDate(plan.cycleInfo.cycleEndDate)}</span>
                </div>
              )}
              {/* Create / renew / edit button:
                  - Staff (canCreate, not studentSelf): only when plan is not locked
                  - Admin-level staff (canForceDelete: قائدة/نائبة/مسؤولة مسار): يقدرون يعدّلون النصاب حتى لو الخطة مقفلة
                  - Student on her own page (studentSelf): whenever the leader has granted permission (effectiveCanCreate = studentCanEditPlan), even if locked */}
              {plan?.approvalStatus === "pending" ? (
                <span className="text-xs text-amber-700 bg-amber-50 rounded-lg px-2 py-1">بانتظار موافقة القائدة</span>
              ) : effectiveCanCreate && (!isLocked || studentSelf || canForceDelete) && (
                <Button size="sm" variant={plan ? "outline" : "default"} className="text-xs gap-1" onClick={() => setWizardOpen(true)}>
                  {plan ? <><RefreshCw className="w-3.5 h-3.5" />تجديد</> : <><Plus className="w-3.5 h-3.5" />إنشاء خطة</>}
                </Button>
              )}
              {/* Force-delete (admin only) */}
              {plan && canForceDelete && (
                <Button variant="ghost" size="sm" className="text-xs text-red-600 hover:text-red-700 hover:bg-red-50 gap-1" onClick={handleCancel}>
                  <Trash2 className="w-3.5 h-3.5" />حذف
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {!plan ? (
            <div className="text-center py-6 text-muted-foreground">
              <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">لا توجد خطة نشطة</p>
              {effectiveCanCreate && <p className="text-xs mt-1 opacity-70">اضغطي "إنشاء خطة" للبدء</p>}
            </div>
          ) : (
            <PlanDisplay
              plan={plan}
              totalDays={totalDays}
              planMode={planMode}
              canCancel={canCancelPlan}
              onCancel={handleCancel}
              isLocked={isLocked}
              needsCancellationApproval={needsCancellationApproval}
            />
          )}
        </CardContent>
      </Card>

      <PlanWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onSaved={() => { setWizardOpen(false); fetchPlan(); }}
        studentId={studentId}
        circleId={circleId}
        isFixation={isFixation}
        totalDays={totalDays}
        planMode={planMode}
        planTitle={planTitle}
        cycleStartDate={cycleStartDate}
      />
    </>
  );
}

function buildQuotaLabel(plan: ReviewPlan): string {
  if (plan.quotaType === "juz" && plan.quotaJuz != null) return `${plan.quotaJuz} جزء`;
  if (plan.quotaType === "surah" && plan.quotaSurahStart) {
    const fmtRange = (s: string, as_: number | undefined, e: string | undefined, ae: number | undefined) =>
      `من ${s}${as_ ? ` آية ${as_}` : ""} إلى ${e ?? s}${ae ? ` آية ${ae}` : ""}`;
    const first = fmtRange(plan.quotaSurahStart, plan.quotaAyahStart, plan.quotaSurahEnd, plan.quotaAyahEnd);
    if (plan.extraRanges) {
      try {
        const extra = JSON.parse(plan.extraRanges) as SurahRange[];
        const extraLabels = extra.map(r => fmtRange(r.surahStart, r.ayahStart, r.surahEnd, r.ayahEnd));
        return [first, ...extraLabels].join(" + ");
      } catch { return first; }
    }
    return first;
  }
  return "";
}

function formatDayRange(day: DayEntry): string {
  if (!day.surahStart) return "—";
  let result = day.surahStart;
  if (day.ayahStart) result += ` آية ${day.ayahStart}`;
  if (day.surahEnd && day.surahEnd !== day.surahStart) {
    result += ` ← ${day.surahEnd}`;
    if (day.ayahEnd) result += ` آية ${day.ayahEnd}`;
  } else if (day.ayahEnd && day.ayahEnd !== day.ayahStart) {
    result += ` → آية ${day.ayahEnd}`;
  }
  return result;
}

function printPlan(plan: ReviewPlan, totalDays: number, planMode: "girls" | "fixation") {
  const dates = getDayDates(plan.startDate, totalDays, planMode);
  const currentDay = getCurrentPlanDay(plan.startDate, totalDays, planMode);
  const quotaLabel = buildQuotaLabel(plan);
  const sourceSummary = getSourceSummary(plan);
  const endDate = dates[dates.length - 1] ?? plan.startDate;

  // Snapshot ranges take precedence, so printing remains faithful to the cycle
  // even after more memorization is entered for the following renewal.
  const _quotaRangesPrint = getPlanRanges(plan);
  const computedRanges = _quotaRangesPrint.length > 0 ? computeDayRanges(_quotaRangesPrint, plan.days) : null;

  const rows = plan.days.map((day, i) => {
    const dateStr = dates[day.dayNumber - 1] ?? "";
    const isToday = day.dayNumber === currentDay;
    const isPast = day.dayNumber < currentDay;
    let rangeStr: string;
    if (day.surahStart) {
      rangeStr = formatDayRange(day);
    } else {
      const segs = computedRanges?.[i];
      rangeStr = (segs && segs.length > 0)
        ? segs.map((r: DayRangeSegment) => `${r.surahStart} آية ${r.ayahStart} ← ${r.surahEnd} آية ${r.ayahEnd}`).join(' + ')
        : "—";
    }
    const style = isToday ? 'background:#f3e8ff;font-weight:bold;' : isPast ? 'opacity:0.5;' : '';
    return `<tr style="${style}"><td>${day.dayNumber}</td><td>${dateStr ? formatArDate(dateStr) : "—"}</td><td>${rangeStr}</td><td style="text-align:center">${day.pages ?? "—"}</td></tr>`;
  }).join("");

  const html = `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>خطة المراجعة</title><style>body{font-family:'Segoe UI',Tahoma,sans-serif;direction:rtl;padding:20px;font-size:12px;color:#333}h2{font-size:18px;margin-bottom:4px;color:#4c1d95}.meta{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin:10px 0 14px}.meta-item{background:#f8f5ff;padding:8px 10px;border-radius:6px;border:1px solid #e9d5ff}.meta-label{font-size:10px;color:#7c3aed;margin-bottom:2px}.meta-value{font-weight:bold;font-size:12px}table{width:100%;border-collapse:collapse;font-size:11px}th{background:#f5f3ff;padding:7px 8px;text-align:right;font-weight:bold;border:1px solid #e9d5ff;color:#4c1d95}td{padding:5px 8px;border:1px solid #e9e7ef;text-align:right}@media print{button{display:none}}</style></head><body><h2>خطة المراجعة</h2><p style="color:#666;margin-top:0;font-size:11px">الطالبة: ${plan.studentName ?? ""}</p><div class="meta"><div class="meta-item"><div class="meta-label">بداية الخطة</div><div class="meta-value">${formatArDate(plan.startDate)}</div></div><div class="meta-item"><div class="meta-label">نهاية الخطة</div><div class="meta-value">${formatArDate(endDate)}</div></div>${quotaLabel ? `<div class="meta-item"><div class="meta-label">النصاب</div><div class="meta-value">${quotaLabel}</div></div>` : ""}${plan.totalPages ? `<div class="meta-item"><div class="meta-label">الكمية</div><div class="meta-value">${plan.totalPages} صفحة</div></div>` : ""}${sourceSummary ? `<div class="meta-item"><div class="meta-label">مصادر الخطة</div><div class="meta-value">${sourceSummary}</div></div>` : ""}</div><table><thead><tr><th>اليوم</th><th>التاريخ</th><th>النطاق</th><th>صفحات</th></tr></thead><tbody>${rows}</tbody></table><button onclick="window.print()" style="margin-top:14px;padding:8px 16px;background:#7c3aed;color:white;border:none;border-radius:6px;cursor:pointer;font-size:12px">طباعة</button></body></html>`;

  const w = window.open('', '_blank', 'width=800,height=700');
  if (w) { w.document.write(html); w.document.close(); setTimeout(() => w.print(), 400); }
}

type DayStatus = "absent" | "ahead" | "ontrack" | "behind" | null;
type DayRecordShape = {
  reviewFarPages: number | null; reviewPages: number | null; isAbsent: boolean;
  reviewFarSurahEnd: string | null; reviewFarAyahEnd: number | null;
  reviewSurahEnd: string | null; reviewAyahEnd: number | null;
};

// Resolves the "pages actually done" value for a review record, using the field
// convention that matches the plan's track: fixation/تثبيت stores its quota in
// reviewPages (with a legacy fallback to reviewFarPages), girls_review uses reviewFarPages.
function getRecordDoneValue(
  planMode: "girls" | "fixation",
  rec: { reviewFarPages: number | null; reviewPages: number | null } | undefined,
): number | null {
  if (!rec) return null;
  const v = planMode === "fixation" ? (rec.reviewPages ?? rec.reviewFarPages) : rec.reviewFarPages;
  return v ?? null;
}

// Converts a (surah name, ayah number) position into one global ayah ordinal
// (1 = الفاتحة:1, increasing sequentially through the whole Quran) so two
// Quran positions ("النطاق") can be compared directly.
const SURAH_ORDINAL_OFFSET = new Map<string, number>();
{
  let offset = 0;
  for (const surah of [...SURAHS].sort((a, b) => a.number - b.number)) {
    SURAH_ORDINAL_OFFSET.set(surah.name, offset);
    offset += surah.ayahs;
  }
}
function ayahOrdinal(surahName: string | null | undefined, ayahNumber: number | null | undefined): number | null {
  if (!surahName || !Number.isInteger(ayahNumber)) return null;
  const offset = SURAH_ORDINAL_OFFSET.get(surahName.trim());
  if (offset == null) return null;
  return offset + (ayahNumber as number);
}

// Resolves the "ayah position reached" (end of range) for a review record,
// same track convention/fallback as getRecordDoneValue but for the range fields.
function getRecordDoneEndOrdinal(planMode: "girls" | "fixation", rec: DayRecordShape | undefined): number | null {
  if (!rec) return null;
  const surahEnd = planMode === "fixation" ? (rec.reviewSurahEnd ?? rec.reviewFarSurahEnd) : rec.reviewFarSurahEnd;
  const ayahEnd = planMode === "fixation" ? (rec.reviewAyahEnd ?? rec.reviewFarAyahEnd) : rec.reviewFarAyahEnd;
  return ayahOrdinal(surahEnd, ayahEnd);
}

// Computes a per-day status (absent/ahead/ontrack/behind/null) for every day of
// the plan, based on the QURAN RANGE the student has actually reached (farthest
// ayah recorded so far) compared with the ayah each day's quota requires her to
// have reached by then. Because this is cumulative, once she's genuinely ahead,
// every day up to the point she's reached shows ahead/ontrack — including days
// that haven't arrived yet on the calendar — and only days that have already
// passed without her reaching them show behind.
function computeDayStatuses(
  plan: ReviewPlan, dates: string[], currentDayNum: number, planMode: "girls" | "fixation",
  computedRanges?: DayRangeSegment[][] | null,
): Map<number, DayStatus> {
  const map = new Map<number, DayStatus>();
  if (currentDayNum <= 0) return map;

  const recAt = (d: number) => {
    const ds = dates[d - 1];
    return ds && plan.dayRecords ? (plan.dayRecords[ds] as DayRecordShape | undefined) : undefined;
  };
  const targetAt = (d: number) => {
    const day = plan.days.find(pd => pd.dayNumber === d);
    const direct = ayahOrdinal(day?.surahEnd, day?.ayahEnd);
    if (direct != null) return direct;
    // Fallback for plans that don't store surahEnd/ayahEnd on the day itself
    // (e.g. auto-computed ranges) — use the same computed segments the table
    // already uses to *display* the range, taking the farthest point reached
    // by the end of that day.
    if (!computedRanges) return null;
    const dayIdx = plan.days.findIndex(pd => pd.dayNumber === d);
    const segs = dayIdx >= 0 ? computedRanges[dayIdx] : undefined;
    const lastSeg = segs && segs.length > 0 ? segs[segs.length - 1] : undefined;
    return lastSeg ? ayahOrdinal(lastSeg.surahEnd, lastSeg.ayahEnd) : null;
  };
  const isSaturday = (d: number) => {
    const ds = dates[d - 1];
    return ds ? new Date(ds + "T12:00:00Z").getUTCDay() === 6 : false;
  };

  // Farthest ayah position reached so far, from any non-absent record dated
  // up to today (progress only moves forward, so the max is her true position).
  let actualOrdinal: number | null = null;
  for (let d = 1; d <= currentDayNum; d++) {
    const rec = recAt(d);
    if (!rec || rec.isAbsent) continue;
    const ord = getRecordDoneEndOrdinal(planMode, rec);
    if (ord != null && (actualOrdinal == null || ord > actualOrdinal)) actualOrdinal = ord;
  }

  for (let d = 1; d <= plan.days.length; d++) {
    const rec = recAt(d);
    if (rec?.isAbsent) { map.set(d, "absent"); continue; }
    // Saturday: no data entry at the maqraah — never counts as a miss.
    if (!rec && isSaturday(d)) { map.set(d, null); continue; }
    const target = targetAt(d);
    if (target == null) { map.set(d, null); continue; }
    if (actualOrdinal != null && actualOrdinal > target) { map.set(d, "ahead"); continue; }
    if (actualOrdinal != null && actualOrdinal === target) { map.set(d, "ontrack"); continue; }
    // She hasn't reached this day's mark yet: only a genuine miss once the day
    // has actually arrived; today with nothing entered yet stays neutral, and
    // days still in the future aren't judged at all.
    if (d < currentDayNum) { map.set(d, "behind"); continue; }
    if (d === currentDayNum) { map.set(d, rec ? "behind" : null); continue; }
    map.set(d, null);
  }
  return map;
}

function PlanDisplay({ plan, totalDays, planMode, canCancel, onCancel, isLocked, needsCancellationApproval }: {
  plan: ReviewPlan; totalDays: number; planMode: "girls" | "fixation";
  canCancel?: boolean; onCancel?: () => void; isLocked?: boolean; needsCancellationApproval?: boolean;
}) {
  const today = getMeccaToday();
  const dates = getDayDates(plan.startDate, totalDays, planMode);
  const currentDay = getCurrentPlanDay(plan.startDate, totalDays, planMode);
  const todayEntry = plan.days.find(d => d.dayNumber === currentDay);
  const endDate = dates[dates.length - 1] ?? plan.startDate;
  const isCompleted = today > endDate;
  const notStarted = today < plan.startDate;

  const quotaLabel = buildQuotaLabel(plan);
  const sourceSummary = getSourceSummary(plan);

  const totalLabel = plan.totalPages != null
    ? `${plan.totalPages} صفحة`
    : plan.quantity === "half" ? "نصف وجه/يوم" : plan.quantity === "full" ? "وجه/يوم" : "";

  // The immutable snapshot keeps this cycle fixed while later memorization is
  // reserved for the next renewal.
  const planRanges = getPlanRanges(plan);
  const computedRanges = planRanges.length > 0 ? computeDayRanges(planRanges, plan.days) : null;
  const dayStatuses = computeDayStatuses(plan, dates, currentDay, planMode, computedRanges);

  const [expanded, setExpanded] = useState(false);
  const shownDays = expanded ? plan.days : plan.days.slice(0, 7);

  return (
    <div className="space-y-3">
      {/* ─── Metadata grid ──────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-2">
        {/* Start date */}
        <div className="bg-muted/40 rounded-xl p-2.5">
          <p className="text-[10px] text-muted-foreground mb-0.5">بداية الخطة</p>
          <p className="font-semibold text-xs">{formatArDate(plan.startDate)}</p>
        </div>

        {/* End date — cancel button for students lives here */}
        <div className="bg-muted/40 rounded-xl p-2.5 relative">
          <p className="text-[10px] text-muted-foreground mb-0.5">نهاية الخطة</p>
          <div className="flex items-center justify-between gap-1">
            <p className="font-semibold text-xs">{formatArDate(endDate)}</p>
            {canCancel && onCancel && (
              <button
                onClick={onCancel}
                className="flex items-center gap-0.5 text-[10px] text-rose-500 hover:text-rose-700 transition-colors shrink-0"
                title="إلغاء الخطة"
              >
                <Trash2 className="w-3 h-3" />
                    {needsCancellationApproval ? "طلب إلغاء" : isLocked ? "إلغاء (مقفلة)" : "إلغاء"}
              </button>
            )}
          </div>
        </div>

        {quotaLabel && (
          <div className="bg-muted/40 rounded-xl p-2.5">
            <p className="text-[10px] text-muted-foreground mb-0.5">النصاب</p>
            <p className="font-semibold text-xs">{quotaLabel}</p>
          </div>
        )}
        {totalLabel && (
          <div className="bg-muted/40 rounded-xl p-2.5">
            <p className="text-[10px] text-muted-foreground mb-0.5">الكمية</p>
            <p className="font-semibold text-xs">{totalLabel}</p>
          </div>
        )}
        {sourceSummary && (
          <div className="bg-violet-50/70 border border-violet-100 rounded-xl p-2.5 col-span-2">
            <p className="text-[10px] text-violet-700 mb-0.5">مصادر الخطة عند إنشائها</p>
            <p className="font-semibold text-xs text-violet-950">{sourceSummary}</p>
            <p className="text-[10px] text-violet-700/80 mt-1">الحفظ الجديد يدخل تلقائيًا في الدورة التالية.</p>
          </div>
        )}
      </div>

      {isCompleted ? (
        <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 rounded-xl p-3">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span className="text-sm font-semibold">انتهت الخطة بنجاح!</span>
        </div>
      ) : notStarted ? (
        <div className="flex items-center gap-2 text-amber-700 bg-amber-50 rounded-xl p-3">
          <CalendarDays className="w-4 h-4 shrink-0" />
          <span className="text-sm">تبدأ الخطة {formatArDate(plan.startDate)}</span>
        </div>
      ) : (
        <div className="rounded-xl p-3" style={{ background: plan.themeColor + "99" }}>
          <p className="text-[10px] text-muted-foreground mb-1">اليوم الحالي</p>
          <p className="font-bold text-2xl">{currentDay} <span className="text-base font-normal text-muted-foreground">/ {totalDays}</span></p>
          {todayEntry && (
            <div className="mt-1.5 text-xs space-y-0.5">
              {todayEntry.surahStart && (
                <p className="text-muted-foreground">
                  {todayEntry.surahStart}{todayEntry.ayahStart ? ` (آية ${todayEntry.ayahStart}` : ""}
                  {todayEntry.surahEnd && todayEntry.surahEnd !== todayEntry.surahStart ? ` ← ${todayEntry.surahEnd}` : ""}
                  {todayEntry.ayahEnd ? ` ${todayEntry.ayahEnd})` : ""}
                </p>
              )}
              {todayEntry.pages != null && <p className="font-semibold">{todayEntry.pages} صفحة</p>}
            </div>
          )}
        </div>
      )}

      {plan.days.length > 0 && (
        <div>
          <div className="flex justify-end mb-1.5">
            <button
              onClick={() => printPlan(plan, totalDays, planMode)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
            >
              <Printer className="w-3.5 h-3.5" />
              طباعة / PDF
            </button>
          </div>
          <div className="overflow-x-auto rounded-xl border border-border/40">
            <table className="w-full text-xs min-w-[280px]">
              <thead className="bg-muted/50">
                <tr>
                  <th className="py-2 px-2 text-right font-semibold text-muted-foreground w-8">يوم</th>
                  <th className="py-2 px-2 text-right font-semibold text-muted-foreground">التاريخ</th>
                  <th className="py-2 px-2 text-right font-semibold text-muted-foreground">النطاق</th>
                  <th className="py-2 px-2 text-center font-semibold text-muted-foreground w-14">صفحات</th>
                </tr>
              </thead>
              <tbody>
                {shownDays.map((day) => {
                  const dayIdx = plan.days.indexOf(day);
                  const dateStr = dates[day.dayNumber - 1];
                  const isToday = day.dayNumber === currentDay;
                  const isPast = day.dayNumber < currentDay;
                  const cr = computedRanges?.[dayIdx];

                  // Per-day colour, with catch-up forgiveness — works for both
                  // girls (مراجعة) and fixation (تثبيت) plans. Once the student meets
                  // her quota on a later day, earlier behind/absent days are forgiven.
                  const rec = plan.dayRecords && dateStr ? plan.dayRecords[dateStr] : undefined;
                  const doneToday = getRecordDoneValue(planMode, rec);
                  const status: DayStatus = dayStatuses.get(day.dayNumber) ?? null;

                  const statusBg: Record<NonNullable<DayStatus>, string> = {
                    absent: "#f3f4f6",
                    ahead:  "#dbeafe",
                    ontrack:"#dcfce7",
                    behind: "#fef9c3",
                  };
                  const rowStyle: React.CSSProperties = status
                    ? { background: statusBg[status] }
                    : isToday
                      ? { background: plan.themeColor + "70" }
                      : {};

                  return (
                    <tr key={day.dayNumber} className={`border-t border-border/20 ${isToday ? "font-semibold" : ""}`}
                      style={rowStyle}>
                      <td className="py-1.5 px-2 text-center text-muted-foreground font-mono">{day.dayNumber}</td>
                      <td className="py-1.5 px-2 text-muted-foreground text-[11px]">{dateStr ? formatArDate(dateStr) : "—"}</td>
                      <td className="py-1.5 px-2 text-[11px]">
                        {day.surahStart
                          ? formatDayRange(day)
                          : (cr && cr.length > 0)
                            ? cr.map((seg: DayRangeSegment) => `${seg.surahStart} آية ${seg.ayahStart} ← ${seg.surahEnd} آية ${seg.ayahEnd}`).join(' + ')
                            : "—"}
                      </td>
                      <td className="py-1.5 px-2 text-center">
                        {day.pages ?? "—"}
                        {rec && !rec.isAbsent && doneToday != null && (
                          <span className="block text-[10px] text-muted-foreground leading-tight">
                            {doneToday}✓
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {plan.days.length > 7 && (
            <button onClick={() => setExpanded(!expanded)} className="mt-1.5 text-xs text-primary underline w-full text-center">
              {expanded ? "إخفاء الأيام" : `عرض جميع الأيام (${plan.days.length})`}
            </button>
          )}
          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-[10px] text-muted-foreground">
            {([
              { color: "#dcfce7", label: "منتظمة" },
              { color: "#dbeafe", label: "متقدمة" },
              { color: "#fef9c3", label: "متأخرة" },
              { color: "#f3f4f6", label: "غائبة" },
            ] as { color: string; label: string }[]).map(({ color, label }) => (
              <span key={label} className="flex items-center gap-1">
                <span className="inline-block w-3 h-3 rounded-sm border border-border/30" style={{ background: color }} />
                {label}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Mini colour picker ────────────────────────────────────────────────────────
function ColorPicker({ themeColor, setThemeColor }: { themeColor: string; setThemeColor: (v: string) => void }) {
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">لون الخطة</p>
      <div className="flex gap-2 flex-wrap">
        {PLAN_COLORS.map(c => (
          <button
            key={c.color}
            onClick={() => setThemeColor(c.color)}
            title={c.name}
            className={`w-7 h-7 rounded-full border-2 transition-all ${themeColor === c.color ? "border-gray-800 scale-110 shadow" : "border-transparent"}`}
            style={{ background: c.color }}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Ayah Select Dropdown ─────────────────────────────────────────────────────
function AyahSelect({ surahName, value, onChange, placeholder }: {
  surahName?: string; value?: number; onChange: (v: number | undefined) => void; placeholder: string;
}) {
  const surah = SURAHS.find(s => s.name === surahName);
  const count = surah?.ayahs ?? 0;
  return (
    <select
      className="border rounded p-1 text-xs bg-background w-full"
      value={value ?? ""}
      onChange={e => onChange(parseInt(e.target.value) || undefined)}
      disabled={!surahName || count === 0}
    >
      <option value="">{placeholder}</option>
      {Array.from({ length: count }, (_, i) => i + 1).map(n => (
        <option key={n} value={n}>{n}</option>
      ))}
    </select>
  );
}

// ─── Juz Grid (30 checkboxes) ─────────────────────────────────────────────────
function JuzGrid({ selectedJuz, onChange }: {
  selectedJuz: Set<number>;
  onChange: (updated: Set<number>) => void;
}) {
  const toggle = (juz: number) => {
    const next = new Set(selectedJuz);
    if (next.has(juz)) next.delete(juz);
    else next.add(juz);
    onChange(next);
  };

  const selectAll = () => onChange(new Set(Array.from({ length: 30 }, (_, i) => i + 1)));
  const clearAll = () => onChange(new Set());

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {selectedJuz.size > 0
            ? <><span className="font-bold text-foreground">{selectedJuz.size}</span> جزء محدد = <span className="font-bold text-primary">{selectedJuz.size * 20}</span> صفحة</>
            : "اختاري الأجزاء المراد مراجعتها"}
        </p>
        <div className="flex gap-1.5">
          <button onClick={selectAll} className="text-[10px] text-primary underline">الكل</button>
          <span className="text-muted-foreground text-[10px]">|</span>
          <button onClick={clearAll} className="text-[10px] text-muted-foreground underline">مسح</button>
        </div>
      </div>
      <div className="grid grid-cols-6 gap-1.5">
        {Array.from({ length: 30 }, (_, i) => i + 1).map(juz => (
          <button
            key={juz}
            onClick={() => toggle(juz)}
            className={`aspect-square rounded-lg text-sm font-bold transition-all border-2 ${
              selectedJuz.has(juz)
                ? "bg-primary text-white border-primary shadow-sm"
                : "bg-background text-foreground border-border hover:border-primary/40 hover:bg-primary/5"
            }`}
          >
            {juz}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Multi Surah Ranges ────────────────────────────────────────────────────────
const DEFAULT_RANGE: SurahRange = { surahStart: SURAHS[0].name, ayahStart: 1, surahEnd: SURAHS[0].name, ayahEnd: 7 };

function SurahRangesEditor({ ranges, onChange }: {
  ranges: SurahRange[];
  onChange: (r: SurahRange[]) => void;
}) {
  // دمج أكثر من حقل في تحديث واحد لتجنب مشكلة الـ stale closure
  const updateRange = (idx: number, patch: Partial<SurahRange>) => {
    onChange(ranges.map((r, i) => i === idx ? { ...r, ...patch } : r));
  };

  const addRange = () => onChange([...ranges, { ...DEFAULT_RANGE }]);
  const removeRange = (idx: number) => onChange(ranges.filter((_, i) => i !== idx));

  const totalPages = ranges.reduce((sum, r) => {
    const p = calculatePages(r.surahStart, r.ayahStart, r.surahEnd, r.ayahEnd);
    return sum + (p > 0 ? p : 0);
  }, 0);

  return (
    <div className="space-y-3">
      {ranges.map((range, idx) => {
        const endSurahObj = SURAHS.find(s => s.name === range.surahEnd);
        const rangePages = calculatePages(range.surahStart, range.ayahStart, range.surahEnd, range.ayahEnd);

        return (
          <div key={idx} className="bg-muted/30 rounded-xl p-3 space-y-2 relative">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-semibold text-muted-foreground">
                النطاق {ranges.length > 1 ? idx + 1 : ""}
                {rangePages > 0 && <span className="text-primary font-bold mr-1">({rangePages} صفحة)</span>}
              </p>
              {ranges.length > 1 && (
                <button onClick={() => removeRange(idx)} className="text-rose-400 hover:text-rose-600 p-0.5">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[10px] text-muted-foreground">من سورة</Label>
                <select
                  className="w-full border rounded-lg p-1.5 text-xs mt-0.5 bg-background"
                  value={range.surahStart}
                  onChange={e => updateRange(idx, { surahStart: e.target.value, ayahStart: 1 })}
                >
                  {SURAH_OPTIONS.map(s => <option key={s.number} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground">من آية</Label>
                <AyahSelect
                  surahName={range.surahStart}
                  value={range.ayahStart}
                  onChange={v => updateRange(idx, { ayahStart: v ?? 1 })}
                  placeholder="آية البداية"
                />
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground">إلى سورة</Label>
                <select
                  className="w-full border rounded-lg p-1.5 text-xs mt-0.5 bg-background"
                  value={range.surahEnd}
                  onChange={e => {
                    const s = SURAHS.find(s => s.name === e.target.value);
                    updateRange(idx, { surahEnd: e.target.value, ayahEnd: s?.ayahs ?? 1 });
                  }}
                >
                  {SURAH_OPTIONS.map(s => <option key={s.number} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground">إلى آية</Label>
                <AyahSelect
                  surahName={range.surahEnd}
                  value={range.ayahEnd}
                  onChange={v => updateRange(idx, { ayahEnd: v ?? (endSurahObj?.ayahs ?? 1) })}
                  placeholder="آية النهاية"
                />
              </div>
            </div>
          </div>
        );
      })}

      <button
        onClick={addRange}
        className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 font-medium w-full justify-center py-2 border-2 border-dashed border-primary/30 rounded-xl hover:border-primary/50 hover:bg-primary/5 transition-colors"
      >
        <Plus className="w-3.5 h-3.5" />
        إضافة نطاق آخر
      </button>

      {totalPages > 0 && (
        <p className="text-sm text-center text-muted-foreground">
          إجمالي النصاب: <span className="font-bold text-foreground">{totalPages} صفحة</span>
        </p>
      )}
    </div>
  );
}

// ─── Wizard ────────────────────────────────────────────────────────────────────
function PlanWizard({ open, onClose, onSaved, studentId, circleId, isFixation, totalDays, planMode, planTitle, cycleStartDate }: {
  open: boolean; onClose: () => void; onSaved: () => void;
  studentId: number; circleId: number; isFixation: boolean;
  totalDays: number; planMode: "girls" | "fixation"; planTitle: string;
  cycleStartDate?: string | null;
}) {
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const today = getMeccaToday();

  // Girls: 4 steps (quota → mode → days → date+color)
  // Fixation: 3 steps (quantity → date+color → weeks)
  const maxSteps = isFixation ? 3 : 4;

  const [quotaType, setQuotaType] = useState<"juz" | "surah">("juz");
  // Juz: set of selected Juz numbers (1-30)
  const [selectedJuz, setSelectedJuz] = useState<Set<number>>(new Set());
  // Surah: multiple ranges
  const [surahRanges, setSurahRanges] = useState<SurahRange[]>([{ ...DEFAULT_RANGE }]);

  const [wizardMode, setWizardMode] = useState<"auto" | "manual">("auto");
  const [daysInitMode, setDaysInitMode] = useState<"none" | "auto" | "manual">("none");
  const [quantity, setQuantity] = useState<"half" | "full" | "double">("full");
  const [fixationMode, setFixationMode] = useState<"auto" | "manual">("manual");
  const [fixationStart, setFixationStart] = useState({ surah: "الفاتحة", ayah: 1 });

  const getFixationDailyPages = useCallback((value: "half" | "full" | "double") => {
    if (value === "half") return 0.5;
    if (value === "double") return 2;
    return 1;
  }, []);

  const buildFixationDays = useCallback((value: "half" | "full" | "double", count = 24): DayEntry[] =>
    computeDayRanges(
      [{ surahStart: fixationStart.surah, ayahStart: fixationStart.ayah, surahEnd: "الناس", ayahEnd: 6 }],
      Array.from({ length: count }, (_, idx) => ({ pages: getFixationDailyPages(value) })),
    ).map((segments, idx) => ({
      dayNumber: idx + 1,
      pages: getFixationDailyPages(value),
      surahStart: segments[0]?.surahStart,
      ayahStart: segments[0]?.ayahStart,
      surahEnd: segments[segments.length - 1]?.surahEnd,
      ayahEnd: segments[segments.length - 1]?.ayahEnd,
    })), [fixationStart, getFixationDailyPages]);
  const [startDate, setStartDate] = useState(cycleStartDate ?? today);
  const [themeColor, setThemeColor] = useState(PLAN_COLORS[1].color);
  const [days, setDays] = useState<DayEntry[]>([]);
  const [totalPages, setTotalPages] = useState(0);

  // If cycleStartDate changes (after fetch), sync it into the wizard state
  useEffect(() => {
    if (cycleStartDate) setStartDate(cycleStartDate);
  }, [cycleStartDate]);

  const computedPages = quotaType === "juz"
    ? selectedJuz.size * 20
    : surahRanges.reduce((sum, r) => {
        const p = calculatePages(r.surahStart, r.ayahStart, r.surahEnd, r.ayahEnd);
        return sum + (p > 0 ? p : 0);
      }, 0);

  const fixationDailyPages = getFixationDailyPages(quantity);
  const fixationAvailablePages = isFixation
    ? calculatePages(fixationStart.surah, fixationStart.ayah, "الناس", 6)
    : 0;
  const fixationHasEnoughContent = !isFixation || fixationAvailablePages >= fixationDailyPages * totalDays;

  useEffect(() => {
    if (!open) {
      setStep(1);
      setDays([]);
      setDaysInitMode("none");
      setStartDate(cycleStartDate ?? today);
      setThemeColor(PLAN_COLORS[1].color);
      setQuotaType("juz");
      setSelectedJuz(new Set());
      setSurahRanges([{ ...DEFAULT_RANGE }]);
      setWizardMode("auto");
      setQuantity("full");
      setFixationMode("manual");
      setFixationStart({ surah: "الفاتحة", ayah: 1 });
      setTotalPages(0);
    }
  }, [open]);

  const generateAutoDays = useCallback(() => {
    const total = computedPages;
    setTotalPages(total);
    const dist = distribute(total, totalDays);
    setDays(dist.map((pages, i) => ({ dayNumber: i + 1, pages })));
  }, [computedPages, totalDays]);

  const initManualDays = useCallback(() => {
    setDays(Array.from({ length: totalDays }, (_, i) => ({ dayNumber: i + 1 })));
  }, [totalDays]);

  const goNext = () => {
    if (!isFixation && step === 2) {
      if (wizardMode === "auto") {
        generateAutoDays();
        setDaysInitMode("auto");
      } else if (days.length === 0 || daysInitMode !== "manual") {
        initManualDays();
        setDaysInitMode("manual");
      }
    }
    if (isFixation && step === 1) {
      if (fixationMode === "auto") {
        setDays(buildFixationDays(quantity, totalDays));
      } else {
        setDays(buildFixationDays(quantity, totalDays));
      }
    }
    setStep(s => s + 1);
  };

  const updateDay = (idx: number, field: keyof DayEntry, value: any) => {
    setDays(prev => prev.map((d, i) => i === idx ? { ...d, [field]: value } : d));
  };

  const canGoNext = (): boolean => {
    if (isFixation) {
      if (step === 1) return fixationHasEnoughContent;
      // Date step is always valid when cycleStartDate is locked, or when user picked a valid date
      if (step === 2) return cycleStartDate ? true : startDate >= today;
      return true;
    }
    if (step === 1) {
      if (quotaType === "juz") return selectedJuz.size > 0;
      return computedPages > 0;
    }
    if (step === 4) return cycleStartDate ? true : startDate >= today;
    return true;
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const body: any = {
        circleId, startDate, themeColor, days,
        planMode: isFixation ? fixationMode : wizardMode,
      };
      if (isFixation) {
        body.quantity = quantity;
        body.quotaType = "surah";
        body.quotaSurahStart = fixationStart.surah;
        body.quotaAyahStart = fixationStart.ayah;
        body.quotaSurahEnd = "الناس";
        body.quotaAyahEnd = 6;
        body.totalPages = getFixationDailyPages(quantity) * totalDays;
        if (fixationMode === "auto") {
          body.days = buildFixationDays(quantity, totalDays);
        }
      } else {
        body.quotaType = quotaType;
        if (quotaType === "juz") {
          body.quotaJuz = selectedJuz.size;
          // حفظ قائمة الأجزاء المختارة لاستخدامها في عرض النطاقات
          body.extraRanges = JSON.stringify(Array.from(selectedJuz).sort((a, b) => a - b));
        } else {
          const firstRange = surahRanges[0];
          if (firstRange) {
            body.quotaSurahStart = firstRange.surahStart;
            body.quotaAyahStart = firstRange.ayahStart;
            body.quotaSurahEnd = firstRange.surahEnd;
            body.quotaAyahEnd = firstRange.ayahEnd;
          }
          if (surahRanges.length > 1) {
            body.extraRanges = JSON.stringify(surahRanges.slice(1));
          }
        }
        body.totalPages = totalPages || computedPages || undefined;
      }
      const res = await fetch(`${BASE}/api/students/${studentId}/review-plan`, {
        method: "POST", headers: authHeader(), body: JSON.stringify(body),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(payload?.error ?? "تعذر حفظ الخطة، تحققي من البيانات والصلاحيات");
      }
      toast({ title: "✓ تم حفظ الخطة!" });
      onSaved();
    } catch (e: any) {
      toast({ title: "خطأ في حفظ الخطة", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  // ─── Step labels ──────────────────────────────────────────────────────────
  const stepLabels = isFixation
    ? ["الكمية", "تاريخ البداية", "جدول الأسابيع"]
    : ["النصاب", "نوع الخطة", "الأنصبة", "تاريخ البداية"];

  // ─── Step renderers ───────────────────────────────────────────────────────
  const renderStep = () => {
    if (isFixation) {
      switch (step) {
        case 1:
          return (
            <div className="space-y-4">
              <div className="space-y-2">
                <p className="text-sm font-medium">بداية التثبيت</p>
                <div className="grid grid-cols-2 gap-2">
                  <select
                    className="border rounded-lg p-2 text-sm bg-background"
                    value={fixationStart.surah}
                    onChange={event => setFixationStart({ surah: event.target.value, ayah: 1 })}
                  >
                    {SURAH_OPTIONS.map(surah => <option key={surah.number} value={surah.value}>{surah.label}</option>)}
                  </select>
                  <AyahSelect
                    surahName={fixationStart.surah}
                    value={fixationStart.ayah}
                    onChange={value => setFixationStart(previous => ({ ...previous, ayah: value ?? 1 }))}
                    placeholder="آية البداية"
                  />
                </div>
              </div>
              {!fixationHasEnoughContent && (
                <p className="text-xs text-destructive bg-destructive/10 rounded-lg p-2">
                  نقطة البداية لا تحتوي على صفحات كافية لإكمال ٢٤ يومًا بهذه الكمية. اختاري نقطة أسبق أو كمية أقل.
                </p>
              )}
              <p className="text-sm text-muted-foreground">اختاري الكمية اليومية لخطة التثبيت (٦ أسابيع × ٤ أيام)</p>
              <div className="grid grid-cols-2 gap-3">
                {(["half", "full", "double"] as const).map(q => (
                  <button key={q} onClick={() => setQuantity(q)}
                    className={`rounded-xl p-5 border-2 text-center transition-colors ${quantity === q ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}>
                    <p className="text-2xl font-bold mb-1">{q === "half" ? "½" : q === "full" ? "1" : "2"}</p>
                    <p className="font-bold text-sm">{q === "half" ? "نصف وجه" : q === "full" ? "وجه كامل" : "وجهان"}</p>
                    <p className="text-xs text-muted-foreground mt-1">يومياً لكل يوم تثبيت</p>
                  </button>
                ))}
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium">طريقة إنشاء الخطة</p>
                <div className="grid grid-cols-2 gap-3">
                  {(["auto", "manual"] as const).map(mode => (
                    <button key={mode} type="button" onClick={() => setFixationMode(mode)}
                      className={`rounded-xl border-2 p-3 text-sm ${fixationMode === mode ? "border-primary bg-primary/5" : "border-border"}`}>
                      {mode === "auto" ? "تلقائية" : "يدوية"}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          );
        case 2:
          return (
            <div className="space-y-5">
              <div className="space-y-2">
                {cycleStartDate ? (
                  <>
                    <p className="text-sm text-muted-foreground">تاريخ بداية الخطة محدد تلقائياً حسب بداية دورة التثبيت</p>
                    <div className="bg-violet-50 border border-violet-200 rounded-xl p-3 flex items-center gap-2">
                      <CalendarDays className="w-4 h-4 text-violet-500 shrink-0" />
                      <div>
                        <p className="text-xs text-violet-600 font-semibold">تاريخ البداية (مقفول)</p>
                        <p className="font-bold text-foreground">{formatArDate(cycleStartDate)}</p>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-muted-foreground">اختاري تاريخ بداية الخطة</p>
                    <Label className="text-sm">تاريخ البداية</Label>
                    <Input type="date" value={startDate} min={today} onChange={e => setStartDate(e.target.value)} className="mt-1 text-right" />
                    {startDate >= today && (
                      <div className="bg-muted/40 rounded-xl p-3 text-sm mt-2">
                        <p className="text-muted-foreground text-xs mb-0.5">التاريخ المختار</p>
                        <p className="font-semibold">{formatArDate(startDate)}</p>
                      </div>
                    )}
                  </>
                )}
              </div>
              <ColorPicker themeColor={themeColor} setThemeColor={setThemeColor} />
            </div>
          );
        case 3:
          return (
            <StepFixationWeeks
              days={days}
              updateDay={updateDay}
              quantity={quantity}
              startDate={startDate}
              isAuto={fixationMode === "auto"}
            />
          );
      }
    } else {
      switch (step) {
        // Step 1: quota
        case 1:
          return (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {(["juz", "surah"] as const).map(t => (
                  <button key={t} onClick={() => setQuotaType(t)}
                    className={`rounded-xl p-4 border-2 text-center transition-colors ${quotaType === t ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}>
                    <p className="font-bold text-sm">{t === "juz" ? "أجزاء" : "سور محددة"}</p>
                    <p className="text-xs text-muted-foreground mt-1">{t === "juz" ? "تحددين الأجزاء المراد مراجعتها" : "تحددين نطاق سور بآياتهن"}</p>
                  </button>
                ))}
              </div>
              {quotaType === "juz" ? (
                <JuzGrid selectedJuz={selectedJuz} onChange={setSelectedJuz} />
              ) : (
                <SurahRangesEditor ranges={surahRanges} onChange={setSurahRanges} />
              )}
            </div>
          );
        // Step 2: auto or manual
        case 2:
          return (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">هل تريدين أن يقسّم الموقع الخطة تلقائياً أم تريدين التقسيم يدوياً؟</p>
              <div className="grid grid-cols-2 gap-3">
                {(["auto", "manual"] as const).map(m => (
                  <button key={m} onClick={() => setWizardMode(m)}
                    className={`rounded-xl p-4 border-2 text-center transition-colors ${wizardMode === m ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}>
                    <p className="text-xl mb-1">{m === "auto" ? "✨" : "✏️"}</p>
                    <p className="font-bold text-sm">{m === "auto" ? "تلقائية" : "يدوية"}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {m === "auto" ? "الموقع يوزّع النصاب على ٢١ يوم" : "أنتِ تحددين لكل يوم نصابه"}
                    </p>
                  </button>
                ))}
              </div>
              {computedPages > 0 && (
                <div className="bg-muted/30 rounded-xl p-3 text-sm text-center">
                  إجمالي النصاب: <span className="font-bold text-primary">{computedPages} صفحة</span>
                  {wizardMode === "auto" && (
                    <span className="text-muted-foreground text-xs block mt-0.5">
                      ≈ {(computedPages / totalDays).toFixed(1)} صفحة / يوم
                    </span>
                  )}
                </div>
              )}
              {daysInitMode !== "none" && daysInitMode !== wizardMode && (
                <p className="text-xs text-amber-600 bg-amber-50 rounded-lg p-2">
                  ⚠️ تغيير النوع سيعيد توزيع الأيام من جديد
                </p>
              )}
            </div>
          );
        // Step 3: day distribution
        case 3:
          return (
            <StepGirlsDays
              days={days}
              updateDay={updateDay}
              isAuto={wizardMode === "auto"}
              totalPages={totalPages || computedPages}
              totalDays={totalDays}
              onRegenerate={() => { generateAutoDays(); setDaysInitMode("auto"); }}
            />
          );
        // Step 4: start date + colour
        case 4:
          return (
            <div className="space-y-5">
              <div className="space-y-2">
                {cycleStartDate ? (
                  <>
                    <p className="text-sm text-muted-foreground">تاريخ بداية الخطة محدد تلقائياً حسب بداية دورة المراجعة</p>
                    <div className="bg-violet-50 border border-violet-200 rounded-xl p-3 flex items-center gap-2">
                      <CalendarDays className="w-4 h-4 text-violet-500 shrink-0" />
                      <div>
                        <p className="text-xs text-violet-600 font-semibold">تاريخ البداية (مقفول)</p>
                        <p className="font-bold text-foreground">{formatArDate(cycleStartDate)}</p>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-muted-foreground">اختاري تاريخ بداية الخطة</p>
                    <Label className="text-sm">تاريخ البداية</Label>
                    <Input type="date" value={startDate} min={today} onChange={e => setStartDate(e.target.value)} className="mt-1 text-right" />
                    {startDate >= today && (
                      <div className="bg-muted/40 rounded-xl p-3 text-sm mt-2">
                        <p className="text-muted-foreground text-xs mb-0.5">التاريخ المختار</p>
                        <p className="font-semibold">{formatArDate(startDate)}</p>
                      </div>
                    )}
                  </>
                )}
              </div>
              <ColorPicker themeColor={themeColor} setThemeColor={setThemeColor} />
            </div>
          );
      }
    }
    return null;
  };

  const isLastStep = step === maxSteps;

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-right flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-primary" />
            إنشاء {planTitle}
          </DialogTitle>
          <div className="flex gap-1 mt-2">
            {Array.from({ length: maxSteps }, (_, i) => (
              <div key={i} className={`h-1.5 flex-1 rounded-full transition-colors ${i < step ? "bg-primary" : "bg-muted"}`} />
            ))}
          </div>
          <p className="text-xs text-muted-foreground text-right mt-1">
            الخطوة {step} / {maxSteps}: {stepLabels[step - 1]}
          </p>
        </DialogHeader>

        <div className="py-2 min-h-[220px]">{renderStep()}</div>

        <DialogFooter className="flex-row-reverse gap-2 mt-2">
          {step > 1 && (
            <Button variant="outline" onClick={() => setStep(s => s - 1)} disabled={saving}>
              <ChevronRight className="w-4 h-4 ml-1" />السابق
            </Button>
          )}
          {!isLastStep ? (
            <Button onClick={goNext} disabled={!canGoNext()}>
              التالي<ChevronLeft className="w-4 h-4 mr-1" />
            </Button>
          ) : (
            <Button onClick={handleSave} disabled={saving || !canGoNext()}>
              {saving
                ? <><Loader2 className="w-4 h-4 animate-spin ml-1" />جاري الحفظ...</>
                : "✓ حفظ وإنهاء"}
            </Button>
          )}
          <Button variant="ghost" onClick={onClose} disabled={saving}>إلغاء</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Girls Days Step ──────────────────────────────────────────────────────────
function StepGirlsDays({ days, updateDay, isAuto, totalPages, totalDays, onRegenerate }: {
  days: DayEntry[]; updateDay: (i: number, f: keyof DayEntry, v: any) => void;
  isAuto: boolean; totalPages: number; totalDays: number; onRegenerate: () => void;
}) {
  const perDay = totalPages > 0 ? Math.round((totalPages / totalDays) * 2) / 2 : 0;

  // ─── Auto mode: show read-only summary ────────────────────────────────────
  if (isAuto) {
    return (
      <div className="space-y-4">
        <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 text-center space-y-1">
          <p className="text-xs text-muted-foreground">إجمالي النصاب</p>
          <p className="text-3xl font-bold text-primary">{totalPages}</p>
          <p className="text-xs text-muted-foreground">صفحة على {totalDays} يوم</p>
          {perDay > 0 && (
            <p className="text-sm font-semibold mt-1">
              ≈ <span className="text-primary">{perDay}</span> صفحة في اليوم
            </p>
          )}
        </div>

        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-xs text-emerald-700 flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          <span>سيتم توزيع الصفحات تلقائياً على أيام الخطة. يمكنك تعديل التوزيع لاحقاً بعد الحفظ.</span>
        </div>

        <div className="max-h-52 overflow-y-auto rounded-xl border border-border/40">
          <table className="w-full text-xs">
            <thead className="bg-muted/50 sticky top-0">
              <tr>
                <th className="py-1.5 px-3 text-right text-muted-foreground font-medium">اليوم</th>
                <th className="py-1.5 px-3 text-center text-muted-foreground font-medium">الصفحات</th>
              </tr>
            </thead>
            <tbody>
              {days.map(day => (
                <tr key={day.dayNumber} className="border-t border-border/20">
                  <td className="py-1 px-3 text-muted-foreground">يوم {day.dayNumber}</td>
                  <td className="py-1 px-3 text-center font-semibold">{day.pages ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Button variant="outline" size="sm" className="text-xs gap-1 w-full" onClick={onRegenerate}>
          <RefreshCw className="w-3.5 h-3.5" />إعادة حساب التوزيع
        </Button>
      </div>
    );
  }

  // ─── Manual mode: full editable table ─────────────────────────────────────
  const assignedTotal = days.reduce((s, d) => s + (d.pages ?? 0), 0);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold">إدخال الأنصبة يدوياً</p>
          {totalPages > 0 && (
            <p className="text-xs text-muted-foreground mt-0.5">
              المُخصص: <span className={`font-bold ${Math.abs(assignedTotal - totalPages) < 0.6 ? "text-emerald-600" : "text-amber-600"}`}>{Math.round(assignedTotal * 2) / 2}</span> / {totalPages} صفحة
            </p>
          )}
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-2.5 text-xs text-amber-700">
        أدخلي السورة والآيات وعدد الصفحات لكل يوم
      </div>

      <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
        {days.map((day, idx) => (
          <div key={day.dayNumber} className="bg-muted/30 rounded-xl p-2">
            <p className="text-[11px] font-mono text-muted-foreground mb-1.5">يوم {day.dayNumber}</p>
            <div className="grid grid-cols-2 gap-1.5">
              <div>
                <select className="border rounded p-1 text-xs bg-background w-full" value={day.surahStart ?? ""}
                  onChange={e => { updateDay(idx, "surahStart", e.target.value || undefined); updateDay(idx, "ayahStart", undefined); }}>
                  <option value="">— سورة البداية —</option>
                  {SURAH_OPTIONS.map(s => <option key={s.number} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <AyahSelect surahName={day.surahStart} value={day.ayahStart} onChange={v => updateDay(idx, "ayahStart", v)} placeholder="آية البداية" />
              <div>
                <select className="border rounded p-1 text-xs bg-background w-full" value={day.surahEnd ?? ""}
                  onChange={e => { updateDay(idx, "surahEnd", e.target.value || undefined); updateDay(idx, "ayahEnd", undefined); }}>
                  <option value="">— سورة النهاية —</option>
                  {SURAH_OPTIONS.map(s => <option key={s.number} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <AyahSelect surahName={day.surahEnd} value={day.ayahEnd} onChange={v => updateDay(idx, "ayahEnd", v)} placeholder="آية النهاية" />
            </div>
            <input type="number" step="0.5" min="0" placeholder="عدد الصفحات" value={day.pages ?? ""}
              onChange={e => updateDay(idx, "pages", parseFloat(e.target.value) || undefined)}
              className="border rounded p-1 text-xs w-full text-center bg-background mt-1.5" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Fixation Weeks Step ──────────────────────────────────────────────────────
function StepFixationWeeks({ days, updateDay, quantity, startDate, isAuto }: {
  days: DayEntry[]; updateDay: (i: number, f: keyof DayEntry, v: any) => void;
  quantity: "half" | "full" | "double"; startDate: string; isAuto: boolean;
}) {
  const weeks = Array.from({ length: 6 }, (_, w) => ({
    weekNum: w + 1,
    days: days.slice(w * 4, w * 4 + 4),
    startIdx: w * 4,
  }));

  const dayNames = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء"];

  const getDate = (dayNumber: number): string => {
    if (!startDate) return "";
    const dates: string[] = [];
    const cur = new Date(startDate + "T12:00:00Z");
    const firstDow = cur.getUTCDay();
    if (firstDow <= 3) dates.push(cur.toISOString().slice(0, 10));
    while (dates.length < 24) {
      cur.setDate(cur.getDate() + 1);
      const dow = cur.getUTCDay();
      if (dow <= 3) dates.push(cur.toISOString().slice(0, 10));
    }
    return dates[dayNumber - 1] ?? "";
  };

  return (
    <div className="space-y-3">
    <p className="text-sm text-muted-foreground">
      {isAuto ? "النطاقات موزعة تلقائياً من نقطة البداية التي اخترتها" : "عدّلي السورة والآيات لكل يوم"} ({quantity === "half" ? "نصف وجه" : quantity === "full" ? "وجه كامل" : "وجهان"} / يوم)
      </p>
      <div className="max-h-72 overflow-y-auto space-y-4">
        {weeks.map(({ weekNum, days: wDays, startIdx }) => (
          <div key={weekNum}>
            <p className="text-xs font-bold text-muted-foreground mb-2">الأسبوع {weekNum}</p>
            <div className="space-y-2">
              {wDays.map((day, i) => {
                const globalIdx = startIdx + i;
                const dateStr = getDate(day.dayNumber);
                return (
                  <div key={day.dayNumber} className="bg-muted/30 rounded-xl p-2.5">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-semibold">{dayNames[i]}</span>
                      {dateStr && <span className="text-[10px] text-muted-foreground">{formatArDate(dateStr)}</span>}
                    </div>
                    {isAuto ? (
                      <div className="rounded-lg bg-background border border-border/50 p-2 text-xs">
                        {day.surahStart ? (
                          <span>{day.surahStart} آية {day.ayahStart} ← {day.surahEnd} آية {day.ayahEnd}</span>
                        ) : (
                          <span className="text-muted-foreground">لا يوجد نطاق كافٍ من نقطة البداية</span>
                        )}
                      </div>
                    ) : <div className="grid grid-cols-2 gap-1.5">
                      <div>
                        <select className="border rounded p-1 text-xs bg-background w-full" value={day.surahStart ?? ""}
                          onChange={e => { updateDay(globalIdx, "surahStart", e.target.value || undefined); updateDay(globalIdx, "ayahStart", undefined); }}>
                          <option value="">— سورة البداية —</option>
                          {SURAH_OPTIONS.map(s => <option key={s.number} value={s.value}>{s.label}</option>)}
                        </select>
                      </div>
                      <AyahSelect surahName={day.surahStart} value={day.ayahStart} onChange={v => updateDay(globalIdx, "ayahStart", v)} placeholder="آية البداية" />
                      <div>
                        <select className="border rounded p-1 text-xs bg-background w-full" value={day.surahEnd ?? ""}
                          onChange={e => { updateDay(globalIdx, "surahEnd", e.target.value || undefined); updateDay(globalIdx, "ayahEnd", undefined); }}>
                          <option value="">— سورة النهاية —</option>
                          {SURAH_OPTIONS.map(s => <option key={s.number} value={s.value}>{s.label}</option>)}
                        </select>
                      </div>
                      <AyahSelect surahName={day.surahEnd} value={day.ayahEnd} onChange={v => updateDay(globalIdx, "ayahEnd", v)} placeholder="آية النهاية" />
                    </div>}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
