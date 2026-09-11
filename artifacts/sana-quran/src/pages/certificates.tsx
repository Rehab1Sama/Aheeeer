import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListCertificateTerms, useCreateCertificateTerm, useUpdateCertificateTerm,
  useListCertificateStudentResults, useSaveCertificateGrades, usePublishCertificateTerm,
  useListCertificateImportCandidates, useResolveCertificateImportCandidates,
  getListCertificateTermsQueryKey, getListCertificateStudentResultsQueryKey,
  getListCertificateImportCandidatesQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ClipboardCheck, Plus, CalendarDays, FileSpreadsheet, Send, RefreshCw, BookOpenCheck, AlertCircle, Check, X, Pencil, Info, Upload, ShieldCheck } from "lucide-react";
import { getToken } from "@/lib/auth";
import ExcelJS from "exceljs";

const dateLabel = (value?: string | null) => value ? new Date(value).toLocaleDateString("ar-SA", { day: "numeric", month: "short", year: "numeric" }) : "—";
const statusLabel = (s: string) => s === "published" ? "منشور" : "مسودة";

function TermForm({ open, onOpenChange, initial, onSaved }: { open: boolean; onOpenChange: (v: boolean) => void; initial?: any; onSaved: () => void }) {
  const create = useCreateCertificateTerm(); const update = useUpdateCertificateTerm();
  const [form, setForm] = useState({ name: initial?.name ?? "", academicYear: initial?.academicYear ?? "", startDate: initial?.startDate?.slice(0, 10) ?? "", endDate: initial?.endDate?.slice(0, 10) ?? "", reviewCycleOneStart: initial?.reviewCycleOneStart?.slice(0, 10) ?? "", reviewCycleTwoStart: initial?.reviewCycleTwoStart?.slice(0, 10) ?? "" });
  const busy = create.isPending || update.isPending;
  const submit = (e: React.FormEvent) => { e.preventDefault(); const data = { name: form.name, startDate: form.startDate, endDate: form.endDate, ...(form.academicYear ? { academicYear: form.academicYear } : {}), ...(form.reviewCycleOneStart ? { reviewCycleOneStart: form.reviewCycleOneStart } : {}), ...(form.reviewCycleTwoStart ? { reviewCycleTwoStart: form.reviewCycleTwoStart } : {}) }; const done = () => { onSaved(); onOpenChange(false); }; initial ? update.mutate({ termId: initial.id, data }, { onSuccess: done }) : create.mutate({ data }, { onSuccess: done }); };
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent dir="rtl" className="max-w-lg"><DialogHeader><DialogTitle className="text-right text-xl">{initial ? "تعديل الفصل" : "فصل دراسي جديد"}</DialogTitle></DialogHeader><form onSubmit={submit} className="space-y-4">
    <div><label className="text-sm font-semibold">اسم الفصل</label><input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="الفصل الدراسي الأول" className="mt-1 w-full rounded-xl border bg-background px-3 py-2.5 outline-none focus:ring-2 focus:ring-primary/25" /></div>
    <div className="grid grid-cols-2 gap-3"><div><label className="text-sm font-semibold">العام الأكاديمي</label><input value={form.academicYear} onChange={e => setForm({ ...form, academicYear: e.target.value })} placeholder="1446 هـ" className="mt-1 w-full rounded-xl border bg-background px-3 py-2.5" /></div><div><label className="text-sm font-semibold">بداية الفصل</label><input required type="date" value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} className="mt-1 w-full rounded-xl border bg-background px-3 py-2.5" /></div></div>
    <div><label className="text-sm font-semibold">نهاية الفصل</label><input required type="date" value={form.endDate} onChange={e => setForm({ ...form, endDate: e.target.value })} className="mt-1 w-full rounded-xl border bg-background px-3 py-2.5" /></div>
    <div className="rounded-xl bg-primary/5 border border-primary/10 p-3"><p className="text-xs font-bold text-primary mb-2">دورتا المراجعة لمسار الحافظات</p><div className="grid grid-cols-2 gap-3"><input type="date" value={form.reviewCycleOneStart} onChange={e => setForm({ ...form, reviewCycleOneStart: e.target.value })} className="w-full rounded-lg border bg-background px-2 py-2 text-sm" /><input type="date" value={form.reviewCycleTwoStart} onChange={e => setForm({ ...form, reviewCycleTwoStart: e.target.value })} className="w-full rounded-lg border bg-background px-2 py-2 text-sm" /></div></div>
    <Button disabled={busy} className="w-full">{busy ? "جارٍ الحفظ..." : "حفظ الفصل"}</Button>
  </form></DialogContent></Dialog>;
}

