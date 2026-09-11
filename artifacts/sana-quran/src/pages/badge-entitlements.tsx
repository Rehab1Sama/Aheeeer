// ============================================================================
// صفحة "مستحقات الأوسمة" — صفحة واحدة فيها الأقسام الستة للأوسمة اللحظية
// (المعرّفة بـ badgeDefinitions.ts وbadgeEngine.ts على الباك إند)، كل قسم
// بفلتر تاريخ مستقل (أسبوع / شهر / تاريخ مرجعي) تحدده أنتِ من الصفحة نفسها.
// هذي صفحة عرض فقط — ما تكتب أي شيء بقاعدة البيانات ولا تمنح أوسمة، فقط
// تعرض مين مستحقة الوسام لحظيًا. الوسام "الرسمي" (يدوي/مخزّن) موجود بصفحة
// /badges المنفصلة.
//
// التركيب: راجعي INTEGRATION_NOTES.md — تحتاجين سطرين بـ App.tsx (import +
// Route) بعد ما تركّبي راوت الباك إند liveBadgesOverview.ts.
// ============================================================================

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2, Award, RefreshCw, Send } from "lucide-react";
import { BadgeChip } from "@/components/badges/BadgeChip";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function authHeader(): Record<string, string> {
  const token = localStorage.getItem("sana_auth_token");
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (token) h["Authorization"] = `Bearer ${token}`;
  return h;
}

interface EarnedBadge {
  badgeId: string;
  tier: number;
  name: string;
  subtitle: string;
  emoji: string;
  image: string | null;
  color: string;
}

interface OverviewEntry {
  key: string;
  label: string;
  meta?: string;
  badge: EarnedBadge;
}

interface AllOverviewResponse {
  circleWeeklyMoon: OverviewEntry[];
  reviewPlanCompletion: OverviewEntry[];
  monthlyPerfect: OverviewEntry[];
  improvement: OverviewEntry[];
  trackNoShortcoming: OverviewEntry[];
  supervisorWeeklyCommitment: OverviewEntry[];
}

