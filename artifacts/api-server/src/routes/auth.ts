import { Router, type IRouter } from "express";
import { db, usersTable, studentsTable, circlesTable, tracksTable, studentEnrollmentsTable, registrationSettingsTable } from "@workspace/db";
import { eq, and, or, inArray } from "drizzle-orm";
import { hashPassword, verifyPassword, generateToken, needsRehash } from "../lib/auth";
import { authenticate } from "../middlewares/authenticate";
import { rateLimit } from "../middlewares/rateLimit";
import { LoginBody, LoginSelectAccountBody } from "@workspace/api-zod";
import { appendVolunteerToSheet } from "../lib/sheets";
import { sendPasswordResetEmail } from "../lib/email";
import { randomBytes } from "crypto";

const router: IRouter = Router();

// Opportunistically upgrade a still-legacy password hash to the new scrypt
// format now that we have the plaintext password in hand. Best-effort —
// failure here must never block login.
function rehashIfNeeded(userId: number, currentHash: string, plainPassword: string): void {
  if (!needsRehash(currentHash)) return;
  db.update(usersTable)
    .set({ passwordHash: hashPassword(plainPassword) })
    .where(eq(usersTable.id, userId))
    .catch(() => {});
}

const loginRateLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 15, keyPrefix: "login", byEmail: true });
const forgotPasswordRateLimit = rateLimit({ windowMs: 60 * 60 * 1000, max: 5, keyPrefix: "forgot-password", byEmail: true });
const resetPasswordRateLimit = rateLimit({ windowMs: 60 * 60 * 1000, max: 15, keyPrefix: "reset-password" });
const staffRegisterRateLimit = rateLimit({ windowMs: 60 * 60 * 1000, max: 10, keyPrefix: "staff-register" });

router.post("/auth/login", loginRateLimit, async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  const { email, password } = parsed.data;
  const users = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase().trim()));
  if (users.length === 0) {
    res.status(401).json({ error: "بيانات الدخول غير صحيحة" });
    return;
  }

  const verified = users.filter(u => verifyPassword(password, u.passwordHash));
  if (verified.length === 0) {
    res.status(401).json({ error: "بيانات الدخول غير صحيحة" });
    return;
  }

  if (verified.length === 1) {
    const user = verified[0];
    if (user.isArchived) {
      res.status(403).json({ error: "تم تعطيل حسابك، تواصلي مع الإدارة لإعادة التفعيل" });
      return;
    }
    if (user.registrationStatus === "pending") {
      res.status(403).json({ error: "طلبك قيد المراجعة، سيتم إشعارك عند القبول" });
      return;
    }
    if (user.registrationStatus === "rejected") {
      res.status(403).json({ error: "تم رفض طلب التسجيل" });
      return;
    }
    const token = generateToken(user.id, user.role);
    rehashIfNeeded(user.id, user.passwordHash, password);
    const { passwordHash: _ph, ...safeUser } = user;
    await db.update(usersTable).set({ lastLoginAt: new Date() }).where(eq(usersTable.id, user.id));
    res.json({ user: safeUser, token });
    return;
  }

  const approvedVerified = verified.filter(
    u => !u.isArchived && u.registrationStatus !== "pending" && u.registrationStatus !== "rejected",
  );
  if (approvedVerified.length === 0) {
    if (verified.some(u => u.isArchived)) {
      res.status(403).json({ error: "تم تعطيل حسابك، تواصلي مع الإدارة لإعادة التفعيل" });
      return;
    }
    res.status(403).json({ error: "طلبك قيد المراجعة، سيتم إشعارك عند القبول" });
    return;
  }
  if (approvedVerified.length === 1) {
    const user = approvedVerified[0];
    const token = generateToken(user.id, user.role);
    rehashIfNeeded(user.id, user.passwordHash, password);
    const { passwordHash: _ph, ...safeUser } = user;
    await db.update(usersTable).set({ lastLoginAt: new Date() }).where(eq(usersTable.id, user.id));
    res.json({ user: safeUser, token });
    return;
  }
  const _unused_verified = verified;

  const roleLabels: Record<string, string> = {
    leader: "القائدة",
    deputy: "النائبة",
    data_entry: "مُدخلة بيانات",
    teacher: "معلمة",
    supervisor: "مشرفة",
    student: "طالبة",
    track_supervisor: "مسؤولة مسار",
  };

  res.json({
    requiresSelection: true,
    accounts: approvedVerified.map(u => ({
      id: u.id,
      name: u.name,
      role: u.role,
      roleLabel: roleLabels[u.role] ?? u.role,
      track: u.track ?? null,
      circleId: u.circleId ?? null,
    })),
  });
});

