import { Router, type IRouter } from "express";
import { db, registrationSettingsTable, usersTable, studentsTable, circlesTable, studentEnrollmentsTable } from "@workspace/db";
import { eq, sql, desc, gt } from "drizzle-orm";
import { authenticate, requireRole } from "../middlewares/authenticate";
import { hashPassword, generateToken } from "../lib/auth";
import { rateLimit } from "../middlewares/rateLimit";
import { OpenRegistrationBody, SubmitRegistrationBody } from "@workspace/api-zod";
import { appendStudentToSheet } from "../lib/sheets";
import { sendEmailOTP } from "../lib/email";


const router: IRouter = Router();

const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com","guerrillamail.com","10minutemail.com","throwam.com","yopmail.com",
  "trashmail.com","temp-mail.org","fakeinbox.com","sharklasers.com","guerrillamail.info",
  "guerrillamail.biz","guerrillamail.de","guerrillamail.net","guerrillamail.org",
  "spam4.me","tempr.email","discard.email","maildrop.cc","mailnull.com",
  "spamgourmet.com","trashmail.at","trashmail.io","trashmail.me","trashmail.net",
  "trashmail.xyz","dispostable.com","mailnesia.com","getairmail.com","mytemp.email",
  "tempmail.com","tempmail.net","tempmailaddress.com","throwaway.email","spamfree24.org",
  "getnada.com","inalid.com","tmail.com","mailsac.com","mailnull.com","throwam.com",
]);

// `attempts` = number of times a code was *sent* for this email (resend limit).
// `verifyAttempts` = number of *wrong-guess* verification attempts against
// the currently active code — previously unlimited, which let anyone brute
// force the 6-digit OTP (1,000,000 possibilities) well within its 10-minute
// lifetime since there was no cap at all.
const otpStore = new Map<string, { otp: string; expiresAt: number; attempts: number; verifyAttempts: number }>();
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of otpStore) { if (v.expiresAt < now) otpStore.delete(k); }
}, 5 * 60 * 1000);

const MAX_OTP_VERIFY_ATTEMPTS = 6;

const sendOtpRateLimit = rateLimit({ windowMs: 10 * 60 * 1000, max: 8, keyPrefix: "send-otp", byEmail: true });
const verifyOtpRateLimit = rateLimit({ windowMs: 10 * 60 * 1000, max: 20, keyPrefix: "verify-otp" });

router.post("/registration/send-email-otp", sendOtpRateLimit, async (req, res): Promise<void> => {
  const { email } = req.body as { email?: string };
  if (!email || !email.includes("@") || !email.includes(".")) {
    res.status(400).json({ error: "بريد إلكتروني غير صحيح" }); return;
  }
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  if (DISPOSABLE_DOMAINS.has(domain)) {
    res.status(400).json({ error: "البريد المؤقت غير مقبول — استخدمي بريدًا حقيقيًا" }); return;
  }
  const key = email.toLowerCase();
  const existing = otpStore.get(key);
  if (existing && existing.expiresAt > Date.now() && existing.attempts >= 5) {
    res.status(429).json({ error: "تم إرسال الرمز كثيرًا، انتظري قليلاً ثم أعيدي المحاولة" }); return;
  }
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  otpStore.set(key, { otp, expiresAt: Date.now() + 10 * 60 * 1000, attempts: (existing?.attempts ?? 0) + 1, verifyAttempts: 0 });
  try {
    await sendEmailOTP(email, otp);
    res.json({ success: true });
  } catch {
    if (process.env.NODE_ENV !== "production") {
      res.json({ success: true, devOtp: otp });
    } else {
      res.status(500).json({ error: "فشل إرسال البريد — تأكد من ضبط EMAIL_USER و EMAIL_PASS" });
    }
  }
});

