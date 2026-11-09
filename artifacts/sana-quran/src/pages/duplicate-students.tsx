// الحسابات المكررة: نسخ الطالبة نفسها تُعرض في مجموعة، ويُختار السجل الأساسي ثم تُدمج.
// الدمج ينقل السجلات والخطط والحسابات للأساسي ويؤرشف النسخ — لا يُحذف شيء.
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getToken } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Copy, Merge, Phone, Users } from "lucide-react";

type Member = { id: number; fullName: string; isArchived: boolean; createdAt: string; phoneTail: string; circles: Array<{ id: number; name: string; active: boolean }>; records: number; plans: number; accounts: string[] };
type Group = { key: string; reason: "phone" | "circle"; suggestedPrimaryId: number; members: Member[] };

const api = async (path: string, init?: RequestInit) => {
  const r = await fetch(path, { ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}`, ...(init?.headers ?? {}) } });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error ?? "تعذّر إتمام العملية");
  return data;
};
const day = (iso: string) => new Date(iso).toLocaleDateString("ar-SA", { day: "numeric", month: "short", year: "numeric" });

export default function DuplicateStudentsPage({ isLeader }: { isLeader: boolean }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading } = useQuery<{ groups: Group[]; totalGroups: number; totalCopies: number }>({
    queryKey: ["duplicateStudents"], queryFn: () => api("/api/admin/duplicate-students"),
  });
  const [primary, setPrimary] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["duplicateStudents"] });

  const mergeGroup = async (g: Group) => {
    const p = primary[g.key] ?? g.suggestedPrimaryId;
    const dups = g.members.map((m) => m.id).filter((id) => id !== p);
    if (!window.confirm(`دمج ${dups.length} ${dups.length > 2 ? "نسخ" : "نسخة"} في السجل #${p}؟\nتنتقل السجلات والخطط والحسابات إليه، وتُؤرشف النسخ (لا يُحذف شيء).`)) return;
    setBusy(g.key);
    try { await api("/api/admin/duplicate-students/merge", { method: "POST", body: JSON.stringify({ primaryId: p, duplicateIds: dups }) }); toast({ title: "تم الدمج" }); refresh(); }
    catch (e: any) { toast({ title: "تعذّر الدمج", description: e.message, variant: "destructive" }); }
    finally { setBusy(null); }
  };
  const phoneGroups = data?.groups.filter((g) => g.reason === "phone") ?? [];
  const mergeAll = async () => {
    if (!window.confirm(`دمج كل المجموعات المتطابقة بالاسم والجوال (${phoneGroups.length} مجموعة) بالسجل الأساسي المقترح لكل منها؟\nلا يُحذف شيء، والنسخ تُؤرشف.`)) return;
    setBusy("all");
    try { const r = await api("/api/admin/duplicate-students/merge-all", { method: "POST" }); toast({ title: `تم دمج ${r.merged} نسخة`, description: r.failed ? `تعذّر ${r.failed} مجموعة — راجعيها يدويًا` : undefined }); refresh(); }
    catch (e: any) { toast({ title: "تعذّر الدمج", description: e.message, variant: "destructive" }); }
    finally { setBusy(null); }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-5" dir="rtl">
      <header>
        <div className="flex items-center gap-2 text-primary text-sm font-bold mb-1"><Copy className="w-4 h-4" />الطالبات والخطط</div>
        <h1 className="text-2xl font-extrabold">الحسابات المكررة</h1>
        <p className="text-muted-foreground text-sm mt-1">نسخ الطالبة نفسها (الاسم نفسه مع الجوال نفسه، أو مع الحلقة نفسها). اختاري السجل الأساسي ثم ادمجي: تنتقل إليه السجلات والخطط والحسابات، وتُؤرشف النسخ دون حذف.</p>
      </header>

      {data && (
        <div className="rounded-2xl border bg-card p-4 flex flex-wrap items-center gap-4 justify-between">
          <div className="flex gap-6 text-sm">
            <span>المجموعات: <b className="text-primary text-lg">{data.totalGroups}</b></span>
            <span>النسخ الزائدة: <b className="text-primary text-lg">{data.totalCopies}</b></span>
          </div>
          {isLeader && phoneGroups.length > 0 && (
            <button type="button" disabled={busy !== null} onClick={mergeAll} className="rounded-xl bg-primary text-primary-foreground px-4 py-2 text-sm font-bold disabled:opacity-50 flex items-center gap-2">
              <Merge className="w-4 h-4" />{busy === "all" ? "جارٍ الدمج…" : `دمج المتطابقات بالاسم والجوال (${phoneGroups.length})`}
            </button>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-32 rounded-2xl bg-muted animate-pulse" />)}</div>
      ) : !data?.groups.length ? (
        <div className="rounded-2xl border bg-card py-16 text-center text-muted-foreground"><Users className="mx-auto mb-2 w-8 h-8 text-primary/40" />لا توجد حسابات مكررة، الحمد لله</div>
      ) : (
        <div className="space-y-3">
          {data.groups.map((g) => {
            const p = primary[g.key] ?? g.suggestedPrimaryId;
            return (
              <div key={g.key} className="rounded-2xl border bg-card overflow-hidden">
                <div className="px-4 py-3 border-b flex flex-wrap items-center gap-2 justify-between">
                  <div className="flex items-center gap-2">
                    <b>{g.members[0]!.fullName}</b>
                    <span className={`text-xs rounded-full px-2 py-0.5 font-bold ${g.reason === "phone" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
                      {g.reason === "phone" ? "الاسم والجوال متطابقان" : "الاسم والحلقة متطابقان"}
                    </span>
                    <span className="text-xs text-muted-foreground">{g.members.length} سجلات</span>
                  </div>
                  <button type="button" disabled={busy !== null} onClick={() => mergeGroup(g)} className="rounded-xl border border-primary text-primary px-3 py-1.5 text-sm font-bold hover:bg-primary/5 disabled:opacity-50 flex items-center gap-1.5">
                    <Merge className="w-4 h-4" />{busy === g.key ? "جارٍ الدمج…" : "دمج في الأساسي"}
                  </button>
                </div>
                <ul className="divide-y">
                  {g.members.map((m) => (
                    <li key={m.id}>
                      <label className={`flex items-start gap-3 px-4 py-3 cursor-pointer ${p === m.id ? "bg-primary/5" : ""}`}>
                        <input type="radio" name={g.key} checked={p === m.id} onChange={() => setPrimary((s) => ({ ...s, [g.key]: m.id }))} className="mt-1" />
                        <div className="flex-1 text-sm space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-bold">#{m.id}</span>
                            {p === m.id && <span className="text-xs rounded-full bg-primary text-primary-foreground px-2 py-0.5">الأساسي</span>}
                            {m.isArchived && <span className="text-xs rounded-full bg-muted px-2 py-0.5">مؤرشف</span>}
                            <span className="text-xs text-muted-foreground">أُنشئ {day(m.createdAt)}</span>
                            {m.phoneTail && <span className="text-xs text-muted-foreground flex items-center gap-1" dir="ltr"><Phone className="w-3 h-3" />…{m.phoneTail}</span>}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {m.circles.length ? m.circles.map((c) => <span key={c.id} className={`ml-2 ${c.active ? "text-foreground font-semibold" : "line-through"}`}>{c.name}</span>) : "بلا حلقة"}
                          </div>
                          <div className="text-xs text-muted-foreground">سجلات يومية: <b>{m.records}</b> · خطط: <b>{m.plans}</b> · حسابات: <b>{m.accounts.length}</b>{m.accounts.length ? <span dir="ltr" className="mr-1">({m.accounts.join("، ")})</span> : null}</div>
                        </div>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
