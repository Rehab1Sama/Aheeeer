import { useEffect, useMemo, useState } from "react";
import {
  useGetMissingDataEntry,
  useCreateRecord,
  useUpdateRecord,
  useListCircles,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { SURAHS, calculatePages } from "@/lib/quran";
import { getInputFields } from "@/lib/schoolConfig";
import { getMakkahDay } from "@/lib/date";
import { parseCards, matchStudent, type ParsedCard, type ParsedField, type StudentRef } from "@/lib/cardParser";
import { ClipboardPaste, CheckCircle2, AlertTriangle, Pencil, UserX, Loader2 } from "lucide-react";

// ─── أنواع الحالة ────────────────────────────────────────────────

type FieldKey = "memorize" | "near" | "far";

interface RangeState {
  enabled: boolean; // هل يوجد محتوى لهذا الحقل
  surahStart: string;
  ayahStart: string;
  surahEnd: string;
  ayahEnd: string;
  needsCheck: boolean; // التباس من القارئ
  confirmed: boolean; // أكّدته المشرفة أو عدّلته
  notes: string[];
  raw: string;
}

interface CardState {
  key: string;
  parsed: ParsedCard;
  studentId: number | null;
  matchNote: string | null;
  include: boolean;
  replace: boolean;
  listened: boolean | null;
  fields: Record<FieldKey, RangeState>;
  editing: FieldKey | null;
  dupNote: string | null;
}

const FIELD_LABEL: Record<FieldKey, string> = {
  memorize: "الحفظ",
  near: "المراجعة القريبة",
  far: "المراجعة البعيدة",
};

const FIELD_INPUT: Record<FieldKey, string> = {
  memorize: "memorize",
  near: "review_near",
  far: "review_far",
};

function toRangeState(f: ParsedField): RangeState {
  return {
    enabled: f.status !== "empty",
    surahStart: f.range?.surahStart ?? "",
    ayahStart: f.range ? String(f.range.ayahStart) : "",
    surahEnd: f.range?.surahEnd ?? "",
    ayahEnd: f.range ? String(f.range.ayahEnd) : "",
    needsCheck: f.status === "check",
    confirmed: f.status !== "check",
    notes: f.notes,
    raw: f.raw,
  };
}

function pagesOf(r: RangeState): number {
  if (!r.enabled || !r.surahStart || !r.surahEnd) return 0;
  return calculatePages(r.surahStart, Number(r.ayahStart) || 1, r.surahEnd, Number(r.ayahEnd) || 1);
}

function rangeValid(r: RangeState): boolean {
  if (!r.enabled) return true;
  const a = SURAHS.find((s) => s.name === r.surahStart);
  const b = SURAHS.find((s) => s.name === r.surahEnd);
  const as = Number(r.ayahStart);
  const ae = Number(r.ayahEnd);
  return !!a && !!b && as >= 1 && as <= a.ayahs && ae >= 1 && ae <= b.ayahs;
}

function fieldReady(r: RangeState): boolean {
  return !r.enabled || (rangeValid(r) && (!r.needsCheck || r.confirmed));
}

function fmtPages(n: number): string {
  return n === 0 ? "0" : String(n);
}

// ─── محرّر نطاق ───────────────────────────────────────────────────

function RangeEditor({ value, onChange }: { value: RangeState; onChange: (v: RangeState) => void }) {
  const sel = "h-9 rounded-md border border-input bg-background px-2 text-sm w-full";
  const set = (patch: Partial<RangeState>) => onChange({ ...value, ...patch, confirmed: true });
  return (
    <div className="grid grid-cols-2 gap-2 rounded-lg border border-dashed p-2">
      <div className="space-y-1">
        <span className="text-xs text-muted-foreground">من سورة</span>
        <select className={sel} value={value.surahStart} onChange={(e) => set({ surahStart: e.target.value, enabled: true })}>
          <option value="">—</option>
          {SURAHS.map((s) => <option key={s.number} value={s.name}>{s.name}</option>)}
        </select>
        <Input type="number" inputMode="numeric" className="h-9" placeholder="الآية" value={value.ayahStart}
          onChange={(e) => set({ ayahStart: e.target.value, enabled: true })} />
      </div>
      <div className="space-y-1">
        <span className="text-xs text-muted-foreground">إلى سورة</span>
        <select className={sel} value={value.surahEnd} onChange={(e) => set({ surahEnd: e.target.value, enabled: true })}>
          <option value="">—</option>
          {SURAHS.map((s) => <option key={s.number} value={s.name}>{s.name}</option>)}
        </select>
        <Input type="number" inputMode="numeric" className="h-9" placeholder="الآية" value={value.ayahEnd}
          onChange={(e) => set({ ayahEnd: e.target.value, enabled: true })} />
      </div>
    </div>
  );
}

// ─── الصفحة ───────────────────────────────────────────────────────

export default function WhatsappEntryPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [circleId, setCircleId] = useState<number | null>(null);
  const [date, setDate] = useState<string>(getMakkahDay());
  const [text, setText] = useState("");
  const [cards, setCards] = useState<CardState[] | null>(null);
  const [absentIds, setAbsentIds] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ ok: number; failed: Array<{ name: string; error: string }>; skipped: number } | null>(null);

  const { data: circles } = useListCircles(undefined, { query: { queryKey: ["circles"] } });
  // الخادم يرجع للمشرفة (والمعلمة ومُدخلة البيانات) حلقاتها فقط؛ لو حلقة واحدة تُختار تلقائيًا.
  useEffect(() => {
    if (!circleId && circles && circles.length === 1) setCircleId((circles[0] as any).id);
  }, [circles, circleId]);
  const { data: missingData } = useGetMissingDataEntry(
    { date },
    { query: { queryKey: ["missingData", date], staleTime: 0 } },
  );
  const createRecord = useCreateRecord();
  const updateRecord = useUpdateRecord();

  const circle = (circles ?? []).find((c: any) => c.id === circleId) as any;
  const inputFields = getInputFields(circle?.dataEntryType);
  const activeFields = (["memorize", "near", "far"] as FieldKey[]).filter((k) => inputFields.includes(FIELD_INPUT[k]));
  const useListen = inputFields.includes("listen");

  // طالبات الحلقة المختارة (من نفس مصدر شاشة إدخال البيانات)
  const students = useMemo(() => {
    return ((missingData ?? []) as any[])
      .filter((s) => s.circleId === circleId)
      .map((s) => ({ id: s.studentId as number, name: s.studentName as string, hasRecord: !!s.hasRecord, recordId: (s.recordId ?? null) as number | null, onLeave: !!s.onLeave }))
      .sort((a, b) => a.name.localeCompare(b.name, "ar"));
  }, [missingData, circleId]);

  const studentRefs: StudentRef[] = useMemo(() => students.map((s) => ({ id: s.id, name: s.name })), [students]);
  const byId = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);

  // ─── التحليل ───
  const analyze = () => {
    setResult(null);
    const parsed = parseCards(text, SURAHS.map((s) => ({ name: s.name, ayahs: s.ayahs })));
    if (parsed.length === 0) {
      setCards([]);
      return;
    }
    const states: CardState[] = parsed.map((p) => {
      const m = matchStudent(p.name, studentRefs, p.sender);
      let studentId: number | null = null;
      let matchNote: string | null = null;
      if (m.kind === "matched") studentId = m.student.id;
      else if (m.kind === "ambiguous") matchNote = "الاسم ينطبق على أكثر من طالبة — اختاري الصحيحة";
      else matchNote = "لم أجد هذا الاسم بين طالبات الحلقة — اختاري الطالبة أو تجاهلي البطاقة";
      return {
        key: `c${p.index}`,
        parsed: p,
        studentId,
        matchNote,
        include: studentId !== null,
        replace: false,
        listened: p.listened,
        fields: { memorize: toRangeState(p.memorize), near: toRangeState(p.near), far: toRangeState(p.far) },
        editing: null,
        dupNote: null,
      };
    });
    // بطاقتان لنفس الطالبة: الأحدث تُعتمد
    const lastIdx = new Map<number, number>();
    states.forEach((s, i) => { if (s.studentId !== null) lastIdx.set(s.studentId, i); });
    states.forEach((s, i) => {
      if (s.studentId !== null && lastIdx.get(s.studentId) !== i) {
        s.include = false;
        s.dupNote = "بطاقة مكررة لنفس الطالبة — اعتمدتُ الأحدث";
      }
    });
    setCards(states);
    setAbsentIds(new Set());
  };

  const patchCard = (key: string, patch: Partial<CardState>) =>
    setCards((prev) => prev && prev.map((c) => (c.key === key ? { ...c, ...patch } : c)));

  const patchField = (key: string, f: FieldKey, v: RangeState) =>
    setCards((prev) => prev && prev.map((c) => (c.key === key ? { ...c, fields: { ...c.fields, [f]: v } } : c)));

  const assignStudent = (key: string, id: number | null) => {
    setCards((prev) => prev && prev.map((c) => {
      if (c.key !== key) return c;
      return { ...c, studentId: id, include: id !== null, matchNote: id === null ? c.matchNote : null };
    }));
  };

  // ─── الجاهزية ───
  const cardReady = (c: CardState): boolean => {
    if (!c.include || c.studentId === null) return false;
    const st = byId.get(c.studentId);
    if (st?.hasRecord && !c.replace) return false;
    return activeFields.every((k) => fieldReady(c.fields[k]));
  };

  const included = (cards ?? []).filter((c) => c.include);
  const readyCards = (cards ?? []).filter(cardReady);
  const blocked = included.filter((c) => !cardReady(c));
  const cardStudentIds = new Set((cards ?? []).filter((c) => c.include && c.studentId !== null).map((c) => c.studentId as number));
  const noCardStudents = students.filter((s) => !cardStudentIds.has(s.id) && !s.hasRecord);

  // ─── الحفظ ───
  const buildPayload = (c: CardState) => {
    const payload: any = {
      studentId: c.studentId,
      circleId,
      date,
      isAbsent: false,
      memorizePages: 0,
      reviewNearPages: 0,
      reviewFarPages: 0,
      reviewPages: 0,
      recitationPages: 0,
    };
    const put = (k: FieldKey, prefix: "memorize" | "reviewNear" | "reviewFar") => {
      const r = c.fields[k];
      if (!activeFields.includes(k) || !r.enabled || !r.surahStart || !r.surahEnd) return;
      payload[`${prefix}SurahStart`] = r.surahStart;
      payload[`${prefix}AyahStart`] = Number(r.ayahStart) || 1;
      payload[`${prefix}SurahEnd`] = r.surahEnd;
      payload[`${prefix}AyahEnd`] = Number(r.ayahEnd) || 1;
      payload[`${prefix}Pages`] = pagesOf(r);
    };
    put("memorize", "memorize");
    put("near", "reviewNear");
    put("far", "reviewFar");
    if (useListen) payload.listenedToReciter = c.listened;
    return payload;
  };

  const errText = (e: any): string => e?.data?.error ?? e?.message ?? "خطأ غير معروف";

  const save = async () => {
    if (!circleId) return;
    setSaving(true);
    let ok = 0;
    const failed: Array<{ name: string; error: string }> = [];

    for (const c of readyCards) {
      const st = byId.get(c.studentId as number);
      const name = st?.name ?? c.parsed.name;
      try {
        const payload = buildPayload(c);
        if (st?.hasRecord && st.recordId) {
          await updateRecord.mutateAsync({ id: st.recordId, data: payload });
        } else {
          await createRecord.mutateAsync({ data: payload });
        }
        ok++;
      } catch (e: any) {
        failed.push({ name, error: errText(e) });
      }
    }

    for (const id of absentIds) {
      const st = byId.get(id);
      if (!st || st.hasRecord) continue;
      try {
        await createRecord.mutateAsync({
          data: { studentId: id, circleId, date, isAbsent: true, memorizePages: 0, reviewNearPages: 0, reviewFarPages: 0, reviewPages: 0, recitationPages: 0 } as any,
        });
        ok++;
      } catch (e: any) {
        failed.push({ name: st.name, error: errText(e) });
      }
    }

    setSaving(false);
    setResult({ ok, failed, skipped: blocked.length });
    queryClient.invalidateQueries({ queryKey: ["missingData"] });
    queryClient.invalidateQueries({ queryKey: ["records"] });
    toast({
      title: failed.length ? `تم حفظ ${ok} وتعذّر ${failed.length}` : `تم حفظ ${ok} سجل ✓`,
      variant: failed.length ? "destructive" : undefined,
    });
    if (failed.length === 0 && blocked.length === 0) {
      setCards(null);
      setText("");
      setAbsentIds(new Set());
    }
  };

  const selectedDay = Number(date.slice(8, 10));
  const selectedMonth = Number(date.slice(5, 7));
  const totalToSave = readyCards.length + Array.from(absentIds).filter((id) => !byId.get(id)?.hasRecord).length;

  const sel = "h-10 rounded-md border border-input bg-background px-3 text-sm w-full";

  return (
    <div className="space-y-4 pb-24" dir="rtl">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2"><ClipboardPaste className="h-5 w-5" /> إدخال من بطاقات الواتساب</h1>
        <p className="text-sm text-muted-foreground mt-1">الصقي بطاقات التحضير كما وصلتك، راجعي الملخص، ثم احفظي.</p>
      </div>

      <Card>
        <CardContent className="pt-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">الحلقة</label>
              <select className={sel} value={circleId ?? ""} onChange={(e) => { setCircleId(e.target.value ? Number(e.target.value) : null); setCards(null); setResult(null); }}>
                <option value="">اختاري الحلقة</option>
                {(circles ?? []).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">تاريخ الإدخال</label>
              <Input type="date" className="h-10" value={date} onChange={(e) => { setDate(e.target.value); setCards(null); setResult(null); }} />
            </div>
          </div>
          <Textarea rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder="الصقي البطاقات هنا (يمكن لصق عدة بطاقات دفعة واحدة)" />
          <Button className="w-full" disabled={!circleId || !text.trim()} onClick={analyze}>تحليل البطاقات</Button>
          {circleId && students.length === 0 && (
            <p className="text-xs text-amber-600">لا توجد طالبات مسجّلات في هذه الحلقة ليوم {date}.</p>
          )}
        </CardContent>
      </Card>

      {cards !== null && cards.length === 0 && (
        <Card><CardContent className="pt-4 text-sm text-muted-foreground">لم أجد أي بطاقة تحضير في النص الملصوق. تأكدي أنها تحتوي على "النصاب الجديد" و"اسم الحبيبة".</CardContent></Card>
      )}

      {cards !== null && cards.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge className="bg-green-100 text-green-700 border-0">{readyCards.length} جاهزة</Badge>
            {blocked.length > 0 && <Badge className="bg-amber-100 text-amber-700 border-0">{blocked.length} تحتاج مراجعة</Badge>}
            <span className="text-muted-foreground">من {cards.length} بطاقة</span>
          </div>

          {cards.map((c) => {
            const ready = cardReady(c);
            const st = c.studentId !== null ? byId.get(c.studentId) : undefined;
            const dateMismatch = c.parsed.sentDay !== null && (c.parsed.sentDay !== selectedDay || c.parsed.sentMonth !== selectedMonth);
            return (
              <Card key={c.key} className={c.include ? (ready ? "border-green-300" : "border-amber-300") : "opacity-60"}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 min-w-0">
                      <input type="checkbox" checked={c.include} disabled={c.studentId === null}
                        onChange={(e) => patchCard(c.key, { include: e.target.checked })} />
                      <span className="truncate">{st?.name ?? c.parsed.name}</span>
                    </span>
                    {c.include && (ready
                      ? <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
                      : <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />)}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  {(c.studentId === null || c.matchNote) && (
                    <div className="space-y-1">
                      {c.matchNote && <p className="text-xs text-amber-600">{c.matchNote}</p>}
                      <select className={sel} value={c.studentId ?? ""} onChange={(e) => assignStudent(c.key, e.target.value ? Number(e.target.value) : null)}>
                        <option value="">اختاري الطالبة</option>
                        {students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </div>
                  )}
                  {c.dupNote && <p className="text-xs text-amber-600">{c.dupNote}</p>}
                  {c.parsed.warnings.map((w, i) => <p key={i} className="text-xs text-amber-600">⚠ {w}</p>)}
                  {dateMismatch && <p className="text-xs text-amber-600">⚠ أُرسلت يوم {c.parsed.sentDay}/{c.parsed.sentMonth} وتاريخ الإدخال المختار مختلف.</p>}
                  {st?.hasRecord && (
                    <label className="flex items-center gap-2 text-xs text-amber-700">
                      <input type="checkbox" checked={c.replace} onChange={(e) => patchCard(c.key, { replace: e.target.checked })} />
                      لها سجل في هذا اليوم — استبداله بهذه البطاقة
                    </label>
                  )}

                  {activeFields.map((k) => {
                    const r = c.fields[k];
                    const pages = pagesOf(r);
                    return (
                      <div key={k} className="rounded-lg bg-muted/40 p-2 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold">{FIELD_LABEL[k]}</span>
                          <div className="flex items-center gap-2">
                            {r.enabled && rangeValid(r) && <span className="text-xs text-muted-foreground">{fmtPages(pages)} صفحة</span>}
                            <Button type="button" variant="ghost" size="sm" className="h-7 px-2"
                              onClick={() => patchCard(c.key, { editing: c.editing === k ? null : k })}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                        {!r.enabled ? (
                          <p className="text-xs text-muted-foreground">لا شيء (فارغ)</p>
                        ) : rangeValid(r) ? (
                          <p>{r.surahStart} {r.ayahStart} ← {r.surahEnd} {r.ayahEnd}</p>
                        ) : (
                          <p className="text-rose-600 text-xs">النطاق غير مكتمل أو فيه آية خارج السورة</p>
                        )}
                        {r.raw && <p className="text-xs text-muted-foreground">المكتوب: {r.raw}</p>}
                        {r.notes.map((n, i) => <p key={i} className="text-xs text-amber-600">⚠ {n}</p>)}
                        {r.needsCheck && !r.confirmed && rangeValid(r) && (
                          <Button type="button" size="sm" variant="outline" className="h-7"
                            onClick={() => patchField(c.key, k, { ...r, confirmed: true })}>
                            صحيح، أكّدي
                          </Button>
                        )}
                        {(c.editing === k || (r.needsCheck && !r.confirmed && !rangeValid(r))) && (
                          <RangeEditor value={r} onChange={(v) => patchField(c.key, k, v)} />
                        )}
                      </div>
                    );
                  })}

                  {useListen && (
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">السماع</span>
                      {([true, false] as const).map((v) => (
                        <button key={String(v)} type="button"
                          onClick={() => patchCard(c.key, { listened: v })}
                          className={`px-3 py-1 rounded-md border text-xs ${c.listened === v ? (v ? "bg-green-500 text-white border-green-500" : "bg-rose-500 text-white border-rose-500") : "border-input"}`}>
                          {v ? "نعم" : "لا"}
                        </button>
                      ))}
                      {c.listened === null && <span className="text-xs text-muted-foreground">غير محدد</span>}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}

          {noCardStudents.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2"><UserX className="h-4 w-4" /> لم تصل بطاقتها</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p className="text-xs text-muted-foreground">حدّدي من تريدين تسجيلها غائبة. من لا تحدّدينها تبقى بلا سجل.</p>
                {noCardStudents.map((s) => (
                  <label key={s.id} className="flex items-center gap-2">
                    <input type="checkbox" checked={absentIds.has(s.id)} disabled={s.onLeave}
                      onChange={(e) => setAbsentIds((prev) => { const n = new Set(prev); if (e.target.checked) n.add(s.id); else n.delete(s.id); return n; })} />
                    <span>{s.name}</span>
                    {s.onLeave && <Badge className="border-0 bg-muted text-muted-foreground text-xs">إجازة</Badge>}
                  </label>
                ))}
              </CardContent>
            </Card>
          )}
        </>
      )}

      {result && (
        <Card className={result.failed.length ? "border-rose-300" : "border-green-300"}>
          <CardContent className="pt-4 text-sm space-y-1">
            <p className="font-semibold">تم حفظ {result.ok} سجل{result.skipped > 0 ? `، وبقي ${result.skipped} للمراجعة` : ""}.</p>
            {result.failed.map((f, i) => <p key={i} className="text-rose-600 text-xs">تعذّر حفظ {f.name}: {f.error}</p>)}
          </CardContent>
        </Card>
      )}

      {cards !== null && cards.length > 0 && (
        <div className="fixed bottom-0 inset-x-0 z-20 border-t bg-background/95 backdrop-blur p-3">
          <Button className="w-full" disabled={saving || totalToSave === 0} onClick={save}>
            {saving ? <><Loader2 className="h-4 w-4 animate-spin ml-2" /> جارٍ الحفظ…</> : `حفظ ${totalToSave} سجل`}
          </Button>
        </div>
      )}
    </div>
  );
}
