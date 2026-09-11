import { useState } from "react";
import {
  useListBadgeEvents, useCreateBadgeEvent, useUpdateBadgeEvent, useDeleteBadgeEvent,
  useListBadgeAssignments, useCreateBadgeAssignment, useDeleteBadgeAssignment,
  useAutoAssignBadgeEvent,
  useListUsers, useListCircles,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Pencil, Award, ChevronDown, ChevronUp, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const TARGET_TYPES = [
  { value: "circle", label: "حلقة" },
  { value: "teacher", label: "معلمة" },
  { value: "supervisor", label: "مشرفة" },
  { value: "student", label: "طالبة" },
  { value: "track_supervisor", label: "مسؤولة مسار" },
];

const EMOJI_OPTIONS = ["🏅","🥇","🥈","🥉","⭐","🌟","✨","🎖️","🏆","🎗️","🎀","💎","👑","🌸","🌺"];

interface BadgesPageProps { userRole?: string; userId?: number; }

export default function BadgesPage({ userRole, userId }: BadgesPageProps) {
  const [showEventDialog, setShowEventDialog] = useState(false);
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [editingEvent, setEditingEvent] = useState<any>(null);
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [expandedEvent, setExpandedEvent] = useState<number | null>(null);
  const [eventForm, setEventForm] = useState({ name: "", description: "", emoji: "🏅", color: "#f59e0b", targetType: "student", dateFrom: "", dateTo: "", isActive: true });
  const [assignForm, setAssignForm] = useState({ entityType: "", entityId: "", entityName: "", notes: "" });
  const { toast } = useToast();
  const qc = useQueryClient();

  const isLeader = userRole === "leader" || userRole === "track_supervisor";

  const { data: events = [] } = useListBadgeEvents({});
  const { data: assignments = [] } = useListBadgeAssignments({});
  const { data: users = [] } = useListUsers({});
  const { data: circles = [] } = useListCircles({});

  const createEvent = useCreateBadgeEvent();
  const updateEvent = useUpdateBadgeEvent();
  const deleteEvent = useDeleteBadgeEvent();
  const createAssign = useCreateBadgeAssignment();
  const deleteAssign = useDeleteBadgeAssignment();
  const autoAssign = useAutoAssignBadgeEvent();

  function inv() { qc.invalidateQueries({ queryKey: ["listBadgeEvents"] }); qc.invalidateQueries({ queryKey: ["listBadgeAssignments"] }); }

  function openNewEvent() { setEditingEvent(null); setEventForm({ name: "", description: "", emoji: "🏅", color: "#f59e0b", targetType: "student", dateFrom: "", dateTo: "", isActive: true }); setShowEventDialog(true); }
  function openEditEvent(e: any) { setEditingEvent(e); setEventForm({ name: e.name, description: e.description ?? "", emoji: e.emoji, color: e.color, targetType: e.targetType, dateFrom: e.dateFrom, dateTo: e.dateTo, isActive: e.isActive }); setShowEventDialog(true); }

  async function handleSaveEvent() {
    if (!eventForm.name || !eventForm.dateFrom || !eventForm.dateTo) { toast({ title: "أدخل الحقول المطلوبة", variant: "destructive" }); return; }
    try {
      if (editingEvent) await updateEvent.mutateAsync({ id: editingEvent.id, data: eventForm });
      else await createEvent.mutateAsync({ data: eventForm });
      inv(); setShowEventDialog(false); toast({ title: "تم الحفظ" });
    } catch { toast({ title: "حدث خطأ", variant: "destructive" }); }
  }

  async function handleDeleteEvent(id: number) {
    if (!confirm("حذف الحدث وكل وساماته؟")) return;
    await deleteEvent.mutateAsync({ id }); inv(); toast({ title: "تم الحذف" });
  }

  function openAssign(event: any) {
    setSelectedEvent(event);
    setAssignForm({ entityType: event.targetType, entityId: "", entityName: "", notes: "" });
    setShowAssignDialog(true);
  }

  function getEntityOptions(targetType: string) {
    if (targetType === "circle") return circles.map(c => ({ id: c.id, name: c.name }));
    const roleMap: Record<string, string> = { teacher: "teacher", supervisor: "supervisor", student: "student", track_supervisor: "track_supervisor" };
    if (roleMap[targetType]) return users.filter(u => u.role === roleMap[targetType]).map(u => ({ id: u.id, name: u.name }));
    return [];
  }

  async function handleSaveAssign() {
    if (!assignForm.entityId || !assignForm.entityName) { toast({ title: "اختاري الجهة", variant: "destructive" }); return; }
    try {
      await createAssign.mutateAsync({ data: {
        badgeEventId: selectedEvent.id, entityType: assignForm.entityType,
        entityId: parseInt(assignForm.entityId), entityName: assignForm.entityName, notes: assignForm.notes || null,
      }});
      inv(); setShowAssignDialog(false); toast({ title: "تم منح الوسام" });
    } catch { toast({ title: "حدث خطأ", variant: "destructive" }); }
  }

  const myBadges = userId ? assignments.filter(a => {
    if (userRole === "student") return a.entityType === "student" && a.entityId === userId;
    if (userRole === "teacher") return a.entityType === "teacher" && a.entityId === userId;
    if (userRole === "supervisor") return a.entityType === "supervisor" && a.entityId === userId;
    if (userRole === "track_supervisor") return a.entityType === "track_supervisor" && a.entityId === userId;
    return false;
  }) : [];

  return (
    <div className="p-4 max-w-4xl mx-auto" dir="rtl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-primary flex items-center gap-2">
          <Award className="w-6 h-6" />الأوسمة والشارات
        </h1>
        {isLeader && <Button size="sm" onClick={openNewEvent}><Plus className="w-4 h-4 ml-1" />حدث جديد</Button>}
      </div>

      {!isLeader && myBadges.length > 0 && (() => {
        const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const thisWeek = myBadges.filter(b => (b as any).createdAt && new Date((b as any).createdAt) >= oneWeekAgo);
        const older = myBadges.filter(b => !(b as any).createdAt || new Date((b as any).createdAt) < oneWeekAgo);
        const BadgePill = ({ b }: { b: typeof myBadges[0] }) => (
          <div className="flex items-center gap-2 px-3 py-2 rounded-full text-white text-sm font-medium shadow-sm" style={{ backgroundColor: b.badgeColor }}>
            <span>{b.badgeEmoji}</span><span>{b.badgeName}</span>
          </div>
        );
        return (
          <div className="mb-8 p-4 rounded-xl border bg-gradient-to-r from-amber-50 to-yellow-50">
            <h2 className="text-lg font-semibold mb-3">أوسمتي 🏅</h2>
            {thisWeek.length > 0 && (
              <div className="mb-4">
                <p className="text-xs font-bold text-amber-700 mb-2 flex items-center gap-1">✨ هذا الأسبوع</p>
                <div className="flex flex-wrap gap-3">
                  {thisWeek.map(b => <BadgePill key={b.id} b={b} />)}
                </div>
              </div>
            )}
            {older.length > 0 && (
              <div>
                {thisWeek.length > 0 && <p className="text-xs font-semibold text-amber-600 mb-2 mt-2">أوسمة سابقة</p>}
                <div className="flex flex-wrap gap-3">
                  {older.map(b => <BadgePill key={b.id} b={b} />)}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {isLeader && <div className="space-y-4">
        {events.map(event => {
          const eventAssignments = assignments.filter(a => a.badgeEventId === event.id);
          const isExpanded = expandedEvent === event.id;
          const targetLabel = TARGET_TYPES.find(t => t.value === event.targetType)?.label ?? event.targetType;

          return (
            <div key={event.id} className={`rounded-xl border bg-card overflow-hidden ${!event.isActive ? "opacity-70" : ""}`}>
              <div className="p-4">
                <div className="flex items-center gap-3">
                  <div className="text-3xl">{event.emoji}</div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-lg">{event.name}</span>
                      <Badge variant="secondary" className="text-xs">{targetLabel}</Badge>
                      {!event.isActive && <Badge variant="outline" className="text-xs">متوقف</Badge>}
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: event.color }} />
                    </div>
                    {event.description && <div className="text-sm text-muted-foreground">{event.description}</div>}
                    <div className="text-xs text-muted-foreground mt-0.5">{event.dateFrom} — {event.dateTo} • {event.assignmentCount} وسام</div>
                  </div>
                  <div className="flex gap-1 items-center">
                    {isLeader && (
                      <>
                        <Button
                          size="sm"
                          variant="default"
                          className="bg-amber-500 hover:bg-amber-600 text-white"
                          disabled={autoAssign.isPending}
                          onClick={async () => {
                            try {
                              const result = await autoAssign.mutateAsync({ id: event.id });
                              inv();
                              toast({ title: result.message });
                            } catch { toast({ title: "حدث خطأ", variant: "destructive" }); }
                          }}
                        >
                          ✨ تلقائي
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => openAssign(event)}>
                          <Plus className="w-3.5 h-3.5 ml-1" />منح يدوي
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditEvent(event)}><Pencil className="w-3.5 h-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDeleteEvent(event.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                      </>
                    )}
                    {eventAssignments.length > 0 && (
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setExpandedEvent(isExpanded ? null : event.id)}>
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              {isExpanded && eventAssignments.length > 0 && (
                <div className="border-t px-4 py-3 bg-muted/30">
                  <div className="flex flex-wrap gap-2">
                    {eventAssignments.map(a => (
                      <div key={a.id} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm text-white" style={{ backgroundColor: a.badgeColor }}>
                        <span>{a.badgeEmoji}</span>
                        <span>{a.entityName}</span>
                        {isLeader && (
                          <button onClick={() => { deleteAssign.mutateAsync({ id: a.id }); inv(); }} className="hover:opacity-70 mr-1">
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {events.length === 0 && (
          <div className="text-center py-16">
            <Award className="w-14 h-14 mx-auto mb-3 text-muted-foreground/30" />
            <p className="text-muted-foreground">لا توجد أحداث أوسمة بعد — أضف أول حدث!</p>
          </div>
        )}
      </div>}

      {!isLeader && myBadges.length === 0 && (
        <div className="text-center py-16">
          <Award className="w-14 h-14 mx-auto mb-3 text-muted-foreground/30" />
          <p className="text-muted-foreground">لا توجد أوسمة حاليًا</p>
        </div>
      )}

      <Dialog open={showEventDialog} onOpenChange={setShowEventDialog}>
        <DialogContent dir="rtl">
          <DialogHeader><DialogTitle>{editingEvent ? "تعديل الحدث" : "حدث وسام جديد"}</DialogTitle></DialogHeader>

          <div className="space-y-4">
            <div><Label>اسم الوسام *</Label><Input value={eventForm.name} onChange={e => setEventForm(f => ({ ...f, name: e.target.value }))} /></div>
            <div><Label>الرمز</Label>
              <div className="flex flex-wrap gap-2 mt-1">
                {EMOJI_OPTIONS.map(em => (
                  <button key={em} className={`text-2xl p-1 rounded ${eventForm.emoji === em ? "ring-2 ring-primary" : ""}`} onClick={() => setEventForm(f => ({ ...f, emoji: em }))}>{em}</button>
                ))}
              </div>
            </div>
            <div><Label>اللون</Label><Input type="color" value={eventForm.color} onChange={e => setEventForm(f => ({ ...f, color: e.target.value }))} className="h-10" /></div>
            <div><Label>الفئة المستهدفة</Label>
              <Select value={eventForm.targetType} onValueChange={v => setEventForm(f => ({ ...f, targetType: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TARGET_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>من تاريخ *</Label><Input type="date" value={eventForm.dateFrom} onChange={e => setEventForm(f => ({ ...f, dateFrom: e.target.value }))} /></div>
              <div><Label>إلى تاريخ *</Label><Input type="date" value={eventForm.dateTo} onChange={e => setEventForm(f => ({ ...f, dateTo: e.target.value }))} /></div>
            </div>
            <div><Label>الوصف</Label><Textarea value={eventForm.description} onChange={e => setEventForm(f => ({ ...f, description: e.target.value }))} rows={2} /></div>
            <div className="flex items-center gap-3"><Switch checked={eventForm.isActive} onCheckedChange={v => setEventForm(f => ({ ...f, isActive: v }))} /><Label>نشط</Label></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEventDialog(false)}>إلغاء</Button>
            <Button onClick={handleSaveEvent}>حفظ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showAssignDialog} onOpenChange={setShowAssignDialog}>
        <DialogContent dir="rtl">
          <DialogHeader><DialogTitle>منح وسام: {selectedEvent?.emoji} {selectedEvent?.name}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>اختاري {TARGET_TYPES.find(t => t.value === assignForm.entityType)?.label}</Label>
              <Select value={assignForm.entityId} onValueChange={v => {
                const opts = getEntityOptions(assignForm.entityType);
                const found = opts.find(o => o.id === parseInt(v));
                setAssignForm(f => ({ ...f, entityId: v, entityName: found?.name ?? "" }));
              }}>
                <SelectTrigger><SelectValue placeholder="اختاري..." /></SelectTrigger>
                <SelectContent>
                  {getEntityOptions(assignForm.entityType).map(o => (
                    <SelectItem key={o.id} value={String(o.id)}>{o.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div><Label>ملاحظة</Label><Textarea value={assignForm.notes} onChange={e => setAssignForm(f => ({ ...f, notes: e.target.value }))} rows={2} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAssignDialog(false)}>إلغاء</Button>
            <Button onClick={handleSaveAssign}>منح الوسام</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
