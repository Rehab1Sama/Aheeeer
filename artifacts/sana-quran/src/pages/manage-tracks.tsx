import { useState } from "react";
import {
  useListTracks, useCreateTrack, useDeleteTrack, useUpdateTrack,
  useListCircles, useCreateCircleInTrack, useDeleteCircle, useUpdateCircle,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Layers, Plus, Trash2, BookOpen, Users,
  X, Check, Pencil, Link2, UserPlus, RefreshCw, ArrowRightLeft,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

const DATA_ENTRY_LABELS: Record<string, { label: string; color: string; desc: string }> = {
  girls: {
    label: "فتيات — حفظ",
    color: "bg-teal-100 text-teal-700",
    desc: "حفظ + مراجعة قريبة + مراجعة بعيدة + سماع",
  },
  girls_near: {
    label: "فتيات — قريبة فقط",
    color: "bg-teal-100 text-teal-600",
    desc: "حفظ + مراجعة قريبة + سماع",
  },
  girls_far: {
    label: "فتيات — بعيدة فقط",
    color: "bg-teal-100 text-teal-600",
    desc: "حفظ + مراجعة بعيدة + سماع",
  },
  girls_no_review: {
    label: "فتيات — بلا مراجعة",
    color: "bg-teal-100 text-teal-600",
    desc: "حفظ + سماع (بدون مراجعة)",
  },
  children: {
    label: "أطفال",
    color: "bg-sky-100 text-sky-700",
    desc: "حفظ + مراجعة عامة",
  },
  mothers: {
    label: "أمهات",
    color: "bg-purple-100 text-purple-700",
    desc: "حفظ + مراجعة قريبة + مراجعة بعيدة",
  },
  simple_review: {
    label: "مراجعة عامة",
    color: "bg-blue-100 text-blue-700",
    desc: "حفظ + مراجعة (عام)",
  },
  fixation: {
    label: "تثبيت",
    color: "bg-amber-100 text-amber-700",
    desc: "تثبيت جديد + تكرار + مراجعة + سماع القارئ",
  },
  recitation: {
    label: "تصحيح التلاوة",
    color: "bg-rose-100 text-rose-700",
    desc: "تلاوة فقط (بدون حفظ أو مراجعة)",
  },
};

export default function ManageTracksPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: tracks, isLoading: tracksLoading } = useListTracks({ query: { queryKey: ["tracks"] } });
  const { data: circles } = useListCircles(undefined, { query: { queryKey: ["circles"] } });

  const createTrack = useCreateTrack();
  const updateTrack = useUpdateTrack();
  const deleteTrack = useDeleteTrack();
  const createCircle = useCreateCircleInTrack();
  const updateCircle = useUpdateCircle();
  const deleteCircle = useDeleteCircle();

  const [showNewTrack, setShowNewTrack] = useState(false);
  const [newTrackName, setNewTrackName] = useState("");
  const [newTrackType, setNewTrackType] = useState<"girls" | "girls_near" | "girls_far" | "girls_no_review" | "children" | "mothers" | "simple_review" | "recitation" | "fixation">("girls");

  const [newCircleName, setNewCircleName] = useState<Record<number, string>>({});
  const [showNewCircle, setShowNewCircle] = useState<Record<number, boolean>>({});

  const [editingTrackId, setEditingTrackId] = useState<number | null>(null);
  const [editTrackName, setEditTrackName] = useState("");
  const [editingCircleId, setEditingCircleId] = useState<number | null>(null);
  const [editCircleName, setEditCircleName] = useState("");
  const [editingCircleExtra, setEditingCircleExtra] = useState<number | null>(null);
  const [editCircleWhatsapp, setEditCircleWhatsapp] = useState("");
  const [editCircleMeetingTime, setEditCircleMeetingTime] = useState("");
  const [editCircleCapacity, setEditCircleCapacity] = useState("");
  const [movingCircleId, setMovingCircleId] = useState<number | null>(null);
  const [moveTargetTrack, setMoveTargetTrack] = useState("");
  const [syncing, setSyncing] = useState(false);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["tracks"] });
    queryClient.invalidateQueries({ queryKey: ["circles"] });
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/setup/sync", { method: "POST" });
      const json = await res.json();
      if (json.ok) {
        toast({ title: json.results.join(" | ") });
        invalidate();
      } else {
        toast({ title: json.error ?? "خطأ في المزامنة", variant: "destructive" });
      }
    } catch {
      toast({ title: "تعذّر الاتصال بالخادم", variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  };

  const handleCreateTrack = () => {
    if (!newTrackName.trim()) return;
    createTrack.mutate(
      { data: { name: newTrackName.trim(), dataEntryType: newTrackType as "girls" | "simple_review" | "recitation" | "fixation" } },
      {
        onSuccess: () => {
          toast({ title: `تم إنشاء مسار "${newTrackName.trim()}"` });
          setNewTrackName("");
          setShowNewTrack(false);
          invalidate();
        },
        onError: (e: any) => {
          toast({ title: e?.message ?? "خطأ في الإنشاء", variant: "destructive" });
        },
      }
    );
  };

  const handleDeleteTrack = (id: number, name: string) => {
    const count = (circles ?? []).filter(c => (c as any).trackId === id || c.track === name).length;
    if (count > 0) {
      toast({ title: `لا يمكن حذف المسار — يحتوي على ${count} حلقة`, variant: "destructive" });
      return;
    }
    if (!confirm(`هل تريدين حذف مسار "${name}" نهائيًا؟`)) return;
    deleteTrack.mutate({ id }, {
      onSuccess: () => { toast({ title: `تم حذف مسار "${name}"` }); invalidate(); },
    });
  };

  const handleCreateCircle = (trackId: number) => {
    const name = newCircleName[trackId]?.trim();
    if (!name) return;
    createCircle.mutate(
      { id: trackId, data: { name } },
      {
        onSuccess: () => {
          toast({ title: `تم إنشاء حلقة "${name}"` });
          setNewCircleName(v => ({ ...v, [trackId]: "" }));
          setShowNewCircle(v => ({ ...v, [trackId]: false }));
          invalidate();
        },
        onError: (e: any) => {
          toast({ title: e?.message ?? "خطأ في الإنشاء", variant: "destructive" });
        },
      }
    );
  };

  const handleUpdateCircleExtra = (id: number) => {
    updateCircle.mutate(
      { id, data: { whatsappLink: editCircleWhatsapp || null, meetingTime: editCircleMeetingTime || null, newStudentCapacity: editCircleCapacity ? Number(editCircleCapacity) : null } },
      {
        onSuccess: () => {
          toast({ title: "تم الحفظ" });
          setEditingCircleExtra(null);
          invalidate();
        },
        onError: () => toast({ title: "خطأ في الحفظ", variant: "destructive" }),
      }
    );
  };

  const handleDeleteCircle = (id: number, name: string) => {
    if (!confirm(`هل تريدين حذف حلقة "${name}" نهائيًا؟\nتأكدي أنها لا تحتوي على طالبات.`)) return;
    deleteCircle.mutate({ id }, {
      onSuccess: () => { toast({ title: `تم حذف حلقة "${name}"` }); invalidate(); },
      onError: (e: any) => {
        toast({ title: e?.message ?? "لا يمكن حذف الحلقة", variant: "destructive" });
      },
    });
  };

  const handleUpdateTrack = (id: number) => {
    const name = editTrackName.trim();
    if (!name) return;
    updateTrack.mutate(
      { id, data: { name } },
      {
        onSuccess: () => {
          toast({ title: `تم تعديل اسم المسار` });
          setEditingTrackId(null);
          invalidate();
        },
        onError: () => toast({ title: "خطأ في التعديل", variant: "destructive" }),
      }
    );
  };

  const handleUpdateCircle = (id: number) => {
    const name = editCircleName.trim();
    if (!name) return;
    updateCircle.mutate(
      { id, data: { name } },
      {
        onSuccess: () => {
          toast({ title: `تم تعديل اسم الحلقة` });
          setEditingCircleId(null);
          invalidate();
        },
        onError: () => toast({ title: "خطأ في التعديل", variant: "destructive" }),
      }
    );
  };

  const handleMoveCircle = (id: number, circleName: string) => {
    if (!moveTargetTrack) return;
    updateCircle.mutate(
      { id, data: { track: moveTargetTrack } },
      {
        onSuccess: () => {
          toast({ title: `نُقلت حلقة "${circleName}" إلى مسار "${moveTargetTrack}"` });
          setMovingCircleId(null);
          setMoveTargetTrack("");
          invalidate();
        },
        onError: () => toast({ title: "خطأ في نقل الحلقة", variant: "destructive" }),
      }
    );
  };

  return (
    <div className="space-y-5" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Layers className="w-5 h-5 text-primary" />
            إدارة المسارات والحلقات
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            أضيفي مسارات وحلقات جديدة بدون الحاجة لتعديل الكود
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={handleSync}
            disabled={syncing}
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "جارٍ المزامنة..." : "مزامنة"}
          </Button>
          <Button
            size="sm"
            className="gap-1.5"
            onClick={() => setShowNewTrack(v => !v)}
          >
            {showNewTrack ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            {showNewTrack ? "إلغاء" : "مسار جديد"}
          </Button>
        </div>
      </div>

      {/* New Track Form */}
      {showNewTrack && (
        <Card className="border-2 border-primary/20 bg-primary/5 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold text-primary flex items-center gap-2">
              <Plus className="w-4 h-4" />
              إنشاء مسار جديد
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">اسم المسار *</Label>
              <Input
                value={newTrackName}
                onChange={e => setNewTrackName(e.target.value)}
                placeholder="مثال: نور، قمر، ..."
                className="text-right"
                onKeyDown={e => e.key === "Enter" && handleCreateTrack()}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">نوع إدخال البيانات *</Label>
              <p className="text-[11px] text-muted-foreground">يحدد الحقول التي ستظهر لمدخلة البيانات</p>
              <div className="space-y-3">
                {/* Primary categories */}
                <div>
                  <p className="text-[11px] font-semibold text-muted-foreground mb-1.5">الفئة الرئيسية</p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {(["girls", "children", "mothers", "recitation", "fixation"] as const).map(type => {
                      const info = DATA_ENTRY_LABELS[type];
                      return (
                        <button
                          key={type}
                          onClick={() => setNewTrackType(type)}
                          className={`flex items-start gap-3 p-3 rounded-xl border-2 transition-all text-right ${
                            newTrackType === type
                              ? "border-primary bg-primary/5"
                              : "border-border/50 hover:border-primary/30"
                          }`}
                        >
                          <div className={`w-4 h-4 rounded-full border-2 mt-0.5 shrink-0 flex items-center justify-center ${
                            newTrackType === type ? "border-primary bg-primary" : "border-muted-foreground"
                          }`}>
                            {newTrackType === type && <div className="w-2 h-2 rounded-full bg-white" />}
                          </div>
                          <div>
                            <p className="text-sm font-semibold">{info.label}</p>
                            <p className="text-xs text-muted-foreground">{info.desc}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
                {/* Advanced variants */}
                <details className="group">
                  <summary className="text-[11px] font-semibold text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors">
                    ▸ خيارات متقدمة للفتيات (قريبة فقط / بعيدة فقط / بلا مراجعة)
                  </summary>
                  <div className="grid grid-cols-1 gap-2 mt-2 sm:grid-cols-2">
                    {(["girls_near", "girls_far", "girls_no_review", "simple_review"] as const).map(type => {
                      const info = DATA_ENTRY_LABELS[type];
                      return (
                        <button
                          key={type}
                          onClick={() => setNewTrackType(type)}
                          className={`flex items-start gap-3 p-3 rounded-xl border-2 transition-all text-right ${
                            newTrackType === type
                              ? "border-primary bg-primary/5"
                              : "border-border/50 hover:border-primary/30"
                          }`}
                        >
                          <div className={`w-4 h-4 rounded-full border-2 mt-0.5 shrink-0 flex items-center justify-center ${
                            newTrackType === type ? "border-primary bg-primary" : "border-muted-foreground"
                          }`}>
                            {newTrackType === type && <div className="w-2 h-2 rounded-full bg-white" />}
                          </div>
                          <div>
                            <p className="text-sm font-semibold">{info.label}</p>
                            <p className="text-xs text-muted-foreground">{info.desc}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </details>
              </div>
            </div>

            <Button
              className="w-full gap-1.5"
              onClick={handleCreateTrack}
              disabled={!newTrackName.trim() || createTrack.isPending}
            >
              <Check className="w-4 h-4" />
              إنشاء المسار
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Tracks List */}
      {tracksLoading ? (
        <div className="text-center py-12 text-muted-foreground">جاري التحميل...</div>
      ) : (tracks ?? []).length === 0 ? (
        <Card className="border border-border/50 shadow-sm">
          <CardContent className="flex flex-col items-center justify-center py-12 gap-4 text-center">
            <Layers className="w-10 h-10 text-muted-foreground/30" />
            <div>
              <p className="text-base font-semibold text-foreground">لا توجد مسارات بعد</p>
              <p className="text-sm text-muted-foreground mt-1">
                أضيفي مسارًا جديدًا من الزر أعلاه،<br />
                أو إذا كانت البيانات موجودة في قاعدة البيانات، نفّذي الإعداد التلقائي:
              </p>
            </div>
            <a
              href="/api/setup-leader"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-medium hover:bg-teal-700 transition-colors"
            >
              <Check className="w-4 h-4" />
              إعداد المسارات والحلقات تلقائيًا
            </a>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {(tracks ?? []).map(track => {
            const stripPrefix = (s: string) => s.replace(/^مسار\s+/, "").trim();
          const trackCircles = (circles ?? []).filter(c => (c as any).trackId === track.id || c.track === stripPrefix(track.name));
            const info = DATA_ENTRY_LABELS[track.dataEntryType] ?? DATA_ENTRY_LABELS.girls;

            return (
              <Card key={track.id} className="border border-border/50 shadow-sm">
                <CardHeader className="pb-2 pt-4 px-4">
                  <div className="flex items-center justify-between gap-2">
                    {editingTrackId === track.id ? (
                      <div className="flex gap-2 flex-1">
                        <Input
                          value={editTrackName}
                          onChange={e => setEditTrackName(e.target.value)}
                          className="text-right text-sm h-8 flex-1"
                          autoFocus
                          onKeyDown={e => {
                            if (e.key === "Enter") handleUpdateTrack(track.id);
                            if (e.key === "Escape") setEditingTrackId(null);
                          }}
                        />
                        <Button size="sm" className="h-8 px-2.5" onClick={() => handleUpdateTrack(track.id)} disabled={!editTrackName.trim()}>
                          <Check className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="sm" variant="outline" className="h-8 px-2.5" onClick={() => setEditingTrackId(null)}>
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3 flex-1">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-base font-bold text-foreground">{track.name}</span>
                            <Badge className={`text-[10px] border-0 px-1.5 ${info.color}`}>
                              {info.label}
                            </Badge>
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Users className="w-3 h-3" />
                              {trackCircles.length} حلقة
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">{info.desc}</p>
                        </div>
                      </div>
                    )}
                    {editingTrackId !== track.id && (
                      <div className="flex gap-1 shrink-0">
                        <button
                          onClick={() => { setEditingTrackId(track.id); setEditTrackName(track.name); }}
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-blue-600 hover:bg-blue-50 transition-colors"
                          title="تعديل الاسم"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteTrack(track.id, track.name)}
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-rose-600 hover:bg-rose-50 transition-colors"
                          title="حذف المسار"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </CardHeader>

                <CardContent className="pt-0 pb-4 px-4 space-y-2">
                    <div className="border-t border-border/50 pt-3 space-y-2">
                      {trackCircles.length === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-2">لا توجد حلقات في هذا المسار</p>
                      ) : (
                        trackCircles.map(circle => (
                          <div
                            key={circle.id}
                            className="flex items-center justify-between gap-2 bg-muted/30 rounded-xl px-3 py-2"
                          >
                            {editingCircleId === circle.id ? (
                              <div className="flex gap-2 flex-1">
                                <Input
                                  value={editCircleName}
                                  onChange={e => setEditCircleName(e.target.value)}
                                  className="text-right text-sm h-7 flex-1"
                                  autoFocus
                                  onKeyDown={e => {
                                    if (e.key === "Enter") handleUpdateCircle(circle.id);
                                    if (e.key === "Escape") setEditingCircleId(null);
                                  }}
                                />
                                <button
                                  onClick={() => handleUpdateCircle(circle.id)}
                                  className="p-1 rounded text-green-600 hover:bg-green-50 transition-colors"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => setEditingCircleId(null)}
                                  className="p-1 rounded text-muted-foreground hover:bg-muted transition-colors"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : movingCircleId === circle.id ? (
                              <div className="flex-1 flex items-center gap-2 flex-wrap">
                                <ArrowRightLeft className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                                <span className="text-xs text-muted-foreground">نقل إلى:</span>
                                <select
                                  autoFocus
                                  className="flex-1 border border-input rounded-md px-2 py-1 text-sm bg-background text-right"
                                  value={moveTargetTrack}
                                  onChange={e => setMoveTargetTrack(e.target.value)}
                                >
                                  <option value="">— اختاري المسار —</option>
                                  {(tracks ?? [])
                                    .filter(t => t.name !== track.name)
                                    .map(t => (
                                      <option key={t.id} value={t.name}>{t.name}</option>
                                    ))}
                                </select>
                                <button
                                  onClick={() => handleMoveCircle(circle.id, circle.name)}
                                  disabled={!moveTargetTrack || updateCircle.isPending}
                                  className="p-1 rounded text-green-600 hover:bg-green-50 disabled:opacity-40 transition-colors"
                                  title="تأكيد النقل"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => { setMovingCircleId(null); setMoveTargetTrack(""); }}
                                  className="p-1 rounded text-muted-foreground hover:bg-muted transition-colors"
                                  title="إلغاء"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : editingCircleExtra === circle.id ? (
                              <div className="flex-1 space-y-2">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-muted-foreground w-24">رابط الواتس:</span>
                                  <Input
                                    value={editCircleWhatsapp}
                                    onChange={e => setEditCircleWhatsapp(e.target.value)}
                                    placeholder="https://chat.whatsapp.com/..."
                                    className="h-7 text-xs flex-1"
                                    dir="ltr"
                                  />
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-muted-foreground w-24">وقت الحلقة:</span>
                                  <Input
                                    value={editCircleMeetingTime}
                                    onChange={e => setEditCircleMeetingTime(e.target.value)}
                                    placeholder="مثال: ٧م - ٩م"
                                    className="h-7 text-xs flex-1"
                                  />
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-muted-foreground w-24">سعة الجديدات:</span>
                                  <Input
                                    type="number"
                                    min="0"
                                    value={editCircleCapacity}
                                    onChange={e => setEditCircleCapacity(e.target.value)}
                                    placeholder="فارغ = بلا حد"
                                    className="h-7 text-xs flex-1"
                                  />
                                </div>
                                <div className="flex gap-2">
                                  <button onClick={() => handleUpdateCircleExtra(circle.id)} className="p-1 rounded text-green-600 hover:bg-green-50">
                                    <Check className="w-3.5 h-3.5" />
                                  </button>
                                  <button onClick={() => setEditingCircleExtra(null)} className="p-1 rounded text-muted-foreground hover:bg-muted">
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <>
                                <div className="flex items-center gap-2 flex-1 min-w-0 flex-wrap">
                                  <BookOpen className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                  <span className="text-sm font-medium">{circle.name}</span>
                                  {(circle as any).studentCount != null && (
                                    <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                                      <Users className="w-2.5 h-2.5" />
                                      {(circle as any).studentCount}
                                    </span>
                                  )}
                                  {(circle as any).meetingTime && (
                                    <span className="text-[10px] text-muted-foreground bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full">{(circle as any).meetingTime}</span>
                                  )}
                                  {(circle as any).newStudentCapacity != null && (
                                    <span className="text-[10px] bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                                      <UserPlus className="w-2.5 h-2.5" />
                                      {(circle as any).newStudentCapacity}
                                    </span>
                                  )}
                                  {(circle as any).whatsappLink && (
                                    <a
                                      href={(circle as any).whatsappLink}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-[10px] text-green-600 bg-green-50 px-1.5 py-0.5 rounded-full hover:bg-green-100 flex items-center gap-0.5"
                                      onClick={e => e.stopPropagation()}
                                    >
                                      <Link2 className="w-2.5 h-2.5" />
                                      واتساب
                                    </a>
                                  )}
                                </div>
                                <div className="flex gap-1 shrink-0">
                                  <button
                                    onClick={() => { setEditingCircleId(circle.id); setEditCircleName(circle.name); }}
                                    className="p-1 rounded text-muted-foreground hover:text-blue-600 hover:bg-blue-50 transition-colors"
                                    title="تعديل الاسم"
                                  >
                                    <Pencil className="w-3 h-3" />
                                  </button>
                                  <button
                                    onClick={() => { setMovingCircleId(circle.id); setMoveTargetTrack(""); }}
                                    className="p-1 rounded text-muted-foreground hover:text-amber-600 hover:bg-amber-50 transition-colors"
                                    title="نقل إلى مسار آخر"
                                  >
                                    <ArrowRightLeft className="w-3 h-3" />
                                  </button>
                                  <button
                                    onClick={() => {
                                      setEditingCircleExtra(circle.id);
                                      setEditCircleWhatsapp((circle as any).whatsappLink ?? "");
                                      setEditCircleMeetingTime((circle as any).meetingTime ?? "");
                                      setEditCircleCapacity((circle as any).newStudentCapacity?.toString() ?? "");
                                    }}
                                    className="p-1 rounded text-muted-foreground hover:text-teal-600 hover:bg-teal-50 transition-colors"
                                    title="إعدادات الحلقة"
                                  >
                                    <Link2 className="w-3 h-3" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteCircle(circle.id, circle.name)}
                                    className="p-1 rounded text-muted-foreground hover:text-rose-600 hover:bg-rose-50 transition-colors"
                                    title="حذف الحلقة"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        ))
                      )}

                      {/* Add Circle */}
                      {showNewCircle[track.id] ? (
                        <div className="flex gap-2 pt-1">
                          <Input
                            value={newCircleName[track.id] ?? ""}
                            onChange={e => setNewCircleName(v => ({ ...v, [track.id]: e.target.value }))}
                            placeholder="اسم الحلقة الجديدة..."
                            className="text-right text-sm h-8"
                            autoFocus
                            onKeyDown={e => {
                              if (e.key === "Enter") handleCreateCircle(track.id);
                              if (e.key === "Escape") setShowNewCircle(v => ({ ...v, [track.id]: false }));
                            }}
                          />
                          <Button
                            size="sm"
                            className="h-8 px-3"
                            onClick={() => handleCreateCircle(track.id)}
                            disabled={!newCircleName[track.id]?.trim()}
                          >
                            <Check className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 px-3"
                            onClick={() => setShowNewCircle(v => ({ ...v, [track.id]: false }))}
                          >
                            <X className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setShowNewCircle(v => ({ ...v, [track.id]: true }))}
                          className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border border-dashed border-border/70 text-xs text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          إضافة حلقة جديدة
                        </button>
                      )}
                    </div>
                  </CardContent>
              </Card>
            );
          })}

        </div>
      )}
    </div>
  );
}
