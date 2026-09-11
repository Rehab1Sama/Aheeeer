import { useState } from "react";
import {
  useListStudentsNearCompletion, useListExamRecords, useCreateExamRecord, useUpdateExamRecord, useDeleteExamRecord
} from "@workspace/api-client-react";
import { makeWhatsAppLink } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, Plus, Pencil, Trash2, BookOpen, Award, Phone } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} xmlns="http://www.w3.org/2000/svg">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.886 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
  );
}

const GRADES = ["ممتاز", "جيد جدًا", "جيد", "مقبول", "ضعيف"];

interface VolunteerPageProps { userRole?: string; }

export default function VolunteerPage({ userRole }: VolunteerPageProps) {
  const [showDialog, setShowDialog] = useState(false);
  const [editingRecord, setEditingRecord] = useState<any>(null);
  const [selectedStudent, setSelectedStudent] = useState<any>(null);
  const [form, setForm] = useState({ studentId: 0, date: (() => { const d = new Date(Date.now() + 3*60*60*1000); if(d.getUTCHours()<5) d.setUTCDate(d.getUTCDate()-1); return d.toISOString().slice(0,10); })(), juzNumber: "", responded: true, grade: "جيد", notes: "" });
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: nearCompletion = [] } = useListStudentsNearCompletion({});
  const { data: examRecords = [] } = useListExamRecords({});
  const createMutation = useCreateExamRecord();
  const updateMutation = useUpdateExamRecord();
  const deleteMutation = useDeleteExamRecord();

  const isLeader = userRole === "leader";

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["listExamRecords"] });
    qc.invalidateQueries({ queryKey: ["listStudentsNearCompletion"] });
  }

  function openExam(student: any) {
    setSelectedStudent(student);
    setEditingRecord(null);
    const totalJuz = student.juzCompleted;
    const _d = new Date(Date.now() + 3*60*60*1000); if(_d.getUTCHours()<5) _d.setUTCDate(_d.getUTCDate()-1);
    setForm({ studentId: student.studentId, date: _d.toISOString().slice(0,10), juzNumber: String(totalJuz + 1), responded: true, grade: "جيد", notes: "" });
    setShowDialog(true);
  }

  function openEdit(r: any) {
    setEditingRecord(r);
    setSelectedStudent(null);
    setForm({ studentId: r.studentId, date: r.date, juzNumber: String(r.juzNumber ?? ""), responded: r.responded, grade: r.grade ?? "جيد", notes: r.notes ?? "" });
    setShowDialog(true);
  }

  async function handleSave() {
    try {
      const payload = {
        studentId: form.studentId, date: form.date, responded: form.responded,
        juzNumber: form.juzNumber ? parseInt(form.juzNumber) : null,
        grade: form.responded ? form.grade : null, notes: form.notes || null,
      };
      if (editingRecord) {
        await updateMutation.mutateAsync({ id: editingRecord.id, data: payload });
      } else {
        await createMutation.mutateAsync({ data: payload });
      }
      invalidate();
      setShowDialog(false);
      toast({ title: "تم تسجيل الاختبار" });
    } catch { toast({ title: "حدث خطأ", variant: "destructive" }); }
  }

  async function handleDelete(id: number) {
    await deleteMutation.mutateAsync({ id });
    invalidate();
    toast({ title: "تم الحذف" });
  }

  return (
    <div className="p-4 max-w-4xl mx-auto" dir="rtl">
      <h1 className="text-2xl font-bold text-primary mb-6 flex items-center gap-2">
        <Award className="w-6 h-6" />متابعة الاختبارات
      </h1>

      <div className="mb-8">
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-amber-500" />
          الطالبات قرب إتمام الجزء
        </h2>
        {nearCompletion.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground rounded-xl border border-dashed">لا توجد طالبات قرب إتمام جزء حاليًا</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {nearCompletion.map(s => {
              const studentRecords = examRecords.filter(r => r.studentId === s.studentId);
              const isCompleted = (s as any).atJuzBoundary;
              const isNear = s.nearCompletion;
              return (
                <div key={s.studentId} className={`rounded-xl border p-4 bg-card ${isNear ? "border-amber-300 bg-amber-50/50" : isCompleted ? "border-green-400 bg-green-50/50" : ""}`}>
                  {/* شارة الجزء في الأعلى */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-base leading-tight">{s.studentName}</div>
                      <div className="text-sm text-muted-foreground mt-0.5">📚 {s.circleName}</div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0 mr-2">
                      {isCompleted && (
                        <Badge className="bg-green-600 text-white text-xs font-bold px-2.5 py-1">
                          ✅ أتمّت الجزء {s.juzCompleted}
                        </Badge>
                      )}
                      {isNear && !isCompleted && (
                        <Badge className="bg-amber-500 text-white text-xs font-bold px-2.5 py-1">
                          ⏳ تقترب من الجزء {s.juzCompleted + 1}
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* الرقم وزر الواتساب */}
                  {s.phone && (
                    <div className="flex items-center gap-2 mb-3 bg-muted/40 rounded-lg px-3 py-2">
                      <Phone className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <span className="text-sm font-medium flex-1" dir="ltr">{s.phone}</span>
                      <a
                        href={makeWhatsAppLink(s.phone)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-[#25D366] text-white hover:bg-[#128C7E] font-semibold transition-colors"
                      >
                        <WhatsAppIcon className="w-3.5 h-3.5" />
                        واتساب
                      </a>
                    </div>
                  )}

                  {/* الصفحات المحفوظة */}
                  <div className="text-xs text-muted-foreground mb-3">
                    <span>{s.totalMemorizePages} صفحة محفوظة</span>
                    <span className="mx-1.5">•</span>
                    <span>{s.juzCompleted} جزء مكتمل</span>
                  </div>
                  {studentRecords.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-2">
                      {studentRecords.map(r => (
                        <div key={r.id} className={`text-xs px-2 py-1 rounded-full flex items-center gap-1 ${r.responded ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                          {r.responded ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                          جزء {r.juzNumber} — {r.responded ? r.grade : "لم تؤد"}
                          {userRole === "leader" || userRole === "volunteer" ? (
                            <button onClick={() => handleDelete(r.id)} className="hover:text-destructive"><Trash2 className="w-3 h-3" /></button>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )}
                  <Button size="sm" variant="outline" className="w-full" onClick={() => openExam(s)}>
                    <Plus className="w-3.5 h-3.5 ml-1" />تسجيل اختبار
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {examRecords.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3">سجل الاختبارات</h2>
          <div className="space-y-2">
            {examRecords.map(r => (
              <div key={r.id} className="flex items-center justify-between p-3 rounded-lg border bg-card">
                <div className="flex items-center gap-3">
                  {r.responded ? <CheckCircle2 className="w-5 h-5 text-green-500" /> : <XCircle className="w-5 h-5 text-red-400" />}
                  <div>
                    <div className="font-medium">{r.studentName}</div>
                    <div className="text-sm text-muted-foreground">
                      {r.date} {r.juzNumber && `• الجزء ${r.juzNumber}`}
                      {r.responded && r.grade && ` • ${r.grade}`}
                    </div>
                    {r.notes && <div className="text-xs text-muted-foreground">{r.notes}</div>}
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(r)}><Pencil className="w-3.5 h-3.5" /></Button>
                  {isLeader && <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(r.id)}><Trash2 className="w-3.5 h-3.5" /></Button>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>تسجيل اختبار {selectedStudent?.studentName ?? editingRecord?.studentName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div><Label>التاريخ</Label><Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} /></div>
            <div><Label>رقم الجزء</Label><Input type="number" min={1} max={30} value={form.juzNumber} onChange={e => setForm(f => ({ ...f, juzNumber: e.target.value }))} /></div>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" checked={form.responded} onChange={() => setForm(f => ({ ...f, responded: true }))} />
                <span>✅ أدّت الاختبار</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" checked={!form.responded} onChange={() => setForm(f => ({ ...f, responded: false }))} />
                <span>❌ لم تؤدِّ</span>
              </label>
            </div>
            {form.responded && (
              <div><Label>التقدير</Label>
                <Select value={form.grade} onValueChange={v => setForm(f => ({ ...f, grade: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{GRADES.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            <div><Label>ملاحظات</Label><Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>إلغاء</Button>
            <Button onClick={handleSave} disabled={createMutation.isPending || updateMutation.isPending}>حفظ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
