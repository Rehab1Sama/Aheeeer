// سجل التدقيق (للقائدة): من أضاف أو عدّل أو حذف، ومتى، وماذا.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getToken } from "@/lib/auth";
import { History, Search } from "lucide-react";

type Row = { id: number; userName: string | null; role: string | null; method: string; path: string; status: number; body: unknown; createdAt: string };

const AREAS: Array<[RegExp, string]> = [
  [/^\/records/, "سجلات الطالبات"], [/^\/review-plans/, "خطط المراجعة"], [/^\/students/, "الطالبات"],
  [/^\/users/, "الحسابات"], [/^\/circles/, "الحلقات"], [/^\/tracks/, "المسارات"], [/^\/certificate/, "الشهادات"],
  [/^\/daily-circle-tasks/, "المهام اليومية"], [/^\/supervisor-names/, "أسماء مسؤولات المسار"], [/^\/messages/, "الرسائل"],
  [/^\/(badge|live-badges)/, "الأوسمة"], [/^\/registration/, "التسجيل"], [/^\/custom-question/, "أسئلة الاستمارة"],
  [/^\/exam/, "الاختبارات"], [/^\/calendar/, "التقويم"], [/^\/store/, "المتجر"], [/^\/settings|^\/admin|^\/white-label/, "الإعدادات"],
  [/^\/deputy/, "مهام النائبة"], [/^\/data-entry/, "الإدخال"], [/^\/alerts/, "التنبيهات"], [/^\/track-supervisor/, "مسؤولات المسار"],
];
const ROLE: Record<string, string> = { leader: "القائدة", deputy: "النائبة", track_supervisor: "مسؤولة مسار", teacher: "معلمة", supervisor: "مشرفة", student: "طالبة", data_entry: "مُدخلة بيانات", volunteer: "متطوعة", exam_supervisor: "مسؤولة الاختبارات" };
const ACTION: Record<string, [string, string]> = {
  POST: ["إضافة", "bg-emerald-100 text-emerald-800"], PUT: ["تعديل", "bg-sky-100 text-sky-800"],
  PATCH: ["تعديل", "bg-sky-100 text-sky-800"], DELETE: ["حذف", "bg-rose-100 text-rose-800"],
};
const areaOf = (p: string) => AREAS.find(([r]) => r.test(p))?.[1] ?? "أخرى";
const fmt = (iso: string) => new Date(iso).toLocaleString("ar-SA", { timeZone: "Asia/Riyadh", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default function AuditLogPage() {
  const [q, setQ] = useState("");
  const [method, setMethod] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<number | null>(null);
  const params = new URLSearchParams({ limit: "100", offset: String(page * 100), ...(q ? { q } : {}), ...(method ? { method } : {}), ...(from ? { from } : {}), ...(to ? { to } : {}) });
  const { data = [], isLoading } = useQuery<Row[]>({
    queryKey: ["auditLogs", params.toString()],
    queryFn: async () => {
      const r = await fetch(`/api/audit-logs?${params}`, { headers: { Authorization: `Bearer ${getToken()}` } });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "تعذّر تحميل السجل");
      return r.json();
    },
  });

  return (
    <div className="max-w-5xl mx-auto space-y-5" dir="rtl">
      <header>
        <div className="flex items-center gap-2 text-primary text-sm font-bold mb-1"><History className="w-4 h-4" />الإعدادات والبيانات</div>
        <h1 className="text-2xl font-extrabold">سجل التعديلات</h1>
        <p className="text-muted-foreground text-sm mt-1">كل إضافة أو تعديل أو حذف تم في الموقع: من قامت به ومتى. يُحفظ ٦ أشهر.</p>
      </header>

      <div className="rounded-2xl border bg-card p-4 grid gap-3 sm:grid-cols-4">
        <label className="sm:col-span-2 relative">
          <Search className="w-4 h-4 absolute right-3 top-3 text-muted-foreground" />
          <input value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder="ابحثي في المسار، مثل records أو review-plans" className="w-full rounded-xl border bg-background pr-9 pl-3 py-2.5 text-sm" />
        </label>
        <select value={method} onChange={(e) => { setMethod(e.target.value); setPage(0); }} className="rounded-xl border bg-background px-3 py-2.5 text-sm">
          <option value="">كل العمليات</option><option value="POST">إضافة</option><option value="PATCH">تعديل</option><option value="PUT">تعديل (كامل)</option><option value="DELETE">حذف</option>
        </select>
        <div className="flex gap-2">
          <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(0); }} className="w-full rounded-xl border bg-background px-2 py-2.5 text-sm" aria-label="من تاريخ" />
          <input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(0); }} className="w-full rounded-xl border bg-background px-2 py-2.5 text-sm" aria-label="إلى تاريخ" />
        </div>
      </div>

      <div className="rounded-2xl border bg-card overflow-hidden">
        {isLoading ? (
          <div className="p-6 space-y-3">{[1, 2, 3, 4].map((i) => <div key={i} className="h-12 rounded-lg bg-muted animate-pulse" />)}</div>
        ) : data.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground"><History className="mx-auto mb-2 w-8 h-8 text-primary/40" /><p>لا توجد تعديلات مطابقة</p><p className="text-xs mt-1">يبدأ التسجيل من تاريخ تفعيل هذه الميزة</p></div>
        ) : (
          <ul className="divide-y">
            {data.map((r) => {
              const [label, cls] = ACTION[r.method] ?? [r.method, "bg-muted"];
              return (
                <li key={r.id}>
                  <button type="button" onClick={() => setOpen(open === r.id ? null : r.id)} className="w-full text-right px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-1 hover:bg-muted/30">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${cls}`}>{label}</span>
                    <span className="font-bold">{areaOf(r.path)}</span>
                    <span className="text-sm text-muted-foreground">{r.userName || "—"}{r.role ? ` · ${ROLE[r.role] ?? r.role}` : ""}</span>
                    <span className="mr-auto text-xs text-muted-foreground">{fmt(r.createdAt)}</span>
                  </button>
                  {open === r.id && (
                    <div className="px-4 pb-4 text-xs space-y-2">
                      <p className="text-muted-foreground font-mono" dir="ltr">{r.method} {r.path}</p>
                      {r.body != null && <pre className="rounded-xl bg-muted/50 p-3 overflow-x-auto whitespace-pre-wrap break-all" dir="ltr">{JSON.stringify(r.body, null, 2)}</pre>}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="flex justify-between">
        <button type="button" disabled={page === 0} onClick={() => setPage(page - 1)} className="rounded-xl border px-4 py-2 text-sm font-bold disabled:opacity-40">الأحدث</button>
        <button type="button" disabled={data.length < 100} onClick={() => setPage(page + 1)} className="rounded-xl border px-4 py-2 text-sm font-bold disabled:opacity-40">الأقدم</button>
      </div>
    </div>
  );
}
