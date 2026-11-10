// لمسات المقرأة الجمالية: دوائر الصفحة الرئيسية والتقويم، ترحيب حسب الوقت، شريط الفصل والإجازة،
// احتفال اكتمال الحلقة، وعدّاد الأرقام. بلا أيقونات فيها أرواح.
import { useEffect, useMemo, useRef, useState } from "react";
import { useListCalendarEvents } from "@workspace/api-client-react";

const makkahNow = () => new Date(Date.now() + 3 * 3600 * 1000);
const makkahIso = () => makkahNow().toISOString().slice(0, 10);
function readLS(k: string) { try { return localStorage.getItem(k); } catch { return null; } }
function writeLS(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* */ } }

/** دوائر المقرأة (نفس شكل الصفحة الرئيسية والتقويم): دائرة ممتلئة، حلقة متقطعة، ونقطتان ذهبية وزرقاء */
export function SoftCircles({ size = 180, className = "" }: { size?: number; className?: string }) {
  const ring = Math.round(size * 0.78);
  return (
    <div aria-hidden="true" className={`pointer-events-none absolute flex items-center justify-center ${className}`} style={{ width: size, height: size }}>
      <div className="absolute rounded-full bg-[#ECEEF7] opacity-75 dark:bg-[#2B3784]/30" style={{ width: size, height: size }} />
      <div className="absolute rounded-full border border-dashed border-[#C8CDE8] dark:border-[#C8CDE8]/30" style={{ width: ring, height: ring }} />
      <div className="absolute h-2 w-2 rounded-full bg-[#C4A76A]" style={{ left: size * 0.14, top: size * 0.1 }} />
      <div className="absolute h-1.5 w-1.5 rounded-full bg-[#9EA8CC]" style={{ right: size * 0.16, bottom: size * 0.14 }} />
    </div>
  );
}