router.post("/auth/login/select", loginRateLimit, async (req, res): Promise<void> => {
  const parsed = LoginSelectAccountBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  const { email, password, accountId } = parsed.data;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, accountId));
  if (!user || user.email !== email.toLowerCase()) {
    res.status(401).json({ error: "بيانات الدخول غير صحيحة" });
    return;
  }
  if (!verifyPassword(password, user.passwordHash)) {
    res.status(401).json({ error: "بيانات الدخول غير صحيحة" });
    return;
  }
  if (user.isArchived) {
    res.status(403).json({ error: "تم تعطيل حسابك، تواصلي مع الإدارة لإعادة التفعيل" });
    return;
  }
  const token = generateToken(user.id, user.role);
  rehashIfNeeded(user.id, user.passwordHash, password);
  const { passwordHash: _ph, ...safeUser } = user;
  await db.update(usersTable).set({ lastLoginAt: new Date() }).where(eq(usersTable.id, user.id));
  res.json({ user: safeUser, token });
});

const ROLE_LABELS: Record<string, string> = {
  leader: "القائدة",
  data_entry: "مُدخلة بيانات",
  teacher: "معلمة",
  supervisor: "مشرفة",
  student: "طالبة",
  track_supervisor: "مسؤولة مسار",
  exam_supervisor: "مسؤولة الاختبارات",
  volunteer: "متطوعة",
};

router.get("/auth/my-accounts", authenticate, async (req, res): Promise<void> => {
  const [currentUser] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!));
  if (!currentUser) { res.status(404).json({ error: "Not found" }); return; }

  const all = await db.select().from(usersTable).where(eq(usersTable.email, currentUser.email));
  const active = all.filter(u => !u.isArchived);

  // جلب أسماء الحلقات دفعة واحدة
  const circleIds = [...new Set(active.map(u => u.circleId).filter(Boolean))] as number[];
  const circleRows = circleIds.length > 0
    ? await db.select({ id: circlesTable.id, name: circlesTable.name }).from(circlesTable)
    : [];
  const circleMap = new Map(circleRows.map(c => [c.id, c.name]));

  res.json(active.map(u => ({
    id: u.id,
    name: u.name,
    role: u.role,
    roleLabel: ROLE_LABELS[u.role] ?? u.role,
    track: u.track ?? null,
    circleId: u.circleId ?? null,
    circleName: u.circleId ? (circleMap.get(u.circleId) ?? null) : null,
    isCurrent: u.id === req.userId,
  })));
});

router.post("/auth/switch-account", authenticate, async (req, res): Promise<void> => {
  const { targetUserId } = req.body as { targetUserId: number };
  const [currentUser] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!));
  const [targetUser] = await db.select().from(usersTable).where(eq(usersTable.id, targetUserId));

  if (!currentUser || !targetUser) { res.status(404).json({ error: "المستخدم غير موجود" }); return; }
  if (targetUser.email.toLowerCase() !== currentUser.email.toLowerCase()) {
    res.status(403).json({ error: "غير مسموح" }); return;
  }
  if (targetUser.isArchived) { res.status(403).json({ error: "الحساب موقوف" }); return; }

  const token = generateToken(targetUser.id, targetUser.role);
  const { passwordHash: _ph, ...safeUser } = targetUser;
  res.json({ user: safeUser, token });
});