// ─── تواريخ مساعدة (توقيت مكة، الأسبوع يبدأ الأحد) ───────────────────────────
function getMakkahDay(): string {
  const meccaMs = Date.now() + 3 * 60 * 60 * 1000;
  const d = new Date(meccaMs);
  if (d.getUTCHours() < 5) d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
function addDaysStr(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function normalizeToSunday(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d.toISOString().slice(0, 10);
}
function getLastCompletedWeekStart(): string {
  const today = getMakkahDay();
  const sunday = normalizeToSunday(today);
  const dow = new Date(today + "T12:00:00Z").getUTCDay(); // الجمعة=5، السبت=6
  return dow >= 5 ? sunday : addDaysStr(sunday, -7);
}
function formatArDate(dateStr: string): string {
  try {
    return new Date(dateStr + "T12:00:00Z").toLocaleDateString("ar-SA", { day: "numeric", month: "long" });
  } catch { return dateStr; }
}
function monthStartOf(dateStr: string): string { return `${dateStr.slice(0, 7)}-01`; }
function monthEndOf(dateStr: string): string {
  const [y, m] = dateStr.slice(0, 7).split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${dateStr.slice(0, 7)}-${String(lastDay).padStart(2, "0")}`;
}

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, { headers: authHeader() });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ─── قسم عام قابل لإعادة الاستخدام ───────────────────────────────────────────
// نفس مكوّن عرض الوسام (BadgeChip) المستخدم بصفحات my-circle.tsx /
// my-progress.tsx / circle-overview.tsx — عشان يبقى متوافق شكليًا 100%.
function BadgePill({ e }: { e: OverviewEntry }) {
  return <BadgeChip badge={e.badge} size={400} compact />;
}
// ملاحظة: e.label (اسم الطالبة/الحلقة نفسها) كان يظهر بدل اسم الوسام بالسطر
// الأول سابقًا؛ الآن BadgeChip يعرض اسم الوسام دومًا، واسم الجهة المستحقة (e.label)
// نعرضه فوق الوسام مباشرة عشان يبقى واضح مين المستحقة.
function BadgeEntry({ e }: { e: OverviewEntry }) {
  return (
    <div className="inline-flex flex-col items-center gap-1">
      <span className="text-xs font-semibold text-foreground">{e.label}</span>
      <BadgePill e={e} />
    </div>
  );
}

interface SectionProps {
  title: string;
  description: string;
  entries: OverviewEntry[] | null; // null = لسا ما تحمّل
  loading: boolean;
  filterLabel: string;
  filterControl: React.ReactNode;
  emptyLabel?: string;
  /** محتوى إضافي أسفل القسم (مثل زر "إرسال الوسام الآن" لقسم الحضور الشهري) */
  footer?: React.ReactNode;
}

function BadgeSection({ title, description, entries, loading, filterLabel, filterControl, emptyLabel, footer }: SectionProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <CardTitle className="text-lg">{title}</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">{description}</p>
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs whitespace-nowrap">{filterLabel}</Label>
            {filterControl}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" /> جارِ التحميل...
          </div>
        ) : entries === null ? null : entries.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">{emptyLabel ?? "لا توجد مستحقات ضمن هذا الفلتر"}</p>
        ) : (
          <div className="flex flex-wrap gap-4">
            {entries.map(e => <BadgeEntry key={e.key} e={e} />)}
          </div>
        )}
        {footer}
      </CardContent>
    </Card>
  );
}

interface BadgeEntitlementsPageProps { userRole?: string }

export default function BadgeEntitlementsPage({ userRole }: BadgeEntitlementsPageProps) {
  const allowed = userRole === "leader" || userRole === "deputy" || userRole === "track_supervisor";

  // فلاتر كل قسم — مستقلة عن بعض
  const [weekMoon, setWeekMoon] = useState(getLastCompletedWeekStart());
  const [asOfPlan, setAsOfPlan] = useState(getMakkahDay());
  // الحضور الشهري: ما فيه تاريخ افتراضي — القائدة تحدد الفترة بنفسها، وما
  // تُحسب أو تُعرض أي أوسمة قبل ما تختار الفترة (مو شهر تقويمي ثابت مُحمَّل تلقائيًا)
  const [monthFrom, setMonthFrom] = useState("");
  const [monthTo, setMonthTo] = useState("");
  const [weekImprove, setWeekImprove] = useState(getLastCompletedWeekStart());
  const [weekTrack, setWeekTrack] = useState(getLastCompletedWeekStart());
  const [weekSupervisor, setWeekSupervisor] = useState(getLastCompletedWeekStart());

  const [data, setData] = useState<Partial<AllOverviewResponse>>({});
  const [loadingKey, setLoadingKey] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<string | null>(null);
  const [sendingPlan, setSendingPlan] = useState(false);
  const [sendResultPlan, setSendResultPlan] = useState<string | null>(null);
  const [sendingTrack, setSendingTrack] = useState(false);
  const [sendResultTrack, setSendResultTrack] = useState<string | null>(null);
  const [sendingSupervisor, setSendingSupervisor] = useState(false);
  const [sendResultSupervisor, setSendResultSupervisor] = useState<string | null>(null);

  const canSend = userRole === "leader" || userRole === "deputy";

  // بداية الفصل الحالي — تُستخدم بالباك إند عشان "شع نورك" ما يقارن بأسبوع قبل بداية الفصل
  const [termStart, setTermStart] = useState("");
  const [savingTermStart, setSavingTermStart] = useState(false);
  const [termStartSaved, setTermStartSaved] = useState<string | null>(null);

  useEffect(() => {
    if (!canSend) return;
    fetchJson<Record<string, string>>("/settings").then(s => {
      if (s.term_start_date) setTermStart(s.term_start_date);
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveTermStart() {
    if (!termStart) return;
    setSavingTermStart(true);
    setTermStartSaved(null);
    try {
      const res = await fetch(`${BASE}/api/settings`, {
        method: "PATCH",
        headers: authHeader(),
        body: JSON.stringify({ key: "term_start_date", value: termStart }),
      });
      if (!res.ok) throw new Error();
      setTermStartSaved("✅ تم الحفظ");
    } catch {
      setTermStartSaved("تعذّر الحفظ");
    } finally {
      setSavingTermStart(false);
    }
  }

  async function sendMonthlyBadges() {
    if (monthFrom > monthTo) { setSendResult("تاريخ البداية لازم يكون قبل تاريخ النهاية"); return; }
    setSending(true);
    setSendResult(null);
    try {
      const res = await fetch(`${BASE}/api/live-badges/send/monthly-perfect`, {
        method: "POST",
        headers: authHeader(),
        body: JSON.stringify({ dateFrom: monthFrom, dateTo: monthTo }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? "تعذّر الإرسال");
      setSendResult(body.count > 0 ? `✅ تم إرسال الوسام لـ ${body.count} طالبة` : "ما فيه طالبات مستحقة ضمن هذي الفترة");
    } catch (err) {
      setSendResult(err instanceof Error ? err.message : "تعذّر الإرسال");
    } finally {
      setSending(false);
    }
  }

  async function sendPlanBadges() {
    setSendingPlan(true);
    setSendResultPlan(null);
    try {
      const res = await fetch(`${BASE}/api/live-badges/send/review-plan-completion`, {
        method: "POST",
        headers: authHeader(),
        body: JSON.stringify({ asOf: asOfPlan }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? "تعذّر الإرسال");
      setSendResultPlan(body.count > 0 ? `✅ تم إرسال الوسام لـ ${body.count} طالبة` : "ما فيه طالبات مستحقة حتى هذا التاريخ");
    } catch (err) {
      setSendResultPlan(err instanceof Error ? err.message : "تعذّر الإرسال");
    } finally {
      setSendingPlan(false);
    }
  }

  async function sendTrackBadges() {
    setSendingTrack(true);
    setSendResultTrack(null);
    try {
      const res = await fetch(`${BASE}/api/live-badges/send/track-no-shortcoming`, {
        method: "POST",
        headers: authHeader(),
        body: JSON.stringify({ weekStart: weekTrack }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? "تعذّر الإرسال");
      setSendResultTrack(body.count > 0 ? `✅ تم إرسال الوسام لـ ${body.count} مسار` : "ما فيه مسارات مستحقة ضمن هذا الأسبوع");
    } catch (err) {
      setSendResultTrack(err instanceof Error ? err.message : "تعذّر الإرسال");
    } finally {
      setSendingTrack(false);
    }
  }

  async function sendSupervisorBadges() {
    setSendingSupervisor(true);
    setSendResultSupervisor(null);
    try {
      const res = await fetch(`${BASE}/api/live-badges/send/supervisor-weekly-commitment`, {
        method: "POST",
        headers: authHeader(),
        body: JSON.stringify({ weekStart: weekSupervisor }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? "تعذّر الإرسال");
      setSendResultSupervisor(body.count > 0 ? `✅ تم إرسال الوسام لـ ${body.count} مسؤولة مسار` : "ما فيه مسؤولات مسار مستحقات ضمن هذا الأسبوع");
    } catch (err) {
      setSendResultSupervisor(err instanceof Error ? err.message : "تعذّر الإرسال");
    } finally {
      setSendingSupervisor(false);
    }
  }

  function setLoading(key: string, v: boolean) { setLoadingKey(s => ({ ...s, [key]: v })); }

  async function reload(key: keyof AllOverviewResponse, path: string) {
    setLoading(key, true);
    try {
      const res = await fetchJson<OverviewEntry[]>(path);
      setData(d => ({ ...d, [key]: res }));
    } catch {
      setError("تعذّر تحميل بعض الأقسام — حاولي تحديث الصفحة");
    } finally {
      setLoading(key, false);
    }
  }

  function reloadAll() {
    reload("circleWeeklyMoon", `/live-badges/overview/circle-weekly-moon?weekStart=${weekMoon}`);
    reload("reviewPlanCompletion", `/live-badges/overview/review-plan-completion?asOf=${asOfPlan}`);
    if (monthFrom && monthTo) {
      reload("monthlyPerfect", `/live-badges/overview/monthly-perfect?dateFrom=${monthFrom}&dateTo=${monthTo}`);
    }
    reload("improvement", `/live-badges/overview/improvement?weekStart=${weekImprove}`);
    reload("trackNoShortcoming", `/live-badges/overview/track-no-shortcoming?weekStart=${weekTrack}`);
    reload("supervisorWeeklyCommitment", `/live-badges/overview/supervisor-weekly-commitment?weekStart=${weekSupervisor}`);
  }

  useEffect(() => { if (allowed) reloadAll(); /* أول تحميل فقط */ /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  if (!allowed) {
    return (
      <div className="p-8 text-center text-muted-foreground" dir="rtl">
        ليس لديك صلاحية لعرض هذي الصفحة.
      </div>
    );
  }

  return (
    <div className="p-4 max-w-5xl mx-auto space-y-4" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold text-primary flex items-center gap-2">
          <Award className="w-6 h-6" />مستحقات الأوسمة
        </h1>
        <Button size="sm" variant="outline" onClick={reloadAll}>
          <RefreshCw className="w-4 h-4 ml-1" />تحديث الكل
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}

      <BadgeSection
        title="🌕 أقمر الحلقة (أسبوعي)"
        description="كل الحلقات المستحقة لوسام قمر الأسبوع ضمن الأسبوع المحدد"
        entries={data.circleWeeklyMoon ?? null}
        loading={!!loadingKey.circleWeeklyMoon}
        filterLabel="الأسبوع (اختاري أي يوم منه)"
        filterControl={
          <div className="flex items-center gap-2">
            <Input type="date" className="h-8 w-40" value={weekMoon}
              onChange={e => { const w = normalizeToSunday(e.target.value); setWeekMoon(w); reload("circleWeeklyMoon", `/live-badges/overview/circle-weekly-moon?weekStart=${w}`); }} />
            <span className="text-xs text-muted-foreground whitespace-nowrap">{formatArDate(weekMoon)} — {formatArDate(addDaysStr(weekMoon, 4))}</span>
          </div>
        }
      />

      <BadgeSection
        title="🌙 إنهاء خطة المراجعة"
        description="الطالبات اللي انتهت دورة خطتهن حتى التاريخ المحدد"
        entries={data.reviewPlanCompletion ?? null}
        loading={!!loadingKey.reviewPlanCompletion}
        filterLabel="حتى تاريخ"
        filterControl={
          <Input type="date" className="h-8 w-40" value={asOfPlan}
            onChange={e => { setAsOfPlan(e.target.value); reload("reviewPlanCompletion", `/live-badges/overview/review-plan-completion?asOf=${e.target.value}`); }} />
        }
        footer={canSend && (
          <div className="mt-4 pt-4 border-t flex items-center gap-3 flex-wrap">
            <Button size="sm" onClick={sendPlanBadges} disabled={sendingPlan || !(data.reviewPlanCompletion?.length)}>
              {sendingPlan ? <Loader2 className="w-4 h-4 ml-1 animate-spin" /> : <Send className="w-4 h-4 ml-1" />}
              إرسال الوسام الآن لكل المستحقات
            </Button>
            {sendResultPlan && <span className="text-sm text-muted-foreground">{sendResultPlan}</span>}
          </div>
        )}
      />

      <BadgeSection
        title="🏆 حضور الفترة الكاملة"
        description="الطالبات اللي حضرن الفترة المحددة كاملة بدون أي غياب — حددي الفترة اللي تبين، مو بالضرورة شهر تقويمي كامل"
        entries={monthFrom && monthTo ? (data.monthlyPerfect ?? null) : []}
        loading={!!loadingKey.monthlyPerfect}
        emptyLabel={monthFrom && monthTo ? "لا توجد مستحقات ضمن هذا الفلتر" : "حددي الفترة (من — إلى) عشان تشوفي المستحقات"}
        filterLabel="من — إلى"
        filterControl={
          <div className="flex items-center gap-2">
            <Input type="date" className="h-8 w-36" value={monthFrom}
              onChange={e => {
                setMonthFrom(e.target.value);
                if (e.target.value && monthTo) reload("monthlyPerfect", `/live-badges/overview/monthly-perfect?dateFrom=${e.target.value}&dateTo=${monthTo}`);
              }} />
            <span className="text-xs text-muted-foreground">إلى</span>
            <Input type="date" className="h-8 w-36" value={monthTo}
              onChange={e => {
                setMonthTo(e.target.value);
                if (monthFrom && e.target.value) reload("monthlyPerfect", `/live-badges/overview/monthly-perfect?dateFrom=${monthFrom}&dateTo=${e.target.value}`);
              }} />
          </div>
        }
        footer={canSend && (
          <div className="mt-4 pt-4 border-t flex items-center gap-3 flex-wrap">
            <Button size="sm" onClick={sendMonthlyBadges} disabled={sending || !(data.monthlyPerfect?.length)}>
              {sending ? <Loader2 className="w-4 h-4 ml-1 animate-spin" /> : <Send className="w-4 h-4 ml-1" />}
              إرسال الوسام الآن لكل المستحقات
            </Button>
            {sendResult && <span className="text-sm text-muted-foreground">{sendResult}</span>}
          </div>
        )}
      />

      <BadgeSection
        title="✨ شع نورك (التطور)"
        description="الطالبات اللي تحسّن حضورهن هذا الأسبوع مقارنة بالأسبوع اللي قبله مباشرة"
        entries={data.improvement ?? null}
        loading={!!loadingKey.improvement}
        filterLabel="الأسبوع (اختاري أي يوم منه)"
        filterControl={
          <div className="flex items-center gap-2">
            <Input type="date" className="h-8 w-40" value={weekImprove}
              onChange={e => { const w = normalizeToSunday(e.target.value); setWeekImprove(w); reload("improvement", `/live-badges/overview/improvement?weekStart=${w}`); }} />
            <span className="text-xs text-muted-foreground whitespace-nowrap">{formatArDate(weekImprove)} — {formatArDate(addDaysStr(weekImprove, 4))}</span>
          </div>
        }
        footer={canSend && (
          <div className="mt-4 pt-4 border-t flex items-center gap-2 flex-wrap">
            <Label className="text-xs whitespace-nowrap">بداية الفصل الحالي (ما يُحسب وسام إلا من ثاني أسبوع بعدها)</Label>
            <Input type="date" className="h-8 w-40" value={termStart}
              onChange={e => setTermStart(e.target.value)} />
            <Button size="sm" variant="outline" onClick={saveTermStart} disabled={savingTermStart}>
              {savingTermStart ? <Loader2 className="w-4 h-4 ml-1 animate-spin" /> : null}
              حفظ
            </Button>
            {termStartSaved && <span className="text-xs text-muted-foreground">{termStartSaved}</span>}
          </div>
        )}
      />

      <BadgeSection
        title="💚 مسارنا الأحب"
        description="المسارات اللي ما فيها أي تقصير طوال الأسبوع المحدد"
        entries={data.trackNoShortcoming ?? null}
        loading={!!loadingKey.trackNoShortcoming}
        filterLabel="الأسبوع (اختاري أي يوم منه)"
        filterControl={
          <div className="flex items-center gap-2">
            <Input type="date" className="h-8 w-40" value={weekTrack}
              onChange={e => { const w = normalizeToSunday(e.target.value); setWeekTrack(w); reload("trackNoShortcoming", `/live-badges/overview/track-no-shortcoming?weekStart=${w}`); }} />
            <span className="text-xs text-muted-foreground whitespace-nowrap">{formatArDate(weekTrack)} — {formatArDate(addDaysStr(weekTrack, 4))}</span>
          </div>
        }
        footer={canSend && (
          <div className="mt-4 pt-4 border-t flex items-center gap-3 flex-wrap">
            <Button size="sm" onClick={sendTrackBadges} disabled={sendingTrack || !(data.trackNoShortcoming?.length)}>
              {sendingTrack ? <Loader2 className="w-4 h-4 ml-1 animate-spin" /> : <Send className="w-4 h-4 ml-1" />}
              إرسال الوسام الآن لكل المستحقات
            </Button>
            {sendResultTrack && <span className="text-sm text-muted-foreground">{sendResultTrack}</span>}
          </div>
        )}
      />

      <BadgeSection
        title="👑 فخر الأسبوع (مسؤولة المسار)"
        description="مسؤولات المسار اللي التزمن بتسجيل حضور العمل كل أيام الأسبوع"
        entries={data.supervisorWeeklyCommitment ?? null}
        loading={!!loadingKey.supervisorWeeklyCommitment}
        filterLabel="الأسبوع (اختاري أي يوم منه)"
        filterControl={
          <div className="flex items-center gap-2">
            <Input type="date" className="h-8 w-40" value={weekSupervisor}
              onChange={e => { const w = normalizeToSunday(e.target.value); setWeekSupervisor(w); reload("supervisorWeeklyCommitment", `/live-badges/overview/supervisor-weekly-commitment?weekStart=${w}`); }} />
            <span className="text-xs text-muted-foreground whitespace-nowrap">{formatArDate(weekSupervisor)} — {formatArDate(addDaysStr(weekSupervisor, 4))}</span>
          </div>
        }
        footer={canSend && (
          <div className="mt-4 pt-4 border-t flex items-center gap-3 flex-wrap">
            <Button size="sm" onClick={sendSupervisorBadges} disabled={sendingSupervisor || !(data.supervisorWeeklyCommitment?.length)}>
              {sendingSupervisor ? <Loader2 className="w-4 h-4 ml-1 animate-spin" /> : <Send className="w-4 h-4 ml-1" />}
              إرسال الوسام الآن لكل المستحقات
            </Button>
            {sendResultSupervisor && <span className="text-sm text-muted-foreground">{sendResultSupervisor}</span>}
          </div>
        )}
      />
    </div>
  );
}
