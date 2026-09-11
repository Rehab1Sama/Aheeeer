import { useState, useEffect } from "react";
import {
  useListUsers,
  useCreateUser,
  useUpdateUser,
  useDeleteUser,
  useListCircles,
  useResetUserPassword,
  useDisableUser,
  useEnableUser,
  useListTracks,
  useGetCurrentUser,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, UserPlus, Search, KeyRound, Ban, CheckCircle2, Archive, CheckSquare, Square, Users, ArrowLeftRight } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function useAllCirclesForForm() {
  const [allCircles, setAllCircles] = useState<{ id: number; name: string; track: string }[]>([]);
  useEffect(() => {
    const token = localStorage.getItem("sana_auth_token");
    fetch(`${BASE}/api/circles/names`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(r => r.ok ? r.json() : [])
      .then(setAllCircles)
      .catch(() => {});
  }, []);
  return allCircles;
}

const ROLES = [
  { value: "leader", label: "القائدة" },
  { value: "deputy", label: "النائبة" },
  { value: "data_entry", label: "مُدخلة بيانات" },
  { value: "teacher", label: "معلمة" },
  { value: "supervisor", label: "مشرفة" },
  { value: "track_supervisor", label: "مسؤولة مسار" },
  { value: "exam_supervisor", label: "مسؤولة الاختبارات" },
  { value: "student", label: "طالبة" },
  { value: "volunteer", label: "متطوعة" },
];

function getRoleBadgeClass(role: string) {
  const map: Record<string, string> = {
    leader: "bg-teal-100 text-teal-700",
    deputy: "bg-teal-100 text-teal-600",
    data_entry: "bg-blue-100 text-blue-700",
    teacher: "bg-emerald-100 text-emerald-700",
    supervisor: "bg-amber-100 text-amber-700",
    track_supervisor: "bg-pink-100 text-pink-700",
    exam_supervisor: "bg-teal-100 text-teal-700",
    student: "bg-gray-100 text-gray-700",
    volunteer: "bg-violet-100 text-violet-700",
  };
  return map[role] ?? "bg-gray-100 text-gray-700";
}

type UserRow = {
  id: number;
  name: string;
  email: string;
  role: string;
  studentId?: number | null;
  track?: string | null;
  circleId?: number | null;
  circleName?: string | null;
  isArchived?: boolean;
};

type PersonGroup = {
  email: string;
  name: string;
  accounts: UserRow[];
};

function groupByEmail(users: UserRow[]): PersonGroup[] {
  const map = new Map<string, PersonGroup>();
  for (const u of users) {
    const email = u.email.toLowerCase();
    if (!map.has(email)) {
      map.set(email, { email: u.email, name: u.name, accounts: [] });
    }
    map.get(email)!.accounts.push(u);
  }
  return [...map.values()]
    .map(person => {
      // الحساب النشط هو المرجع عند وجود حسابات مؤرشفة لنفس البريد.
      // يمنع ذلك فتح بطاقة حساب مؤرشف بالخطأ عند تعديل بيانات الطالبة.
      const accounts = [...person.accounts].sort((a, b) =>
        Number(Boolean(a.isArchived)) - Number(Boolean(b.isArchived)) || a.id - b.id,
      );
      return {
        ...person,
        accounts,
        name: accounts.find(account => !account.isArchived)?.name ?? accounts[0]?.name ?? person.name,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "ar", { sensitivity: "base" }));
}

function useDataEntryAssignments(canManage: boolean) {
  const [assignments, setAssignments] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  const fetchAssignments = () => {
    if (!canManage) return;
    const token = localStorage.getItem("sana_auth_token");
    if (!token) return;
    fetch(`${BASE}/api/data-entry/assignments`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : [])
      .then(setAssignments)
      .catch(() => {});
  };

  useEffect(() => {
    fetchAssignments();
  }, [canManage]);

  const saveAssignments = async (userId: number, circleIds: number[]) => {
    setSaving(true);
    try {
      const token = localStorage.getItem("sana_auth_token");
      await fetch(`${BASE}/api/data-entry/assignments/${userId}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ circleIds }),
      });
      fetchAssignments();
    } finally {
      setSaving(false);
    }
  };

  return { assignments, saving, saveAssignments };
}

export default function AccountsPage() {
  const { data: currentUser } = useGetCurrentUser({ query: { queryKey: ["getCurrentUser"] } });
  const isLeader = currentUser?.role === "leader";
  const isTrackSupervisor = currentUser?.role === "track_supervisor";
  const canManageAssignments = currentUser?.role === "leader" || (currentUser?.role as string) === "deputy";
  const { data: users, isLoading } = useListUsers(undefined, {
    query: { queryKey: ["users", currentUser?.id, currentUser?.role, currentUser?.track] },
  });
  const { data: circles } = useListCircles(undefined, { query: { queryKey: ["circles"] } });
  const allCirclesForForm = useAllCirclesForForm();
  const { data: tracks, isLoading: tracksLoading } = useListTracks({ query: { queryKey: ["tracks"] } });
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const deleteUser = useDeleteUser();
  const resetPwd = useResetUserPassword();
  const disableUser = useDisableUser();
  const enableUser = useEnableUser();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const invalidateArchiveViews = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["users"] }),
      queryClient.invalidateQueries({ queryKey: ["circles"] }),
      queryClient.invalidateQueries({ queryKey: ["circles-all"] }),
      queryClient.invalidateQueries({ queryKey: ["listStudents"] }),
    ]);
  };
  const [permDeleteOpen, setPermDeleteOpen] = useState(false);
  const [permDeleteTarget, setPermDeleteTarget] = useState<{ id: number; label: string } | null>(null);
  const [permDeleting, setPermDeleting] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<{ id: number; label: string } | null>(null);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [assignTarget, setAssignTarget] = useState<{ userId: number; userName: string } | null>(null);
  const [selectedAssignCircles, setSelectedAssignCircles] = useState<number[]>([]);
  const [assignTrackFilter, setAssignTrackFilter] = useState<string>("");
  // تحديد الحلقات لمدخلة البيانات داخل نموذج الإنشاء/التعديل
  const [deFormCircles, setDeFormCircles] = useState<number[]>([]);
  const { assignments: dataEntryAssignments, saving: assignSaving, saveAssignments } = useDataEntryAssignments(canManageAssignments);

  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const [isAddRoleMode, setIsAddRoleMode] = useState(false);
  const [emailConfirmedDuplicate, setEmailConfirmedDuplicate] = useState(false);
  const [resetPwdOpen, setResetPwdOpen] = useState(false);
  const [resetPwdUserId, setResetPwdUserId] = useState<number | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [transferTarget, setTransferTarget] = useState<{ id: number; role: string; studentId?: number | null; circleId: number | null; label: string } | null>(null);
  const [transferCircleId, setTransferCircleId] = useState("");
  const [transferring, setTransferring] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "",
    track: "",
    circleId: "",
  });

  const openCreate = () => {
    setEditingUser(null);
    setIsAddRoleMode(false);
    setForm({ name: "", email: "", password: "", role: "", track: "", circleId: "" });
    setDeFormCircles([]);
    setEmailConfirmedDuplicate(false);
    setDialogOpen(true);
  };

  const openEdit = (user: UserRow) => {
    setEditingUser(user);
    setIsAddRoleMode(false);
    setForm({
      name: user.name,
      email: user.email,
      password: "",
      role: user.role,
      track: user.track ?? "",
      circleId: user.circleId?.toString() ?? "",
    });
    if (user.role === "data_entry") {
      const existing = dataEntryAssignments.find(a => a.userId === user.id);
      setDeFormCircles(existing?.circleIds ?? []);
    } else {
      setDeFormCircles([]);
    }
    setEmailConfirmedDuplicate(false);
    setDialogOpen(true);
  };

  const openAddRole = (person: PersonGroup) => {
    setEditingUser(null);
    setIsAddRoleMode(true);
    setForm({
      name: person.name,
      email: person.email,
      password: "",
      role: "",
      track: "",
      circleId: "",
    });
    setDeFormCircles([]);
    setEmailConfirmedDuplicate(false);
    setDialogOpen(true);
  };

  const handleSave = () => {
    const isDataEntry = form.role === "data_entry";
    const data: any = {
      name: form.name,
      email: form.email,
      role: form.role,
      // مدخلة البيانات: لا circleId فردي، نحفظ المسار فقط للمرجعية
      track: isDataEntry ? (form.track || null) : (form.track || null),
      circleId: isDataEntry ? null : (form.circleId ? parseInt(form.circleId) : null),
    };
    if (form.password) data.password = form.password;

    const afterSave = async (userId: number) => {
      if (isDataEntry) {
        await saveAssignments(userId, deFormCircles);
      }
      toast({ title: editingUser ? "تم تحديث الحساب بنجاح" : "تم إنشاء الحساب بنجاح" });
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setDialogOpen(false);
    };

    if (editingUser) {
      updateUser.mutate(
        { id: editingUser.id, data },
        {
          onSuccess: () => afterSave(editingUser.id),
          onError: (error: any) => toast({
            title: "خطأ في تحديث الحساب",
            description: error?.message ?? "تعذر حفظ التعديل",
            variant: "destructive",
          }),
        }
      );
    } else {
      createUser.mutate(
        { data: { ...data, password: form.password } },
        {
          onSuccess: (res: any) => {
            const userId = res?.id ?? res?.data?.id;
            if (userId) afterSave(userId);
            else {
              toast({ title: "تم إنشاء الحساب بنجاح" });
              queryClient.invalidateQueries({ queryKey: ["users"] });
              setDialogOpen(false);
            }
          },
          onError: () => toast({ title: "خطأ في إنشاء الحساب", variant: "destructive" }),
        }
      );
    }
  };

  const handleDelete = (userId: number, label: string) => {
    if (!confirm(`هل تريدين حذف "${label}"؟`)) return;
    deleteUser.mutate(
      { id: userId },
      {
        onSuccess: async () => {
          toast({ title: "تم حذف الحساب" });
          await invalidateArchiveViews();
        },
        onError: () => toast({ title: "خطأ في حذف الحساب", variant: "destructive" }),
      }
    );
  };

  const handleArchiveAccount = (userId: number, label: string) => {
    setArchiveTarget({ id: userId, label });
    setArchiveOpen(true);
  };

  const confirmArchive = () => {
    if (!archiveTarget) return;
    deleteUser.mutate(
      { id: archiveTarget.id },
      {
        onSuccess: async () => {
          toast({ title: "تمت الأرشفة", description: "الحساب في الأرشيف وبياناته محفوظة" });
          await invalidateArchiveViews();
          setArchiveOpen(false);
          setArchiveTarget(null);
        },
        onError: () => toast({ title: "خطأ في الأرشفة", variant: "destructive" }),
      }
    );
  };

  const confirmTransfer = async () => {
    if (!transferTarget || !transferCircleId) return;
    const targetCircleId = parseInt(transferCircleId, 10);
    setTransferring(true);
    try {
      const token = localStorage.getItem("sana_auth_token");
      let res: Response;
      if (transferTarget.role === "student") {
        res = await fetch(`${BASE}/api/students/${transferTarget.studentId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ circleId: targetCircleId, fromCircleId: transferTarget.circleId }),
        });
      } else if (transferTarget.role === "teacher" || transferTarget.role === "supervisor") {
        if (!transferTarget.circleId) throw new Error("no source circle");
        res = await fetch(`${BASE}/api/circles/${transferTarget.circleId}/remove-staff`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ staffRole: transferTarget.role, action: "transfer", targetCircleId }),
        });
      } else {
        res = await fetch(`${BASE}/api/users/${transferTarget.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ circleId: targetCircleId }),
        });
      }
      if (!res.ok) throw new Error(await res.text());
      toast({ title: "تم النقل بنجاح" });
      queryClient.invalidateQueries();
      setTransferTarget(null);
      setTransferCircleId("");
    } catch {
      toast({ title: "فشل النقل", variant: "destructive" });
    } finally {
      setTransferring(false);
    }
  };

  const handlePermanentDelete = async () => {
    if (!permDeleteTarget) return;
    setPermDeleting(true);
    try {
      const token = localStorage.getItem("sana_auth_token");
      const res = await fetch(`${BASE}/api/users/${permDeleteTarget.id}/permanent`, {
        method: "DELETE",
        headers: token ? { "Authorization": `Bearer ${token}` } : {},
      });
      if (res.ok || res.status === 204) {
        toast({ title: "تم الحذف النهائي", description: "تم حذف الحساب بشكل نهائي من النظام" });
        queryClient.invalidateQueries({ queryKey: ["users"] });
        setPermDeleteOpen(false);
        setPermDeleteTarget(null);
      } else {
        toast({ title: "خطأ في الحذف النهائي", variant: "destructive" });
      }
    } finally {
      setPermDeleting(false);
    }
  };

  const handleResetPwd = () => {
    if (!newPassword.trim() || !resetPwdUserId) return;
    resetPwd.mutate(
      { id: resetPwdUserId, data: { newPassword } },
      {
        onSuccess: () => {
          toast({ title: "تم تغيير كلمة المرور" });
          setResetPwdOpen(false);
          setNewPassword("");
        },
        onError: () => toast({ title: "خطأ في تغيير كلمة المرور", variant: "destructive" }),
      }
    );
  };

  const handleToggleDisable = (acc: UserRow) => {
    const fn = acc.isArchived ? enableUser : disableUser;
    const label = acc.isArchived ? "تفعيل" : "تعطيل";
    fn.mutate(
      { id: acc.id },
      {
        onSuccess: () => {
          toast({ title: `تم ${label} الحساب` });
          queryClient.invalidateQueries({ queryKey: ["users"] });
        },
      }
    );
  };

  // حماية إضافية في الواجهة: مسؤولة المسار لا ترى الحسابات المؤرشفة
  // حتى لو بقيت استجابة قديمة في cache قبل تحديثها من الخادم.
  const userRows: UserRow[] = Array.isArray(users) ? users as UserRow[] : [];
  const visibleUsers = isTrackSupervisor
    ? userRows.filter(user => !user.isArchived)
    : userRows;
  const allPersons = groupByEmail(visibleUsers as UserRow[]);
  const persons = allPersons.filter(p => {
    if (searchTerm.trim() && !p.name.includes(searchTerm) && !p.email.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    if (roleFilter && !p.accounts.some(a => a.role === roleFilter)) return false;
    return true;
  });

  // Detect duplicate email during new account creation (not editing, not add-role flow)
  const emailDuplicates = (!editingUser && !isAddRoleMode && form.email.trim().length > 3)
    ? userRows.filter((u: UserRow) =>
        u.email.toLowerCase() === form.email.trim().toLowerCase()
      )
    : [];
  // Group duplicates by name to avoid repeating the same name multiple times
  const duplicateNames = [...new Set((emailDuplicates as UserRow[]).map(u => u.name))];
  const showEmailDuplicateWarning = emailDuplicates.length > 0 && !emailConfirmedDuplicate;
  const needsTrack = ["track_supervisor", "teacher", "supervisor", "student", "volunteer"].includes(form.role);
  const needsCircle = ["teacher", "supervisor", "student", "volunteer"].includes(form.role);
  // Use allCirclesForForm (fetched from /api/circles/names — all circles, all tracks)
  // so track_supervisors can assign roles in any track, not just their own.
  const filteredCircles = form.track
    ? allCirclesForForm.filter(c => c.track === form.track)
    : allCirclesForForm;
  // الحلقات المُسندة لمدخلات أخريات (لاستثنائها عند الإسناد)
  const otherDataEntryAssignedIds = new Set(
    dataEntryAssignments
      .filter(a => a.userId !== (editingUser?.id ?? null))
      .flatMap(a => a.circleIds ?? [])
  );

  // الحلقات المُسندة لمدخلات أخريات في نافذة الإسناد المنفصلة
  const assignDialogOtherAssignedIds = new Set(
    dataEntryAssignments
      .filter(a => a.userId !== assignTarget?.userId)
      .flatMap(a => a.circleIds ?? [])
  );

  // حلقات مدخلة البيانات — مفلترة بالمسار المختار في النموذج (مستثنية حلقات المدخلات الأخريات)
  const deFormTrackCircles = form.track
    ? (circles ?? []).filter((c: any) => !c.isArchived && c.track === form.track && !otherDataEntryAssignedIds.has(c.id))
    : [];

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">الحسابات</h1>
          <p className="text-muted-foreground text-sm mt-1">إدارة المستخدمين وأدوارهم</p>
        </div>
        <Button onClick={openCreate} className="gap-2" data-testid="button-create-user">
          <Plus className="w-4 h-4" />
          حساب جديد
        </Button>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="بحث بالاسم أو البريد..."
            className="pr-9 text-right"
            dir="rtl"
          />
        </div>
        <select
          value={roleFilter}
          onChange={e => setRoleFilter(e.target.value)}
          className="border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground min-w-[120px]"
          dir="rtl"
        >
          <option value="">كل الأدوار</option>
          {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
      </div>

      <Card className="border-0 shadow-sm" data-testid="card-accounts">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">جاري التحميل...</div>
          ) : (
            <div className="divide-y divide-border">
              {persons.length === 0 && searchTerm ? (
                <div className="p-8 text-center text-muted-foreground">لا توجد نتائج مطابقة</div>
              ) : persons.map(person => (
                <div key={person.email} className="p-4 hover:bg-muted/20 transition-colors">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-foreground">{person.name}</div>
                      <div className="text-xs text-muted-foreground mb-2">{person.email}</div>
                      <div className="flex flex-wrap gap-2">
                        {person.accounts.map(acc => {
                          const hasActiveVersion = acc.role === "student" && acc.isArchived && acc.studentId != null &&
                            person.accounts.some(other =>
                              other.id !== acc.id &&
                              other.role === "student" &&
                              other.studentId === acc.studentId &&
                              !other.isArchived,
                            );
                          return (
                          <div
                            key={acc.id}
                            className={`flex items-center gap-1.5 rounded-lg px-2 py-1 ${acc.isArchived ? "bg-gray-100 opacity-60" : "bg-muted/50"}`}
                            data-testid={`row-user-${acc.id}`}
                          >
                            <Badge className={`text-xs ${getRoleBadgeClass(acc.role)}`}>
                              {ROLES.find(r => r.value === acc.role)?.label ?? acc.role}
                            </Badge>
                            {acc.track && (
                              <span className="text-xs text-muted-foreground">{acc.track}</span>
                            )}
                            {["student", "volunteer"].includes(acc.role) && (
                              acc.circleName
                                ? <span className="text-xs font-medium text-indigo-600 bg-indigo-50 rounded px-1.5 py-0.5">{acc.circleName}</span>
                                : <span className="text-xs text-amber-600 bg-amber-50 rounded px-1.5 py-0.5">بدون حلقة ⚠</span>
                            )}
                            {acc.isArchived && <span className="text-xs text-gray-500">معطّل</span>}
                            {/* مسؤولة المسار ترى حسابات مسارها فقط وتدير أسماء الموظفات وأرشفتهم */}
                            {(isLeader || isTrackSupervisor) && (<>
                              {!hasActiveVersion && (
                                <button
                                  onClick={() => openEdit(acc)}
                                  className="text-muted-foreground hover:text-foreground transition-colors ml-1"
                                  data-testid={`button-edit-user-${acc.id}`}
                                  title="تعديل"
                                >
                                  <Pencil className="w-3 h-3" />
                                </button>
                              )}
                              {!hasActiveVersion && !acc.isArchived && ["student", "teacher", "supervisor", "volunteer"].includes(acc.role) && (
                                <button
                                  onClick={() => { setTransferTarget({ id: acc.id, role: acc.role, studentId: acc.studentId, circleId: acc.circleId ?? null, label: `${ROLES.find(r => r.value === acc.role)?.label ?? acc.role} — ${person.name}` }); setTransferCircleId(""); }}
                                  className="text-muted-foreground hover:text-blue-600 transition-colors"
                                  title="نقل لحلقة أخرى"
                                >
                                  <ArrowLeftRight className="w-3 h-3" />
                                </button>
                              )}
                              {(isLeader || (isTrackSupervisor && ["student", "volunteer"].includes(acc.role))) && <button
                                onClick={() => { setResetPwdUserId(acc.id); setNewPassword(""); setResetPwdOpen(true); }}
                                className="text-muted-foreground hover:text-blue-600 transition-colors"
                                title="إعادة تعيين كلمة المرور"
                              ><KeyRound className="w-3 h-3" /></button>}
                              {isLeader && <button
                                onClick={() => handleToggleDisable(acc)}
                                className={`transition-colors ${acc.isArchived ? "text-muted-foreground hover:text-emerald-600" : "text-muted-foreground hover:text-destructive"}`}
                                title={acc.isArchived ? "تفعيل الحساب" : "تعطيل الحساب"}
                              >{acc.isArchived ? <CheckCircle2 className="w-3 h-3" /> : <Ban className="w-3 h-3" />}</button>}
                              {acc.role !== "leader" && acc.role !== "deputy" &&
                                (isLeader || ["teacher", "supervisor", "volunteer"].includes(acc.role)) && (
                                <button
                                  onClick={() => handleArchiveAccount(acc.id, `${acc.role} — ${person.name}`)}
                                  className="text-muted-foreground hover:text-amber-600 transition-colors"
                                  title="أرشفة الحساب (البيانات تبقى محفوظة)"
                                >
                                  <Archive className="w-3 h-3" />
                                </button>
                              )}
                              {isLeader && acc.role !== "leader" && acc.role !== "deputy" && (
                                <button
                                  onClick={() => { setPermDeleteTarget({ id: acc.id, label: `${person.name} (${acc.role})` }); setPermDeleteOpen(true); }}
                                  className="text-muted-foreground hover:text-destructive transition-colors"
                                  data-testid={`button-delete-user-${acc.id}`}
                                  title="حذف نهائي"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              )}
                            </>)}
                          </div>
                        )})}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1.5 shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openAddRole(person)}
                        className="gap-1.5 text-xs h-8"
                        title="إضافة دور لنفس الشخص"
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                        إضافة دور
                      </Button>
                      {canManageAssignments && person.accounts.some(a => a.role === "data_entry") && (() => {
                        const de = person.accounts.find(a => a.role === "data_entry");
                        if (!de) return null;
                        const currentAssign = dataEntryAssignments.find(a => a.userId === de.id);
                        const assignedCount = currentAssign?.circleIds?.length ?? 0;
                        return (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setAssignTarget({ userId: de.id, userName: person.name });
                              setSelectedAssignCircles(currentAssign?.circleIds ?? []);
                              setAssignTrackFilter("");
                              setAssignDialogOpen(true);
                            }}
                            className={`gap-1.5 text-xs h-8 ${
                              assignedCount > 0
                                ? "border-blue-200 text-blue-700 hover:bg-blue-50"
                                : "border-amber-200 text-amber-700 hover:bg-amber-50"
                            }`}
                            title="إسناد حلقات لمدخلة البيانات"
                          >
                            <Users className="w-3.5 h-3.5" />
                            {assignedCount > 0 ? `إسناد حلقات (${assignedCount})` : "إسناد حلقات ⚠"}
                          </Button>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>
              {editingUser
                ? "تعديل الحساب"
                : form.email
                ? `إضافة دور لـ ${form.name}`
                : "إنشاء حساب جديد"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>الاسم {isAddRoleMode && <span className="text-xs text-muted-foreground">(يمكن تغييره للتمييز بين أبناء نفس الأم)</span>}</Label>
              <Input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="الاسم الكامل"
              />
            </div>
            {/* الإيميل وكلمة السر: مقفلتان في وضع إضافة دور، قابلتان للتعديل في وضع الإنشاء أو التعديل */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                البريد الإلكتروني
                {isAddRoleMode && <span className="text-xs text-muted-foreground">(مقفل — كما سجّلته صاحبة الحساب)</span>}
              </Label>
              <div className="relative">
                <Input
                  value={form.email}
                  onChange={e => {
                    if (isAddRoleMode) return;
                    setForm(f => ({ ...f, email: e.target.value }));
                    setEmailConfirmedDuplicate(false);
                  }}
                  readOnly={isAddRoleMode}
                  placeholder="email@sana.sa"
                  className={[
                    isAddRoleMode ? "bg-muted text-muted-foreground cursor-not-allowed select-none pr-8" : "",
                    showEmailDuplicateWarning ? "border-amber-400 focus-visible:ring-amber-300" : "",
                  ].filter(Boolean).join(" ")}
                />
                {isAddRoleMode && (
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground">🔒</span>
                )}
              </div>
              {showEmailDuplicateWarning && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-3 space-y-2">
                  {duplicateNames.map(name => (
                    <p key={name} className="text-sm font-semibold text-red-700">
                      ⚠️ يا {name}، تم تسجيل حسابك من قبل، الرجاء عدم تكرار التسجيل بنفس الاسم.
                    </p>
                  ))}
                  <p className="text-xs text-red-500">
                    إذا كان التسجيل مقصوداً (أمّ لأكثر من طالبة، أو أختان بنفس الإيميل) اضغطي للمتابعة.
                  </p>
                  <button
                    type="button"
                    onClick={() => setEmailConfirmedDuplicate(true)}
                    className="text-xs font-semibold text-red-700 underline hover:text-red-900"
                  >
                    المتابعة رغم التكرار
                  </button>
                </div>
              )}
            </div>
            {!isAddRoleMode && (
              <div className="space-y-2">
                <Label>
                  كلمة المرور{" "}
                  {editingUser && (
                    <span className="text-xs text-muted-foreground">(اتركيها فارغة لعدم التغيير)</span>
                  )}
                </Label>
                <Input
                  type="password"
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  placeholder="••••••••"
                />
              </div>
            )}
            {isAddRoleMode && (
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  كلمة المرور
                  <span className="text-xs text-muted-foreground">(مقفلة — محفوظة كما هي)</span>
                </Label>
                <div className="relative">
                  <Input
                    type="password"
                    value="placeholder"
                    readOnly
                    className="bg-muted text-muted-foreground cursor-not-allowed pr-8"
                  />
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground">🔒</span>
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label>الدور</Label>
              <Select value={form.role} onValueChange={v => {
                setForm(f => ({ ...f, role: v, track: "", circleId: "" }));
                setDeFormCircles([]);
              }}>
                <SelectTrigger>
                  <SelectValue placeholder="اختيار الدور" />
                </SelectTrigger>
                <SelectContent>
                  {(isTrackSupervisor ? ROLES.filter(r => ["student", "teacher", "supervisor", "volunteer"].includes(r.value)) : ROLES).map(r => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* مدخلة البيانات: اختيار المسار أولاً ثم الحلقات */}
            {form.role === "data_entry" && (
              <>
                <div className="space-y-2">
                  <Label>المسار <span className="text-rose-500">*</span></Label>
                  <Select value={form.track} onValueChange={v => {
                    setForm(f => ({ ...f, track: v }));
                    setDeFormCircles([]);
                  }}>
                    <SelectTrigger>
                      <SelectValue placeholder={tracksLoading ? "جارٍ التحميل..." : "اختاري المسار أولاً"} />
                    </SelectTrigger>
                    <SelectContent>
                      {tracksLoading ? (
                        <SelectItem value="__loading__" disabled>جارٍ تحميل المسارات...</SelectItem>
                      ) : !tracks?.length ? (
                        <SelectItem value="__empty__" disabled>لا توجد مسارات</SelectItem>
                      ) : (
                        tracks.map(t => (
                          <SelectItem key={t.name} value={t.name}>{t.name}</SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
                {form.track && (
                  <div className="space-y-2">
                    <Label className="flex items-center justify-between">
                      <span>الحلقات المُسندة لها</span>
                      {deFormCircles.length > 0 && (
                        <span className="text-xs text-blue-600 font-medium">{deFormCircles.length} مُختارة</span>
                      )}
                    </Label>
                    {deFormTrackCircles.length === 0 ? (
                      <p className="text-xs text-muted-foreground bg-muted/50 rounded-xl px-3 py-3 text-center">
                        لا توجد حلقات في هذا المسار
                      </p>
                    ) : (
                      <div className="max-h-48 overflow-y-auto space-y-1.5 border border-border rounded-xl p-2">
                        {deFormTrackCircles.map((c: any) => {
                          const checked = deFormCircles.includes(c.id);
                          return (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => setDeFormCircles(prev =>
                                prev.includes(c.id) ? prev.filter(id => id !== c.id) : [...prev, c.id]
                              )}
                              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg border transition-colors text-right ${
                                checked ? "bg-blue-50 border-blue-200 text-blue-800" : "border-border hover:bg-muted/40"
                              }`}
                            >
                              {checked
                                ? <CheckSquare className="w-4 h-4 text-blue-600 shrink-0" />
                                : <Square className="w-4 h-4 text-muted-foreground shrink-0" />}
                              <span className="text-sm font-medium">{c.name}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {needsTrack && (
              <div className="space-y-2">
                <Label>المسار</Label>
                <Select value={form.track} onValueChange={v => setForm(f => ({ ...f, track: v, circleId: "" }))}>
                  <SelectTrigger>
                    <SelectValue placeholder={tracksLoading ? "جارٍ التحميل..." : "اختيار المسار"} />
                  </SelectTrigger>
                  <SelectContent>
                    {tracksLoading ? (
                      <SelectItem value="__loading__" disabled>جارٍ تحميل المسارات...</SelectItem>
                    ) : !tracks?.length ? (
                      <SelectItem value="__empty__" disabled>لا توجد مسارات — أضيفيها من "إدارة المسارات"</SelectItem>
                    ) : (
                      tracks.map(t => (
                        <SelectItem key={t.name} value={t.name}>{t.name}</SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}
            {needsCircle && form.track && (
              <div className="space-y-2">
                <Label>الحلقة</Label>
                <Select value={form.circleId} onValueChange={v => setForm(f => ({ ...f, circleId: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="اختيار الحلقة" />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredCircles.map((c: any) => (
                      <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>إلغاء</Button>
            <Button
              onClick={handleSave}
              disabled={!form.name || !form.email || !form.role || createUser.isPending || updateUser.isPending}
              data-testid="button-save-user"
            >
              {editingUser ? "حفظ التعديلات" : "إنشاء الحساب"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={resetPwdOpen} onOpenChange={setResetPwdOpen}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle>إعادة تعيين كلمة المرور</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <Input
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder="كلمة المرور الجديدة"
              onKeyDown={e => e.key === "Enter" && handleResetPwd()}
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setResetPwdOpen(false)}>إلغاء</Button>
            <Button onClick={handleResetPwd} disabled={!newPassword.trim() || resetPwd.isPending}>
              تغيير كلمة المرور
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* نافذة إسناد الحلقات لمدخلة البيانات */}
      <Dialog open={assignDialogOpen} onOpenChange={v => { if (!v) { setAssignDialogOpen(false); setAssignTarget(null); setAssignTrackFilter(""); } }}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-600" />
              إسناد حلقات — {assignTarget?.userName}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {/* فلتر المسار */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">فلتر حسب المسار</label>
              <select
                className="w-full border border-input rounded-xl px-3 py-2 text-sm bg-background text-right"
                value={assignTrackFilter}
                onChange={e => setAssignTrackFilter(e.target.value)}
              >
                <option value="">كل المسارات</option>
                {[...new Set((circles ?? []).filter((c: any) => !c.isArchived).map((c: any) => c.track).filter(Boolean))].map(t => (
                  <option key={t as string} value={t as string}>{t as string}</option>
                ))}
              </select>
            </div>
            {/* قائمة الحلقات */}
            <div className="max-h-64 overflow-y-auto space-y-1.5 border border-border rounded-xl p-2">
              {(() => {
                const filtered = (circles ?? []).filter((c: any) => !c.isArchived && (!assignTrackFilter || c.track === assignTrackFilter));
                if (filtered.length === 0) return <p className="text-center text-sm text-muted-foreground py-4">لا توجد حلقات</p>;
                return filtered.map((c: any) => {
                  const checked = selectedAssignCircles.includes(c.id);
                  const takenByOther = assignDialogOtherAssignedIds.has(c.id);
                  if (takenByOther) return null;
                  return (
                    <button
                      key={c.id}
                      onClick={() => setSelectedAssignCircles(prev =>
                        prev.includes(c.id) ? prev.filter(id => id !== c.id) : [...prev, c.id]
                      )}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-colors text-right ${
                        checked ? "bg-blue-50 border-blue-200 text-blue-800" : "border-border hover:bg-muted/40"
                      }`}
                    >
                      {checked
                        ? <CheckSquare className="w-4 h-4 text-blue-600 shrink-0" />
                        : <Square className="w-4 h-4 text-muted-foreground shrink-0" />
                      }
                      <span className="text-sm font-medium">{c.name}</span>
                      <span className="text-xs text-muted-foreground mr-auto flex items-center gap-1.5">
                        {(c as any).meetingTime && <span className="text-teal-600">{(c as any).meetingTime}</span>}
                        {c.track && <span>{c.track}</span>}
                      </span>
                    </button>
                  );
                });
              })()}
            </div>
            {selectedAssignCircles.length > 0 && (
              <p className="text-xs text-blue-600 font-medium">
                ✓ {selectedAssignCircles.length} حلقة مُختارة
              </p>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setAssignDialogOpen(false); setAssignTarget(null); setAssignTrackFilter(""); }}>إلغاء</Button>
            <Button
              onClick={async () => {
                if (!assignTarget) return;
                await saveAssignments(assignTarget.userId, selectedAssignCircles);
                toast({ title: `تم إسناد ${selectedAssignCircles.length} حلقة لـ ${assignTarget.userName}` });
                setAssignDialogOpen(false);
                setAssignTarget(null);
                setAssignTrackFilter("");
              }}
              disabled={assignSaving}
              className="gap-1.5"
            >
              {assignSaving ? "جاري الحفظ..." : `حفظ (${selectedAssignCircles.length} حلقة)`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* نافذة تأكيد الأرشفة */}
      <Dialog open={archiveOpen} onOpenChange={v => { if (!v) { setArchiveOpen(false); setArchiveTarget(null); } }}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Archive className="w-4 h-4 text-amber-600" />
              أرشفة الحساب
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-3">
              <p className="text-sm text-amber-800">
                سيتم أرشفة حساب <span className="font-bold">{archiveTarget?.label}</span>.
              </p>
            </div>
            <p className="text-xs text-muted-foreground">تبقى جميع البيانات والإحصائيات محفوظة في النظام.</p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setArchiveOpen(false); setArchiveTarget(null); }}>إلغاء</Button>
            <Button
              onClick={confirmArchive}
              disabled={deleteUser.isPending}
              className="bg-amber-600 hover:bg-amber-700 text-white gap-1.5"
            >
              <Archive className="w-3.5 h-3.5" />
              {deleteUser.isPending ? "جاري الأرشفة..." : "تأكيد الأرشفة"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* نافذة تأكيد الحذف النهائي */}
      <Dialog open={permDeleteOpen} onOpenChange={v => { if (!v) { setPermDeleteOpen(false); setPermDeleteTarget(null); } }}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-destructive">⚠️ حذف نهائي</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="rounded-xl bg-red-50 border border-red-200 p-3">
              <p className="text-sm font-semibold text-red-800 mb-1">تحذير: هذا الإجراء لا يمكن التراجع عنه</p>
              <p className="text-xs text-red-700">سيتم حذف حساب <span className="font-bold">{permDeleteTarget?.label}</span> نهائيًا من النظام بما فيه جميع بياناته.</p>
            </div>
            <p className="text-xs text-muted-foreground">إذا أردتِ الاحتفاظ بالبيانات والإحصائيات، استخدمي زر الأرشفة بدلًا من الحذف النهائي.</p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setPermDeleteOpen(false); setPermDeleteTarget(null); }}>إلغاء</Button>
            <Button
              variant="destructive"
              onClick={handlePermanentDelete}
              disabled={permDeleting}
            >
              {permDeleting ? "جاري الحذف..." : "تأكيد الحذف النهائي"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!transferTarget} onOpenChange={v => { if (!v) { setTransferTarget(null); setTransferCircleId(""); } }}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowLeftRight className="w-4 h-4 text-blue-600" />
              نقل إلى حلقة أخرى
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm">نقل <span className="font-bold">{transferTarget?.label}</span> إلى:</p>
            <Select value={transferCircleId} onValueChange={setTransferCircleId}>
              <SelectTrigger><SelectValue placeholder="اختاري الحلقة الهدف" /></SelectTrigger>
              <SelectContent>
                {allCirclesForForm
                  .filter(c => c.id !== transferTarget?.circleId)
                  .map(c => (
                    <SelectItem key={c.id} value={c.id.toString()}>{c.name} — {c.track}</SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setTransferTarget(null); setTransferCircleId(""); }}>إلغاء</Button>
            <Button
              onClick={confirmTransfer}
              disabled={!transferCircleId || transferring}
              className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5"
            >
              <ArrowLeftRight className="w-3.5 h-3.5" />
              {transferring ? "جاري النقل..." : "تأكيد النقل"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
