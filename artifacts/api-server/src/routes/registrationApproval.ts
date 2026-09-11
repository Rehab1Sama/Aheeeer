import { Router, type IRouter } from "express";
import { db, usersTable, circlesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { authenticate, requireRole } from "../middlewares/authenticate";

const router: IRouter = Router();

const APPROVAL_ROLES = ["leader", "deputy", "track_supervisor"] as const;

const ROLE_LABELS: Record<string, string> = {
  leader: "القائدة",
  deputy: "النائبة",
  data_entry: "مُدخلة بيانات",
  teacher: "معلمة",
  supervisor: "مشرفة",
  student: "طالبة",
  track_supervisor: "مسؤولة مسار",
  exam_supervisor: "مسؤولة الاختبارات",
  volunteer: "متطوعة",
};

router.get(
  "/registration/pending",
  authenticate,
  requireRole(...APPROVAL_ROLES),
  async (req, res): Promise<void> => {
    const allPending = await db
      .select({
        id: usersTable.id,
        name: usersTable.name,
        email: usersTable.email,
        role: usersTable.role,
        phone: usersTable.phone,
        country: usersTable.country,
        ageRange: usersTable.ageRange,
        educationLevel: usersTable.educationLevel,
        track: usersTable.track,
        circleId: usersTable.circleId,
        registrationStatus: usersTable.registrationStatus,
        createdAt: usersTable.createdAt,
        circleName: circlesTable.name,
        circleTrack: circlesTable.track,
      })
      .from(usersTable)
      .leftJoin(circlesTable, eq(usersTable.circleId, circlesTable.id))
      .where(eq(usersTable.registrationStatus, "pending"));

    if (req.userRole === "track_supervisor" && req.userTrack) {
      const filtered = allPending.filter(
        u => (u.circleTrack ?? u.track) === req.userTrack,
      );
      res.json(
        filtered.map(u => ({
          ...u,
          roleLabel: ROLE_LABELS[u.role] ?? u.role,
        })),
      );
      return;
    }

    res.json(
      allPending.map(u => ({
        ...u,
        roleLabel: ROLE_LABELS[u.role] ?? u.role,
      })),
    );
  },
);

router.post(
  "/registration/:id/approve",
  authenticate,
  requireRole(...APPROVAL_ROLES),
  async (req, res): Promise<void> => {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) { res.status(400).json({ error: "معرف غير صالح" }); return; }

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id));
    if (!user) { res.status(404).json({ error: "المستخدم غير موجود" }); return; }

    if (req.userRole === "track_supervisor" && req.userTrack) {
      const userTrack = user.track ?? (user.circleId
        ? (await db.select({ track: circlesTable.track }).from(circlesTable).where(eq(circlesTable.id, user.circleId)))[0]?.track
        : null);
      if (userTrack !== req.userTrack) {
        res.status(403).json({ error: "لا يمكنك الموافقة على طلبات خارج مسارك" });
        return;
      }
    }

    await db
      .update(usersTable)
      .set({ registrationStatus: "approved" })
      .where(and(eq(usersTable.id, id), eq(usersTable.registrationStatus, "pending")));

    res.json({ success: true });
  },
);

router.post(
  "/registration/:id/reject",
  authenticate,
  requireRole(...APPROVAL_ROLES),
  async (req, res): Promise<void> => {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) { res.status(400).json({ error: "معرف غير صالح" }); return; }

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id));
    if (!user) { res.status(404).json({ error: "المستخدم غير موجود" }); return; }

    if (req.userRole === "track_supervisor" && req.userTrack) {
      const userTrack = user.track ?? (user.circleId
        ? (await db.select({ track: circlesTable.track }).from(circlesTable).where(eq(circlesTable.id, user.circleId)))[0]?.track
        : null);
      if (userTrack !== req.userTrack) {
        res.status(403).json({ error: "لا يمكنك رفض طلبات خارج مسارك" });
        return;
      }
    }

    await db
      .update(usersTable)
      .set({ registrationStatus: "rejected" })
      .where(and(eq(usersTable.id, id), eq(usersTable.registrationStatus, "pending")));

    res.json({ success: true });
  },
);

export default router;