router.post("/registration/verify-email-otp", verifyOtpRateLimit, async (req, res): Promise<void> => {
  const { email, otp } = req.body as { email?: string; otp?: string };
  if (!email || !otp) { res.status(400).json({ error: "بيانات غير مكتملة" }); return; }
  const key = email.toLowerCase();
  const stored = otpStore.get(key);
  if (!stored) { res.status(400).json({ error: "لم يتم إرسال رمز لهذا البريد أو انتهت صلاحيته" }); return; }
  if (stored.expiresAt < Date.now()) {
    otpStore.delete(key);
    res.status(400).json({ error: "انتهت صلاحية الرمز — اطلبي رمزًا جديدًا" }); return;
  }
  if (stored.verifyAttempts >= MAX_OTP_VERIFY_ATTEMPTS) {
    otpStore.delete(key);
    res.status(429).json({ error: "عدد كبير جدًا من المحاولات الخاطئة — اطلبي رمزًا جديدًا" }); return;
  }
  if (stored.otp !== otp.trim()) {
    stored.verifyAttempts += 1;
    res.status(400).json({ error: "رمز التحقق غير صحيح" }); return;
  }
  otpStore.delete(key);
  res.json({ success: true });
});

async function getSettings() {
  try {
    const [settings] = await db.select().from(registrationSettingsTable);
    return settings ?? {
      isOpen: false,
      staffRegistrationOpen: true,
      existingStudentRegOpen: false,
      autoApproveStudents: false,
      deadline: null,
      customQuestions: null,
      staffCustomQuestions: null,
    };
  } catch {
    return {
      isOpen: false,
      staffRegistrationOpen: false,
      existingStudentRegOpen: false,
      autoApproveStudents: false,
      deadline: null,
      customQuestions: null,
      staffCustomQuestions: null,
    };
  }
}

async function upsertSettings(values: Record<string, unknown>) {
  const existing = await db.select().from(registrationSettingsTable);
  if (existing.length === 0) {
    await db.insert(registrationSettingsTable).values(values as any);
  } else {
    await db.update(registrationSettingsTable).set(values as any);
  }
}

router.get("/registration/status", async (_req, res): Promise<void> => {
  const settings = await getSettings();
  const now = new Date();
  const startDate = (settings as any).startDate ?? null;
  const deadline = settings.deadline ?? null;
  const effectivelyOpen = settings.isOpen
    && (!startDate || now >= new Date(startDate))
    && (!deadline || now <= new Date(deadline));

  if (settings.isOpen && deadline && now > new Date(deadline)) {
    await upsertSettings({ isOpen: false });
  }

  const allowedStaffRolesRaw = (settings as any).allowedStaffRoles ?? null;
  let allowedStaffRoles: string[] | null = null;
  if (allowedStaffRolesRaw) {
    try { allowedStaffRoles = JSON.parse(allowedStaffRolesRaw); } catch { /* ignore */ }
  }
  res.json({
    isOpen: effectivelyOpen,
    rawIsOpen: settings.isOpen,
    staffRegistrationOpen: settings.staffRegistrationOpen,
    existingStudentRegOpen: settings.existingStudentRegOpen,
    autoApproveStudents: (settings as any).autoApproveStudents ?? false,
    startDate,
    deadline,
    customQuestions: settings.customQuestions,
    staffCustomQuestions: (settings as any).staffCustomQuestions ?? null,
    allowedStaffRoles,
    wizardConfig: (settings as any).wizardConfig ?? null,
  });
});

router.post("/registration/open", authenticate, requireRole("leader"), async (req, res): Promise<void> => {
  const parsed = OpenRegistrationBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const startDate = typeof (req.body as any).startDate === "string" ? (req.body as any).startDate : null;
  await upsertSettings({ isOpen: true, startDate, ...parsed.data });
  res.json({ success: true });
});

router.post("/registration/close", authenticate, requireRole("leader"), async (_req, res): Promise<void> => {
  await upsertSettings({ isOpen: false });
  res.json({ success: true });
});

