import { useState, useEffect } from "react";
import { useGetCurrentUser } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getToken } from "@/lib/auth";
import {
  ChevronDown, ChevronUp, AlertTriangle, Users, BookOpen,
  ClipboardList, UserCheck, RefreshCw, Bell, CheckCircle2, RotateCcw, Shield, PlaneTakeoff,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type DataEntryAlert = {
  userId: number; name: string; track: string;
  issue: string; issueLabel: string; details?: string[];
};
type SupervisorAlert = {
  type: string; name: string; track: string; issueLabel: string; userId?: number;
};
type TeacherAlert = {
  userId: number; name: string; circleName: string; track: string; absenceCount: number; lateCount?: number;
};
type StudentAlert = {
  studentId: number; studentName: string; circleName: string; track: string;
  absenceCount: number; shortcomingCount: number; planMissedDays?: number;
};
type CycleCompleted = {
  studentId: number; studentName: string; circleName: string; track: string;
  cycleCount: number; totalPages: number; daysOverdue: number;
};
type PlanNotification = {
  id: number; studentId: number; studentName: string;
  circleName: string; track: string; type: string;
  cycleCount: number; totalPages: number; createdAt: string;
};
type DeputyAlert = {
  hasDeputy: boolean;
  name?: string;
  inactive: boolean;
  neverLoggedIn: boolean;
  daysSinceLogin: number | null;
  pendingTasksCount: number;
  unansweredQaCount: number;
};
type StumblingStats = {
  dataEntry: DataEntryAlert[];
  trackSupervisors: SupervisorAlert[];
  teachers: TeacherAlert[];
  supervisors: TeacherAlert[];
  students: StudentAlert[];
  cycleCompleted: CycleCompleted[];
  planNotifications: PlanNotification[];
  deputyAlert?: DeputyAlert;
};

async function fetchStumbling(): Promise<StumblingStats> {
  const token = getToken();
  const res = await fetch(`${BASE}/api/stats/stumbling`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error("فشل تحميل البيانات");
  return res.json();
}

async function markNotificationRead(id: number) {
  const token = getToken();
  await fetch(`${BASE}/api/stats/stumbling/notifications/${id}/read`, {
    method: "PATCH",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

async function markAllNotificationsRead() {
  const token = getToken();
  await fetch(`${BASE}/api/stats/stumbling/notifications/read-all`, {
    method: "PATCH",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

function SectionHeader({
  icon: Icon, title, count, color, open, onToggle, pulse = false,
}: {
  icon: React.ElementType; title: string; count: number;
  color: string; open: boolean; onToggle: () => void; pulse?: boolean;
}) {
  return (
    <button
      onClick={onToggle}
      className={`w-full flex items-center justify-between p-4 rounded-xl border transition-colors text-right ${
        open ? `${color} border-current/20` : "bg-muted/30 border-border/40 hover:bg-muted/50"
      }`}
    >
      <div className="flex items-center gap-3">
        <div className="relative">
          <Icon className={`w-5 h-5 ${open ? "" : "text-muted-foreground"}`} />
          {pulse && count > 0 && (
            <span className="absolute -top-1 -right-1 w-2 h-2 bg-rose-500 rounded-full animate-pulse" />
          )}
        </div>
        <span className="font-bold text-sm">{title}</span>
      </div>
      <div className="flex items-center gap-2">
        {count > 0 && (
          <Badge className={`text-xs font-bold ${open ? "bg-white/70 text-foreground" : "bg-destructive/10 text-destructive border-0"}`}>
            {count}
          </Badge>
        )}
        {count === 0 && (
          <Badge className="text-xs font-bold bg-green-100 text-green-700 border-0">✓ لا يوجد</Badge>
        )}
        {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </div>
    </button>
  );
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `منذ ${mins} دقيقة`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `منذ ${hrs} ساعة`;
  return `منذ ${Math.floor(hrs / 24)} يوم`;
}

export default function StumblingStatsPage() {
  const { data: user, isLoading: userLoading } = useGetCurrentUser({ query: { queryKey: ["getCurrentUser"] } });
  const [data, setData] = useState<StumblingStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openSection, setOpenSection] = useState<string | null>(null);
  const [dismissedNotifs, setDismissedNotifs] = useState<Set<number>>(new Set());

  const load = () => {
    setLoading(true);
    setError(null);
    fetchStumbling()
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  };

  useEffect(() => { load(); }, []);

  const toggle = (key: string) =>
    setOpenSection(prev => (prev === key ? null : key));

  const dismissNotif = async (id: number) => {
    setDismissedNotifs(prev => new Set([...prev, id]));
    await markNotificationRead(id);
  };

  const dismissAllNotifs = async () => {
    if (!data) return;
    const ids = new Set((data.planNotifications ?? []).map((n: PlanNotification) => n.id));
    setDismissedNotifs(prev => new Set([...prev, ...ids]));
    await markAllNotificationsRead();
  };

  if (userLoading) {
    return <div className="p-8 text-center text-muted-foreground text-sm">جاري التحقق من الصلاحيات…</div>;
  }

  if (!["leader", "deputy", "track_supervisor"].includes(user?.role ?? "")) {
    return <div className="p-8 text-center text-muted-foreground">غير مصرح بالوصول</div>;
  }

  const allNotifs = (data?.planNotifications ?? []).filter(n => !dismissedNotifs.has(n.id));
  const visibleNotifs = allNotifs.filter(n => n.type !== "leave_granted");
  const leaveNotifs = allNotifs.filter((n: any) => n.type === "leave_granted");

  const showCycleCompleted = true;

  const deputyAlert = data?.deputyAlert;
  const deputyHasIssue = deputyAlert?.hasDeputy &&
    (deputyAlert.inactive || deputyAlert.neverLoggedIn || deputyAlert.pendingTasksCount > 0 || (deputyAlert.unansweredQaCount ?? 0) > 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-rose-50/20 pb-20">
      <div className="max-w-2xl mx-auto px-4 pt-6 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
              إحصائيات التعثر
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              آخر ٣٠ يوم · {new Date().toLocaleDateString("ar-SA")}
            </p>
          </div>
          <button
            onClick={load}
            className="p-2 rounded-lg bg-white border border-border/50 hover:bg-muted/30 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 text-muted-foreground ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        {loading && (
          <div className="text-center py-10 text-muted-foreground text-sm">جاري التحميل…</div>
        )}
        {error && (
          <div className="text-center py-6 text-rose-600 text-sm bg-rose-50 rounded-xl border border-rose-200">
            {error}
          </div>
        )}

        {data && (
          <div className="space-y-2">

            {/* =================== LEAVE NOTIFICATIONS =================== */}
            {leaveNotifs.length > 0 && (
              <div className="rounded-xl border border-blue-200 bg-blue-50/60 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 bg-blue-100/60">
                  <div className="flex items-center gap-2">
                    <PlaneTakeoff className="w-4 h-4 text-blue-600" />
                    <span className="font-bold text-sm text-blue-800">إجازات جديدة</span>
                    <Badge className="bg-blue-600 text-white border-0 text-xs">{leaveNotifs.length}</Badge>
                  </div>
                  <button
                    onClick={async () => {
                      const ids = new Set(leaveNotifs.map((n: any) => n.id));
                      setDismissedNotifs(prev => new Set([...prev, ...ids]));
                      for (const n of leaveNotifs) await markNotificationRead((n as any).id);
                    }}
                    className="text-[11px] text-blue-600 hover:text-blue-800 font-medium transition-colors"
                  >
                    تمييز الكل كمقروء
                  </button>
                </div>
                <div className="divide-y divide-blue-100">
                  {leaveNotifs.map((n: any) => (
                    <div key={n.id} className="flex items-center gap-3 px-4 py-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm text-foreground truncate">{n.studentName}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {n.circleName} · {n.track}
                        </p>
                        {n.note && (
                          <p className="text-[11px] text-blue-700 font-medium mt-0.5">{n.note}</p>
                        )}
                        <p className="text-[10px] text-muted-foreground/60 mt-0.5">{timeAgo(n.createdAt)}</p>
                      </div>
                      <button
                        onClick={() => dismissNotif(n.id)}
                        className="p-1.5 rounded-lg hover:bg-blue-100 transition-colors shrink-0"
                        title="تمييز كمقروء"
                      >
                        <CheckCircle2 className="w-4 h-4 text-blue-400 hover:text-blue-600" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* =================== PLAN NOTIFICATIONS =================== */}
            {visibleNotifs.length > 0 && (
              <div className="rounded-xl border border-teal-200 bg-teal-50/60 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 bg-teal-100/60">
                  <div className="flex items-center gap-2">
                    <Bell className="w-4 h-4 text-teal-600" />
                    <span className="font-bold text-sm text-teal-800">خطط جديدة من الطالبات</span>
                    <Badge className="bg-teal-600 text-white border-0 text-xs">{visibleNotifs.length}</Badge>
                  </div>
                  <button
                    onClick={dismissAllNotifs}
                    className="text-[11px] text-teal-600 hover:text-teal-800 font-medium transition-colors"
                  >
                    تمييز الكل كمقروء
                  </button>
                </div>
                <div className="divide-y divide-teal-100">
                  {visibleNotifs.map(n => (
                    <div key={n.id} className="flex items-center gap-3 px-4 py-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm text-foreground truncate">{n.studentName}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {n.circleName} · {n.track} ·{" "}
                          <span className="text-teal-600 font-medium">
                            {n.type === "plan_renewed" ? `جددت الدورة #${n.cycleCount}` : "أنشأت خطتها"}
                          </span>
                          {" · "}{n.totalPages} وجه
                        </p>
                        <p className="text-[10px] text-muted-foreground/60 mt-0.5">{timeAgo(n.createdAt)}</p>
                      </div>
                      <button
                        onClick={() => dismissNotif(n.id)}
                        className="p-1.5 rounded-lg hover:bg-teal-100 transition-colors shrink-0"
                        title="تمييز كمقروء"
                      >
                        <CheckCircle2 className="w-4 h-4 text-teal-400 hover:text-teal-600" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* =================== DEPUTY ALERT (leader only) =================== */}
            {user?.role === "leader" && deputyAlert?.hasDeputy && deputyHasIssue && (
              <div className="rounded-xl border border-red-200 bg-red-50/60 px-4 py-3">
                <div className="flex items-start gap-2">
                  <Shield className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <p className="font-bold text-sm text-red-800">تنبيه النائبة — {deputyAlert.name}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {(deputyAlert.inactive || deputyAlert.neverLoggedIn) && (
                        <Badge className="bg-red-100 text-red-700 border-red-200 text-xs">
                          {deputyAlert.neverLoggedIn
                            ? "لم تدخل النظام بعد"
                            : `لم تدخل منذ ${deputyAlert.daysSinceLogin} ${deputyAlert.daysSinceLogin === 1 ? "يوم" : "أيام"}`}
                        </Badge>
                      )}
                      {deputyAlert.pendingTasksCount > 0 && (
                        <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-xs">
                          {deputyAlert.pendingTasksCount} مهمة لم تُنجز
                        </Badge>
                      )}
                      {(deputyAlert.unansweredQaCount ?? 0) > 0 && (
                        <Badge className="bg-teal-100 text-teal-700 border-teal-200 text-xs">
                          {deputyAlert.unansweredQaCount} سؤال بلا إجابة (+3 أيام)
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* =================== CYCLE COMPLETED (only if allowed) =================== */}
            {showCycleCompleted && (
              <div className="space-y-1">
                <SectionHeader
                  icon={RotateCcw}
                  title="دورات مكتملة — تنتظر التجديد"
                  count={(data.cycleCompleted ?? []).length}
                  color="bg-emerald-50 text-emerald-800 border-emerald-200"
                  open={openSection === "cycleCompleted"}
                  onToggle={() => toggle("cycleCompleted")}
                />
                {openSection === "cycleCompleted" && (
                  <Card className="border-0 shadow-sm mx-1">
                    <CardContent className="pt-4 space-y-3">
                      {(data.cycleCompleted ?? []).length === 0 ? (
                        <p className="text-sm text-center text-muted-foreground py-2">لا يوجد ✓</p>
                      ) : (data.cycleCompleted ?? []).map((a, i) => (
                        <div key={i} className="bg-emerald-50/60 rounded-xl p-3 border border-emerald-100">
                          <div className="flex items-center justify-between gap-2">
                            <p className="font-semibold text-sm text-foreground">{a.studentName}</p>
                            <div className="flex gap-1 flex-wrap justify-end shrink-0">
                              <Badge className="bg-emerald-100 text-emerald-800 border-0 text-xs">الدورة #{a.cycleCount}</Badge>
                              <Badge className="bg-amber-100 text-amber-700 border-0 text-xs">+{a.daysOverdue} يوم</Badge>
                            </div>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {a.circleName} · {a.track} · {a.totalPages} وجه
                          </p>
                          <p className="text-[11px] text-emerald-700 mt-1 font-medium">
                            أتمّت الدورة — تحتاج لتجديد الخطة
                          </p>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}
              </div>
            )}

            {/* =================== DATA ENTRY (leader only) =================== */}
            {user?.role === "leader" && (
              <div className="space-y-1">
                <SectionHeader
                  icon={ClipboardList}
                  title="مدخلات البيانات"
                  count={data.dataEntry.length}
                  color="bg-orange-50 text-orange-800 border-orange-200"
                  open={openSection === "dataEntry"}
                  onToggle={() => toggle("dataEntry")}
                />
                {openSection === "dataEntry" && (
                  <Card className="border-0 shadow-sm mx-1">
                    <CardContent className="pt-4 space-y-3">
                      {data.dataEntry.length === 0 ? (
                        <p className="text-sm text-center text-muted-foreground py-2">لا يوجد تعثر ✓</p>
                      ) : data.dataEntry.map((a, i) => (
                        <div key={i} className="bg-orange-50/60 rounded-xl p-3 border border-orange-100">
                          <div className="flex items-center justify-between">
                            <p className="font-semibold text-sm text-foreground">{a.name}</p>
                            <Badge className="bg-orange-100 text-orange-800 border-0 text-xs">{a.track}</Badge>
                          </div>
                          <p className="text-xs text-orange-700 mt-1">{a.issueLabel}</p>
                          {a.details && a.details.length > 0 && (
                            <div className="mt-2 space-y-1">
                              {a.details.map((d, j) => (
                                <p key={j} className="text-xs text-muted-foreground bg-white/60 rounded-lg px-2 py-1">
                                  ◦ {d}
                                </p>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}
              </div>
            )}

            {/* =================== TRACK SUPERVISORS (leader only) =================== */}
            {user?.role === "leader" && (
              <div className="space-y-1">
                <SectionHeader
                  icon={UserCheck}
                  title="مسؤولات المسار"
                  count={data.trackSupervisors.length}
                  color="bg-teal-50 text-teal-800 border-teal-200"
                  open={openSection === "supervisors"}
                  onToggle={() => toggle("supervisors")}
                />
                {openSection === "supervisors" && (
                  <Card className="border-0 shadow-sm mx-1">
                    <CardContent className="pt-4 space-y-3">
                      {data.trackSupervisors.length === 0 ? (
                        <p className="text-sm text-center text-muted-foreground py-2">لا يوجد تعثر ✓</p>
                      ) : data.trackSupervisors.map((a, i) => (
                        <div key={i} className="bg-teal-50/60 rounded-xl p-3 border border-teal-100">
                          <div className="flex items-center justify-between">
                            <p className="font-semibold text-sm text-foreground">{a.name}</p>
                            <Badge className="bg-teal-100 text-teal-800 border-0 text-xs">{a.track}</Badge>
                          </div>
                          <p className="text-xs text-teal-700 mt-1">{a.issueLabel}</p>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}
              </div>
            )}

            {/* =================== TEACHERS =================== */}
            <div className="space-y-1">
              <SectionHeader
                icon={BookOpen}
                title="المعلمات"
                count={data.teachers.length}
                color="bg-rose-50 text-rose-800 border-rose-200"
                open={openSection === "teachers"}
                onToggle={() => toggle("teachers")}
              />
              {openSection === "teachers" && (
                <Card className="border-0 shadow-sm mx-1">
                  <CardContent className="pt-4 space-y-3">
                    {data.teachers.length === 0 ? (
                      <p className="text-sm text-center text-muted-foreground py-2">لا يوجد تعثر ✓</p>
                    ) : data.teachers.map((a, i) => (
                      <div key={i} className="bg-rose-50/60 rounded-xl p-3 border border-rose-100">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-semibold text-sm text-foreground">{a.name}</p>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            {a.absenceCount > 0 && (
                              <Badge className="bg-rose-100 text-rose-800 border-0 text-xs">{a.absenceCount} غياب</Badge>
                            )}
                            {(a.lateCount ?? 0) > 0 && (
                              <Badge className="bg-amber-100 text-amber-800 border-0 text-xs">{a.lateCount} تأخير</Badge>
                            )}
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          حلقة {a.circleName} · {a.track}
                        </p>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </div>

            {/* =================== SUPERVISORS =================== */}
            <div className="space-y-1">
              <SectionHeader
                icon={Users}
                title="المشرفات"
                count={data.supervisors.length}
                color="bg-blue-50 text-blue-800 border-blue-200"
                open={openSection === "supervisorRole"}
                onToggle={() => toggle("supervisorRole")}
              />
              {openSection === "supervisorRole" && (
                <Card className="border-0 shadow-sm mx-1">
                  <CardContent className="pt-4 space-y-3">
                    {data.supervisors.length === 0 ? (
                      <p className="text-sm text-center text-muted-foreground py-2">لا يوجد تعثر ✓</p>
                    ) : data.supervisors.map((a, i) => (
                      <div key={i} className="bg-blue-50/60 rounded-xl p-3 border border-blue-100">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-semibold text-sm text-foreground">{a.name}</p>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            {a.absenceCount > 0 && (
                              <Badge className="bg-rose-100 text-rose-800 border-0 text-xs">{a.absenceCount} غياب</Badge>
                            )}
                            {(a.lateCount ?? 0) > 0 && (
                              <Badge className="bg-amber-100 text-amber-800 border-0 text-xs">{a.lateCount} تأخير</Badge>
                            )}
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          حلقة {a.circleName} · {a.track}
                        </p>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </div>

            {/* =================== STUDENTS =================== */}
            <div className="space-y-1">
              <SectionHeader
                icon={AlertTriangle}
                title="الطالبات"
                count={data.students.length}
                color="bg-amber-50 text-amber-800 border-amber-200"
                open={openSection === "students"}
                onToggle={() => toggle("students")}
              />
              {openSection === "students" && (
                <Card className="border-0 shadow-sm mx-1">
                  <CardContent className="pt-4 space-y-3">
                    {data.students.length === 0 ? (
                      <p className="text-sm text-center text-muted-foreground py-2">لا يوجد تعثر ✓</p>
                    ) : data.students.map((a, i) => (
                      <div key={i} className="rounded-xl p-3 border bg-amber-50/60 border-amber-100">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-semibold text-sm text-foreground">{a.studentName}</p>
                          <div className="flex gap-1 flex-shrink-0 flex-wrap justify-end">
                            {(a.planMissedDays ?? 0) >= 3 && (
                              <Badge className="bg-yellow-100 text-yellow-800 border-0 text-xs">{a.planMissedDays} أيام تأخير بالخطة</Badge>
                            )}
                            {a.absenceCount >= 3 && (
                              <Badge className="bg-rose-100 text-rose-800 border-0 text-xs">{a.absenceCount} غياب</Badge>
                            )}
                            {a.shortcomingCount >= 3 && (
                              <Badge className="bg-amber-100 text-amber-800 border-0 text-xs">{a.shortcomingCount} تقصير</Badge>
                            )}
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {a.circleName} · {a.track}
                        </p>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
