// طلبات نقل الطالبات: القائدة والنائبة توافقان أو ترفضان، وبقية الأدوار ترى طلباتها.
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getToken } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Check, MoveRight, X } from "lucide-react";

type Req = { id: number; studentName: string | null; fromCircleName: string | null; toCircleName: string | null; requestedByName: string | null; decidedByName: string | null; note: string | null; decisionNote: string | null; status: string; createdAt: string; decidedAt: string | null };
const when = (iso: string) => new Date(iso).toLocaleString("ar-SA", { timeZone: "Asia/Riyadh", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const STATUS: Record<string, [string, string]> = { pending: ["بانتظار القرار", "bg-amber-100 text-amber-800"], approved: ["تمت الموافقة", "bg-emerald-100 text-emerald-800"], rejected: ["مرفوض", "bg-rose-100 text-rose-800"] };

export default function TransferRequestsPage({ canDecide }: { canDecide: boolean }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [tab, setTab] = useState<"pending" | "all">("pending");
  const [busy, setBusy] = useState<number | null>(null);
  const { data = [], isLoading } = useQuery<Req[]>({
    queryKey: ["transferRequests", tab],
    queryFn: async () => { const r = await fetch(`/api/transfer-requests?status=${tab}`, { headers: { Authorization: `Bearer ${getToken()}` } }); if (!r.ok) throw new Error("تعذّر تحميل الطلبات"); return r.json(); },
  });
  const decide = async (r: Req, approve: boolean) => {
    const note = approve ? null : window.prompt("سبب الرفض (يظهر لمن أرسلت الطلب):") ?? null;
    if (!approve && note === null) return;
    setBusy(r.id);
    try {
      const res = await fetch(`/api/transfer-requests/${r.id}/decide`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` }, body: JSON.stringify({ approve, note }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "تعذّر تنفيذ القرار");
      toast({ title: approve ? `نُقلت ${r.studentName ?? "الطالبة"} إلى ${r.toCircleName}` : "رُفض الطلب" });
      qc.invalidateQueries({ queryKey: ["transferRequests"] });
      qc.invalidateQueries({ queryKey: ["todaySummary"] });
    } catch (e: any) { toast({ title: "تعذّر التنفيذ", description: e.message, variant: "destructive" }); }
    finally { setBusy(null); }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-5" dir="rtl">
      <header>
        <div className="flex items-center gap-2 text-primary text-sm font-bold mb-1"><MoveRight className="w-4 h-4" />الطالبات</div>
        <h1 className="text-2xl font-extrabold">طلبات النقل</h1>
        <p className="text-muted-foreground text-sm mt-1">{canDecide ? "الطلبات التي أرسلتها المسؤولات لنقل طالبات لا يملكن صلاحية نقلهن. الموافقة تنقل الطالبة فورًا." : "طلبات النقل التي أرسلتِها وحالتها."}</p>
      </header>
      <div className="flex gap-2">
        {(["pending", "all"] as const).map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)} className={`rounded-xl px-4 py-2 text-sm font-bold border ${tab === t ? "bg-primary text-primary-foreground border-primary" : "bg-card"}`}>{t === "pending" ? "بانتظار القرار" : "كل الطلبات"}</button>
        ))}
      </div>
      {isLoading ? <div className="space-y-3">{[1, 2].map((i) => <div key={i} className="h-24 rounded-2xl bg-muted animate-pulse" />)}</div>
        : data.length === 0 ? <div className="rounded-2xl border bg-card py-14 text-center text-muted-foreground"><MoveRight className="mx-auto mb-2 w-8 h-8 text-primary/40" />لا توجد طلبات {tab === "pending" ? "بانتظار القرار" : ""}</div>
        : <ul className="space-y-3">{data.map((r) => {
          const [label, cls] = STATUS[r.status] ?? [r.status, "bg-muted"];
          return (
            <li key={r.id} className="rounded-2xl border bg-card p-4 space-y-2">
              <div className="flex flex-wrap items-center gap-2 justify-between">
                <b className="text-base">{r.studentName ?? "—"}</b>
                <span className={`text-xs rounded-full px-2.5 py-0.5 font-bold ${cls}`}>{label}</span>
              </div>
              <div className="flex items-center gap-2 text-sm"><span>{r.fromCircleName ?? "—"}</span><ArrowLeft className="w-4 h-4 text-primary" /><b className="text-primary">{r.toCircleName}</b></div>
              <p className="text-xs text-muted-foreground">من {r.requestedByName ?? "—"} · {when(r.createdAt)}</p>
              {r.note && <p className="text-sm rounded-xl bg-muted/50 px-3 py-2">{r.note}</p>}
              {r.status !== "pending" && <p className="text-xs text-muted-foreground">{r.status === "approved" ? "وافقت" : "رفضت"} {r.decidedByName ?? ""}{r.decidedAt ? ` · ${when(r.decidedAt)}` : ""}{r.decisionNote ? ` — ${r.decisionNote}` : ""}</p>}
              {canDecide && r.status === "pending" && (
                <div className="flex gap-2 pt-1">
                  <button type="button" disabled={busy !== null} onClick={() => decide(r, true)} className="flex-1 rounded-xl bg-primary text-primary-foreground py-2 text-sm font-bold flex items-center justify-center gap-1.5 disabled:opacity-50"><Check className="w-4 h-4" />{busy === r.id ? "جارٍ النقل…" : "موافقة ونقل"}</button>
                  <button type="button" disabled={busy !== null} onClick={() => decide(r, false)} className="rounded-xl border px-4 py-2 text-sm font-bold flex items-center gap-1.5 disabled:opacity-50"><X className="w-4 h-4" />رفض</button>
                </div>
              )}
            </li>
          );
        })}</ul>}
    </div>
  );
}
