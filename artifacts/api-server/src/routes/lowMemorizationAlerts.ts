import { Router, type IRouter } from "express";
import { db, lowMemorizationAlertsTable, circlesTable, studentsTable, usersTable, recordsTable, tracksTable, dataEntryCircleAssignmentsTable } from "@workspace/db";
import { eq, and, desc, inArray } from "drizzle-orm";
import { authenticate } from "../middlewares/authenticate";

const router: IRouter = Router();

function getMeccaTodayServer(): string {
  return new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// POST /api/records/check-low-memorization — called internally after record creation
// Also exposed as GET for the admin dashboard
export async function checkAndCreateLowMemorizationAlert(studentId: number, enteredById: number) {
  try {
    const [student] = await db.select().from(studentsTable).where(eq(studentsTable.id, studentId));
    if (!student?.circleId) return;

    const [circle] = await db.select().from(circlesTable).where(eq(circlesTable.id, student.circleId));
    if (!circle) return;

    // استخدم dataEntryType من tracksTable إذا كانت الحلقة مرتبطة بمسار
    let trackType = circle.trackType ?? "girls";
    if (circle.trackId) {
      const [trackRow] = await db.select().from(tracksTable).where(eq(tracksTable.id, circle.trackId));
      if (trackRow?.dataEntryType) trackType = trackRow.dataEntryType;
    }
    // يُطبَّق الإنذار على مسار الفتيات والتثبيت فقط
    if (trackType !== "girls" && trackType !== "fixation") return;

    const today = getMeccaTodayServer();
    const fourteenDaysAgo = addDays(today, -13); // 14 days inclusive

    // جلب سجلات آخر 14 يومًا للطالبة
    const recentRecords = await db.select().from(recordsTable)
      .where(and(
        eq(recordsTable.studentId, studentId),
        eq(recordsTable.circleId, student.circleId),
      ));

    const filteredRecords = recentRecords.filter(r =>
      r.date >= fourteenDaysAgo && r.date <= today && !r.isAbsent
    );

    const totalPages = filteredRecords.reduce((s, r) => s + (r.memorizePages ?? 0), 0);

    if (totalPages <= 3) {
      // تحقق إذا كان الإنذار موجود بالفعل لهذه الطالبة (غير مقروء)
      const [existingAlert] = await db.select().from(lowMemorizationAlertsTable)
        .where(and(
          eq(lowMemorizationAlertsTable.studentId, studentId),
          eq(lowMemorizationAlertsTable.isRead, false),
        ));

      if (existingAlert) {
        // تحديث الإنذار الموجود
        await db.update(lowMemorizationAlertsTable)
          .set({ totalPages, updatedAt: new Date() })
          .where(eq(lowMemorizationAlertsTable.id, existingAlert.id));
      } else {
        // إنشاء إنذار جديد
        await db.insert(lowMemorizationAlertsTable).values({
          studentId,
          studentName: student.fullName,
          circleId: circle.id,
          circleName: circle.name,
          track: circle.track ?? "",
          trackType,
          totalPages: Math.round(totalPages * 10) / 10,
          periodDays: 14,
          isRead: false,
        });
      }
    } else {
      // إذا تجاوزت الحد، احذف الإنذار القديم إذا كان موجودًا
      await db.delete(lowMemorizationAlertsTable)
        .where(and(
          eq(lowMemorizationAlertsTable.studentId, studentId),
          eq(lowMemorizationAlertsTable.isRead, false),
        ));
    }
  } catch (err) {
    console.error("checkAndCreateLowMemorizationAlert error:", err);
  }
}

// GET /api/alerts/low-memorization — for leader, deputy, track_supervisor
router.get("/alerts/low-memorization", authenticate, async (req, res): Promise<void> => {
  const role = req.userRole!;
  if (!["leader", "deputy", "track_supervisor"].includes(role)) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  let alerts = await db.select().from(lowMemorizationAlertsTable)
    .where(eq(lowMemorizationAlertsTable.isRead, false))
    .orderBy(desc(lowMemorizationAlertsTable.createdAt));

  // مسؤولة المسار ترى فقط تنبيهات مسارها
  if (role === "track_supervisor") {
    const [me] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!));
    const myTrack = me?.track ?? "";
    alerts = alerts.filter(a => a.track === myTrack);
  }

  res.json(alerts);
});

// GET /api/alerts/low-memorization/all — جميع الإنذارات بما فيها المقروءة (للقائدة/النائبة)
router.get("/alerts/low-memorization/all", authenticate, async (req, res): Promise<void> => {
  const role = req.userRole!;
  if (!["leader", "deputy", "track_supervisor"].includes(role)) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  let alerts = await db.select().from(lowMemorizationAlertsTable)
    .orderBy(desc(lowMemorizationAlertsTable.createdAt));

  if (role === "track_supervisor") {
    const [me] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!));
    const myTrack = me?.track ?? "";
    alerts = alerts.filter(a => a.track === myTrack);
  }

  res.json(alerts);
});

// PATCH /api/alerts/low-memorization/:id/read
router.patch("/alerts/low-memorization/:id/read", authenticate, async (req, res): Promise<void> => {
  const role = req.userRole!;
  if (!["leader", "deputy", "track_supervisor"].includes(role)) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  const id = parseInt(req.params.id as string);
  await db.update(lowMemorizationAlertsTable)
    .set({ isRead: true })
    .where(eq(lowMemorizationAlertsTable.id, id));
  res.json({ ok: true });
});

// PATCH /api/alerts/low-memorization/read-all — قراءة جميع الإنذارات
router.patch("/alerts/low-memorization/read-all", authenticate, async (req, res): Promise<void> => {
  const role = req.userRole!;
  if (!["leader", "deputy", "track_supervisor"].includes(role)) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  if (role === "track_supervisor") {
    const [me] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!));
    const myTrack = me?.track ?? "";
    const alerts = await db.select().from(lowMemorizationAlertsTable)
      .where(and(eq(lowMemorizationAlertsTable.isRead, false)));
    const myAlertIds = alerts.filter(a => a.track === myTrack).map(a => a.id);
    for (const id of myAlertIds) {
      await db.update(lowMemorizationAlertsTable).set({ isRead: true }).where(eq(lowMemorizationAlertsTable.id, id));
    }
  } else {
    await db.update(lowMemorizationAlertsTable).set({ isRead: true });
  }

  res.json({ ok: true });
});

export default router;
