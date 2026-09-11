import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trophy, Settings2, Moon } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const authHeader = (): Record<string, string> => {
  const t = localStorage.getItem("sana_auth_token");
  return t ? { Authorization: `Bearer ${t}` } : {};
};

function formatDateShort(dateStr: string): string {
  const months = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
  const d = new Date(dateStr + "T12:00:00Z");
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]}`;
}

interface LeaderboardData {
  visible: boolean;
  windowFrom: string | null;
  windowTo: string | null;
  weekStart: string | null;
  weekEnd: string | null;
  circles: { id: number; name: string; track: string }[];
}

// إعدادات نافذة الظهور — للقائدة والنائبة فقط
function LeaderboardWindowSettings({ current, onSaved }: { current: LeaderboardData | null; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(current?.windowFrom ?? "");
  const [to, setTo] = useState(current?.windowTo ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  useEffect(() => {
    setFrom(current?.windowFrom ?? "");
    setTo(current?.windowTo ?? "");
  }, [current]);

  const save = async () => {
    setSaving(true);
    setError(null);
    setSavedMsg(null);
    try {
      const res = await fetch(`${BASE}/api/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({ key: "leaderboard_window", value: JSON.stringify({ from, to }) }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body?.error ?? "تعذّر حفظ النافذة — حاولي مرة ثانية");
        setSaving(false);
        return;
      }
      setSaving(false);
      setSavedMsg("تم الحفظ ✓");
      onSaved();
      setTimeout(() => { setOpen(false); setSavedMsg(null); }, 900);
    } catch {
      setError("تعذّر الاتصال بالسيرفر — تأكدي من الإنترنت وحاولي مرة ثانية");
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <div className="mt-2 space-y-1">
        <button
          onClick={() => setOpen(true)}
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          <Settings2 className="w-3.5 h-3.5" /> تحكم بوقت ظهور لوحة الصدارة
        </button>
        {current?.windowFrom && current?.windowTo && (
          <p className="text-[11px] text-muted-foreground">
            الفترة المحددة حاليًا: {formatDateShort(current.windowFrom)} - {formatDateShort(current.windowTo)}
            {!current.visible && " (خارج الفترة الآن، اللوحة مخفية)"}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="mt-3 pt-3 border-t border-border/60 space-y-2">
      <p className="text-xs text-muted-foreground">حددي الفترة اللي تظهر فيها لوحة الصدارة لكل الحسابات (مثلًا آخر الشهر)</p>
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="text-xs text-muted-foreground block mb-1">من</label>
          <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="h-9" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">إلى</label>
          <Input type="date" value={to} onChange={e => setTo(e.target.value)} className="h-9" />
        </div>
        <Button size="sm" onClick={save} disabled={saving || !from || !to || from > to}>
          {saving ? "جاري الحفظ..." : "حفظ"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>إلغاء</Button>
      </div>
      {error && <p className="text-xs text-rose-600">{error}</p>}
      {savedMsg && <p className="text-xs text-emerald-600">{savedMsg}</p>}
    </div>
  );
}

export default function MonthlyLeaderboardCard({ userRole }: { userRole?: string }) {
  const [data, setData] = useState<LeaderboardData | null>(null);
  const [loaded, setLoaded] = useState(false);
  const canManage = userRole === "leader" || userRole === "deputy";

  const fetchData = () => {
    fetch(`${BASE}/api/leaderboard/monthly`, { headers: authHeader() })
      .then(r => (r.ok ? r.json() : null))
      .then(d => { setData(d); setLoaded(true); })
      .catch(() => setLoaded(true));
  };

  useEffect(() => { fetchData(); }, []);

  if (!loaded) return null;
  // للقائدة/النائبة نعرض دايمًا زر التحكم حتى لو اللوحة مخفية حاليًا؛ لباقي الأدوار لا نعرض شي إذا مخفية
  if (!data?.visible && !canManage) return null;

  return (
    <Card className="border-0 shadow-sm border-r-4 border-r-amber-400 bg-gradient-to-l from-amber-50 to-white overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-bold flex items-center gap-2 text-amber-800">
          <Trophy className="w-4 h-4" />
          لوحة الصدارة — حلقات بلا غياب
        </CardTitle>
        {data?.visible && data.weekStart && data.weekEnd && (
          <p className="text-xs text-muted-foreground">
            عن أسبوع {formatDateShort(data.weekStart)} - {formatDateShort(data.weekEnd)}
          </p>
        )}
      </CardHeader>
      <CardContent className="pt-0">
        {!data?.visible ? (
          canManage && <p className="text-xs text-muted-foreground">اللوحة مخفية حاليًا عن الجميع — رح تظهر تلقائيًا خلال الفترة اللي تحددينها بالأسفل.</p>
        ) : data.circles.length === 0 ? (
          <p className="text-xs text-muted-foreground">ما وصلت أي حلقة صفر غياب بالأسبوع الماضي.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {data.circles.map(c => (
              <span
                key={c.id}
                className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 text-amber-900 px-3 py-1.5 text-sm font-semibold"
              >
                <Moon className="w-3.5 h-3.5" /> {c.name}
              </span>
            ))}
          </div>
        )}

        {canManage && <LeaderboardWindowSettings current={data} onSaved={fetchData} />}
      </CardContent>
    </Card>
  );
}