/** ترحيب أعلى الصفحة الرئيسية حسب وقت مكة */
export function HomeGreeting({ name }: { name: string }) {
  const first = (name || "").trim().split(/\s+/)[0] || "";
  const now = makkahNow();
  const h = now.getUTCHours();
  const morning = h >= 4 && h < 12;
  const greeting = morning ? "صباح الخير" : "مساء النور";
  const date = new Date();
  const greg = date.toLocaleDateString("ar-EG", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Riyadh" });
  let hijri = "";
  try { hijri = date.toLocaleDateString("ar-SA-u-ca-islamic-umalqura", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Riyadh" }); } catch { /* */ }
  return (
    <div className="relative mb-4 overflow-hidden rounded-2xl border border-primary/10 bg-card px-5 py-4 shadow-sm">
      <SoftCircles size={150} className="-left-10 -top-12" />
      <SoftCircles size={90} className="left-24 -bottom-12 opacity-70" />
      <div className="relative">
        <p className="font-heading text-lg text-primary">
          {greeting} يا قمرتنا{first ? ` ${first}` : ""} {morning ? "🌸" : "🌿"}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{greg}{hijri ? ` · ${hijri}` : ""}</p>
      </div>
    </div>
  );
}

type CalEvent = { title: string; date: string; endDate?: string | null; eventType?: string | null };

/** حال اليوم من التقويم: أول أسبوع في الفصل، أو إجازة */
function useSeason(): { kind: "start" | "holiday"; term?: string; nextTerm?: string; nextDate?: string } | null {
  const y = makkahNow().getUTCFullYear();
  const opts = (yr: number) => ({ query: { queryKey: ["calendarEvents", yr], staleTime: 30 * 60 * 1000 } });
  const { data: prev = [] } = useListCalendarEvents({ year: y - 1 }, opts(y - 1) as any);
  const { data: cur = [] } = useListCalendarEvents({ year: y }, opts(y) as any);
  const { data: next = [] } = useListCalendarEvents({ year: y + 1 }, opts(y + 1) as any);
  return useMemo(() => {
    const all = [...(prev as CalEvent[]), ...(cur as CalEvent[]), ...(next as CalEvent[])];
    if (all.length === 0) return null;
    const today = makkahIso();
    const starts = all.filter((e) => /بداية/.test(e.title)).sort((a, b) => a.date.localeCompare(b.date));
    const termOf = (e?: CalEvent) => (/بداية\s+(.+)$/.exec(e?.title ?? "")?.[1] ?? "").trim();
    const nextStart = starts.find((e) => e.date > today);
    for (const e of all) {
      if (e.eventType !== "holiday" || today < e.date) continue;
      const after = starts.find((s) => s.date > e.date);
      const end = e.endDate ?? (after ? addDays(after.date, -1) : addDays(e.date, 60));
      if (today <= end) return { kind: "holiday", nextTerm: termOf(after), nextDate: after?.date };
    }
    const started = starts.filter((e) => e.date <= today);
    const last = started[started.length - 1];
    if (last && daysBetween(last.date, today) < 7) return { kind: "start", term: termOf(last) };
    void nextStart;
    return null;
  }, [prev, cur, next]);
}
function addDays(iso: string, n: number) { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function daysBetween(a: string, b: string) { return Math.round((new Date(b + "T00:00:00Z").getTime() - new Date(a + "T00:00:00Z").getTime()) / 86400000); }

/** شريط رقيق أعلى الموقع: «حيَّاكنَّ الله في الفصل…» أول أسبوع، و«إجازة مباركة» في الإجازة */
export function SeasonStrip() {
  const season = useSeason();
  const [, force] = useState(0);
  if (!season) return null;
  const key = `season-hidden:${season.kind}:${season.term ?? season.nextTerm ?? ""}:${makkahIso()}`;
  if (readLS(key)) return null;
  let text: string;
  if (season.kind === "start") {
    text = `حيَّاكنَّ الله في ${season.term || "الفصل الجديد"}، أعاننا الله وإياكنَّ 🌸`;
  } else {
    const when = season.nextDate
      ? new Date(season.nextDate + "T00:00:00Z").toLocaleDateString("ar-EG", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })
      : "";
    text = `إجازة مباركة${season.nextTerm ? `، نلقاكنَّ في ${season.nextTerm}${when ? ` يوم ${when}` : ""}` : ""} 🌿`;
  }
  return (
    <div className="relative overflow-hidden border-b border-[#C8CDE8]/60 bg-[#F1F2F8] dark:border-white/10 dark:bg-[#141B4A]">
      <div aria-hidden="true" className="absolute -left-6 top-1/2 h-14 w-14 -translate-y-1/2 rounded-full border border-dashed border-[#C8CDE8] dark:border-white/15" />
      <div aria-hidden="true" className="absolute left-12 top-2 h-1.5 w-1.5 rounded-full bg-[#C4A76A]" />
      <div className="relative flex items-center gap-3 px-4 py-2">
        <p className="flex-1 text-center text-xs font-bold text-[#2B3784] dark:text-[#E4E7F4]">{text}</p>
        <button type="button" onClick={() => { writeLS(key, "1"); force((x) => x + 1); }} className="text-[#59658F] hover:text-[#1A2260] dark:text-white/60" aria-label="إخفاء">×</button>
      </div>
    </div>
  );
}

/** احتفال اكتمال الحلقة: نجوم وأهلّة ذهبية وكحلية تتساقط على ثلاث دفعات نحو ست ثوانٍ */
export function Celebration({ onDone }: { onDone: () => void }) {
  const pieces = useMemo(() => Array.from({ length: 60 }, (_, i) => ({
    ch: i % 3 === 0 ? "☾" : i % 3 === 1 ? "★" : "✦",
    left: Math.random() * 100,
    size: 12 + Math.random() * 14,
    color: i % 2 === 0 ? "#C4A76A" : i % 5 === 0 ? "#9EA8CC" : "#2B3784",
    delay: (i % 3) * 1.2 + Math.random() * 0.8,
    dur: 3 + Math.random() * 1.5,
    drift: (Math.random() - 0.5) * 120,
    spin: (Math.random() - 0.5) * 540,
  })), []);
  useEffect(() => { const t = window.setTimeout(onDone, 7000); return () => window.clearTimeout(t); }, [onDone]);
  return (
    <div className="sana-celebrate" aria-hidden="true">
      {pieces.map((p, i) => (
        <span
          key={i}
          style={{
            left: `${p.left}%`, fontSize: p.size, color: p.color,
            ["--delay" as any]: `${p.delay}s`, ["--dur" as any]: `${p.dur}s`,
            ["--drift" as any]: `${p.drift}px`, ["--spin" as any]: `${p.spin}deg`,
          }}
        >{p.ch}</span>
      ))}
    </div>
  );
}

/** عدّاد يبدأ من الصفر حتى القيمة (يحترم «تقليل الحركة») */
export function CountUp({ value, decimals = 0, suffix = "" }: { value: number; decimals?: number; suffix?: string }) {
  const [shown, setShown] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce || !Number.isFinite(value)) { setShown(value); return; }
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / 900);
      const eased = 1 - Math.pow(1 - k, 3);
      setShown(a + (value - a) * eased);
      if (k < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  const factor = Math.pow(10, decimals);
  return <>{(Math.round(shown * factor) / factor).toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}{suffix}</>;
}
