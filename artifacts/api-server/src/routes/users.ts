import { findExistingStudent } from "../lib/studentIdentity";
import { Router, type IRouter } from "express";
import { toSafeUser } from "../lib/safeUser";
import { db, usersTable, studentsTable, circlesTable, recordsTable, studentGoalsTable, studentNotesTable, studentTransfersTable, examRecordsTable, studentEnrollmentsTable } from "@workspace/db";
import { eq, and, sql, isNotNull, inArray, getTableColumns } from "drizzle-orm";
import { hashPassword } from "../lib/auth";
import { authenticate, requireRole } from "../middlewares/authenticate";
import { CreateUserBody, UpdateUserBody, ResetUserPasswordBody } from "@workspace/api-zod";

const router: IRouter = Router();

// أعمدة قائمة الحسابات: بلا كلمات المرور والرموز (لا تخرج من القاعدة أصلًا)
const { passwordHash: _ph, emailVerificationToken: _evt, passwordResetToken: _prt, passwordResetTokenExpiry: _prx, telegramLinkToken: _tlt, telegramChatId: _tci, ...listUserColumns } = getTableColumns(usersTable);

// الأدوار التي تديرها مسؤولة المسار (لا تلمس القائدة ولا النائبة ولا مسؤولات المسارات ولا مدخلات البيانات)
const TRACK_MANAGED_ROLES = ["student", "teacher", "supervisor", "volunteer"];

/** هل الحساب تابع لمسار مسؤولة المسار الحالية؟ (مساره، أو حلقته، أو حلقة يملكها، أو تسجيل نشط للطالبة) */
async function inSupervisorTrack(req: { userTrack?: string | null }, u: typeof usersTable.$inferSelect): Promise<boolean> {
  const myTrack = req.userTrack;
  if (!myTrack) return false;
  if (u.track === myTrack) return true;
  if (u.circleId != null) {
    const [c] = await db.select({ track: circlesTable.track }).from(circlesTable).where(eq(circlesTable.id, u.circleId));
    if (c?.track === myTrack) return true;
  }
  if (u.role === "teacher" || u.role === "supervisor") {
    const ownerColumn = u.role === "teacher" ? circlesTable.teacherId : circlesTable.supervisorId;
    const [owned] = await db.select({ id: circlesTable.id }).from(circlesTable).where(and(
      eq(ownerColumn, u.id), eq(circlesTable.track, myTrack), eq(circlesTable.isArchived, false),
    )).limit(1);
    if (owned) return true;
  }
  if (u.role === "student" && u.studentId != null) {
    const [en] = await db.select({ id: studentEnrollmentsTable.id }).from(studentEnrollmentsTable)
      .innerJoin(circlesTable, eq(circlesTable.id, studentEnrollmentsTable.circleId))
      .where(and(
        eq(studentEnrollmentsTable.studentId, u.studentId), eq(studentEnrollmentsTable.isArchived, false),
        eq(circlesTable.track, myTrack), eq(circlesTable.isArchived, false),
      )).limit(1);
    if (en) return true;
  }
  return false;
}

/** تحويل حساب طالبة إلى كادر: يُغلق تسجيلها في حلقة هذا الحساب (أو قائمة التسجيل) فلا تبقى طالبة باسمها هناك */
async function closeStudentSideOnStaffConversion(u: typeof usersTable.$inferSelect): Promise<void> {
  if (u.studentId == null) return;
  const regIds = (await db.select({ id: circlesTable.id }).from(circlesTable).where(eq(circlesTable.trackType, "registration"))).map((c) => c.id);
  const circleIds = [...new Set([...(u.circleId != null ? [u.circleId] : []), ...regIds])];
  if (circleIds.length) {
    await db.update(studentEnrollmentsTable).set({ isArchived: true }).where(and(
      eq(studentEnrollmentsTable.studentId, u.studentId), inArray(studentEnrollmentsTable.circleId, circleIds), eq(studentEnrollmentsTable.isArchived, false),
    ));
  }
  // سجل الطالبة نفسه يُؤرشف فقط إن لم يبق لها تسجيل نشط ولا سجلات
  const [left] = await db.select({ id: studentEnrollmentsTable.id }).from(studentEnrollmentsTable)
    .where(and(eq(studentEnrollmentsTable.studentId, u.studentId), eq(studentEnrollmentsTable.isArchived, false))).limit(1);
  const [rec] = await db.select({ id: recordsTable.id }).from(recordsTable).where(eq(recordsTable.studentId, u.studentId)).limit(1);
  if (!left && !rec) await db.update(studentsTable).set({ isArchived: true }).where(eq(studentsTable.id, u.studentId));
}