// NOTE: staff registrations are approved automatically by design (no manual
// review step) — that is an intentional product decision, not a bug, and is
// left unchanged here. Rate limiting is added purely to slow down automated
// signup spam/abuse; it does not add an approval requirement.
router.post("/auth/staff-register", staffRegisterRateLimit, async (req, res): Promise<void> => {
  const { name, phone, email, password, role } = req.body ?? {};
  if (!name || typeof name !== "string" || name.trim().length < 2) {
    res.status(400).json({ error: "الاسم مطلوب" });
    return;
  }
  if (!phone || typeof phone !== "string" || phone.trim().length < 7) {
    res.status(400).json({ error: "رقم الجوال مطلوب" });
    return;
  }
  if (!email || typeof email !== "string" || !email.includes("@")) {
    res.status(400).json({ error: "البريد الإلكتروني غير صحيح" });
    return;
  }
  if (!password || typeof password !== "string" || password.length < 6) {
    res.status(400).json({ error: "كلمة المرور قصيرة جدًا" });
    return;
  }
  const targetRole = role ?? "data_entry";

  const allowedRolesForStaff = ["teacher", "supervisor", "track_supervisor", "data_entry"];
  if (!allowedRolesForStaff.includes(targetRole)) {
    res.status(400).json({ error: "دور غير صالح" });
    return;
  }

  const [settings] = await db.select().from(registrationSettingsTable);
  const allowedRolesJson = (settings as any)?.allowedStaffRoles;
  if (allowedRolesJson) {
    try {
      const allowed = JSON.parse(allowedRolesJson) as string[];
      if (!allowed.includes(targetRole)) {
        res.status(403).json({ error: "هذا الدور غير مسموح به في التسجيل الحالي" });
        return;
      }
    } catch { /* ignore */ }
  }

  const passwordHash = hashPassword(password);
  const { country, track, circleId, extraData } = req.body ?? {};
  const parsedCircleId = circleId ? parseInt(circleId) : null;
  const [user] = await db.insert(usersTable).values({
    name,
    phone,
    country: country ?? null,
    email: email.toLowerCase().trim(),
    passwordHash,
    role: targetRole,
    track: track ?? null,
    circleId: parsedCircleId,
    isArchived: false,
    registrationStatus: "approved",
    extraData: extraData ? JSON.stringify(extraData) : null,
  }).returning();
  const { passwordHash: _ph, ...safeUser } = user;

  // ربط المعلمة/المشرفة بالحلقة تلقائياً عند التسجيل
  if (parsedCircleId) {
    if (targetRole === "teacher") {
      await db.update(circlesTable).set({ teacherId: user.id }).where(eq(circlesTable.id, parsedCircleId));
    } else if (targetRole === "supervisor") {
      await db.update(circlesTable).set({ supervisorId: user.id }).where(eq(circlesTable.id, parsedCircleId));
    }
  }

  // Get circle name for Google Sheets
  const circleName = parsedCircleId
    ? (await db.select({ name: circlesTable.name }).from(circlesTable).where(eq(circlesTable.id, parsedCircleId)))[0]?.name
    : undefined;

  // Append to Google Sheets (non-blocking)
  appendVolunteerToSheet({
    fullName: name,
    email: email.toLowerCase(),
    role: targetRole,
    phone: phone ?? null,
    country: country ?? null,
    track: track ?? null,
    circleName: circleName ?? null,
  }).catch(() => {});

  res.status(201).json(safeUser);
});

router.post("/auth/forgot-password", forgotPasswordRateLimit, async (req, res): Promise<void> => {
  const { email } = req.body as { email?: string };
  if (!email || !email.includes("@")) {
    res.status(400).json({ error: "البريد الإلكتروني غير صحيح" }); return;
  }

  // Always respond the same way whether or not the email is registered, so
  // this endpoint can't be used to enumerate valid accounts. The email is
  // only actually sent when a matching, non-archived account exists.
  const genericResponse = { success: true, message: "إذا كان هذا البريد مسجلاً لدينا، سيصلك رابط إعادة تعيين كلمة المرور خلال دقائق" };

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase()));

  if (!user || user.isArchived) {
    res.json(genericResponse);
    return;
  }

  const token = randomBytes(32).toString("hex");
  const expiry = new Date(Date.now() + 60 * 60 * 1000);

  await db.update(usersTable)
    .set({ passwordResetToken: token, passwordResetTokenExpiry: expiry })
    .where(eq(usersTable.id, user.id));

  const appUrl = process.env.APP_URL ?? `https://${req.get("host")}`;
  const resetUrl = `${appUrl}/reset-password?token=${token}`;

  try {
    await sendPasswordResetEmail(email.toLowerCase(), resetUrl);
  } catch {
    // Deliberately still return the generic success response — surfacing a
    // send failure here would itself confirm the email exists.
  }

  res.json(genericResponse);
});