router.post("/registration/staff-open", authenticate, requireRole("leader"), async (req, res): Promise<void> => {
  const { allowedRoles } = (req.body ?? {}) as { allowedRoles?: string[] };
  const update: Record<string, unknown> = { staffRegistrationOpen: true };
  if (Array.isArray(allowedRoles) && allowedRoles.length > 0) {
    update.allowedStaffRoles = JSON.stringify(allowedRoles);
  } else {
    update.allowedStaffRoles = null;
  }
  await upsertSettings(update);
  res.json({ success: true });
});

router.post("/registration/staff-close", authenticate, requireRole("leader"), async (_req, res): Promise<void> => {
  await upsertSettings({ staffRegistrationOpen: false });
  res.json({ success: true });
});

router.post("/registration/existing-open", authenticate, requireRole("leader"), async (_req, res): Promise<void> => {
  await upsertSettings({ existingStudentRegOpen: true });
  res.json({ success: true });
});

router.post("/registration/existing-close", authenticate, requireRole("leader"), async (_req, res): Promise<void> => {
  await upsertSettings({ existingStudentRegOpen: false });
  res.json({ success: true });
});

router.post("/registration/auto-approve-on", authenticate, requireRole("leader"), async (_req, res): Promise<void> => {
  await upsertSettings({ autoApproveStudents: true });
  res.json({ success: true });
});

router.post("/registration/auto-approve-off", authenticate, requireRole("leader"), async (_req, res): Promise<void> => {
  await upsertSettings({ autoApproveStudents: false });
  res.json({ success: true });
});

// Public endpoint — all active circles (for existing-student form, no capacity filter)
router.get("/registration/circles-public", async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      id: circlesTable.id,
      name: circlesTable.name,
      track: circlesTable.track,
      teacherId: circlesTable.teacherId,
      supervisorId: circlesTable.supervisorId,
    })
    .from(circlesTable)
    .where(eq(circlesTable.isArchived, false));
  res.json(rows);
});

// Public endpoint — circles with available capacity for NEW students
router.get("/registration/circles-new-students", async (_req, res): Promise<void> => {
  const circles = await db
    .select({
      id: circlesTable.id,
      name: circlesTable.name,
      track: circlesTable.track,
      meetingTime: circlesTable.meetingTime,
      newStudentCapacity: circlesTable.newStudentCapacity,
    })
    .from(circlesTable)
    .where(eq(circlesTable.isArchived, false));

  const counts = await db
    .select({
      circleId: studentsTable.circleId,
      count: sql<number>`cast(count(*) as int)`,
    })
    .from(studentsTable)
    .groupBy(studentsTable.circleId);

  const countMap = new Map(counts.map(r => [r.circleId, r.count]));

  const available = circles.filter(c => {
    if (c.newStudentCapacity == null) return true;
    const registered = countMap.get(c.id) ?? 0;
    return registered < c.newStudentCapacity;
  });

  const result = available.map(c => ({
    id: c.id,
    name: c.name,
    track: c.track,
    meetingTime: c.meetingTime,
    newStudentCapacity: c.newStudentCapacity,
    registeredCount: countMap.get(c.id) ?? 0,
    spotsLeft: c.newStudentCapacity != null
      ? c.newStudentCapacity - (countMap.get(c.id) ?? 0)
      : null,
  }));

  res.json(result);
});

router.post("/registration/save-questions", authenticate, requireRole("leader"), async (req, res): Promise<void> => {
  const { formType, questions } = req.body as { formType?: string; questions?: unknown[] };
  if (!Array.isArray(questions)) {
    res.status(400).json({ error: "questions must be an array" });
    return;
  }
  if (formType === "staff") {
    await upsertSettings({ staffCustomQuestions: JSON.stringify(questions) });
  } else {
    await upsertSettings({ customQuestions: JSON.stringify(questions) });
  }
  res.json({ success: true });
});

router.get("/registration/activate", async (_req, res): Promise<void> => {
  res.json({ success: true, message: "التفعيل التلقائي مُفعَّل — لا حاجة لرمز تفعيل" });
});