router.get("/users/archived-staff", authenticate, async (req, res): Promise<void> => {
  if (!["leader", "deputy", "track_supervisor"].includes(req.userRole ?? "")) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  const archived = await db
    .select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, role: usersTable.role, track: usersTable.track, circleId: usersTable.circleId, createdAt: usersTable.createdAt })
    .from(usersTable)
    .where(eq(usersTable.isArchived, true));
  const staffRoles = ["teacher", "supervisor", "track_supervisor", "data_entry", "deputy"];
  const filtered = archived.filter(u => staffRoles.includes(u.role));
  if (req.userRole === "track_supervisor") {
    res.json(filtered.filter(u => u.track === req.userTrack));
    return;
  }
  res.json(filtered);
});

router.post("/users/:id/restore", authenticate, async (req, res): Promise<void> => {
  if (!["leader", "deputy", "track_supervisor"].includes(req.userRole ?? "")) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  const id = parseInt(String(req.params.id));
  const [target] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  if (!target) { res.status(404).json({ error: "المستخدم غير موجود" }); return; }
  if (!target.isArchived) { res.status(409).json({ error: "الحساب نشط بالفعل" }); return; }
  const protectedRoles = ["leader", "deputy", "track_supervisor"];
  if (req.userRole !== "leader" && protectedRoles.includes(target.role)) {
    res.status(403).json({ error: "لا تملكين صلاحية استعادة هذا الحساب" }); return;
  }
  if (req.userRole === "track_supervisor") {
    let inTrack = target.track === req.userTrack;
    if (!inTrack && req.userTrack && (target.role === "teacher" || target.role === "supervisor")) {
      const ownerColumn = target.role === "teacher" ? circlesTable.teacherId : circlesTable.supervisorId;
      const [ownedCircle] = await db.select({ id: circlesTable.id }).from(circlesTable).where(and(
        eq(ownerColumn, target.id), eq(circlesTable.track, req.userTrack), eq(circlesTable.isArchived, false),
      )).limit(1);
      inTrack = Boolean(ownedCircle);
    }
    if (!inTrack) { res.status(403).json({ error: "الحساب خارج نطاق المسار" }); return; }
  }
  const [user] = await db.update(usersTable)
    .set({ isArchived: false })
    .where(and(eq(usersTable.id, id), eq(usersTable.isArchived, true)))
    .returning();
  if (!user) { res.status(409).json({ error: "تعذر استعادة الحساب" }); return; }
  res.json({ success: true });
});

router.get("/users/unlinked-staff", authenticate, async (req, res): Promise<void> => {
  if (!["leader", "deputy"].includes(req.userRole ?? "")) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  const staff = await db
    .select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, role: usersTable.role, circleId: usersTable.circleId, track: usersTable.track, createdAt: usersTable.createdAt })
    .from(usersTable)
    .where(eq(usersTable.role, "teacher"));
  const staffSup = await db
    .select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, role: usersTable.role, circleId: usersTable.circleId, track: usersTable.track, createdAt: usersTable.createdAt })
    .from(usersTable)
    .where(eq(usersTable.role, "supervisor"));
  const allStaff = [...staff, ...staffSup];

  const circles = await db.select({ id: circlesTable.id, name: circlesTable.name, track: circlesTable.track, teacherId: circlesTable.teacherId, supervisorId: circlesTable.supervisorId }).from(circlesTable);

  const linkedTeacherIds = new Set(circles.map(c => c.teacherId).filter(Boolean));
  const linkedSupervisorIds = new Set(circles.map(c => c.supervisorId).filter(Boolean));

  const unlinked = allStaff.filter(u =>
    (u.role === "teacher" && !linkedTeacherIds.has(u.id)) ||
    (u.role === "supervisor" && !linkedSupervisorIds.has(u.id))
  );

   res.json({ unlinked, circles });
});

