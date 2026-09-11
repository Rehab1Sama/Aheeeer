import { useState, useMemo } from "react";
import {
  useListCircleNames,
  useListStudents,
  useListUsers,
  useSendMessage,
  useBatchSendMessages,
  useListMessages,
  useDeleteMessage,
  useGetAttendanceByDate,
  useListTracks,
  useGetCurrentUser,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Send, Trash2, MessageSquare, Users, User, LayoutList,
  Clock, UserCheck, BookOpen, ShieldCheck, BarChart2,
  CalendarX, CalendarCheck, Sparkles, ChevronDown,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";


const MESSAGE_TEMPLATES = [
  { label: "تذكير بالاجتماع", text: "تذكير بأن هناك اجتماعًا مقررًا قريبًا، يرجى الحضور في الموعد المحدد." },
  { label: "غياب اليوم", text: "لم تتمكني من الحضور اليوم، نتمنى لكِ الصحة والعافية. تواصلي مع معلمتكِ لتعويض الغياب." },
  { label: "أداء مميز", text: "مبروك! أداؤكِ هذا الأسبوع كان مميزًا ومتميزًا، استمري في هذا المستوى الرائع." },
  { label: "تذكير بالمراجعة", text: "نذكّركِ بأهمية المراجعة المنتظمة للمحفوظات، جزاكِ الله خيرًا." },
  { label: "إشعار بعطلة", text: "تُعلِم إدارة المقرأة بأنه سيكون هناك إجازة يوم الجمعة القادم، نلتقي بإذن الله الجمعة التالية." },
  { label: "جلسة اختبار", text: "تذكير بأن جلسة الاختبار الشهري ستُعقد قريبًا، يرجى الاستعداد والمراجعة الجيدة." },
];

type SelectorMode =
  | "circle" | "track" | "student"
  | "role_teacher" | "role_supervisor" | "role_track_supervisor"
  | "absent" | "present";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("ar-SA", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
function formatDateOnly(iso: string) {
  return new Date(iso).toLocaleDateString("ar-SA", { year: "numeric", month: "long", day: "numeric" });
}
function isExpired(expiresAt: string | null | undefined) {
  if (!expiresAt) return false;
  return new Date(expiresAt) < new Date();
}
function targetTypeBadge(t: string) {
  if (t === "student") return <Badge className="bg-teal-100 text-teal-700 text-xs">طالبة</Badge>;
  if (t === "circle")  return <Badge className="bg-blue-100 text-blue-700 text-xs">حلقة</Badge>;
  if (t === "track")   return <Badge className="bg-emerald-100 text-emerald-700 text-xs">مسار</Badge>;
  if (t === "role")    return <Badge className="bg-orange-100 text-orange-700 text-xs">دور وظيفي</Badge>;
  return <Badge className="bg-gray-100 text-gray-700 text-xs">{t}</Badge>;
}
function roleBadgeLabel(id: string) {
  if (id === "teacher")          return "المعلمات";
  if (id === "supervisor")       return "المشرفات";
  if (id === "track_supervisor") return "مسؤولات المسارات";
  return id;
}

const STUDENT_MODES: { mode: SelectorMode; label: string; icon: React.FC<any> }[] = [
  { mode: "circle",  label: "حلقة",           icon: Users },
  { mode: "track",   label: "مسار",            icon: LayoutList },
  { mode: "student", label: "طالبة فردية",     icon: User },
  { mode: "absent",  label: "غائبات",          icon: CalendarX },
  { mode: "present", label: "حاضرات",          icon: CalendarCheck },
];
const STAFF_MODES: { mode: SelectorMode; label: string; icon: React.FC<any>; role: string }[] = [
  { mode: "role_teacher",          label: "المعلمات",           icon: BookOpen,     role: "teacher" },
  { mode: "role_supervisor",       label: "المشرفات",           icon: ShieldCheck,  role: "supervisor" },
  { mode: "role_track_supervisor", label: "مسؤولات المسارات",  icon: BarChart2,    role: "track_supervisor" },
];

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function MessagesPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: currentUser } = useGetCurrentUser({ query: { queryKey: ["getCurrentUser"] } });
  const isTrackSupervisor = currentUser?.role === "track_supervisor";
  const myTrack = (currentUser as any)?.track as string | undefined;

  const [mode, setMode]           = useState<SelectorMode>("circle");
  const [targetId, setTargetId]   = useState("");
  const [circleTrackFilter, setCircleTrackFilter] = useState("");
  const [attendanceDate, setAttendanceDate] = useState(today());
  const [content, setContent]     = useState("");
  const [expiryEnabled, setExpiryEnabled] = useState(false);
  const [expiryDate, setExpiryDate]       = useState("");
  const [showTemplates, setShowTemplates] = useState(false);

  const { data: allCircles }  = useListCircleNames({ query: { queryKey: ["circleNames"] } });
  // For track_supervisor, only show circles in their track
  const circles = isTrackSupervisor && myTrack
    ? (allCircles ?? []).filter((c: any) => c.track === myTrack)
    : allCircles;

  const { data: students } = useListStudents(undefined, { query: { queryKey: ["allStudents"] } });
  const { data: tracks } = useListTracks({ query: { queryKey: ["tracks"] } });
  const { data: users }    = useListUsers(undefined, { query: { queryKey: ["users"] } });
  const { data: messages } = useListMessages({ query: { queryKey: ["messages"] } });
  const { data: attendance } = useGetAttendanceByDate(
    { date: attendanceDate },
    { query: { queryKey: ["attendanceByDate", attendanceDate], enabled: mode === "absent" || mode === "present" } }
  );

  const sendMessage      = useSendMessage();
  const batchSend        = useBatchSendMessages();
  const deleteMessage    = useDeleteMessage();

  const isAttendanceMode = mode === "absent" || mode === "present";
  const isRoleMode = mode.startsWith("role_");
  const staffRole = isRoleMode ? STAFF_MODES.find(s => s.mode === mode)?.role ?? "" : "";

  const recipientInfo = useMemo(() => {
    if (isRoleMode) {
      const count = (users ?? []).filter((u: any) => u.role === staffRole).length;
      const label = STAFF_MODES.find(s => s.mode === mode)?.label ?? "";
      return { count, label };
    }
    if (isAttendanceMode) {
      const list = mode === "absent" ? attendance?.absent : attendance?.present;
      const label = mode === "absent" ? "الغائبات" : "الحاضرات";
      return { count: list?.length ?? 0, label: `${label} — ${attendanceDate}`, list };
    }
    if (mode === "student" && targetId) {
      const s = (students ?? []).find((s: any) => String(s.id) === targetId);
      return s ? { count: 1, label: (s as any).fullName } : null;
    }
    if (mode === "circle" && targetId) {
      const circle = (circles ?? []).find((c: any) => String(c.id) === targetId);
      const count  = (students ?? []).filter((s: any) => String((s as any).circleId) === targetId).length;
      return circle ? { count, label: `${circle.name} (${circle.track})` } : null;
    }
    if (mode === "track" && targetId) {
      const count = (students ?? []).filter((s: any) => (s as any).track === targetId).length;
      return { count, label: targetId };
    }
    return null;
  }, [mode, targetId, attendanceDate, attendance, students, circles, users, isRoleMode, isAttendanceMode, staffRole]);

  const canSend = useMemo(() => {
    if (!content.trim()) return false;
    if (expiryEnabled && !expiryDate) return false;
    if (isRoleMode) return true;
    if (isAttendanceMode) return (recipientInfo?.count ?? 0) > 0;
    return !!targetId;
  }, [content, expiryEnabled, expiryDate, isRoleMode, isAttendanceMode, targetId, recipientInfo]);

  const handleSend = () => {
    const expiresAt = expiryEnabled && expiryDate
      ? new Date(expiryDate + "T23:59:59").toISOString()
      : null;

    if (isAttendanceMode) {
      const list = mode === "absent" ? attendance?.absent : attendance?.present;
      const ids  = (list ?? []).map((s: any) => s.studentId);
      if (!ids.length) return;
      batchSend.mutate(
        { data: { studentIds: ids, content: content.trim(), expiresAt } },
        {
          onSuccess: (res: any) => {
            toast({ title: `تم إرسال الرسالة لـ ${res.count} طالبة` });
            setContent(""); setExpiryEnabled(false); setExpiryDate("");
            queryClient.invalidateQueries({ queryKey: ["messages"] });
          },
          onError: () => toast({ title: "خطأ في الإرسال", variant: "destructive" }),
        }
      );
      return;
    }

    const [resolvedType, resolvedId] = isRoleMode
      ? ["role", staffRole]
      : [mode, targetId];

    sendMessage.mutate(
      { data: { targetType: resolvedType, targetId: resolvedId, content: content.trim(), expiresAt } },
      {
        onSuccess: () => {
          toast({ title: "تم إرسال الرسالة" });
          setContent(""); setTargetId(""); setExpiryEnabled(false); setExpiryDate("");
          queryClient.invalidateQueries({ queryKey: ["messages"] });
        },
        onError: () => toast({ title: "خطأ في الإرسال", variant: "destructive" }),
      }
    );
  };

  const handleDelete = (id: number) => {
    if (!confirm("هل تريدين حذف هذه الرسالة؟")) return;
    deleteMessage.mutate(
      { id },
      {
        onSuccess: () => {
          toast({ title: "تم حذف الرسالة" });
          queryClient.invalidateQueries({ queryKey: ["messages"] });
        },
      }
    );
  };

  return (
    <div className="space-y-5" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">الرسائل</h1>
        <p className="text-muted-foreground text-sm mt-1">اختاري المستلمين وأرسلي رسالتك</p>
      </div>

      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-bold text-muted-foreground flex items-center gap-2">
            <Send className="w-4 h-4" />
            رسالة جديدة
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">

          {/* ─── Selector — restricted for track_supervisor ─── */}
          {isTrackSupervisor ? (
            <div>
              <p className="text-xs text-muted-foreground mb-2 font-semibold">الإرسال إلى</p>
              <div className="flex gap-2">
                {[
                  { mode: "circle" as SelectorMode, label: "حلقة من مساري", icon: Users },
                  { mode: "track"  as SelectorMode, label: "كل مساري",       icon: LayoutList },
                ].map(({ mode: m, label, icon: Icon }) => (
                  <button
                    key={m}
                    onClick={() => {
                      setMode(m);
                      setTargetId(m === "track" ? (myTrack ?? "") : "");
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors ${
                      mode === m
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background border-border text-muted-foreground hover:bg-muted/50"
                    }`}
                  >
                    <Icon className="w-3 h-3" />
                    {label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {/* ─── Student-group selector ─── */}
              <div>
                <p className="text-xs text-muted-foreground mb-2 font-semibold">مجموعات الطالبات</p>
                <div className="flex flex-wrap gap-2">
                  {STUDENT_MODES.map(({ mode: m, label, icon: Icon }) => (
                    <button
                      key={m}
                      onClick={() => { setMode(m); setTargetId(""); setCircleTrackFilter(""); }}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors ${
                        mode === m
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background border-border text-muted-foreground hover:bg-muted/50"
                      }`}
                    >
                      <Icon className="w-3 h-3" />
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* ─── Staff-group selector ─── */}
              <div>
                <p className="text-xs text-muted-foreground mb-2 font-semibold">مجموعات الكادر</p>
                <div className="flex flex-wrap gap-2">
                  {STAFF_MODES.map(({ mode: m, label, icon: Icon }) => (
                    <button
                      key={m}
                      onClick={() => { setMode(m); setTargetId(""); setCircleTrackFilter(""); }}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors ${
                        mode === m
                          ? "bg-orange-500 text-white border-orange-500"
                          : "bg-background border-border text-muted-foreground hover:bg-muted/50"
                      }`}
                    >
                      <Icon className="w-3 h-3" />
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* ─── Sub-selectors ─── */}
          {mode === "circle" && !isTrackSupervisor && (
            <select
              value={circleTrackFilter}
              onChange={e => { setCircleTrackFilter(e.target.value); setTargetId(""); }}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground"
              dir="rtl"
            >
              <option value="">كل المسارات</option>
              {(tracks ?? []).map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
            </select>
          )}
          {mode === "circle" && (
            <select value={targetId} onChange={e => setTargetId(e.target.value)}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground" dir="rtl">
              <option value="">اختاري الحلقة</option>
              {(isTrackSupervisor
                ? circles
                : circleTrackFilter
                  ? circles?.filter((c: any) => c.track === circleTrackFilter)
                  : circles
              )?.map(c => <option key={c.id} value={String(c.id)}>{c.name}{!isTrackSupervisor && !circleTrackFilter && ` (${c.track})`}</option>)}
            </select>
          )}
          {mode === "track" && !isTrackSupervisor && (
            <select value={targetId} onChange={e => setTargetId(e.target.value)}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground" dir="rtl">
              <option value="">اختاري المسار</option>
              {(tracks ?? []).map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
            </select>
          )}
          {mode === "track" && isTrackSupervisor && myTrack && (
            <div className="px-3 py-2 bg-muted/50 rounded-lg text-sm font-medium border border-border">
              مسار: {myTrack}
            </div>
          )}
          {mode === "student" && (
            <select value={targetId} onChange={e => setTargetId(e.target.value)}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground" dir="rtl">
              <option value="">اختاري الطالبة</option>
              {students?.map(s => <option key={s.id} value={String(s.id)}>{s.fullName}</option>)}
            </select>
          )}
          {isAttendanceMode && (
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">
                {mode === "absent" ? "اليوم المراد إرسال للغائبات فيه" : "اليوم المراد إرسال للحاضرات فيه"}
              </Label>
              <Input
                type="date"
                value={attendanceDate}
                onChange={e => setAttendanceDate(e.target.value)}
                max={today()}
                className="text-sm"
              />
            </div>
          )}

          {/* ─── Recipient preview ─── */}
          {recipientInfo && (
            <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm border ${
              (recipientInfo.count ?? 0) === 0
                ? "bg-amber-50 border-amber-200"
                : "bg-primary/5 border-primary/20"
            }`}>
              <UserCheck className={`w-4 h-4 shrink-0 ${(recipientInfo.count ?? 0) === 0 ? "text-amber-500" : "text-primary"}`} />
              <span className={`font-medium ${(recipientInfo.count ?? 0) === 0 ? "text-amber-700" : "text-foreground"}`}>
                {(recipientInfo.count ?? 0) === 0 ? "لا توجد مستلمات لهذا اليوم" : recipientInfo.label}
              </span>
              {(recipientInfo.count ?? 0) > 0 && (
                <span className="mr-auto text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5">
                  {recipientInfo.count} {isRoleMode ? "عضوة" : "طالبة"}
                </span>
              )}
            </div>
          )}

          {/* ─── Quick templates ─── */}
          <div>
            <button
              onClick={() => setShowTemplates(v => !v)}
              className="flex items-center gap-2 text-xs text-primary font-semibold hover:underline"
              type="button"
            >
              <Sparkles className="w-3.5 h-3.5" />
              قوالب سريعة
              <ChevronDown className={`w-3 h-3 transition-transform ${showTemplates ? "rotate-180" : ""}`} />
            </button>
            {showTemplates && (
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                {MESSAGE_TEMPLATES.map(t => (
                  <button
                    key={t.label}
                    type="button"
                    onClick={() => { setContent(t.text); setShowTemplates(false); }}
                    className="text-right text-xs px-2.5 py-2 rounded-lg bg-muted/70 hover:bg-primary/10 hover:text-primary border border-border transition-colors font-medium"
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* ─── Message body ─── */}
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder="اكتبي نص الرسالة هنا..."
            rows={3}
            className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
            dir="rtl"
          />

          {/* ─── Expiry ─── */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" checked={expiryEnabled}
                onChange={e => { setExpiryEnabled(e.target.checked); if (!e.target.checked) setExpiryDate(""); }}
                className="rounded" />
              <Clock className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">رسالة مؤقتة تختفي في تاريخ محدد</span>
            </label>
            {expiryEnabled && (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">تاريخ انتهاء الرسالة</Label>
                <Input type="date" value={expiryDate} onChange={e => setExpiryDate(e.target.value)}
                  min={today()} className="text-sm" />
              </div>
            )}
          </div>

          <Button onClick={handleSend} disabled={!canSend || sendMessage.isPending || batchSend.isPending}
            className="w-full gap-2">
            <Send className="w-4 h-4" />
            {isAttendanceMode && recipientInfo?.count
              ? `إرسال لـ ${recipientInfo.count} ${mode === "absent" ? "غائبة" : "حاضرة"}`
              : "إرسال الرسالة"}
          </Button>
        </CardContent>
      </Card>

      {/* Sent messages */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-sm font-bold text-muted-foreground flex items-center gap-2">
              <MessageSquare className="w-4 h-4" />
              الرسائل المرسلة ({messages?.length ?? 0})
            </CardTitle>
            {messages && messages.filter(m => isExpired(m.expiresAt)).length > 0 && (
              <button
                onClick={() => {
                  const expired = (messages ?? []).filter(m => isExpired(m.expiresAt));
                  if (!confirm(`هل تريدين حذف ${expired.length} رسالة منتهية؟`)) return;
                  expired.forEach(m => deleteMessage.mutate({ id: m.id }));
                  setTimeout(() => queryClient.invalidateQueries({ queryKey: ["messages"] }), 600);
                }}
                className="text-xs text-rose-600 hover:underline font-medium flex items-center gap-1"
              >
                <Trash2 className="w-3 h-3" />
                حذف المنتهية ({messages.filter(m => isExpired(m.expiresAt)).length})
              </button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {!messages || messages.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground text-sm">لا توجد رسائل بعد</div>
          ) : (
            <div className="divide-y divide-border">
              {messages.map(msg => {
                const expired = isExpired(msg.expiresAt);
                const label = msg.targetType === "role"
                  ? roleBadgeLabel(msg.targetLabel ?? msg.targetId)
                  : msg.targetLabel;
                return (
                  <div key={msg.id} className={`p-4 ${expired ? "opacity-50 bg-muted/30" : ""}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                          {targetTypeBadge(msg.targetType)}
                          <span className="text-xs font-semibold text-foreground">{label}</span>
                          <span className="text-xs text-muted-foreground">{formatDate(msg.createdAt)}</span>
                          {expired && (
                            <Badge className="bg-gray-100 text-gray-500 text-xs gap-1">
                              <Clock className="w-2.5 h-2.5" /> منتهية
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-foreground leading-relaxed">{msg.content}</p>
                        {msg.expiresAt && (
                          <p className={`text-xs mt-1 flex items-center gap-1 ${expired ? "text-gray-400" : "text-amber-600"}`}>
                            <Clock className="w-3 h-3" />
                            {expired ? "انتهت في" : "تنتهي في"}: {formatDateOnly(msg.expiresAt)}
                          </p>
                        )}
                      </div>
                      <button onClick={() => handleDelete(msg.id)}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-rose-600 hover:bg-rose-50 transition-colors shrink-0">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