// ── Wizard Config — Public (processed: circles filtered by capacity) ─────────
router.get("/registration/wizard-config", async (_req, res): Promise<void> => {
  const settings = await getSettings();
  let rawConfig: any = { tracks: [], questions: [], registrationCircles: [] };
  try {
    if ((settings as any).wizardConfig) rawConfig = JSON.parse((settings as any).wizardConfig);
  } catch {}

  // Count preferred circles from students' extraData (JavaScript-side parsing)
  const allStudents = await db.select({ extraData: studentsTable.extraData })
    .from(studentsTable)
    .where(eq(studentsTable.isArchived, false));

  const prefCountMap = new Map<number, number>();
  for (const { extraData } of allStudents) {
    if (!extraData) continue;
    try {
      const parsed = JSON.parse(extraData);
      const prefId = parsed.__preferredCircleId;
      if (prefId) prefCountMap.set(Number(prefId), (prefCountMap.get(Number(prefId)) ?? 0) + 1);
    } catch {}
  }

  const circleIds: number[] = (rawConfig.registrationCircles ?? []).map((rc: any) => rc.circleId).filter(Boolean);
  const circleMap = new Map<number, { id: number; name: string; meetingTime: string | null }>();
  if (circleIds.length > 0) {
    const circles = await db.select({ id: circlesTable.id, name: circlesTable.name, meetingTime: circlesTable.meetingTime })
      .from(circlesTable).where(eq(circlesTable.isArchived, false));
    for (const c of circles) circleMap.set(c.id, c);
  }

  const registrationCircles = (rawConfig.registrationCircles ?? [])
    .map((rc: any) => {
      const circle = circleMap.get(rc.circleId);
      if (!circle) return null;
      const capacity: number | null = rc.capacity ?? null;
      const prefCount = prefCountMap.get(rc.circleId) ?? 0;
      const spotsLeft = capacity != null ? capacity - prefCount : null;
      if (spotsLeft !== null && spotsLeft <= 0) return null;
      return { circleId: circle.id, name: circle.name, meetingTime: circle.meetingTime, capacity, spotsLeft };
    })
    .filter(Boolean);

  res.json({ tracks: rawConfig.tracks ?? [], questions: rawConfig.questions ?? [], registrationCircles });
});

// ── Admin: Get raw wizard config + all circles (for admin UI) ───────────────
router.get("/registration/admin/wizard-config", authenticate, requireRole("leader"), async (_req, res): Promise<void> => {
  const settings = await getSettings();
  let rawConfig: any = { tracks: [], questions: [], registrationCircles: [] };
  try {
    if ((settings as any).wizardConfig) rawConfig = JSON.parse((settings as any).wizardConfig);
  } catch {}

  const allCircles = await db.select({ id: circlesTable.id, name: circlesTable.name, track: circlesTable.track, meetingTime: circlesTable.meetingTime })
    .from(circlesTable).where(eq(circlesTable.isArchived, false));

  res.json({ ...rawConfig, allCircles });
});

// ── Admin: Save wizard config (leader only) ──────────────────────────────────
router.put("/registration/admin/wizard-config", authenticate, requireRole("leader"), async (req, res): Promise<void> => {
  const { tracks, questions, registrationCircles } = req.body as any;
  await upsertSettings({
    wizardConfig: JSON.stringify({ tracks: tracks ?? [], questions: questions ?? [], registrationCircles: registrationCircles ?? [] }),
  });
  res.json({ success: true });
});