router.get("/users", authenticate, async (req, res): Promise<void> => {
  // جلب أسماء الحلقات لإضافتها لكل مستخدم
  const allCircles = await db.select({ id: circlesTable.id, name: circlesTable.name }).from(circlesTable);
  const circleMap = new Map(allCircles.map(c => [c.id, c.name]));
  const withMeta = (users: any[]) =>
    users.map((raw) => toSafeUser(raw)).map((u: any) => ({
      ...u,
      circleName: u.circleId ? (circleMap.get(u.circleId) ?? null) : null,
    }));

  // مسؤولة المسار ترى الطالبات والمعلمات والمشرفات في مسارها فقط
  if (req.userRole === "track_supervisor") {
    const [me] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!));
    const myTrack = req.userTrack ?? me?.track ?? null;
    if (!myTrack) {
      res.json([]);
      return;
    }
    const trackCircles = await db
      .select({ id: circlesTable.id, teacherId: circlesTable.teacherId, supervisorId: circlesTable.supervisorId })
      .from(circlesTable)
      .where(eq(circlesTable.track, myTrack));
    const trackCircleIds = new Set(trackCircles.map(circle => circle.id));
    const trackStaffIds = new Set(
      trackCircles.flatMap(circle => [circle.teacherId, circle.supervisorId].filter((id): id is number => id != null)),
    );
    const activeEnrollments = await db
      .select({ studentId: studentEnrollmentsTable.studentId, circleId: studentEnrollmentsTable.circleId, studentName: studentsTable.fullName })
      .from(studentEnrollmentsTable)
      .innerJoin(studentsTable, eq(studentsTable.id, studentEnrollmentsTable.studentId))
      .where(eq(studentEnrollmentsTable.isArchived, false));
    const trackEnrollments = activeEnrollments.filter(enrollment => trackCircleIds.has(enrollment.circleId));
    const trackStudentIds = new Set(trackEnrollments.map(enrollment => enrollment.studentId));
    const all = await db.select(listUserColumns).from(usersTable)
      .where(and(eq(usersTable.isArchived, false), inArray(usersTable.role, ["student", "teacher", "supervisor"])));
    const filtered = all.filter(u => {
      if (u.isArchived) return false;
      if (!["student", "teacher", "supervisor"].includes(u.role)) return false;
      if (u.role === "student") {
        return (
          (u.circleId != null && trackCircleIds.has(u.circleId)) ||
          (u.studentId != null && trackStudentIds.has(u.studentId))
        );
      }
      return u.track === myTrack || (u.circleId != null && trackCircleIds.has(u.circleId)) || trackStaffIds.has(u.id);
    });
    const studentIdByName = new Map<string, number>();
    for (const enrollment of trackEnrollments) {
      const key = enrollment.studentName.trim().replace(/\s+/g, " ").toLowerCase();
      if (!studentIdByName.has(key)) studentIdByName.set(key, enrollment.studentId);
    }
    res.json(withMeta(filtered).map(user => user.role === "student" && !user.studentId
      ? { ...user, studentId: studentIdByName.get(user.name.trim().replace(/\s+/g, " ").toLowerCase()) ?? null }
      : user));
    return;
  }
  // الطالبة: معلمة حلقتها ومشرفتها فقط (لعرض اسميهما في صفحتها) — بدل رفض الطلب برسالة خطأ
  if (req.userRole === "student") {
    if (!req.userCircleId) { res.json([]); return; }
    const [c] = await db.select({ t: circlesTable.teacherId, s: circlesTable.supervisorId }).from(circlesTable).where(eq(circlesTable.id, req.userCircleId));
    const ids = [c?.t, c?.s].filter((x): x is number => x != null);
    const staff = ids.length ? await db.select({ id: usersTable.id, name: usersTable.name, role: usersTable.role, circleId: usersTable.circleId }).from(usersTable).where(inArray(usersTable.id, ids)) : [];
    res.json(staff.map((u) => ({ ...u, circleId: req.userCircleId, circleName: circleMap.get(req.userCircleId!) ?? null })));
    return;
  }
  if (req.userRole !== "leader" && req.userRole !== "deputy") {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  const roleFilter = req.query.role as string | undefined;
  const filtered = roleFilter
    ? await db.select(listUserColumns).from(usersTable).where(eq(usersTable.role, roleFilter))
    : await db.select(listUserColumns).from(usersTable);
  res.json(withMeta(filtered));
});

router.get("/users/by-email", authenticate, async (req, res): Promise<void> => {
  // كان أي حساب (حتى الطالبة) يعرف اسم صاحبة أي بريد. الشاشات التي تستخدمه للقائدة والنائبة ومسؤولة المسار.
  if (!["leader", "deputy", "track_supervisor"].includes(req.userRole ?? "")) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  const email = ((req.query.email as string) ?? "").toLowerCase().trim();
  if (!email) { res.status(400).json({ error: "Email required" }); return; }
  const [user] = await db.select({
    id: usersTable.id, name: usersTable.name, email: usersTable.email,
  }).from(usersTable).where(eq(usersTable.email, email));
  if (!user) { res.status(404).json({ error: "لم يُعثر على حساب بهذا البريد" }); return; }
  res.json(user);
});