function ImportExcel({ termId, onDone }: { termId?: number; onDone: (termId?: number) => void }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const readFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true); setMessage("جارٍ قراءة الملفات...");
    try {
      const rows: any[] = [];
      for (const file of Array.from(files)) {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(await file.arrayBuffer());
        workbook.worksheets.forEach((sheet: any) => {
          let header: string[] = [];
          sheet.eachRow({ includeEmpty: false }, (row: any, rowNumber: number) => {
            const cells = row.values.slice(1).map((v: any) => String(v?.text ?? v ?? "").trim());
            if (!header.length && cells.some((v: string) => /اسم الطالبة|الاسم/.test(v))) { header = cells; return; }
            if (!header.length || rowNumber < 2) return;
            const at = (patterns: RegExp[]) => {
              const i = header.findIndex((h) => patterns.some((p) => p.test(h)));
              return i >= 0 ? cells[i] ?? "" : "";
            };
            const name = at([/اسم الطالبة/, /^الاسم$/]);
            if (!name || /اسم الحلقة/.test(name)) return;
            const scoreCell = at([/الدرجة/, /٥٠|50|٧٠|70/]);
            const parsed = scoreCell.match(/[(/]?\s*[\d٠-٩]+\s*[/،,]\s*([\d٠-٩٫.,]+)/);
            const arabic = (s: string) => s.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace("٫", ".").replace(",", ".");
            rows.push({ sheet: sheet.name, row: rowNumber, name, track: at([/اسم الحلقة/]) || file.name.replace(/^.*مسار_/, "").replace(/[_].*$/, ""), quotaFrom: at([/^من$/]), quotaTo: at([/^إلى/]), score: parsed ? Number(arabic(parsed[1])) : null });
          });
        });
      }
      if (!rows.length) throw new Error("لم نجد ورقة تحتوي أعمدة الاسم والنصاب");
      const endpoint = termId ? `/api/certificate-terms/${termId}/import-candidates` : "/api/certificate-historical-import";
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` }, body: JSON.stringify({ rows }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "تعذر حفظ الاستيراد");
      setMessage(`تم حفظ ${result.imported} صفًا للمراجعة. لم يتم تغيير حلقات الطالبات.`);
      onDone(result.termId);
    } catch (error: any) { setMessage(error.message || "تعذر قراءة الملف"); }
    finally { setBusy(false); }
  };
  return <div className="border-b bg-primary/5 p-5">
    <div className="flex items-center gap-2 font-bold"><Upload className="w-5 h-5 text-primary" />استيراد ملفات Excel</div>
    <p className="text-sm text-muted-foreground mt-1">ارفعي ملفًا أو عدة ملفات. سيتم حفظ الاسم والنصاب (من/إلى) والحلقة كسجلات منفصلة للمراجعة.</p>
    <label className={`mt-4 flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-primary/30 bg-background px-4 py-4 text-sm font-bold hover:bg-primary/5 ${busy ? "pointer-events-none opacity-60" : ""}`}>
      <FileSpreadsheet className="w-5 h-5 text-primary" />{busy ? "جارٍ الاستيراد..." : "اختيار ملفات Excel"}<input type="file" accept=".xlsx" multiple className="hidden" onChange={e => readFiles(e.target.files)} />
    </label>
    {message && <p className="mt-3 text-sm font-semibold text-primary">{message}</p>}
  </div>;
}

export default function CertificatesPage() {
  const qc = useQueryClient(); const { data: terms, isLoading, isError, refetch } = useListCertificateTerms({ query: { queryKey: getListCertificateTermsQueryKey() } });
  const [selected, setSelected] = useState<number | null>(null); const [formOpen, setFormOpen] = useState(false); const [editing, setEditing] = useState<any>(); const [tab, setTab] = useState<"grades" | "imports" | "rules">("grades");
  const activeId = selected ?? terms?.[0]?.id; const active = terms?.find(t => t.id === activeId);
  const { data: results, isLoading: loadingResults } = useListCertificateStudentResults(activeId as number, {}, { query: { enabled: !!activeId, queryKey: getListCertificateStudentResultsQueryKey(activeId as number, {}) } });
  const { data: candidates } = useListCertificateImportCandidates(activeId as number, { query: { enabled: !!activeId, queryKey: getListCertificateImportCandidatesQueryKey(activeId as number) } });
  const save = useSaveCertificateGrades(); const publish = usePublishCertificateTerm(); const resolve = useResolveCertificateImportCandidates();
  const [scores, setScores] = useState<Record<number, string>>({});
  const rows = useMemo(() => results ?? [], [results]); const pendingImports = (candidates ?? []).filter(c => !c.resolved);
  const saveGrades = () => { if (!activeId) return; const grades = Object.entries(scores).filter(([, v]) => v !== "").map(([studentId, score]) => ({ studentId: Number(studentId), score: Number(score) })); if (grades.length) save.mutate({ termId: activeId, data: { grades } }, { onSuccess: () => qc.invalidateQueries({ queryKey: getListCertificateStudentResultsQueryKey(activeId, {}) }) }); };
  const publishTerm = () => { if (activeId && window.confirm("سيتم نشر نتائج هذا الفصل للطالبات. هل تريدين المتابعة؟")) publish.mutate({ termId: activeId }, { onSuccess: () => qc.invalidateQueries({ queryKey: getListCertificateTermsQueryKey() }) }); };
  const resolveImport = (id: number, accept: boolean, studentId?: number | null) => activeId && resolve.mutate({ termId: activeId, data: { candidates: [{ id, accept, ...(studentId ? { studentId } : {}) }] } }, { onSuccess: () => qc.invalidateQueries({ queryKey: getListCertificateImportCandidatesQueryKey(activeId) }) });
  return <div className="max-w-[1500px] mx-auto space-y-6 animate-in fade-in duration-500" dir="rtl">
    <header className="flex flex-col md:flex-row md:items-end justify-between gap-4"><div><div className="flex items-center gap-2 text-primary text-sm font-bold mb-2"><ClipboardCheck className="w-4 h-4" />السجل الأكاديمي</div><h1 className="text-3xl font-extrabold tracking-tight text-foreground">الشهادات الفصلية</h1><p className="text-muted-foreground mt-1">راجعي درجات الطالبات، ثبّتيها، ثم انشري النتيجة بثقة.</p></div><Button onClick={() => { setEditing(undefined); setFormOpen(true); }} className="gap-2 shadow-sm"><Plus className="w-4 h-4" />فصل جديد</Button></header>
    <div className="grid grid-cols-1 xl:grid-cols-[280px_1fr] gap-5">
      <aside className="rounded-2xl border bg-card p-3 shadow-sm h-fit"><div className="px-3 py-2 flex items-center justify-between"><span className="font-bold">الفصول الدراسية</span><span className="text-xs text-muted-foreground">{terms?.length ?? 0}</span></div>{isLoading ? <div className="space-y-2 p-2">{[1,2,3].map(i => <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />)}</div> : isError ? <div className="p-4 text-center text-sm text-destructive"><AlertCircle className="mx-auto mb-2" /><p>تعذر تحميل الفصول</p><button onClick={() => refetch()} className="underline mt-2">إعادة المحاولة</button></div> : terms?.length ? terms.map(term => <button key={term.id} onClick={() => setSelected(term.id)} className={`w-full text-right rounded-xl p-3 mt-1 transition-all ${term.id === activeId ? "bg-primary text-primary-foreground shadow-md" : "hover:bg-muted"}`}><div className="flex items-center justify-between gap-2"><span className="font-bold">{term.name}</span><span className={`text-[10px] rounded-full px-2 py-0.5 ${term.id === activeId ? "bg-white/20" : "bg-amber-100 text-amber-800"}`}>{statusLabel(term.status)}</span></div><p className={`text-xs mt-1 ${term.id === activeId ? "text-white/70" : "text-muted-foreground"}`}>{term.academicYear ?? "عام غير محدد"} · {dateLabel(term.startDate)}</p></button>) : <div className="p-5 text-center text-sm text-muted-foreground"><CalendarDays className="mx-auto mb-2 w-8 h-8 text-primary/50" /><p>لم تُنشأ فصول بعد</p><p className="text-xs mt-1">ابدئي بإضافة الفصل الحالي</p></div>}</aside>
       <section className="min-w-0">{!active ? <div className="rounded-2xl border bg-card shadow-sm overflow-hidden"><div className="p-6"><BookOpenCheck className="mx-auto w-12 h-12 text-primary/30 mb-3" /><h2 className="font-bold text-lg text-center">استيراد الفصل الأول التاريخي</h2><p className="text-sm text-muted-foreground mt-1 text-center mb-4">لا يحتاج هذا الاستيراد إلى تواريخ؛ فهو يحفظ الأنصبة والدرجات السابقة فقط.</p><ImportExcel onDone={(id) => { qc.invalidateQueries({ queryKey: getListCertificateTermsQueryKey() }); if (id) setSelected(id); }} /></div></div> : <><div className="rounded-2xl border bg-card p-5 shadow-sm"><div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4"><div><div className="flex items-center gap-2"><h2 className="text-xl font-extrabold">{active.name}</h2><Badge variant={active.status === "published" ? "default" : "secondary"}>{statusLabel(active.status)}</Badge></div><p className="text-sm text-muted-foreground mt-1">{dateLabel(active.startDate)} — {dateLabel(active.endDate)} {active.publishedAt && ` · نُشر ${dateLabel(active.publishedAt)}`}</p></div><div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => { setEditing(active); setFormOpen(true); }} className="gap-1.5"><Pencil className="w-3.5 h-3.5" />تعديل</Button>{active.status !== "published" && <Button size="sm" onClick={publishTerm} disabled={publish.isPending} className="gap-1.5"><Send className="w-3.5 h-3.5" />{publish.isPending ? "جارٍ النشر" : "نشر النتائج"}</Button>}</div></div></div>
      <div className="flex gap-1 border-b mt-5"><button onClick={() => setTab("grades")} className={`px-4 py-3 text-sm font-bold border-b-2 transition-colors ${tab === "grades" ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}>درجات الاختبار <span className="mr-1 text-xs">({rows.length})</span></button><button onClick={() => setTab("imports")} className={`px-4 py-3 text-sm font-bold border-b-2 ${tab === "imports" ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}>مراجعة الاستيراد {pendingImports.length > 0 && <span className="mr-1 rounded-full bg-amber-100 text-amber-800 px-1.5 text-[10px]">{pendingImports.length}</span>}</button><button onClick={() => setTab("rules")} className={`px-4 py-3 text-sm font-bold border-b-2 ${tab === "rules" ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}>قواعد الاحتساب</button></div>
       {tab === "rules" ? <Rules /> : tab === "imports" ? <Imports termId={activeId} candidates={pendingImports} onResolve={resolveImport} onDone={() => { if (!activeId) return; qc.invalidateQueries({ queryKey: getListCertificateImportCandidatesQueryKey(activeId) }); qc.invalidateQueries({ queryKey: getListCertificateStudentResultsQueryKey(activeId, {}) }); }} /> : <Grades rows={rows} loading={loadingResults} scores={scores} setScores={setScores} onSave={saveGrades} saving={save.isPending} />}</>}</section>
    </div><TermForm key={editing?.id ?? "new"} open={formOpen} onOpenChange={setFormOpen} initial={editing} onSaved={() => qc.invalidateQueries({ queryKey: getListCertificateTermsQueryKey() })} />
  </div>;
}

function Grades({ rows, loading, scores, setScores, onSave, saving }: any) { return <div className="rounded-2xl border bg-card shadow-sm overflow-hidden mt-4"><div className="flex items-center justify-between p-4 border-b bg-muted/20"><p className="text-sm text-muted-foreground">أدخلي درجة الاختبار فقط؛ بقية المكونات والخصم تُحتسب من السجلات المعتمدة.</p><Button onClick={onSave} disabled={saving} size="sm" className="gap-2"><RefreshCw className={`w-3.5 h-3.5 ${saving ? "animate-spin" : ""}`} />حفظ الدرجات</Button></div>{loading ? <div className="p-8 space-y-3">{[1,2,3,4].map(i => <div key={i} className="h-12 bg-muted rounded-lg animate-pulse" />)}</div> : rows.length ? <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-muted/40 text-muted-foreground"><tr><th className="p-3 text-right">الطالبة</th><th className="p-3 text-right">الحلقة / المسار</th><th className="p-3">الحضور</th><th className="p-3">المراجعة</th><th className="p-3">الخصم</th><th className="p-3">الاختبار</th><th className="p-3">المجموع</th><th className="p-3">الحالة</th></tr></thead><tbody>{rows.map((r: any) => <tr key={r.studentId} className="border-t hover:bg-muted/20 transition-colors"><td className="p-3 font-bold whitespace-nowrap">{r.studentName}</td><td className="p-3 text-muted-foreground">{r.circleName ?? "—"}<br /><span className="text-xs">{r.trackName ?? r.trackType}</span></td><td className="p-3 text-center">{r.attendanceDays}/{r.eligibleAttendanceDays}</td><td className="p-3 text-center">{r.reviewUnitsCompleted}/{r.reviewUnitsPlanned}</td><td className="p-3 text-center text-rose-600">{r.breakdown?.deduction ?? 0}/{r.breakdown?.shortcomingsMax ?? 0}</td><td className="p-3"><div className="flex items-center gap-1 justify-center"><input type="number" min="0" max={r.testMax} value={scores[r.studentId] ?? r.testScore ?? ""} onChange={e => setScores((s: any) => ({ ...s, [r.studentId]: e.target.value }))} className="w-16 rounded-lg border px-2 py-1.5 text-center font-bold" /><span className="text-xs text-muted-foreground">/{r.testMax}</span></div></td><td className="p-3 text-center font-extrabold text-primary">{r.totalScore}</td><td className="p-3 text-center"><Badge variant={r.status === "ready" ? "default" : "destructive"}>{r.status === "ready" ? "جاهزة" : r.status === "missing_exam" ? "ينقصها اختبار" : "تحتاج مراجعة"}</Badge></td></tr>)}</tbody></table></div> : <div className="py-16 text-center text-muted-foreground"><ClipboardCheck className="mx-auto mb-2 text-primary/40" /><p>لا توجد نتائج لهذا الفصل حتى الآن</p></div>}</div>; }

function Imports({ candidates, onResolve, termId, onDone }: any) { return <div className="rounded-2xl border bg-card shadow-sm mt-4 overflow-hidden"><ImportExcel termId={termId} onDone={onDone} /><div className="p-5 border-b"><div className="flex items-center gap-2 font-bold"><ShieldCheck className="w-5 h-5 text-primary" />مراجعة النصاب والمطابقات</div><p className="text-sm text-muted-foreground mt-1">كرري الاسم لا يعني دمج السجلات؛ كل نصاب يبقى مستقلًا، والمطابقة الملتبسة لا تعتمد تلقائيًا.</p></div>{candidates.length ? <div className="divide-y">{candidates.map((c: any) => <div key={c.id} className="p-4 flex flex-col md:flex-row md:items-center gap-3"><div className="flex-1"><p className="font-bold">{c.sourceName}</p><p className="text-xs text-muted-foreground">{c.sourceTrack ?? "مسار غير محدد"} {c.quotaFrom || c.quotaTo ? ` · ${c.quotaFrom ?? "—"} ← ${c.quotaTo ?? "—"}` : ""}</p></div><div className="text-sm">الدرجة: <b>{c.importedScore ?? "—"}</b></div><Badge variant={c.confidence === "exact" ? "default" : "secondary"}>{c.confidence === "exact" ? "مطابقة مؤكدة" : "مطابقة تحتاج تحقق"}</Badge><div className="flex gap-2"><Button size="sm" onClick={() => onResolve(c.id, true, c.matchedStudentId)} className="gap-1"><Check className="w-3.5 h-3.5" />اعتماد</Button><Button size="sm" variant="outline" onClick={() => onResolve(c.id, false)} className="gap-1"><X className="w-3.5 h-3.5" />تجاهل</Button></div></div>)}</div> : <div className="py-16 text-center text-muted-foreground"><Check className="mx-auto mb-2 text-emerald-600" /><p>لا توجد مطابقات معلّقة</p></div>}</div>; }

function Rules() { return <div className="mt-4 grid gap-4 md:grid-cols-2"><div className="rounded-2xl border bg-card p-5 shadow-sm"><div className="flex items-center gap-2 font-bold mb-4"><Info className="w-4 h-4 text-primary" />سلم الدرجات</div>{[["الحافظات","اختبار 50 + خطط المراجعة 20 + الحضور 20 + التقصير 10"],["سُنى ومشكاة نور","اختبار 20 + الحضور 20 + التقصير 10"],["المسارات العامة","اختبار 60 + الحضور 30 + التقصير 10"],["الأمهات","اختبار 70 + الحضور 30"],["الأطفال","اختبار 70 + الحضور 30"]].map(([a,b]) => <div key={a} className="flex justify-between gap-4 border-b last:border-0 py-3 text-sm"><b>{a}</b><span className="text-muted-foreground text-left">{b}</span></div>)}</div><div className="rounded-2xl border bg-primary/5 border-primary/15 p-5"><div className="flex items-center gap-2 font-bold mb-3"><BookOpenCheck className="w-4 h-4 text-primary" />ملاحظات الاحتساب</div><ul className="space-y-3 text-sm leading-relaxed text-muted-foreground list-disc list-inside"><li>للحافظات دورتان للمراجعة، مدة كل دورة 21 يومًا، ويُحتسب الإنجاز بنسبة ما أُنجز من الخطة.</li><li>اليوم الذي يغيب فيه القريب والبعيد معًا يُسجّل تقصيرًا واحدًا فقط.</li><li>تُحتسب أيام الحضور والتقصير ضمن الأيام المؤهلة للفصل.</li></ul></div></div>; }