import { Router, type IRouter } from "express";
import { toSafeUser } from "../lib/safeUser";
import { db, circlesTable, usersTable, studentsTable, tracksTable, dataEntryCircleAssignmentsTable, studentEnrollmentsTable } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { authenticate } from "../middlewares/authenticate";
import { CreateCircleBody, UpdateCircleBody } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/circles", authenticate, async (req, res): Promise<void> => {
  const trackFilter = req.query.track as string | undefined;
  const isArchivedFilter = req.query.isArchived;

  const allCircles = await db.select().from(circlesTable);
  const allTracks = await db.select().from(tracksTable);
  const trackMap: Record<number, string> = {};
  allTracks.forEach(t => { trackMap[t.id] = t.dataEntryType; });

  let circles = allCircles.map(c => ({
    ...c,
    dataEntryType: c.trackId != null ? (trackMap[c.trackId] ?? "girls") : "girls",
  }));

  if (trackFilter) {
    circles = circles.filter(c => c.track === trackFilter);
  }
  if (isArchivedFilter !== undefined) {
    const archived = isArchivedFilter === "true";
    circles = circles.filter(c => c.isArchived === archived);
  }

  // Track supervisors: only their track's circles
  if (req.userRole === "track_supervisor") {
    circles = circles.filter(c => c.track === req.userTrack);
  }

  // Data entry: لا ترى إلا الحلقات المُسندة لها.
  if (req.userRole === "data_entry") {
    const assignments = await db.select().from(dataEntryCircleAssignmentsTable)
      .where(eq(dataEntryCircleAssignmentsTable.dataEntryUserId, req.userId!));
    const assignedIds = new Set(assignments.map(a => a.circleId));
    circles = circles.filter(c => assignedIds.has(c.id));
  }

  // Teachers/supervisors/students can only see their circle
  if (req.userRole === "teacher" || req.userRole === "supervisor" || req.userRole === "student") {
    const ownedCircleIds = allCircles
      .filter(c => req.userRole === "teacher" ? c.teacherId === req.userId : c.supervisorId === req.userId)
      .map(c => c.id);
    const allowedIds = new Set([...(req.userCircleId != null ? [req.userCircleId] : []), ...ownedCircleIds]);
    circles = circles.filter(c => allowedIds.has(c.id));
  }

  res.json(circles);
});

router.post("/circles", authenticate, async (req, res): Promise<void> => {
  if (req.userRole !== "leader") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const parsed = CreateCircleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [circle] = await db.insert(circlesTable).values(parsed.data).returning();
  res.status(201).json(circle);
});

// Enriched circles — leader/track_supervisor: includes teacher name, supervisor name, student list
router.get("/circles/enriched", authenticate, async (req, res): Promise<void> => {
  if (req.userRole !== "leader" && req.userRole !== "track_supervisor" && req.userRole !== "deputy") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  let circles = await db.select().from(circlesTable).where(eq(circlesTable.isArchived, false));
  if (req.userRole === "track_supervisor") {
    circles = circles.filter(c => c.track === req.userTrack);
  }

  const allUsers = await db.select({
    id: usersTable.id, name: usersTable.name, phone: usersTable.phone,
    email: usersTable.email, role: usersTable.role, circleId: usersTable.circleId,
    isArchived: usersTable.isArchived,
  }).from(usersTable);
  const userMap: Record<number, { name: string; phone: string | null }> = {};
  allUsers.forEach(u => { userMap[u.id] = { name: u.name, phone: u.phone }; });
  const volunteersByCircle: Record<number, { id: number; name: string; phone: string | null }[]> = {};
  for (const user of allUsers) {
    if (user.role === "volunteer" && user.circleId != null && !user.isArchived) {
      if (!volunteersByCircle[user.circleId]) volunteersByCircle[user.circleId] = [];
      volunteersByCircle[user.circleId].push({ id: user.id, name: user.name, phone: user.phone });
    }
  }
  Object.values(volunteersByCircle).forEach(volunteers =>
    volunteers.sort((a, b) => a.name.localeCompare(b.name, "ar", { sensitivity: "base" })),
  );

  // بناء خريطة إيميل الطالبات: مفتاح = الاسم الكامل + circleId
  const studentEmailMap: Record<string, string> = {};
  for (const u of allUsers) {
    if (u.role === "student") {
      const key = `${u.name}__${u.circleId ?? ""}`;
      studentEmailMap[key] = u.email;
    }
  }

  const allEnrollments = await db.select({
    studentId: studentEnrollmentsTable.studentId,
    circleId: studentEnrollmentsTable.circleId,
    fullName: studentsTable.fullName,
    phone: studentsTable.phone,
  })
    .from(studentEnrollmentsTable)
    .innerJoin(studentsTable, eq(studentsTable.id, studentEnrollmentsTable.studentId))
    .where(and(eq(studentEnrollmentsTable.isArchived, false), eq(studentsTable.isArchived, false)));
  const studentsByCircle: Record<number, { id: number; fullName: string; email: string | null }[]> = {};
  for (const e of allEnrollments) {
    if (!studentsByCircle[e.circleId]) studentsByCircle[e.circleId] = [];
    const key = `${e.fullName}__${e.circleId}`;
    const email = studentEmailMap[key] ?? null;
    studentsByCircle[e.circleId].push({ id: e.studentId, fullName: e.fullName, email });
  }
  Object.keys(studentsByCircle).forEach(circleId => {
    studentsByCircle[Number(circleId)].sort((a, b) =>
      a.fullName.localeCompare(b.fullName, "ar", { sensitivity: "base" }),
    );
  });

  const enriched = circles.map(c => ({
    ...c,
    teacherName: c.teacherId ? (userMap[c.teacherId]?.name ?? null) : null,
    teacherPhone: c.teacherId ? (userMap[c.teacherId]?.phone ?? null) : null,
    supervisorName: c.supervisorId ? (userMap[c.supervisorId]?.name ?? null) : null,
    supervisorPhone: c.supervisorId ? (userMap[c.supervisorId]?.phone ?? null) : null,
    students: studentsByCircle[c.id] ?? [],
    volunteers: volunteersByCircle[c.id] ?? [],
  }));

  res.json(enriched);
});