router.post("/users", authenticate, async (req, res): Promise<void> => {
  // مسؤولة المسار يمكنها إضافة طالبات ومعلمات ومشرفات ومتطوعات فقط
  if (req.userRole === "track_supervisor") {
    const body = req.body as { role?: string };
    const allowed = ["student", "teacher", "supervisor", "volunteer"];
    if (!body.role || !allowed.includes(body.role)) {
      res.status(403).json({ error: "مسؤولة المسار يمكنها إدارة الطالبات والكادر والمتطوعات في مسارها فقط" });
      return;
    }
  } else if (req.userRole !== "leader") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const parsed = CreateUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { password, ...rest } = parsed.data;
  const lowerEmail = rest.email.toLowerCase();

  // If an account with this email already exists, reuse its passwordHash so
  // all roles for the same person share one password (multi-role login works).
  const existingAccounts = await db.select().from(usersTable).where(eq(usersTable.email, lowerEmail));
  const passwordHash = existingAccounts.length > 0
    ? existingAccounts[0].passwordHash
    : hashPassword(password);

  const [user] = await db.insert(usersTable).values({
    ...rest,
    email: lowerEmail,
    passwordHash,
  }).returning();

  if (rest.role === "student") {
    // أولاً: ابحث عن سجل طالبة موجود بنفس الاسم في نفس الحلقة قبل إنشاء سجل جديد
    // هذا يمنع تكرار السجلات للطالبات الموجودات في أكثر من حلقة
    let linkedStudentId: number | null = null;

    if (rest.circleId) {
      // بحث مباشر بالاسم + circleId على جدول students
      const directMatch = await db
        .select({ id: studentsTable.id })
        .from(studentsTable)
        .where(
          and(
            sql`TRIM(${studentsTable.fullName}) = TRIM(${rest.name})`,
            eq(studentsTable.circleId, rest.circleId),
            eq(studentsTable.isArchived, false),
          ),
        )
        .limit(1);
      linkedStudentId = directMatch[0]?.id ?? null;

      if (!linkedStudentId) {
        // بحث عبر student_enrollments
        const enrollMatch = await db
          .select({ id: studentEnrollmentsTable.studentId })
          .from(studentEnrollmentsTable)
          .innerJoin(studentsTable, eq(studentsTable.id, studentEnrollmentsTable.studentId))
          .where(
            and(
              sql`TRIM(${studentsTable.fullName}) = TRIM(${rest.name})`,
              eq(studentEnrollmentsTable.circleId, rest.circleId),
              eq(studentEnrollmentsTable.isArchived, false),
              eq(studentsTable.isArchived, false),
            ),
          )
          .limit(1);
        linkedStudentId = enrollMatch[0]?.id ?? null;
      }
    }

    if (linkedStudentId) {
      // ربط الحساب الجديد بالسجل الموجود — لا تنشئ سجلاً مكرراً
      await db.update(usersTable).set({ studentId: linkedStudentId }).where(eq(usersTable.id, user.id));
    } else {
      // إنشاء سجل جديد فقط إذا لم يُعثر على سجل موجود
      const [newStudent] = await db.insert(studentsTable).values({
        fullName: rest.name,
        circleId: rest.circleId ?? null,
        phone: rest.phone ?? null,
        country: rest.country ?? null,
        isArchived: false,
      }).returning({ id: studentsTable.id });
      if (newStudent) {
        await db.update(usersTable).set({ studentId: newStudent.id }).where(eq(usersTable.id, user.id));
      }
    }
  }

  // ربط المعلمة/المشرفة بالحلقة تلقائياً
  if (rest.circleId) {
    if (rest.role === "teacher") {
      await db.update(circlesTable).set({ teacherId: user.id }).where(eq(circlesTable.id, rest.circleId));
    } else if (rest.role === "supervisor") {
      await db.update(circlesTable).set({ supervisorId: user.id }).where(eq(circlesTable.id, rest.circleId));
    }
  }

  const safeUser = toSafeUser(user);
  res.status(201).json(safeUser);
});

router.get("/users/:id", authenticate, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (req.userRole !== "leader" && req.userId !== id) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const safeUser = toSafeUser(user);
  res.json(safeUser);
});