router.post("/auth/reset-password", resetPasswordRateLimit, async (req, res): Promise<void> => {
  const { token, password } = req.body as { token?: string; password?: string };
  if (!token || !password) {
    res.status(400).json({ error: "بيانات ناقصة" }); return;
  }
  if (password.length < 6) {
    res.status(400).json({ error: "كلمة المرور قصيرة جدًا (٦ أحرف على الأقل)" }); return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.passwordResetToken, token));

  if (!user) {
    res.status(400).json({ error: "رابط إعادة التعيين غير صحيح أو انتهت صلاحيته" }); return;
  }

  if (!user.passwordResetTokenExpiry || user.passwordResetTokenExpiry < new Date()) {
    res.status(400).json({ error: "انتهت صلاحية الرابط — اطلبي رابطًا جديدًا" }); return;
  }

  await db.update(usersTable)
    .set({
      passwordHash: hashPassword(password),
      passwordResetToken: null,
      passwordResetTokenExpiry: null,
    })
    .where(eq(usersTable.id, user.id));

  res.json({ success: true });
});

router.post("/auth/logout", (_req, res): void => {
  res.json({ success: true });
});

router.get("/auth/me", authenticate, async (req, res): Promise<void> => {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!));
  if (!user) {
    res.status(401).json({ error: "Not found" });
    return;
  }
  const { passwordHash: _ph, ...safeUser } = user;

  // استخدام studentId المحسوب مسبقًا في middleware (authenticate) لتجنب التكرار
  const studentId: number | null = user.role === "student" ? (req.userStudentId ?? null) : null;
  let studentCircles: any[] = [];
  if (studentId) {
    const rows = await db.select({
      id: circlesTable.id, name: circlesTable.name, track: circlesTable.track,
      trackType: circlesTable.trackType, trackId: circlesTable.trackId,
      dataEntryType: tracksTable.dataEntryType,
    }).from(studentEnrollmentsTable)
      .innerJoin(circlesTable, eq(circlesTable.id, studentEnrollmentsTable.circleId))
      .leftJoin(tracksTable, eq(tracksTable.id, circlesTable.trackId))
      .where(and(eq(studentEnrollmentsTable.studentId, studentId), eq(studentEnrollmentsTable.isArchived, false), eq(circlesTable.isArchived, false)));
    const staff = rows.length ? await db.select({ name: usersTable.name, role: usersTable.role, circleId: usersTable.circleId })
      .from(usersTable).where(and(inArray(usersTable.circleId, rows.map(c => c.id)), or(eq(usersTable.role, "teacher"), eq(usersTable.role, "supervisor")))) : [];
    studentCircles = rows.map(c => ({
      ...c,
      teacherName: staff.find(s => s.circleId === c.id && s.role === "teacher")?.name ?? null,
      supervisorName: staff.find(s => s.circleId === c.id && s.role === "supervisor")?.name ?? null,
      dataEntryType: c.dataEntryType ?? (c.track === "مشكاة نور" ? "recitation" : c.track === "سُنى" ? "fixation" : ["girls", "children", "mothers"].includes(c.trackType ?? "") ? c.trackType : "girls"),
    }));
  }

  let circleDataEntryType: string | null = null;
  let circleTrackType: string | null = null;
  if (user.circleId) {
    const [circle] = await db
      .select({ trackId: circlesTable.trackId, trackType: circlesTable.trackType })
      .from(circlesTable)
      .where(eq(circlesTable.id, user.circleId))
      .limit(1);
    circleTrackType = circle?.trackType ?? null;
    if (circle?.trackId) {
      const [track] = await db
        .select({ dataEntryType: tracksTable.dataEntryType })
        .from(tracksTable)
        .where(eq(tracksTable.id, circle.trackId))
        .limit(1);
      circleDataEntryType = track?.dataEntryType ?? null;
    }
  }

  const currentStaff = user.circleId
    ? await db.select({ name: usersTable.name, role: usersTable.role }).from(usersTable)
      .where(and(eq(usersTable.circleId, user.circleId), or(eq(usersTable.role, "teacher"), eq(usersTable.role, "supervisor"))))
    : [];
  res.json({
    ...safeUser, studentId, circleDataEntryType, circleTrackType, circles: studentCircles,
    circleTeacherName: currentStaff.find(s => s.role === "teacher")?.name ?? null,
    circleSupervisorName: currentStaff.find(s => s.role === "supervisor")?.name ?? null,
  });
});

export default router;
