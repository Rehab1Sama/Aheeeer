import { useState, useEffect, useMemo, useRef } from "react";
import { Link, useLocation } from "wouter";
import { useGetTodayBanner, useLogout, useGetMyMessages, useListStudents } from "@workspace/api-client-react";
import { clearAuth, getToken, setToken } from "@/lib/auth";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { motivationMessage, isLateEntryNow } from "@/lib/motivation";
import { isFeatureEnabled, shouldHideShortcomings, BRAND } from "@/lib/schoolConfig";
import {
  Users, ClipboardList, BarChart3,
  UserCheck, UserX, Home, LogOut, Menu, X,
  CalendarCheck, PenSquare, ClipboardPaste, Headphones, BookUser, FileDown,
  BarChart2, MessageSquare, Search, Clock, Archive, Layers,
  Calendar, ShoppingBag, Award, Shuffle, GraduationCap, AlertTriangle,
  ArrowLeftRight, Loader2, BookOpen, PlaneTakeoff, Bell, CheckCheck,
  TrendingUp, Globe, Moon, Sun, Database, Award as CertificateIcon,
  UserSearch, Star, ChevronDown, MoreHorizontal, MoveRight,
} from "lucide-react";
import { useTheme } from "@/components/ThemeProvider";
import logoUrl from "@/assets/logo.jpg";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

interface LayoutProps {
  user: {
    id: number;
    name: string;
    role: string;
    email: string;
    track?: string | null;
  };
  children: React.ReactNode;
}

interface AccountInfo {
  id: number;
  name: string;
  role: string;
  roleLabel: string;
  track: string | null;
  circleId: number | null;
  circleName: string | null;
  isCurrent: boolean;
}

function useMyAccounts(userId: number) {
  const [accounts, setAccounts] = useState<AccountInfo[]>([]);
  useEffect(() => {
    const token = getToken();
    if (!token) return;
    const base = import.meta.env.BASE_URL.replace(/\/$/, "");
    fetch(`${base}/api/auth/my-accounts`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => (r.ok ? r.json() : []))
      .then((data: AccountInfo[]) => setAccounts(data))
      .catch(() => {});
  }, [userId]);
  return accounts;
}

function NavLink({ href, label, icon: Icon, badge }: { href: string; label: string; icon: React.ElementType; badge?: number }) {
  const [location] = useLocation();
  const isActive = location === href || (href !== "/" && location.startsWith(href));

  return (
    <Link
      href={href}
      className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 text-sm font-semibold group ${
        isActive
          ? "bg-white/20 text-white shadow-sm"
          : "text-white/70 hover:bg-white/10 hover:text-white"
      }`}
      data-testid={`nav-link-${href.replace("/", "") || "home"}`}
    >
      <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? "text-white" : "text-white/60 group-hover:text-white/80"}`} />
      <span>{label}</span>
      {badge != null && badge > 0 && (
        <span className="mr-auto ms-auto bg-rose-500 text-white text-[11px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 leading-none">
          {badge}
        </span>
      )}
      {isActive && !badge && <div className="me-auto w-1.5 h-1.5 rounded-full bg-white/80 me-0 ms-auto"></div>}
    </Link>
  );
}

// ── تجميع القائمة الجانبية تحت عناوين (للأدوار ذات القوائم الطويلة) ──
const NAV_GROUPS: Array<{ title: string; hrefs: string[] }> = [
  { title: "المتابعة اليومية", hrefs: ["/data-entry", "/whatsapp-entry", "/data-entry-status", "/track-entry-status", "/leader-tasks", "/daily-tasks", "/deputy-board", "/deputy-tasks", "/supervisor-hours"] },
  { title: "الطالبات والخطط", hrefs: ["/review-plans-overview", "/certificates", "/attendance", "/weekly-absence-groups", "/shortcomings", "/stumbling-stats", "/student-leaves", "/distinguished-students", "/volunteer", "/archived-students", "/unlinked-students", "/duplicate-students", "/transfer-requests"] },
  { title: "الحلقات والفريق", hrefs: ["/circles", "/deputy-circles", "/manage-tracks", "/accounts", "/circles-staffing", "/teacher-rotation", "/onboard", "/unlinked-staff", "/archived-staff"] },
  { title: "التسجيل", hrefs: ["/registration", "/pending-registrations", "/registration-students", "/registration-pool-search"] },
  { title: "التقارير والإحصائيات", hrefs: ["/statistics", "/track-report", "/monthly-report", "/reports"] },
  { title: "الأوسمة والتواصل", hrefs: ["/badges", "/badge-entitlements", "/messages", "/my-messages", "/calendar", "/store-manage"] },
  { title: "الإعدادات والبيانات", hrefs: ["/audit-log", "/export", "/db-settings", "/white-label"] },
];
const GROUPED_ROLES = ["leader", "deputy", "track_supervisor"];
const isActivePath = (location: string, href: string) => location === href || (href !== "/" && location.startsWith(href));

function readOpenGroups(): Record<string, boolean> {
  try { return JSON.parse(localStorage.getItem("nav-open-groups") ?? "{}"); } catch { return {}; }
}