router.patch("/users/:id", authenticate, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [existingUser] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  if (!existingUser) { res.status(404).json({ error: "User not found" }); return; }
  if (req.userRole !== "leader") {
    if (req.userRole !== "track_supervisor" || !TRACK_MANAGED_ROLES.includes(existingUser.role) || !(await inSupervisorTrack(req, existingUser))) {
      res.status(403).json({ error: "Forbidden" }); return;
    }
  }
  const parsed = UpdateUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  // تغيير حلقة حساب طالبة من هذا المسار يحدّث users.circleId مباشرة بدون
  // أن يلمس student_enrollments أبداً، فيبقى التسجيل القديم نشطًا وتظهر
  // الطالبة بحلقتين بنفس الوقت. النقل الصحيح يجب أن يمر عبر
  // PATCH /students/:id فقط (يقفل التسجيل القديم ويفتح الجديد).
  if (
    existingUser.role === "student" &&
    (parsed.data.role === undefined || parsed.data.role === "student") &&
    parsed.data.circleId !== undefined &&
    parsed.data.circleId !== null &&
    parsed.data.circleId !== existingUser.circleId
  ) {
    res.status(400).json({ error: "نقل الطالبة بين الحلقات يتم فقط عبر عملية نقل الطالبة المخصصة، وليس من تعديل الحساب" });
    return;
  }
  let targetCircleTrack: string | null = null;
  if (parsed.data.circleId !== undefined && parsed.data.circleId !== null) {
    const [targetCircle] = await db.select({ track: circlesTable.track, isArchived: circlesTable.isArchived })
      .from(circlesTable)
      .where(eq(circlesTable.id, parsed.data.circleId));
    if (!targetCircle || targetCircle.isArchived) {
      res.status(400).json({ error: "الحلقة الهدف غير متاحة" });
      return;
    }
    targetCircleTrack = targetCircle.track;
    // مسؤولة المسار تقدر تنقل كادر مسارها (معلمة/مشرفة/متطوعة) لأي حلقة
    // بالمقرأة، حتى لو كانت بمسار مختلف — لا نمنع الحلقة الهدف هنا.
    // (النطاق مُتحقَّق منه أعلاه على "existingUser": الحساب المصدر يجب أن
    // يكون تابعًا لمسار مسؤولة المسار الحالية.)
  }
  let updateData: Record<string, unknown> = { ...parsed.data };
  if (req.userRole === "track_supervisor") {
    // مسؤولة المسار: الاسم والبريد والدور (طالبة/معلمة/مشرفة/متطوعة) والحلقة داخل مسارها فقط
    const d = parsed.data;
    updateData = {};
    if (d.name !== undefined) updateData.name = d.name;
    if (d.email !== undefined && d.email.trim()) updateData.email = d.email.trim();
    if (d.role !== undefined && d.role !== existingUser.role) {
      if (!TRACK_MANAGED_ROLES.includes(d.role)) { res.status(403).json({ error: "لا يمكنكِ إسناد هذا الدور" }); return; }
      updateData.role = d.role;
    }
    if (d.circleId !== undefined && d.circleId !== existingUser.circleId) {
      if (d.circleId !== null && targetCircleTrack !== req.userTrack) { res.status(403).json({ error: "الحلقة خارج نطاق مساركِ" }); return; }
      updateData.circleId = d.circleId;
    }
    if (updateData.role !== undefined || updateData.circleId !== undefined) updateData.track = req.userTrack;
  }
  const newRole = (updateData.role as string | undefined) ?? existingUser.role;
  const roleChanged = newRole !== existingUser.role;
  if (roleChanged && existingUser.role === "student" && ["teacher", "supervisor"].includes(newRole)) {
    await closeStudentSideOnStaffConversion(existingUser);
    updateData.studentId = null;
  }
  // تغيَّر الدور: لا تبقى الحلقة مسجَّلة باسمها معلمةً أو مشرفةً بالدور القديم
  if (roleChanged && existingUser.role === "teacher") await db.update(circlesTable).set({ teacherId: null }).where(eq(circlesTable.teacherId, id));
  if (roleChanged && existingUser.role === "supervisor") await db.update(circlesTable).set({ supervisorId: null }).where(eq(circlesTable.supervisorId, id));
  // نقل المتطوعة بين الحلقات يجعل مسار حسابها تابعًا للحلقة الهدف تلقائيًا.
  if (existingUser.role === "volunteer" && targetCircleTrack) {
    updateData.track = targetCircleTrack;
  }
  const [user] = await db.update(usersTable).set(updateData).where(eq(usersTable.id, id)).returning();
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  if (user.role === "student" && user.name) {
    const nameChanged = Boolean(parsed.data.name && parsed.data.name !== existingUser.name);
    let linkedStudentId = user.studentId;

    // الحسابات القديمة قد تكون بلا student_id رغم وجود حسابات أخرى لنفس
    // الطالبة. اربطيه قبل مزامنة الاسم حتى لا يتغير الحساب المؤرشف وحده.
    if (!linkedStudentId && nameChanged) {
      const linkedSiblings = await db
        .select({ studentId: usersTable.studentId })
        .from(usersTable)
        .where(and(
          eq(usersTable.email, existingUser.email),
          eq(usersTable.role, "student"),
          eq(usersTable.name, existingUser.name),
          isNotNull(usersTable.studentId),
        ));
      const siblingStudentIds = [...new Set(linkedSiblings
        .map(sibling => sibling.studentId)
        .filter((studentId): studentId is number => studentId !== null))];
      if (siblingStudentIds.length === 1) {
        linkedStudentId = siblingStudentIds[0];
        await db.update(usersTable)
          .set({ studentId: linkedStudentId })
          .where(eq(usersTable.id, user.id));
      }
    }

    const studentRef = linkedStudentId
      ? await db.select().from(studentsTable).where(eq(studentsTable.id, linkedStudentId))
      : await db.select().from(studentsTable).where(eq(
        studentsTable.fullName,
        nameChanged ? existingUser.name : user.name,
      ));

    if (studentRef.length > 0 && nameChanged) {
      await db.update(studentsTable)
        .set({ fullName: parsed.data.name! })
        .where(eq(studentsTable.id, studentRef[0].id));
      // الحسابات المتعددة للطالبة نفسها يجب أن تعرض الاسم نفسه، سواء
      // كانت نشطة أو مؤرشفة؛ الحساب النشط لا يُترك بالاسم القديم.
      await db.update(usersTable)
        .set({ name: parsed.data.name! })
        .where(eq(usersTable.studentId, studentRef[0].id));
    }

    const circleId = user.circleId ?? null;
    if (studentRef.length === 0) {
      const [newStudent] = await db.insert(studentsTable).values({
        fullName: user.name,
        circleId,
        phone: user.phone ?? null,
        country: user.country ?? null,
        isArchived: false,
      }).returning({ id: studentsTable.id });
      if (newStudent) {
        await db.update(usersTable).set({ studentId: newStudent.id }).where(eq(usersTable.id, user.id));
      }
    } else {
      if (!linkedStudentId) {
        linkedStudentId = studentRef[0].id;
      }
      if (circleId !== null) {
        // لا تكتب فوق circleId إذا كانت الطالبة مسجّلة في أكثر من حلقة
        // (تعديل circleId يُدار عبر نظام التسجيلات student_enrollments)
        const enrollCount = await db
          .select({ cnt: sql<number>`COUNT(*)` })
          .from(studentEnrollmentsTable)
          .where(
            and(
              eq(studentEnrollmentsTable.studentId, studentRef[0].id),
              eq(studentEnrollmentsTable.isArchived, false),
            ),
          );
        const isMultiCircle = Number(enrollCount[0]?.cnt ?? 0) > 1;
        if (!isMultiCircle) {
          await db.update(studentsTable).set({ circleId }).where(eq(studentsTable.id, studentRef[0].id));
        }
      }
      // ضمان الرابط المباشر
      if (user.studentId !== studentRef[0].id) {
        await db.update(usersTable).set({ studentId: studentRef[0].id }).where(eq(usersTable.id, user.id));
      }
    }
  }

  // تحديث teacher_id / supervisor_id في جدول الحلقة عند تعديل المعلمة أو المشرفة
  if (user.circleId) {
    if (user.role === "teacher") {
      await db.update(circlesTable).set({ teacherId: user.id }).where(eq(circlesTable.id, user.circleId));
    } else if (user.role === "supervisor") {
      await db.update(circlesTable).set({ supervisorId: user.id }).where(eq(circlesTable.id, user.circleId));
    }
  }

  const safeUser = toSafeUser(user);
  res.json(safeUser);
});