// Returns minimal circle info (id, name, track) for ALL circles regardless of role — used for transfer selections
router.get("/circles/names", authenticate, async (req, res): Promise<void> => {
  const circles = await db.select({
    id: circlesTable.id,
    name: circlesTable.name,
    track: circlesTable.track,
  }).from(circlesTable).where(eq(circlesTable.isArchived, false));
  // ملاحظة: تُترك بلا فلترة حسب المسار عمدًا — هذا الـ endpoint مخصص لقوائم
  // النقل (اختيار الحلقة الهدف)، ومسؤولة المسار مسموح لها تنقل طالباتها/كادرها
  // إلى أي حلقة بالمقرأة، مو بس حلقات مسارها.
  res.json(circles);
});

router.get("/circles/:id", authenticate, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);

  const [circle] = await db.select().from(circlesTable).where(eq(circlesTable.id, id));
  if (!circle) {
    res.status(404).json({ error: "Circle not found" });
    return;
  }

  // Permission check
  if (req.userRole === "teacher" || req.userRole === "supervisor") {
    if (req.userCircleId !== id) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
  }
  if (req.userRole === "track_supervisor" || req.userRole === "data_entry") {
    if (circle.track !== req.userTrack) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
  }

  let teacher = null, supervisor = null;
  if (circle.teacherId) {
    const [t] = await db.select().from(usersTable).where(eq(usersTable.id, circle.teacherId));
    if (t) {
      const safe = toSafeUser(t);
      teacher = safe;
    }
  }
  if (circle.supervisorId) {
    const [s] = await db.select().from(usersTable).where(eq(usersTable.id, circle.supervisorId));
    if (s) {
      const safe = toSafeUser(s);
      supervisor = safe;
    }
  }

  // طالبات عبر سجل التسجيل (المصدر الأساسي)
  const studentsViaEnrollment = await db
    .select({
      id: studentsTable.id,
      fullName: studentsTable.fullName,
      phone: studentsTable.phone,
      country: studentsTable.country,
      ageRange: studentsTable.ageRange,
      educationLevel: studentsTable.educationLevel,
      memorizeFrom: studentsTable.memorizeFrom,
      extraData: studentsTable.extraData,
      isArchived: studentsTable.isArchived,
      isNewcomer: studentsTable.isNewcomer,
      archivedAt: studentsTable.archivedAt,
      circleId: studentEnrollmentsTable.circleId,
      leaveStart: studentEnrollmentsTable.leaveStart,
      leaveEnd: studentEnrollmentsTable.leaveEnd,
      createdAt: studentsTable.createdAt,
      updatedAt: studentsTable.updatedAt,
    })
    .from(studentsTable)
    .innerJoin(
      studentEnrollmentsTable,
      and(
        eq(studentEnrollmentsTable.studentId, studentsTable.id),
        eq(studentEnrollmentsTable.circleId, id),
        eq(studentEnrollmentsTable.isArchived, false),
      ),
    )
    .where(eq(studentsTable.isArchived, false));

  const enrolledIds = new Set(studentsViaEnrollment.map(s => s.id));

  // طالبات لهن circleId مباشرة لكن بدون سجل تسجيل (بيانات قديمة)
  const studentsViaDirect = await db
    .select({
      id: studentsTable.id,
      fullName: studentsTable.fullName,
      phone: studentsTable.phone,
      country: studentsTable.country,
      ageRange: studentsTable.ageRange,
      educationLevel: studentsTable.educationLevel,
      memorizeFrom: studentsTable.memorizeFrom,
      extraData: studentsTable.extraData,
      isArchived: studentsTable.isArchived,
      isNewcomer: studentsTable.isNewcomer,
      archivedAt: studentsTable.archivedAt,
      createdAt: studentsTable.createdAt,
      updatedAt: studentsTable.updatedAt,
    })
    .from(studentsTable)
    .where(and(eq(studentsTable.isArchived, false), eq(studentsTable.circleId, id)));

  // دمج النتيجتين مع منع التكرار
  const studentsRaw: any[] = [...studentsViaEnrollment];
  for (const s of studentsViaDirect) {
    if (!enrolledIds.has(s.id)) {
      studentsRaw.push({ ...s, circleId: id, leaveStart: null, leaveEnd: null });
    }
  }

  studentsRaw.sort((a, b) =>
    String(a.fullName).localeCompare(String(b.fullName), "ar", { sensitivity: "base" }),
  );
  res.json({ ...circle, teacher, supervisor, students: studentsRaw });
});

