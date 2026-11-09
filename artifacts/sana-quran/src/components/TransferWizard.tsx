// نقل طالبة بثلاث خطوات: الطالبة ← المسار ← الحلقة.
// مسؤولة المسار تنقل أي طالبة إلى أي مسار مباشرة، بلا طلب موافقة.
import { useEffect, useMemo, useState } from "react";
import { useListCircleNames, useListStudents } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Check, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { getToken } from "@/lib/auth";
import { searchMatch } from "@/lib/arabicSearch";

type Circle = { id: number; name: string; track: string | null };
type Picked = { id: number; fullName: string; circleId?: number | null };
type Enrollment = { circleId: number; circleName: string; circleTrack: string | null; isArchived: boolean };

const collator = new Intl.Collator("ar", { numeric: true, sensitivity: "base" });
const trackLabel = (t: string | null) => (t ?? "بلا مسار").replace(/^مسار\s+/, "");

export default function TransferWizard({
  student: initialStudent,
  fromCircleId: initialFrom,
  onClose,
  onDone,
}: {
  student?: Picked | null;
  fromCircleId?: number | null;
  onClose: () => void;
  onDone?: () => void;
}) {
  const { data: circleNames } = useListCircleNames({ query: { queryKey: ["circleNames"] } });
  const { data: allStudents } = useListStudents(undefined, { query: { queryKey: ["allStudents"], enabled: !initialStudent } });
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [student, setStudent] = useState<Picked | null>(initialStudent ?? null);
  const [search, setSearch] = useState("");
  const [enrollments, setEnrollments] = useState<Enrollment[] | null>(null);
  const [fromCircleId, setFromCircleId] = useState<number | null>(initialFrom ?? null);
  const [track, setTrack] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [target, setTarget] = useState<number | null>(null);

  const circles = (circleNames ?? []) as Circle[];
  const circleById = useMemo(() => new Map(circles.map((c) => [c.id, c])), [circles]);

  // حلقات الطالبة الحالية (قد تكون في أكثر من حلقة)
  useEffect(() => {
    if (!student) { setEnrollments(null); return; }
    let alive = true;
    fetch(`/api/students/${student.id}/enrollments`, { headers: { Authorization: `Bearer ${getToken()}` } })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: Enrollment[]) => {
        if (!alive) return;
        const active = rows.filter((e) => !e.isArchived);
        setEnrollments(active);
        setFromCircleId((cur) => cur ?? (active.length === 1 ? active[0]!.circleId : student.circleId ?? null));
      })
      .catch(() => alive && setEnrollments([]));
    return () => { alive = false; };
  }, [student]);

  const results = useMemo(() => {
    const q = search.trim();
    if (q.length < 2) return [];
    return (allStudents ?? []).filter((s) => searchMatch(s.fullName, q)).slice(0, 30);
  }, [allStudents, search]);

  const tracks = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of circles) { const t = c.track ?? "بلا مسار"; m.set(t, (m.get(t) ?? 0) + 1); }
    return [...m.entries()].sort((a, b) => collator.compare(trackLabel(a[0]), trackLabel(b[0])));
  }, [circles]);

  const trackCircles = useMemo(
    () => circles.filter((c) => (c.track ?? "بلا مسار") === track && c.id !== fromCircleId).sort((a, b) => collator.compare(a.name, b.name)),
    [circles, track, fromCircleId],
  );

  const step = !student ? 1 : !track ? 2 : 3;
  const needsSource = (enrollments?.length ?? 0) > 1;

  const transfer = async (toCircleId: number) => {
    if (!student) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/students/${student.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ circleId: toCircleId, ...(fromCircleId ? { fromCircleId } : {}) }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? "فشل النقل");
      }
      const to = circleById.get(toCircleId);
      toast({ title: "تم النقل 🌿", description: `نُقلت ${student.fullName} إلى ${to?.name ?? "الحلقة"}` });
      queryClient.invalidateQueries({ queryKey: ["allStudents"] });
      queryClient.invalidateQueries({ queryKey: ["circles"] });
      onDone?.();
      onClose();
    } catch (e: any) {
      toast({ title: "تعذَّر النقل", description: e?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const back = () => {
    if (step === 3) { setTrack(null); setTarget(null); }
    else if (step === 2 && !initialStudent) { setStudent(null); setFromCircleId(null); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card rounded-2xl shadow-xl w-full max-w-sm max-h-[85vh] flex flex-col" dir="rtl" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b border-border flex items-center gap-2">
          {(step === 3 || (step === 2 && !initialStudent)) && (
            <button onClick={back} className="p-1 rounded hover:bg-muted" title="رجوع"><ArrowRight className="w-4 h-4" /></button>
          )}
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-base">نقل طالبة</h3>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {step === 1 ? "١. اختاري الطالبة" : step === 2 ? "٢. اختاري المسار" : `٣. اختاري الحلقة · مسار ${trackLabel(track)}`}
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted"><X className="w-4 h-4 text-muted-foreground" /></button>
        </div>

        {student && (
          <div className="px-4 pt-3 space-y-2">
            <div className="rounded-xl bg-primary/5 px-3 py-2 text-sm">
              <span className="font-semibold">{student.fullName}</span>
              {!needsSource && fromCircleId && (
                <span className="text-xs text-muted-foreground mr-2">· حاليًا في {circleById.get(fromCircleId)?.name ?? "—"}</span>
              )}
            </div>
            {needsSource && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">الطالبة في أكثر من حلقة، من أي حلقة تُنقل؟</p>
                <div className="flex flex-wrap gap-1.5">
                  {enrollments!.map((e) => (
                    <button
                      key={e.circleId}
                      onClick={() => setFromCircleId(e.circleId)}
                      className={`px-2.5 py-1 rounded-lg border text-xs ${fromCircleId === e.circleId ? "border-primary bg-primary/10 font-semibold" : "border-border"}`}
                    >
                      {e.circleName}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="p-4 overflow-y-auto space-y-2 flex-1">
          {step === 1 && (
            <>
              <div className="relative">
                <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="اكتبي اسم الطالبة…" className="pr-9" />
              </div>
              {search.trim().length >= 2 && results.length === 0 && (
                <p className="text-center text-sm text-muted-foreground py-4">لا توجد طالبة بهذا الاسم</p>
              )}
              {results.map((s) => (
                <button
                  key={s.id}
                  onClick={() => { setStudent({ id: s.id, fullName: s.fullName, circleId: s.circleId }); setFromCircleId(null); }}
                  className="w-full text-right px-3 py-2.5 rounded-xl border border-border hover:border-primary/50 transition-all"
                >
                  <span className="text-sm font-medium">{s.fullName}</span>
                  {s.circleId && <span className="text-xs text-muted-foreground mr-2">({circleById.get(s.circleId)?.name ?? "—"})</span>}
                </button>
              ))}
            </>
          )}

          {step === 2 && tracks.map(([t, n]) => (
            <button
              key={t}
              onClick={() => setTrack(t)}
              className="w-full text-right px-4 py-3 rounded-xl border-2 border-border hover:border-primary/50 transition-all flex items-center justify-between"
            >
              <span className="text-sm font-medium">مسار {trackLabel(t)}</span>
              <span className="text-xs text-muted-foreground">{n} حلقة</span>
            </button>
          ))}

          {step === 3 && (
            <>
              {trackCircles.length === 0 && <p className="text-center text-sm text-muted-foreground py-4">لا توجد حلقات أخرى في هذا المسار</p>}
              {trackCircles.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setTarget(c.id)}
                  className={`w-full text-right px-4 py-3 rounded-xl border-2 transition-all flex items-center justify-between ${target === c.id ? "border-primary bg-primary/5 font-semibold" : "border-border hover:border-primary/50"}`}
                >
                  <span className="text-sm">{c.name}</span>
                  {target === c.id && <Check className="w-4 h-4 text-primary" />}
                </button>
              ))}
              {needsSource && !fromCircleId && <p className="text-xs text-amber-600">اختاري أولًا الحلقة التي تُنقل منها</p>}
            </>
          )}
        </div>

        <div className="p-3 border-t border-border flex gap-2">
          {step === 3 && (
            <Button size="sm" className="flex-1" disabled={!target || saving || (needsSource && !fromCircleId)} onClick={() => target && transfer(target)}>
              {saving ? "جاري النقل…" : target ? `نقل إلى ${circleById.get(target)?.name ?? ""}` : "نقل"}
            </Button>
          )}
          <Button variant="outline" onClick={onClose} size="sm" className="flex-1">إلغاء</Button>
        </div>
      </div>
    </div>
  );
}