function GroupedNav({ items }: { items: NavItem[] }) {
  const [location] = useLocation();
  const [open, setOpen] = useState<Record<string, boolean>>(readOpenGroups);
  const toggle = (title: string, current: boolean) => {
    const next = { ...open, [title]: !current };
    setOpen(next);
    try { localStorage.setItem("nav-open-groups", JSON.stringify(next)); } catch { /* المتصفح يمنع التخزين */ }
  };
  const used = new Set<string>();
  const sections = NAV_GROUPS.map((g) => {
    const list = g.hrefs.map((h) => items.find((i) => i.href === h)).filter((i): i is NavItem => !!i);
    list.forEach((i) => used.add(i.href));
    return { title: g.title, list };
  }).filter((g) => g.list.length > 0);
  const top = items.filter((i) => i.href === "/");
  top.forEach((i) => used.add(i.href));
  const rest = items.filter((i) => !used.has(i.href));
  if (rest.length) sections.push({ title: "أخرى", list: rest });
  return (
    <>
      {top.map((item) => <NavLink key={item.href} {...item} />)}
      {sections.map((g) => {
        const hasActive = g.list.some((i) => isActivePath(location, i.href));
        const badge = g.list.reduce((n, i) => n + (i.badge ?? 0), 0);
        const isOpen = open[g.title] ?? hasActive;
        return (
          <div key={g.title} className="pt-2">
            <button
              type="button"
              onClick={() => toggle(g.title, isOpen)}
              aria-expanded={isOpen}
              className="w-full flex items-center justify-between px-4 py-2 rounded-lg text-white/55 hover:text-white/85 text-xs font-bold tracking-wide"
            >
              <span className="flex items-center gap-2">
                {g.title}
                {!isOpen && badge > 0 && <span className="bg-rose-500 text-white text-[12px] rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center">{badge}</span>}
                {!isOpen && hasActive && <span className="w-1.5 h-1.5 rounded-full bg-white/80" />}
              </span>
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isOpen ? "rotate-180" : ""}`} />
            </button>
            {isOpen && <div className="space-y-1 mt-0.5">{g.list.map((item) => <NavLink key={item.href} {...item} />)}</div>}
          </div>
        );
      })}
    </>
  );
}

// ── الشريط السفلي في الجوال: أهم الصفحات لكل دور + «المزيد» يفتح القائمة ──
const BOTTOM_PRIORITY: Record<string, string[]> = {
  leader: ["/", "/data-entry-status", "/review-plans-overview", "/statistics", "/attendance"],
  deputy: ["/", "/data-entry-status", "/review-plans-overview", "/deputy-tasks", "/statistics"],
  track_supervisor: ["/", "/data-entry", "/track-entry-status", "/review-plans-overview"],
  teacher: ["/", "/data-entry", "/review-plans-overview", "/my-messages", "/badges"],
  supervisor: ["/", "/data-entry", "/review-plans-overview", "/my-messages", "/badges"],
  student: ["/", "/review-plans-overview", "/badges", "/my-messages", "/attendance"],
  data_entry: ["/", "/calendar"],
  volunteer: ["/", "/calendar"],
  exam_supervisor: ["/", "/statistics", "/calendar"],
};
const SHORT_LABEL: Record<string, string> = {
  "/data-entry-status": "المدخلات", "/review-plans-overview": "الخطط", "/statistics": "الإحصائيات",
  "/attendance": "الغيابات", "/deputy-tasks": "مهامي", "/data-entry": "الإدخال", "/whatsapp-entry": "الواتساب",
  "/track-entry-status": "حالة الإدخال", "/my-messages": "رسائلي", "/badges": "الأوسمة", "/calendar": "التقويم",
};

function BottomNav({ role, items, onMore }: { role: string; items: NavItem[]; onMore: () => void }) {
  const [location] = useLocation();
  const picks = (BOTTOM_PRIORITY[role] ?? ["/"])
    .map((h) => items.find((i) => i.href === h))
    .filter((i): i is NavItem => !!i)
    .slice(0, 4);
  if (picks.length === 0) return null;
  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-card/95 backdrop-blur border-t border-border shadow-[0_-4px_16px_rgba(26,34,96,0.08)]"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="التنقل السريع"
    >
      <div className="flex">
        {picks.map(({ href, label, icon: Icon, badge }) => {
          const active = isActivePath(location, href);
          return (
            <Link key={href} href={href} className={`relative flex-1 flex flex-col items-center justify-center gap-1 py-2 min-h-[56px] text-xs font-bold ${active ? "text-primary" : "text-muted-foreground"}`}>
              <span className="relative">
                <Icon className="w-5 h-5" />
                {badge != null && badge > 0 && <span className="absolute -top-1.5 -left-2 bg-rose-500 text-white text-[12px] rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center leading-none">{badge}</span>}
              </span>
              <span className="truncate max-w-[72px]">{SHORT_LABEL[href] ?? label}</span>
              {active && <span className="absolute top-0 h-0.5 w-8 rounded-full bg-primary" />}
            </Link>
          );
        })}
        <button type="button" onClick={onMore} className="flex-1 flex flex-col items-center justify-center gap-1 py-2 min-h-[56px] text-xs font-bold text-muted-foreground">
          <MoreHorizontal className="w-5 h-5" />
          <span>المزيد</span>
        </button>
      </div>
    </nav>
  );
}

/** ينسخ عناوين أعمدة الجداول (table.mobile-cards) إلى خلاياها، لتظهر كبطاقات في الجوال. */
function labelMobileTables(root: ParentNode = document) {
  root.querySelectorAll<HTMLTableElement>("table.mobile-cards").forEach((table) => {
    const heads = Array.from(table.querySelectorAll("thead tr:last-child th")).map((th) => (th.textContent ?? "").trim());
    table.querySelectorAll<HTMLTableRowElement>("tbody tr").forEach((tr) => {
      let col = 0;
      let titled = false;
      Array.from(tr.cells).forEach((td) => {
        const label = td.colSpan > 1 ? "" : heads[col] ?? "";
        if (td.getAttribute("data-label") !== label) td.setAttribute("data-label", label);
        const isTitle = !titled && label !== "" && label !== "#";
        if (isTitle) { titled = true; td.setAttribute("data-title", ""); } else td.removeAttribute("data-title");
        col += td.colSpan || 1;
      });
    });
  });
}

function useMobileTableLabels() {
  useEffect(() => {
    let frame = 0;
    const run = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => labelMobileTables()); };
    run();
    const observer = new MutationObserver((muts) => {
      // تجاهل تغييراتنا نحن على الخصائص
      if (muts.every((m) => m.type === "attributes")) return;
      run();
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, []);
}

// ── رسالة التحفيز بعد الإدخال، وتذكير المتأخرة ──
// للمشرفات والمعلمات اللواتي يُدخلن البيانات فقط
const ENTRY_ROLES = ["supervisor", "teacher"];
function readLS(key: string): string | null { try { return localStorage.getItem(key); } catch { return null; } }
function writeLS(key: string, v: string) { try { localStorage.setItem(key, v); } catch { /* المتصفح يمنع التخزين */ } }

async function fetchToday(): Promise<{ missing?: number; date?: string } | null> {
  try {
    const r = await fetch("/api/today-summary", { headers: { Authorization: `Bearer ${getToken()}` } });
    return r.ok ? r.json() : null;
  } catch { return null; }
}

function EntryMotivation({ role, name }: { role: string; name: string }) {
  const qc = useQueryClient();
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!ENTRY_ROLES.includes(role)) return;
    let timer = 0;
    const onSaved = async () => {
      qc.invalidateQueries({ queryKey: ["todaySummary"] });
      const t = await fetchToday();
      if (!t || t.missing == null) return;
      const now = Date.now();
      // اكتمال اليوم: مرة واحدة في اليوم. وما دون ذلك: مرة كل ١٥ دقيقة على الأكثر (لا تزعج بعد كل طالبة)
      if (t.missing === 0) {
        if (readLS("motivation-complete") === t.date) return;
        writeLS("motivation-complete", t.date ?? "");
      } else {
        const last = Number(readLS("motivation-partial") ?? 0);
        if (now - last < 15 * 60 * 1000) return;
        writeLS("motivation-partial", String(now));
      }
      setMsg(motivationMessage({ missing: t.missing, late: isLateEntryNow(), name }));
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setMsg(null), 9000);
    };
    window.addEventListener("sana:entry-saved", onSaved);
    return () => { window.removeEventListener("sana:entry-saved", onSaved); window.clearTimeout(timer); };
  }, [role, name, qc]);
  if (!msg) return null;
  return (
    <div className="fixed z-50 inset-x-3 bottom-20 md:bottom-6 md:left-6 md:right-auto md:max-w-sm" role="status" aria-live="polite">
      <div className="rounded-2xl shadow-xl border border-primary/15 bg-card p-4 pr-5 flex gap-3 items-start animate-in fade-in slide-in-from-bottom-4">
        <span className="w-1.5 self-stretch rounded-full bg-gradient-to-b from-[#1A2260] to-[#2B3784]" />
        <p className="flex-1 text-sm font-semibold leading-7">{msg}</p>
        <button type="button" onClick={() => setMsg(null)} className="text-muted-foreground text-lg leading-none" aria-label="إغلاق">×</button>
      </div>
    </div>
  );
}

/** تذكير لطيف في كل الصفحات من التاسعة حتى الثانية عشرة ليلًا (موعد انتهاء الإدخال) بتوقيت مكة (يُخفى لليوم بضغطة) */
function LateReminder({ role, name }: { role: string; name: string }) {
  const [, force] = useState(0);
  const makkahHour = new Date(Date.now() + 3 * 3600 * 1000).getUTCHours();
  const evening = makkahHour >= 21;
  const { data } = useQuery({
    queryKey: ["todaySummary"],
    enabled: ["supervisor", "teacher"].includes(role) && evening,
    staleTime: 30 * 1000,
    queryFn: async () => (await fetchToday()) ?? { items: [] },
  });
  const t = data as { missing?: number; date?: string } | undefined;
  if (!evening || !t?.missing || readLS("late-reminder-hidden") === t.date) return null;
  const first = name.trim().split(/\s+/)[0] || "قمرة";
  const hoursLeft = 24 - makkahHour;
  return (
    <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 px-4 py-3 flex items-center gap-3 text-sm">
      <span className="flex-1 font-semibold text-amber-900 dark:text-amber-200">
        حبيبتنا {first}! باقي {t.missing.toLocaleString("ar-EG")} {t.missing >= 3 && t.missing <= 10 ? "طالبات" : "طالبة"} بلا إدخال، و{hoursLeft <= 1 ? "بقي أقل من ساعة" : `بقي نحو ${hoursLeft.toLocaleString("ar-EG")} ساعات`} قبل الثانية عشرة، أعانكِ الله 🌿
      </span>
      <Link href="/data-entry" className="rounded-xl bg-amber-600 text-white px-3 py-1.5 text-xs font-bold whitespace-nowrap">أدخلي الآن</Link>
      <button type="button" onClick={() => { writeLS("late-reminder-hidden", t.date ?? ""); force((x) => x + 1); }} className="text-amber-800/70 text-lg leading-none" aria-label="إخفاء لليوم">×</button>
    </div>
  );
}

// ── «المطلوب اليوم» أعلى الصفحة الرئيسية ──
const TODAY_ROLES = ["leader", "deputy", "track_supervisor", "teacher", "supervisor"];
function TodayBar({ role }: { role: string }) {
  const { data } = useQuery({
    queryKey: ["todaySummary"],
    enabled: TODAY_ROLES.includes(role),
    staleTime: 30 * 1000,
    queryFn: async () => {
      const r = await fetch("/api/today-summary", { headers: { Authorization: `Bearer ${getToken()}` } });
      if (!r.ok) return { items: [] as Array<{ tone: "ok" | "warn"; text: string; href?: string }> };
      return r.json() as Promise<{ items: Array<{ tone: "ok" | "warn"; text: string; href?: string }> }>;
    },
  });
  const items = data?.items ?? [];
  if (items.length === 0) return null;
  return (
    <div className="mb-4 rounded-2xl border border-primary/15 bg-card shadow-sm overflow-hidden" role="status">
      <p className="px-4 pt-3 pb-1 text-xs font-bold text-primary">المطلوب اليوم</p>
      <ul className="divide-y divide-border">
        {items.map((it, i) => {
          const body = (
            <span className="flex items-center gap-2.5 px-4 py-2.5 text-sm font-semibold">
              <span className={`w-2 h-2 rounded-full flex-none ${it.tone === "ok" ? "bg-emerald-500" : "bg-amber-500"}`} />
              <span className="flex-1">{it.text}</span>
              {it.href && <span className="text-muted-foreground text-xs">←</span>}
            </span>
          );
          return <li key={i}>{it.href ? <Link href={it.href} className="block hover:bg-muted/40">{body}</Link> : body}</li>;
        })}
      </ul>
    </div>
  );
}

function NewsTicker() {
  const { data: banner } = useGetTodayBanner({ query: { queryKey: ["todayBanner"] } });

  const achievement = banner?.achievement ?? [];
  const fullAttendance = banner?.leastAbsent ?? [];

  const achievementText = achievement.length > 0
    ? achievement
        .map(item => `${item.circleName} (${item.track}) — ${item.totalPages.toString().replace(".", ",")} وجه`)
        .join("   ✦   ")
    : "لا توجد بيانات إنجاز لليوم بعد";

  const attendanceText = fullAttendance.length > 0
    ? fullAttendance
        .map(item => `${item.circleName} (${item.track}) — ${item.presentCount} طالبة`)
        .join("   ✦   ")
    : "لا توجد حلقات بحضور كامل بعد";

  return (
    <div data-testid="news-ticker">
      <div className="text-white py-1.5 overflow-hidden relative"
        style={{ background: "linear-gradient(90deg,  #1A2260 0%, #2B3784 100%)" }}
      >
        <div className="flex items-center gap-3 px-4">
          <div className="flex-shrink-0 bg-white/20 rounded-full px-2.5 py-0.5 text-xs font-bold whitespace-nowrap">
            🏆 الأكثر إنجازًا
          </div>
          <div className="flex-1 overflow-hidden">
            <div className={achievement.length > 0 ? "ticker-scroll text-xs font-medium" : "text-xs font-medium opacity-70"}>
              {achievement.length > 0 ? `${achievementText}   ✦   ${achievementText}` : achievementText}
            </div>
          </div>
        </div>
      </div>
      <div className="text-white py-1.5 overflow-hidden relative"
        style={{ background: "linear-gradient(90deg,  #2B3784 0%, #1A2260 100%)" }}
      >
        <div className="flex items-center gap-3 px-4">
          <div className="flex-shrink-0 bg-white/20 rounded-full px-2.5 py-0.5 text-xs font-bold whitespace-nowrap">
            ✅ أكثر حضورًا
          </div>
          <div className="flex-1 overflow-hidden">
            <div className={fullAttendance.length > 0 ? "ticker-scroll text-xs font-medium" : "text-xs font-medium opacity-70"}>
              {fullAttendance.length > 0 ? `${attendanceText}   ✦   ${attendanceText}` : attendanceText}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const SEARCH_ROLES = ["leader", "track_supervisor"];

function StudentSearch({ onNavigate }: { onNavigate: (path: string) => void }) {
  const [query, setQuery] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  const { data: results } = useListStudents(
    debouncedQ.length >= 2 ? { q: debouncedQ } : {},
    { query: { queryKey: ["studentSearch", debouncedQ], enabled: debouncedQ.length >= 2 } }
  );

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const showResults = open && debouncedQ.length >= 2 && results && results.length > 0;

  return (
    <div ref={wrapperRef} className="relative mx-4 mb-2">
      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/40 pointer-events-none" />
        <input
          type="text"
          placeholder="بحث عن طالبة..."
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          className="w-full bg-white/10 text-white placeholder-white/40 text-sm rounded-xl pr-9 pl-3 py-2 border border-white/10 focus:outline-none focus:border-white/30 focus:bg-white/15 transition-colors"
          dir="rtl"
        />
        {query && (
          <button
            onClick={() => { setQuery(""); setDebouncedQ(""); setOpen(false); }}
            className="absolute left-2 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>
      {showResults && (
        <div className="absolute top-full right-0 left-0 mt-1 bg-white rounded-xl shadow-xl z-50 overflow-hidden max-h-64 overflow-y-auto">
          {results!.slice(0, 6).map(s => (
            <button
              key={s.id}
              onClick={() => {
                onNavigate(`/students/${s.id}`);
                setQuery("");
                setOpen(false);
              }}
              className="w-full text-right px-3 py-2.5 hover:bg-muted/60 transition-colors border-b border-border/40 last:border-0"
            >
              <p className="text-sm font-medium text-foreground">{s.fullName}</p>
            </button>
          ))}
        </div>
      )}
      {open && debouncedQ.length >= 2 && results && results.length === 0 && (
        <div className="absolute top-full right-0 left-0 mt-1 bg-white rounded-xl shadow-xl z-50 px-3 py-3 text-xs text-muted-foreground text-center">
          لا توجد نتائج
        </div>
      )}
    </div>
  );
}

const ALERT_ROLES = ["leader", "deputy", "track_supervisor"];

function useLowMemorizationAlerts(userId: number, role: string) {
  const [alerts, setAlerts] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const enabled = ALERT_ROLES.includes(role);

  const fetchAlerts = () => {
    if (!enabled) return;
    const token = getToken();
    if (!token) return;
    const base = import.meta.env.BASE_URL.replace(/\/$/, "");
    fetch(`${base}/api/alerts/low-memorization`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : [])
      .then(setAlerts)
      .catch(() => {});
  };

  useEffect(() => {
    fetchAlerts();
    const t = setInterval(fetchAlerts, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, [userId, role, enabled]);

  const markAllRead = async () => {
    const token = getToken();
    if (!token) return;
    const base = import.meta.env.BASE_URL.replace(/\/$/, "");
    await fetch(`${base}/api/alerts/low-memorization/read-all`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}` },
    });
    setAlerts([]);
    setOpen(false);
  };

  const markOneRead = async (id: number) => {
    const token = getToken();
    if (!token) return;
    const base = import.meta.env.BASE_URL.replace(/\/$/, "");
    await fetch(`${base}/api/alerts/low-memorization/${id}/read`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}` },
    });
    setAlerts(prev => prev.filter(a => a.id !== id));
  };

  return { alerts, open, setOpen, markAllRead, markOneRead, enabled };
}

function LowMemorizationAlertBell({ userId, role }: { userId: number; role: string }) {
  const { alerts, open, setOpen, markAllRead, markOneRead, enabled } = useLowMemorizationAlerts(userId, role);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  if (!enabled) return null;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="relative flex items-center justify-center w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 transition-colors"
        title="تنبيهات قلة الحفظ"
      >
        <Bell className="w-4 h-4 text-white/80" />
        {alerts.length > 0 && (
          <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[11px] font-bold rounded-full min-w-[16px] h-[16px] flex items-center justify-center px-0.5 leading-none">
            {alerts.length > 99 ? "99+" : alerts.length}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-2 w-80 bg-white rounded-2xl shadow-2xl z-50 overflow-hidden border border-border"
          style={{ right: "auto" }}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-rose-50">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600" />
              <span className="font-bold text-sm text-rose-800">تنبيهات قلة الحفظ</span>
              {alerts.length > 0 && (
                <span className="bg-rose-500 text-white text-[11px] font-bold rounded-full px-1.5 py-0.5 leading-none">
                  {alerts.length}
                </span>
              )}
            </div>
            {alerts.length > 0 && (
              <button
                onClick={markAllRead}
                className="flex items-center gap-1 text-xs text-rose-600 hover:text-rose-800 font-medium"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                قراءة الكل
              </button>
            )}
          </div>
          <div className="max-h-72 overflow-y-auto">
            {alerts.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                لا توجد تنبيهات حالية
              </div>
            ) : (
              <div className="divide-y divide-border">
                {alerts.slice(0, 15).map((a: any) => (
                  <div key={a.id} className="px-4 py-3 hover:bg-muted/30 transition-colors">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-sm text-foreground truncate">{a.studentName}</p>
                        <p className="text-xs text-muted-foreground">{a.circleName} · {a.track}</p>
                        <p className="text-xs text-rose-600 font-medium mt-0.5">
                          {a.totalPages} وجه في آخر {a.periodDays} يومًا
                        </p>
                      </div>
                      <button
                        onClick={() => markOneRead(a.id)}
                        className="text-muted-foreground hover:text-foreground shrink-0 mt-0.5"
                        title="تعليم كمقروء"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const MESSAGE_ROLES = ["student", "teacher", "supervisor", "track_supervisor"];

function formatDateShort(iso: string) {
  return new Date(iso).toLocaleDateString("ar-SA", { month: "short", day: "numeric" });
}

function NewMessagesModal({ userId, role, navigate }: {
  userId: number; role: string; navigate: (p: string) => void;
}) {
  const enabled = MESSAGE_ROLES.includes(role);
  const { data: messages } = useGetMyMessages({ query: { queryKey: ["myMessages"], enabled } });
  const [open, setOpen] = useState(false);

  const sessionKey = `msgs_modal_${userId}`;
  const seenKey = `msgs_seen_${userId}`;

  useEffect(() => {
    if (!enabled || !messages || messages.length === 0) return;
    // Show modal only once per session if there are unread messages
    const shownThisSession = sessionStorage.getItem(sessionKey);
    if (shownThisSession) return;
    const lastSeen = localStorage.getItem(seenKey);
    const hasUnread = !lastSeen || messages.some(m => m.createdAt > lastSeen);
    if (hasUnread) {
      setOpen(true);
      sessionStorage.setItem(sessionKey, "1");
    }
  }, [messages, enabled, sessionKey, seenKey]);

  const handleClose = () => {
    localStorage.setItem(seenKey, new Date().toISOString());
    setOpen(false);
  };

  const handleGoToMessages = () => {
    handleClose();
    navigate("/my-messages");
  };

  if (!enabled || !messages || messages.length === 0) return null;

  const lastSeen = localStorage.getItem(seenKey);
  const unread = messages.filter(m => !lastSeen || m.createdAt > lastSeen);
  const displayMsgs = unread.length > 0 ? unread : messages.slice(0, 2);

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) handleClose(); }}>
      <DialogContent className="max-w-sm" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-right flex items-center gap-2 text-primary">
            <MessageSquare className="w-5 h-5" />
            رسائل القائدة
            {unread.length > 0 && (
              <Badge className="bg-rose-500 text-white text-xs border-0 mr-auto">
                {unread.length} جديدة
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-2.5 py-1 max-h-72 overflow-y-auto">
          {displayMsgs.map(msg => (
            <div key={msg.id} className="bg-primary/5 rounded-xl px-3.5 py-3 border border-primary/10">
              <p className="text-sm text-foreground leading-relaxed">{msg.content}</p>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-xs text-muted-foreground">{formatDateShort(msg.createdAt)}</span>
                {msg.expiresAt && (
                  <span className="text-xs text-amber-600 flex items-center gap-1 mr-auto">
                    <Clock className="w-3 h-3" />
                    تنتهي {formatDateShort(msg.expiresAt)}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
        <DialogFooter className="gap-2 flex-row-reverse sm:flex-row-reverse">
          <Button
            className="flex-1 gap-1.5"
            onClick={handleGoToMessages}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            كل الرسائل
          </Button>
          <Button variant="outline" onClick={handleClose} className="flex-1">
            حسنًا
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const BADGE_ROLES = ["student", "teacher", "supervisor", "track_supervisor"];

function useUnreadMessageCount(userId: number, role: string, isHome: boolean, isMessagesPage: boolean) {
  const enabled = BADGE_ROLES.includes(role);
  const { data: messages } = useGetMyMessages({
    query: { queryKey: ["myMessages"], enabled, refetchInterval: 5 * 60 * 1000 },
  });

  const storageKey = `msgs_seen_${userId}`;

  useEffect(() => {
    if ((isHome || isMessagesPage) && enabled) {
      localStorage.setItem(storageKey, new Date().toISOString());
    }
  }, [isHome, isMessagesPage, enabled, storageKey]);

  return useMemo(() => {
    if (!enabled || !messages) return 0;
    const lastSeen = localStorage.getItem(storageKey);
    if (!lastSeen) return messages.length;
    return messages.filter(m => m.createdAt > lastSeen).length;
  }, [messages, enabled, storageKey]);
}

export default function Layout({ user, children }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const queryClient = useQueryClient();
  const logout = useLogout();
  const [location, setLocation] = useLocation();
  useMobileTableLabels();
  // في الجوال: إغلاق القائمة بعد الانتقال لصفحة
  useEffect(() => { setSidebarOpen(false); }, [location]);
  const allAccounts = useMyAccounts(user.id);
  const currentAccount = allAccounts.find(a => a.isCurrent);
  const otherAccounts = allAccounts.filter(a => !a.isCurrent);

  const isHome = location === "/";
  const isMessagesPage = location === "/my-messages";
  const unreadCount = useUnreadMessageCount(user.id, user.role, isHome, isMessagesPage);

  const handleLogout = () => {
    clearAuth();
    queryClient.clear();
    logout.mutate(undefined);
    setLocation("/login");
  };

  // تبديل الحساب: يحصل على token جديد للحساب المختار ثم يُعيد تحميل الصفحة
  const handleSwitchAccount = async (targetUserId: number) => {
    if (switching) return;
    setSwitching(true);
    try {
      const token = getToken();
      const res = await fetch("/api/auth/switch-account", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ targetUserId }),
      });
      if (!res.ok) throw new Error("switch failed");
      const data = await res.json();
      if (data.token) {
        setToken(data.token);
        queryClient.clear();
        window.location.assign("/");
      }
    } catch {
      setSwitching(false);
    }
  };

  const navItems = getNavItems(user.role, unreadCount, user.track, (user as any).circleDataEntryType);

  return (
    <div className="min-h-screen sana-main-background flex flex-col" dir="rtl">
      {/* Messages popup on login */}
      <NewMessagesModal userId={user.id} role={user.role} navigate={(p) => { setLocation(p); setSidebarOpen(false); }} />

      {/* News Ticker */}
      <NewsTicker />

      <div className="flex flex-1">
        {/* Sidebar */}
        <aside
          className={`fixed inset-y-0 right-0 top-0 z-50 w-72 flex flex-col transition-transform duration-300 md:relative md:translate-x-0 ${
            sidebarOpen ? "translate-x-0" : "translate-x-full md:translate-x-0"
          }`}
          style={{
            background: "linear-gradient(180deg,  #1A2260 0%, #232D73 50%, #2B3784 100%)"
          }}
        >
          {/* Logo */}
          <div className="p-5 border-b border-white/10">
            <div className="text-center">
              <div className="w-24 h-24 rounded-2xl bg-white flex items-center justify-center mx-auto mb-3 shadow-lg overflow-hidden">
                <img src={logoUrl} alt={`شعار ${BRAND}`} className="w-full h-full object-contain" />
              </div>
              <h1 className="text-white font-bold text-lg leading-tight">{BRAND}</h1>
              <p className="text-white/60 text-xs mt-1">نظام إدارة المقرأة</p>
            </div>
          </div>

          {/* User info + account switcher */}
          <div className="px-4 py-4 border-b border-white/10">
            {/* Current account card */}
            <div className="bg-white/10 rounded-xl p-3">
              <p className="text-white font-semibold text-sm truncate">{user.name}</p>
              <p className="text-white/60 text-xs mt-0.5">{getRoleLabel(user.role)}</p>
              {currentAccount?.circleName && (
                <p className="text-white/50 text-[12px] mt-0.5 truncate">{currentAccount.circleName}</p>
              )}
              {user.track && (
                <Badge className="mt-1 bg-white/20 text-white text-xs border-0">
                  مسار {user.track}
                </Badge>
              )}
            </div>

            {/* Other accounts */}
            {otherAccounts.length > 0 && (
              <div className="mt-2.5">
                <div className="flex items-center gap-1.5 px-1 mb-1.5">
                  <ArrowLeftRight className="w-3 h-3 text-white/40" />
                  <p className="text-white/40 text-[11px] font-medium">تبديل الحساب</p>
                </div>
                <div className="space-y-1">
                  {otherAccounts.map(acc => (
                    <button
                      key={acc.id}
                      onClick={() => handleSwitchAccount(acc.id)}
                      disabled={switching}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-white/70 hover:bg-white/10 hover:text-white transition-all duration-200 disabled:opacity-50 disabled:cursor-wait"
                    >
                      <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                        {switching
                          ? <Loader2 className="w-3.5 h-3.5 text-white animate-spin" />
                          : <span className="text-xs font-bold text-white leading-none">{acc.name.charAt(0)}</span>
                        }
                      </div>
                      <div className="text-right flex-1 min-w-0">
                        <p className="text-sm font-medium text-white/90 truncate leading-tight">{acc.name}</p>
                        <p className="text-white/50 text-[12px] leading-tight">
                          {acc.circleName ?? acc.roleLabel}{acc.track ? ` — ${acc.track}` : ""}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Alert Bell — leader, deputy, track_supervisor */}
          {ALERT_ROLES.includes(user.role) && (
            <div className="px-4 pt-2 pb-1 flex items-center gap-2">
              <LowMemorizationAlertBell userId={user.id} role={user.role} />
              <span className="text-white/50 text-xs">تنبيهات قلة الحفظ</span>
            </div>
          )}

          {/* Student Search — leader & track_supervisor only */}
          {SEARCH_ROLES.includes(user.role) && (
            <div className="pt-3 pb-1">
              <StudentSearch onNavigate={(path) => { setLocation(path); setSidebarOpen(false); }} />
            </div>
          )}

          {/* Navigation */}
          <nav className="flex-1 p-4 overflow-y-auto space-y-1">
            {GROUPED_ROLES.includes(user.role)
              ? <GroupedNav items={navItems} />
              : navItems.map(item => <NavLink key={item.href} {...item} />)}
          </nav>

          {/* Dark mode toggle + Logout */}
          <div className="p-4 border-t border-white/10 space-y-1">
            <DarkModeToggle />
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-white/70 hover:bg-white/10 hover:text-white transition-all duration-200 text-sm font-semibold"
              data-testid="button-logout"
            >
              <LogOut className="w-4 h-4" />
              <span>تسجيل الخروج</span>
            </button>
          </div>
        </aside>

        {/* Mobile overlay */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-40 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Main content */}
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Mobile header */}
          <header className="md:hidden bg-white border-b border-border px-4 py-3 flex items-center justify-between shadow-sm">
            <h1 className="text-primary font-bold text-base">{BRAND}</h1>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              data-testid="button-menu"
            >
              {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </Button>
          </header>

          <div className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
            <LateReminder role={user.role} name={user.name ?? ""} />
            {isHome && <TodayBar role={user.role} />}
            {children}
          </div>
          <footer className="text-center py-3 px-4 pb-24 md:pb-3 text-xs text-muted-foreground border-t border-border bg-background/50">
            جميع الحقوق محفوظة لـ{BRAND} &copy; {new Date().getFullYear()}
          </footer>
          <BottomNav role={user.role} items={navItems} onMore={() => setSidebarOpen(true)} />
          <EntryMotivation role={user.role} name={user.name ?? ""} />
        </main>
      </div>
    </div>
  );
}


function DarkModeToggle() {
  const { isDark, toggleDark } = useTheme();
  return (
    <button
      onClick={toggleDark}
      className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-white/70 hover:bg-white/10 hover:text-white transition-all duration-200 text-sm font-semibold"
      title={isDark ? "الوضع النهاري" : "الوضع الليلي"}
    >
      {isDark
        ? <Sun className="w-4 h-4" />
        : <Moon className="w-4 h-4" />
      }
      <span>{isDark ? "الوضع النهاري" : "الوضع الليلي"}</span>
    </button>
  );
}

function getRoleLabel(role: string): string {
  const labels: Record<string, string> = {
    leader: "القائدة",
    deputy: "النائبة",
    data_entry: "مُدخلة بيانات",
    teacher: "معلمة",
    supervisor: "مشرفة",
    student: "طالبة",
    track_supervisor: "مسؤولة مسار",
    exam_supervisor: "مسؤولة الاختبارات",
    volunteer: "متطوعة",
  };
  return labels[role] ?? role;
}

type NavItem = { href: string; label: string; icon: React.ElementType; badge?: number; feature?: string };

function filterNav(items: NavItem[]): NavItem[] {
  return items.filter(item => !item.feature || isFeatureEnabled(item.feature));
}

function getNavItems(role: string, unreadCount = 0, track?: string | null, circleDataEntryType?: string | null): NavItem[] {
  const hideShortcomings  = shouldHideShortcomings(track, circleDataEntryType);

  if (role === "leader") {
    return filterNav([
      { href: "/", label: "الرئيسية", icon: Home },
      { href: "/review-plans-overview", label: "خطط المراجعة", icon: BookOpen },
      { href: "/certificates", label: "الشهادات الفصلية", icon: CertificateIcon },
      { href: "/data-entry-status", label: "المدخلات", icon: ClipboardList },
      { href: "/supervisor-hours", label: "ساعات عمل مسؤولات المسار", icon: Clock },
      { href: "/accounts", label: "الحسابات", icon: UserCheck },
      { href: "/statistics", label: "الإحصائيات", icon: BarChart3, feature: "stats_general" },
      { href: "/attendance", label: "الغيابات", icon: CalendarCheck },
      { href: "/weekly-absence-groups", label: "غياب الحلقات الأسبوعي", icon: CalendarCheck },
      { href: "/monthly-report", label: "تقرير الحضور", icon: BarChart2, feature: "stats_monthly" },
      { href: "/archived-students", label: "المؤرشفات", icon: Archive },
      { href: "/circles", label: "الحلقات", icon: Users },
      { href: "/manage-tracks", label: "المسارات والحلقات", icon: Layers },
      { href: "/leader-tasks", label: "متابعة المهام اليومية", icon: ClipboardList },
      { href: "/deputy-board", label: "مهام النائبة", icon: ClipboardList, feature: "deputy_tasks" },
      { href: "/volunteer", label: "الاختبارات", icon: GraduationCap, feature: "exam" },
      { href: "/teacher-rotation", label: "شقلبة المعلمات", icon: Shuffle, feature: "teacher_rotation" },
      { href: "/badges", label: "الأوسمة", icon: Award, feature: "badges" },
      { href: "/badge-entitlements", label: "مستحقات الأوسمة", icon: Award, feature: "badges" },
      { href: "/calendar", label: "التقويم", icon: Calendar, feature: "calendar" },
      { href: "/shortcomings", label: "التقصير", icon: AlertTriangle, feature: "shortcomings" },
      { href: "/stumbling-stats", label: "إحصائيات التعثر", icon: AlertTriangle, feature: "stats_stumbling" },
      { href: "/store-manage", label: "المتجر", icon: ShoppingBag, feature: "store" },
      { href: "/messages", label: "الرسائل", icon: MessageSquare, feature: "messages" },
      { href: "/registration", label: "التسجيل", icon: PenSquare, feature: "registration" },
      { href: "/pending-registrations", label: "طلبات التسجيل", icon: ClipboardList, feature: "registration" },
      { href: "/registration-students", label: "طالبات قائمة التسجيل", icon: Users, feature: "registration" },
      { href: "/onboard", label: "إضافة عضو مباشرة", icon: BookUser },
      { href: "/student-leaves", label: "طالبات الإجازة", icon: PlaneTakeoff, feature: "leaves" },
      { href: "/reports", label: "التقارير الأسبوعية", icon: TrendingUp, feature: "stats_weekly" },
      { href: "/white-label", label: "نسخ للبيع", icon: Globe },
      { href: "/circles-staffing", label: "توزيع المعلمات والمشرفات", icon: UserX },
      { href: "/unlinked-staff", label: "موظفات غير مرتبطات", icon: UserX },
      { href: "/unlinked-students", label: "طالبات بدون حلقة", icon: UserX },
      { href: "/archived-staff", label: "الموظفات المؤرشفات", icon: Archive },
      { href: "/db-settings", label: "إعدادات قاعدة البيانات", icon: Database },
      { href: "/audit-log", label: "سجل التعديلات", icon: Clock },
      { href: "/duplicate-students", label: "الحسابات المكررة", icon: Users },
      { href: "/transfer-requests", label: "طلبات النقل", icon: MoveRight },
      { href: "/export", label: "تصدير البيانات", icon: FileDown },
    ]);
  }
  if (role === "deputy") {
    return filterNav([
      { href: "/", label: "الرئيسية", icon: Home },
      { href: "/review-plans-overview", label: "خطط المراجعة", icon: BookOpen },
      { href: "/certificates", label: "الشهادات الفصلية", icon: CertificateIcon },
      { href: "/data-entry-status", label: "المدخلات", icon: ClipboardList },
      { href: "/accounts", label: "الحسابات", icon: UserCheck },
      { href: "/statistics", label: "الإحصائيات", icon: BarChart3, feature: "stats_general" },
      { href: "/attendance", label: "الغيابات", icon: CalendarCheck },
      { href: "/weekly-absence-groups", label: "غياب الحلقات الأسبوعي", icon: CalendarCheck },
      { href: "/monthly-report", label: "تقرير الحضور", icon: BarChart2, feature: "stats_monthly" },
      { href: "/archived-students", label: "المؤرشفات", icon: Archive },
      { href: "/deputy-circles", label: "الحلقات", icon: Users },
      { href: "/manage-tracks", label: "المسارات والحلقات", icon: Layers },
      { href: "/leader-tasks", label: "متابعة المهام اليومية", icon: ClipboardList },
      { href: "/volunteer", label: "الاختبارات", icon: GraduationCap, feature: "exam" },
      { href: "/teacher-rotation", label: "شقلبة المعلمات", icon: Shuffle, feature: "teacher_rotation" },
      { href: "/badges", label: "الأوسمة", icon: Award, feature: "badges" },
      { href: "/badge-entitlements", label: "مستحقات الأوسمة", icon: Award, feature: "badges" },
      { href: "/calendar", label: "التقويم", icon: Calendar, feature: "calendar" },
      { href: "/shortcomings", label: "التقصير", icon: AlertTriangle, feature: "shortcomings" },
      { href: "/stumbling-stats", label: "إحصائيات التعثر", icon: AlertTriangle, feature: "stats_stumbling" },
      { href: "/messages", label: "الرسائل", icon: MessageSquare, feature: "messages" },
      { href: "/registration", label: "التسجيل", icon: PenSquare, feature: "registration" },
      { href: "/pending-registrations", label: "طلبات التسجيل", icon: ClipboardList, feature: "registration" },
      { href: "/registration-students", label: "طالبات قائمة التسجيل", icon: Users, feature: "registration" },
      { href: "/onboard", label: "إضافة عضو مباشرة", icon: BookUser },
      { href: "/export", label: "تصدير البيانات", icon: FileDown },
      { href: "/student-leaves", label: "طالبات الإجازة", icon: PlaneTakeoff, feature: "leaves" },
      { href: "/deputy-tasks", label: "مهامي", icon: ClipboardList, feature: "deputy_tasks" },
      { href: "/reports", label: "التقارير الأسبوعية", icon: TrendingUp, feature: "stats_weekly" },
      { href: "/circles-staffing", label: "توزيع المعلمات والمشرفات", icon: UserX },
      { href: "/unlinked-staff", label: "موظفات غير مرتبطات", icon: UserX },
      { href: "/unlinked-students", label: "طالبات بدون حلقة", icon: UserX },
      { href: "/duplicate-students", label: "الحسابات المكررة", icon: Users },
      { href: "/transfer-requests", label: "طلبات النقل", icon: MoveRight },
      { href: "/archived-staff", label: "الموظفات المؤرشفات", icon: Archive },
    ]);
  }
  if (role === "data_entry") {
    return filterNav([
      { href: "/", label: "إدخال البيانات", icon: PenSquare },
      { href: "/calendar", label: "التقويم", icon: Calendar, feature: "calendar" },
    ]);
  }
  if (role === "teacher" || role === "supervisor") {
    // مطابقة تامة لقاعدة الصلاحية في السيرفر (records.ts → allowedDataEntryRole):
    // حلقات الأمهات والأطفال → المعلمة هي من تُدخل البيانات.
    // بقية الحلقات (فتيات/تصحيح/تثبيت...) → المشرفة هي من تُدخل البيانات.
    const teacherOwnsDataEntry = circleDataEntryType === "children" || circleDataEntryType === "mothers";
    const canSelfEnterData =
      (role === "supervisor" && !teacherOwnsDataEntry) || (role === "teacher" && teacherOwnsDataEntry);
    return filterNav([
      { href: "/", label: "حلقتي", icon: Users },
      ...(canSelfEnterData ? [{ href: "/data-entry", label: "إدخال البيانات", icon: PenSquare }] : []),
      ...(canSelfEnterData ? [{ href: "/whatsapp-entry", label: "إدخال من الواتساب", icon: ClipboardPaste }] : []),
      { href: "/review-plans-overview", label: "خطط المراجعة", icon: BookOpen },
      { href: "/statistics", label: "الإحصائيات", icon: BarChart3, feature: "stats_general" },
      ...(!hideShortcomings ? [{ href: "/shortcomings", label: "التقصير", icon: AlertTriangle, feature: "shortcomings" }] : []),
      { href: "/badges", label: "أوسمتي", icon: Award, feature: "badges" },
      { href: "/calendar", label: "التقويم", icon: Calendar, feature: "calendar" },
      { href: "/my-messages", label: "رسائلي", icon: MessageSquare, badge: unreadCount, feature: "messages" },
    ]);
  }
  if (role === "student") {
    return filterNav([
      { href: "/", label: "تقدمي", icon: BarChart3 },
      { href: "/attendance", label: "غياباتي", icon: CalendarCheck },
      { href: "/shortcomings", label: "تقصيري", icon: AlertTriangle, feature: "shortcomings" },
      { href: "/review-plans-overview", label: "الخطط", icon: BookOpen },
      { href: "/my-certificate", label: "شهادتي الفصلية", icon: CertificateIcon },
      { href: "/statistics", label: "إحصائياتي", icon: BarChart3, feature: "stats_general" },
      { href: "/badges", label: "أوسمتي", icon: Award, feature: "badges" },
      { href: "/calendar", label: "التقويم", icon: Calendar, feature: "calendar" },
      { href: "/my-messages", label: "رسائلي", icon: MessageSquare, badge: unreadCount, feature: "messages" },
      { href: "/audio", label: "صوتيات المصحف", icon: Headphones, feature: "audio" },
    ]);
  }
  if (role === "track_supervisor") {
    return filterNav([
      { href: "/", label: "مساري", icon: Users },
      { href: "/data-entry", label: "إدخال البيانات", icon: PenSquare },
      { href: "/whatsapp-entry", label: "إدخال من الواتساب", icon: ClipboardPaste },
      { href: "/review-plans-overview", label: "خطط المراجعة", icon: BookOpen },
      { href: "/certificates", label: "الشهادات الفصلية", icon: CertificateIcon },
      { href: "/circles", label: "الحلقات", icon: BookOpen },
      { href: "/accounts", label: "الحسابات", icon: UserCheck },
      { href: "/circles-staffing", label: "توزيع المعلمات والمشرفات", icon: UserX },
      { href: "/transfer-requests", label: "طلبات النقل", icon: MoveRight },
      { href: "/track-report", label: "ملخص المسار", icon: BarChart2 },
      { href: "/distinguished-students", label: "المتميزات", icon: Star },
      { href: "/track-entry-status", label: "حالة إدخال البيانات", icon: CheckCheck },
      { href: "/daily-tasks", label: "المهام اليومية", icon: ClipboardList },
      { href: "/statistics", label: "الإحصائيات", icon: BarChart3, feature: "stats_general" },
      { href: "/attendance", label: "الغيابات", icon: CalendarCheck },
      { href: "/monthly-report", label: "تقرير الحضور", icon: BarChart2, feature: "stats_monthly" },
      { href: "/archived-students", label: "المؤرشفات", icon: Archive },
      { href: "/badges", label: "الأوسمة", icon: Award, feature: "badges" },
      { href: "/badge-entitlements", label: "مستحقات الأوسمة", icon: Award, feature: "badges" },
      { href: "/calendar", label: "التقويم", icon: Calendar, feature: "calendar" },
      ...(!hideShortcomings ? [{ href: "/shortcomings", label: "التقصير", icon: AlertTriangle, feature: "shortcomings" }] : []),
      ...(!hideShortcomings ? [{ href: "/stumbling-stats", label: "إحصائيات التعثر", icon: AlertTriangle, feature: "stats_stumbling" }] : []),
      { href: "/messages", label: "الرسائل", icon: MessageSquare, feature: "messages" },
      { href: "/my-messages", label: "رسائلي", icon: MessageSquare, badge: unreadCount, feature: "messages" },
      { href: "/student-leaves", label: "طالبات الإجازة", icon: PlaneTakeoff, feature: "leaves" },
      { href: "/pending-registrations", label: "طلبات التسجيل", icon: ClipboardList, feature: "registration" },
      { href: "/registration-pool-search", label: "قائمة التسجيل", icon: UserSearch },
      { href: "/teacher-rotation", label: "شقلبة المعلمات", icon: Shuffle, feature: "teacher_rotation" },
      { href: "/export", label: "تصدير بيانات المسار", icon: FileDown },
    ]);
  }
  if (role === "volunteer") {
    return filterNav([
      { href: "/", label: "الاختبارات", icon: GraduationCap },
      { href: "/calendar", label: "التقويم", icon: Calendar, feature: "calendar" },
    ]);
  }
  if (role === "exam_supervisor") {
    return filterNav([
      { href: "/", label: "الاختبارات", icon: GraduationCap },
      { href: "/statistics", label: "الإحصائيات", icon: BarChart3, feature: "stats_general" },
      { href: "/calendar", label: "التقويم", icon: Calendar, feature: "calendar" },
    ]);
  }
  return [];
          }