// ── Seed circles for all tracks (10 per track) ─────────────────────────────
const SEED_TRACKS = [
  "بريق", "إشراق", "سُنى", "ضياء", "وهج",
  "مهج", "مشكاة نور", "ألق", "سراج", "قبس", "البهور",
];
const ARABIC_NUMS = ["١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩", "١٠"];

router.post("/circles/seed-tracks", authenticate, async (req, res): Promise<void> => {
  if (req.userRole !== "leader") {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  const existing = await db.select({ name: circlesTable.name }).from(circlesTable);
  const existingNames = new Set(existing.map(c => c.name));
  const toInsert: Array<typeof circlesTable.$inferInsert> = [];
  for (const track of SEED_TRACKS) {
    for (let i = 0; i < 10; i++) {
      const name = `${track} ${ARABIC_NUMS[i]}`;
      if (!existingNames.has(name)) {
        toInsert.push({ name, track, trackType: "girls", isArchived: false });
      }
    }
  }
  if (toInsert.length === 0) {
    res.json({ created: 0, message: "جميع الحلقات موجودة مسبقًا" }); return;
  }
  await db.insert(circlesTable).values(toInsert);
  res.json({ created: toInsert.length, message: `تم إنشاء ${toInsert.length} حلقة بنجاح` });
});

// إزالة معلمة أو مشرفة من حلقة — مع خيار أرشفتها أو نقلها لحلقة أخرى
router.post("/circles/:id/remove-staff", authenticate, async (req, res): Promise<void> => {
  const allowed = ["leader", "deputy", "track_supervisor"];
  if (!allowed.includes(req.userRole ?? "")) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const circleId = parseInt(raw, 10);

  const { staffRole, action, targetCircleId } = req.body as {
    staffRole: "teacher" | "supervisor";
    action: "archive" | "transfer";
    targetCircleId?: number;
  };

  if (!staffRole || !["teacher", "supervisor"].includes(staffRole)) {
    res.status(400).json({ error: "staffRole يجب أن يكون teacher أو supervisor" });
    return;
  }
  if (!action || !["archive", "transfer"].includes(action)) {
    res.status(400).json({ error: "action يجب أن يكون archive أو transfer" });
    return;
  }
  if (action === "transfer" && !targetCircleId) {
    res.status(400).json({ error: "targetCircleId مطلوب عند النقل" });
    return;
  }

  const [circle] = await db.select().from(circlesTable).where(eq(circlesTable.id, circleId));
  if (!circle) {
    res.status(404).json({ error: "Circle not found" });
    return;
  }
  if (circle.isArchived) {
    res.status(400).json({ error: "لا يمكن إدارة كادر حلقة مؤرشفة" });
    return;
  }

  // مسؤولة المسار: فقط حلقات مسارها
  const [circleTrack] = circle.trackId
    ? await db.select({ name: tracksTable.name }).from(tracksTable).where(eq(tracksTable.id, circle.trackId))
    : [];
  const circleTrackName = circle.track ?? circleTrack?.name;
  if (req.userRole === "track_supervisor" && circleTrackName !== req.userTrack) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  let targetCircle: { id: number; track: string | null; trackId: number | null; isArchived: boolean; teacherId: number | null; supervisorId: number | null } | undefined;
  if (targetCircleId) {
    [targetCircle] = await db.select({ id: circlesTable.id, track: circlesTable.track, trackId: circlesTable.trackId, isArchived: circlesTable.isArchived, teacherId: circlesTable.teacherId, supervisorId: circlesTable.supervisorId })
      .from(circlesTable).where(eq(circlesTable.id, targetCircleId));
    if (!targetCircle || targetCircle.isArchived || targetCircle.id === circleId) {
      res.status(400).json({ error: "الحلقة الهدف غير متاحة للنقل" }); return;
    }
    // مسؤولة المسار تقدر تنقل المعلمة/المشرفة لأي حلقة بالمقرأة (كل المسارات)،
    // طالما الحلقة المصدر تابعة لمسارها (يُتحقق منه أعلاه عبر circleTrackName).
    if ((staffRole === "teacher" && targetCircle.teacherId) || (staffRole === "supervisor" && targetCircle.supervisorId)) {
      res.status(409).json({ error: "الحلقة الهدف لديها موظفة من نفس الدور" }); return;
    }
  }

  const userId = staffRole === "teacher" ? circle.teacherId : circle.supervisorId;
  if (!userId) {
    res.status(400).json({ error: "لا يوجد مستخدم مسند لهذا الدور في الحلقة" });
    return;
  }
  const [staffUser] = await db.select({ id: usersTable.id, role: usersTable.role, isArchived: usersTable.isArchived })
    .from(usersTable).where(eq(usersTable.id, userId));
  if (!staffUser || staffUser.isArchived || staffUser.role !== staffRole) {
    res.status(409).json({ error: "الحساب المسند غير نشط أو لا يطابق الدور" });
    return;
  }

  await db.transaction(async (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => {
    if (staffRole === "teacher") {
      await tx.update(circlesTable)
        .set({ teacherId: null })
        .where(and(eq(circlesTable.id, circleId), eq(circlesTable.teacherId, userId)));
    } else {
      await tx.update(circlesTable)
        .set({ supervisorId: null })
        .where(and(eq(circlesTable.id, circleId), eq(circlesTable.supervisorId, userId)));
    }

    if (action === "archive") {
      await tx.update(usersTable).set({ isArchived: true, circleId: null }).where(eq(usersTable.id, userId));
      return;
    }
    if (targetCircleId && targetCircle) {
      await tx.update(usersTable)
        .set({ circleId: targetCircleId, track: targetCircle.track })
        .where(eq(usersTable.id, userId));
      if (staffRole === "teacher") {
        await tx.update(circlesTable).set({ teacherId: userId }).where(eq(circlesTable.id, targetCircleId));
      } else {
        await tx.update(circlesTable).set({ supervisorId: userId }).where(eq(circlesTable.id, targetCircleId));
      }
    }
  });

  res.json({ success: true });
});

router.patch("/circles/:id", authenticate, async (req, res): Promise<void> => {
  if (req.userRole !== "leader" && req.userRole !== "track_supervisor") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const parsed = UpdateCircleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Track supervisors can edit the circle name and its meeting details only within their track.
  if (req.userRole === "track_supervisor") {
    const [existing] = await db.select().from(circlesTable).where(eq(circlesTable.id, id));
    if (!existing || existing.track !== req.userTrack) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const { name, meetingTime, whatsappLink } = parsed.data;
    const [updated] = await db.update(circlesTable).set({ name, meetingTime, whatsappLink }).where(eq(circlesTable.id, id)).returning();
    res.json(updated);
    return;
  }

  // Load existing circle before update to detect track change
  const [existing] = await db.select().from(circlesTable).where(eq(circlesTable.id, id));
  if (!existing) { res.status(404).json({ error: "Circle not found" }); return; }

  const [circle] = await db.update(circlesTable).set(parsed.data).where(eq(circlesTable.id, id)).returning();
  if (!circle) { res.status(404).json({ error: "Circle not found" }); return; }

  // If track name changed, sync it on the teacher & supervisor user accounts
  if (parsed.data.track && parsed.data.track !== existing.track) {
    const staffIds = [existing.teacherId, existing.supervisorId].filter(Boolean) as number[];
    if (staffIds.length > 0) {
      await db.update(usersTable)
        .set({ track: parsed.data.track })
        .where(inArray(usersTable.id, staffIds));
    }
  }

  res.json(circle);
});

export default router;