router.delete("/users/:id", authenticate, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [target] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  if (!target) { res.status(404).json({ error: "User not found" }); return; }
  if (target.isArchived) { res.status(409).json({ error: "الحساب مؤرشف بالفعل" }); return; }
  if (target.role === "student") {
    res.status(400).json({ error: "أرشفة الطالبة تتم من بطاقة الانسحاب داخل الحلقة" });
    return;
  }
  const protectedRoles = ["leader", "deputy", "track_supervisor"];
  if (protectedRoles.includes(target.role)) {
    res.status(403).json({ error: "لا يمكن أرشفة حساب إداري محمي" });
    return;
  }
  let belongsToSupervisorTrack = target.track === req.userTrack;
  if (
    !belongsToSupervisorTrack &&
    req.userRole === "track_supervisor" &&
    target.circleId != null
  ) {
    const [assignedCircle] = await db
      .select({ track: circlesTable.track })
      .from(circlesTable)
      .where(eq(circlesTable.id, target.circleId));
    belongsToSupervisorTrack = assignedCircle?.track === req.userTrack;
  }
  if (
    req.userRole !== "leader" &&
    (
      req.userRole !== "track_supervisor" ||
      !["teacher", "supervisor", "volunteer"].includes(target.role) ||
      !belongsToSupervisorTrack
    )
  ) {
    let inTrack = belongsToSupervisorTrack;
    if (!inTrack && req.userRole === "track_supervisor" && req.userTrack && (target.role === "teacher" || target.role === "supervisor")) {
      const ownerColumn = target.role === "teacher" ? circlesTable.teacherId : circlesTable.supervisorId;
      const [ownedCircle] = await db.select({ id: circlesTable.id }).from(circlesTable).where(and(
        eq(ownerColumn, target.id), eq(circlesTable.track, req.userTrack), eq(circlesTable.isArchived, false),
      )).limit(1);
      inTrack = Boolean(ownedCircle);
    }
    if (!inTrack) { res.status(403).json({ error: "الحساب خارج نطاق المسار" }); return; }
  }
  await db.transaction(async (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => {
    if (target.role === "teacher") {
      await tx.update(circlesTable).set({ teacherId: null }).where(eq(circlesTable.teacherId, id));
    } else if (target.role === "supervisor") {
      await tx.update(circlesTable).set({ supervisorId: null }).where(eq(circlesTable.supervisorId, id));
    }
    await tx.update(usersTable)
      .set({ isArchived: true, circleId: null })
      .where(and(eq(usersTable.id, id), eq(usersTable.isArchived, false)));
  });
  res.sendStatus(204);
});

// الحذف النهائي — متاح للقائدة فقط، يحذف السجل نهائيًا من قاعدة البيانات
router.delete("/users/:id/permanent", authenticate, requireRole("leader"), async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  if (user?.role === "student") {
    // استخدام student_id المرتبط مباشرةً إن وُجد، وإلا البحث بالاسم للتوافق مع البيانات القديمة
    const students = user.studentId
      ? await db.select().from(studentsTable).where(eq(studentsTable.id, user.studentId))
      : await db.select().from(studentsTable).where(eq(studentsTable.fullName, user.name));
    for (const student of students) {
      const sid = student.id;
      await db.delete(recordsTable).where(eq(recordsTable.studentId, sid));
      await db.delete(studentGoalsTable).where(eq(studentGoalsTable.studentId, sid));
      await db.delete(studentNotesTable).where(eq(studentNotesTable.studentId, sid));
      await db.delete(studentTransfersTable).where(eq(studentTransfersTable.studentId, sid));
      await db.delete(examRecordsTable).where(eq(examRecordsTable.studentId, sid));
      await db.delete(studentsTable).where(eq(studentsTable.id, sid));
    }
  }
  await db.delete(usersTable).where(eq(usersTable.id, id));
  res.sendStatus(204);
});