router.post("/registration/submit", async (req, res): Promise<void> => {
  const settings = await getSettings();
  if (!settings.isOpen) {
    res.status(400).json({ error: "التسجيل مغلق حاليًا" });
    return;
  }

  const parsed = SubmitRegistrationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { email: rawEmail, password, fullName, phone, country, ageRange, educationLevel, memorizeFrom, track, circleId, role } = parsed.data;
  const email = rawEmail.toLowerCase().trim();
  const extraData = (req.body as any).extraData ?? null;
  const isNewcomer = (req.body as any).isNewcomer === true;

  // منع التسجيل المتكرر بنفس البريد خلال أقل من 5 دقائق (يمنع الإرسال بالغلط)
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
  const [recentReg] = await db
    .select({ createdAt: usersTable.createdAt })
    .from(usersTable)
    .where(eq(usersTable.email, email.toLowerCase()))
    .orderBy(desc(usersTable.createdAt))
    .limit(1);
  if (recentReg && recentReg.createdAt > fiveMinutesAgo) {
    const secondsLeft = Math.ceil((recentReg.createdAt.getTime() + 5 * 60 * 1000 - Date.now()) / 1000);
    const minutesLeft = Math.ceil(secondsLeft / 60);
    res.status(429).json({
      error: `يبدو أنكِ سجّلتِ للتو — يرجى الانتظار ${minutesLeft} ${minutesLeft === 1 ? "دقيقة" : "دقائق"} قبل التسجيل مجدداً`,
    });
    return;
  }

  const [newUser] = await db.insert(usersTable).values({
    email: email.toLowerCase(),
    name: fullName,
    passwordHash: hashPassword(password),
    role: role ?? "student",
    track: track ?? null,
    circleId: circleId ?? null,
    phone: phone ?? null,
    country: country ?? null,
    ageRange: ageRange ?? null,
    educationLevel: educationLevel ?? null,
    registrationStatus: "approved",
    emailVerificationToken: null,
  }).returning();

  // ربط المعلمة/المشرفة بالحلقة تلقائياً عند التسجيل
  if (newUser && circleId) {
    if (role === "teacher") {
      await db.update(circlesTable).set({ teacherId: newUser.id }).where(eq(circlesTable.id, circleId));
    } else if (role === "supervisor") {
      await db.update(circlesTable).set({ supervisorId: newUser.id }).where(eq(circlesTable.id, circleId));
    }
  }

  if (!role || role === "student") {
    let targetCircleId = circleId;
    if (!targetCircleId) {
      const [regCircle] = await db.select().from(circlesTable).where(eq(circlesTable.trackType, "registration"));
      targetCircleId = regCircle?.id;
    }

    const mergedExtra = extraData ? { ...extraData } : {};
    if (isNewcomer) mergedExtra.__isNewcomer = true;
    mergedExtra.__email = email;

    const [newStudent] = await db.insert(studentsTable).values({
      fullName,
      circleId: targetCircleId ?? null,
      phone: phone ?? null,
      country: country ?? null,
      ageRange: ageRange ?? null,
      educationLevel: educationLevel ?? null,
      memorizeFrom: memorizeFrom ?? null,
      extraData: Object.keys(mergedExtra).length > 0 ? JSON.stringify(mergedExtra) : null,
      isNewcomer,
    }).returning();

    if (newStudent && targetCircleId) {
      await db.insert(studentEnrollmentsTable)
        .values({ studentId: newStudent.id, circleId: targetCircleId, isArchived: false })
        .onConflictDoNothing();
    }

    // ربط الحساب بسجل الطالبة مباشرةً
    if (newStudent) {
      await db.update(usersTable).set({ studentId: newStudent.id }).where(eq(usersTable.id, newUser.id));
    }

    const circleName = targetCircleId
      ? (await db.select({ name: circlesTable.name }).from(circlesTable).where(eq(circlesTable.id, targetCircleId)))[0]?.name
      : undefined;

    appendStudentToSheet({
      fullName,
      email: email.toLowerCase(),
      phone: phone ?? null,
      country: country ?? null,
      ageRange: ageRange ?? null,
      educationLevel: educationLevel ?? null,
      track: track ?? null,
      circleName: circleName ?? null,
      memorizeFrom: memorizeFrom ?? null,
    }).catch(() => {});
  }

  const token = newUser ? generateToken(newUser.id, newUser.role) : null;
  res.status(201).json({ success: true, autoApproved: true, emailSent: false, token });
});

export default router;