router.patch("/users/:id/set-role", authenticate, async (req, res): Promise<void> => {
  const allowed = ["leader", "deputy", "track_supervisor"];
  if (!allowed.includes(req.userRole ?? "")) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const { role, circleId, track } = req.body as { role: string; circleId?: number; track?: string };

  const validRoles = ["student", "teacher", "supervisor", "track_supervisor", "data_entry"];
  if (!role || !validRoles.includes(role)) {
    res.status(400).json({ error: "دور غير صالح" }); return;
  }
  if (req.userRole === "track_supervisor" && !["student", "teacher", "supervisor"].includes(role)) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  // دور القائدة أو النائبة لا يغيّره إلا القائدة (كانت النائبة تستطيع تحويل القائدة إلى طالبة).
  if (req.userRole !== "leader") {
    const [privTarget] = await db.select({ role: usersTable.role }).from(usersTable).where(eq(usersTable.id, id));
    if (privTarget && ["leader", "deputy"].includes(privTarget.role)) {
      res.status(403).json({ error: "لا يمكن تغيير دور هذا الحساب" }); return;
    }
  }
  if (req.userRole === "track_supervisor") {
    const [target] = await db.select().from(usersTable).where(eq(usersTable.id, id));
    if (!target || !TRACK_MANAGED_ROLES.includes(target.role) || !(await inSupervisorTrack(req, target))) { res.status(403).json({ error: "خارج نطاق المسار" }); return; }
    if (circleId !== undefined) {
      const [circle] = await db.select({ track: circlesTable.track }).from(circlesTable).where(eq(circlesTable.id, circleId));
      if (!circle || circle.track !== req.userTrack) { res.status(403).json({ error: "الحلقة خارج نطاق المسار" }); return; }
    }
  }

  const updateData: Record<string, unknown> = { role };
  if (circleId !== undefined) updateData.circleId = circleId;
  if (track !== undefined) updateData.track = track;

  const [user] = await db.update(usersTable).set(updateData).where(eq(usersTable.id, id)).returning();
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  if (circleId) {
    if (role === "teacher") {
      await db.update(circlesTable).set({ teacherId: id }).where(eq(circlesTable.id, circleId));
    } else if (role === "supervisor") {
      await db.update(circlesTable).set({ supervisorId: id }).where(eq(circlesTable.id, circleId));
    }
  }

  // عند تحويل حساب إلى طالبة — ضمان وجود سجل student وربطه مباشرةً
  if (role === "student" && user.name) {
    if (user.studentId) {
      // الرابط موجود — حدّث circleId فقط إذا كانت الطالبة في حلقة واحدة
      if (circleId !== undefined) {
        const enrollCount = await db
          .select({ cnt: sql<number>`COUNT(*)` })
          .from(studentEnrollmentsTable)
          .where(
            and(
              eq(studentEnrollmentsTable.studentId, user.studentId),
              eq(studentEnrollmentsTable.isArchived, false),
            ),
          );
        const isMultiCircle = Number(enrollCount[0]?.cnt ?? 0) > 1;
        if (!isMultiCircle) {
          await db.update(studentsTable).set({ circleId: circleId ?? null }).where(eq(studentsTable.id, user.studentId));
        }
      }
    } else {
      // ابحث عن سجل طالبة مطابق بالاسم + الحلقة أو أنشئ واحداً جديداً
      let foundId: number | null = null;

      if (circleId) {
        // بحث مباشر بالاسم + circleId
        const direct = await db.select({ id: studentsTable.id })
          .from(studentsTable)
          .where(and(
            sql`TRIM(${studentsTable.fullName}) = TRIM(${user.name})`,
            eq(studentsTable.circleId, circleId),
            eq(studentsTable.isArchived, false),
          ))
          .limit(1);
        foundId = direct[0]?.id ?? null;

        if (!foundId) {
          // بحث عبر student_enrollments
          const enroll = await db.select({ id: studentEnrollmentsTable.studentId })
            .from(studentEnrollmentsTable)
            .innerJoin(studentsTable, eq(studentsTable.id, studentEnrollmentsTable.studentId))
            .where(and(
              sql`TRIM(${studentsTable.fullName}) = TRIM(${user.name})`,
              eq(studentEnrollmentsTable.circleId, circleId),
              eq(studentEnrollmentsTable.isArchived, false),
              eq(studentsTable.isArchived, false),
            ))
            .limit(1);
          foundId = enroll[0]?.id ?? null;
        }
      }

      if (!foundId) {
        // بحث بالاسم فقط (إذا لم يُحدَّد circleId)
        const byName = await db.select({ id: studentsTable.id })
          .from(studentsTable)
          .where(and(eq(studentsTable.fullName, user.name), eq(studentsTable.isArchived, false)))
          .limit(1);
        foundId = byName[0]?.id ?? null;
        // الطالبة المؤرشفة نفسها (الاسم + الجوال): نعيد ربطها بدل إنشاء نسخة جديدة
        if (!foundId) {
          const existing = await findExistingStudent({ fullName: user.name, phone: user.phone, circleId: circleId ?? null });
          if (existing) {
            foundId = existing.id;
            if (existing.isArchived) await db.update(studentsTable).set({ isArchived: false }).where(eq(studentsTable.id, existing.id));
          }
        }
      }

      if (foundId) {
        await db.update(usersTable).set({ studentId: foundId }).where(eq(usersTable.id, id));
        // حدّث circleId فقط للطالبات في حلقة واحدة
        if (circleId !== undefined) {
          const enrollCount = await db
            .select({ cnt: sql<number>`COUNT(*)` })
            .from(studentEnrollmentsTable)
            .where(and(eq(studentEnrollmentsTable.studentId, foundId), eq(studentEnrollmentsTable.isArchived, false)));
          const isMultiCircle = Number(enrollCount[0]?.cnt ?? 0) > 1;
          if (!isMultiCircle) {
            await db.update(studentsTable).set({ circleId: circleId ?? null }).where(eq(studentsTable.id, foundId));
          }
        }
      } else {
        const [newStudent] = await db.insert(studentsTable).values({
          fullName: user.name,
          circleId: circleId ?? null,
          isArchived: false,
        }).returning({ id: studentsTable.id });
        if (newStudent) {
          await db.update(usersTable).set({ studentId: newStudent.id }).where(eq(usersTable.id, id));
        }
      }
    }
  }

  const safeUser = toSafeUser(user);
  res.json(safeUser);
});

router.patch("/users/:id/reset-password", authenticate, async (req, res): Promise<void> => {
  const allowedRoles = ["leader", "deputy", "track_supervisor"];
  if (!allowedRoles.includes(req.userRole ?? "")) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const parsed = ResetUserPasswordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  // حساب القائدة أو النائبة لا يغيّر كلمة مروره إلا القائدة (كانت النائبة تستطيع تغيير كلمة مرور القائدة).
  if (req.userRole !== "leader") {
    const [privTarget] = await db.select({ role: usersTable.role }).from(usersTable).where(eq(usersTable.id, id));
    if (privTarget && ["leader", "deputy"].includes(privTarget.role)) {
      res.status(403).json({ error: "لا يمكن تغيير كلمة مرور هذا الحساب" }); return;
    }
  }
  // مسؤولة المسار: كلمات مرور الطالبات والمعلمات والمشرفات والمتطوعات في مسارها
  if (req.userRole === "track_supervisor") {
    const [target] = await db.select().from(usersTable).where(eq(usersTable.id, id));
    if (!target || !TRACK_MANAGED_ROLES.includes(target.role) || !(await inSupervisorTrack(req, target))) {
      res.status(403).json({ error: "الحساب خارج نطاق المسار" }); return;
    }
  }
  await db.update(usersTable).set({ passwordHash: hashPassword(parsed.data.newPassword) }).where(eq(usersTable.id, id));
  res.json({ success: true });
});

router.patch("/users/:id/disable", authenticate, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [target] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  if (!target) { res.status(404).json({ error: "User not found" }); return; }
  if (req.userRole !== "leader" &&
      (req.userRole !== "track_supervisor" || !TRACK_MANAGED_ROLES.includes(target.role) || !(await inSupervisorTrack(req, target)))) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  if (target.circleId && target.role === "teacher") {
    await db.update(circlesTable).set({ teacherId: null }).where(eq(circlesTable.id, target.circleId));
  } else if (target.circleId && target.role === "supervisor") {
    await db.update(circlesTable).set({ supervisorId: null }).where(eq(circlesTable.id, target.circleId));
  }
  const disableData = ["teacher", "supervisor"].includes(target.role)
    ? { isArchived: true, circleId: null }
    : { isArchived: true };
  const [user] = await db.update(usersTable).set(disableData).where(eq(usersTable.id, id)).returning();
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  const safeUser = toSafeUser(user);
  res.json(safeUser);
});

router.patch("/users/:id/enable", authenticate, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [target] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  if (!target) { res.status(404).json({ error: "User not found" }); return; }
  if (req.userRole !== "leader" &&
      (req.userRole !== "track_supervisor" || !TRACK_MANAGED_ROLES.includes(target.role) || !(await inSupervisorTrack(req, target)))) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  const [user] = await db.update(usersTable).set({ isArchived: false }).where(eq(usersTable.id, id)).returning();
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  const safeUser = toSafeUser(user);
  res.json(safeUser);
});

export default router;
