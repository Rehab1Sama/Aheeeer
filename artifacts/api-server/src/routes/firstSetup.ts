import { Router, type IRouter } from "express";
import { db, usersTable, tracksTable, circlesTable, registrationSettingsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { randomBytes, timingSafeEqual } from "crypto";
import { authenticate, requireRole } from "../middlewares/authenticate";
import { hashPassword } from "../lib/auth";

const router: IRouter = Router();

const parse = <T>(val: string | undefined, fallback: T): T => {
  if (!val) return fallback;
  try { return JSON.parse(val) as T; } catch { return fallback; }
};

// GET /api/setup/status — is first-time setup needed?
router.get("/setup/status", authenticate, requireRole("leader"), async (_req, res): Promise<void> => {
  const tracks = await db.select({ id: tracksTable.id }).from(tracksTable).limit(1);
  const isNeeded = tracks.length === 0;

  const envTracks = parse<{ name: string; dataEntryType: string }[]>(
    process.env.DEFAULT_TRACK_TYPES, []
  );

  res.json({
    isNeeded,
    schoolName: process.env.VITE_SCHOOL_NAME ?? null,
    schoolTagline: process.env.VITE_SCHOOL_TAGLINE ?? null,
    logoUrl: process.env.VITE_LOGO_URL ?? null,
    suggestedTracks: envTracks,
  });
});

// POST /api/setup/complete — create tracks + circles + registration settings
router.post("/setup/complete", authenticate, requireRole("leader"), async (req, res): Promise<void> => {
  const {
    tracks,
    registrationOpen,
    registrationDeadline,
    adminName,
  } = req.body as {
    tracks: { name: string; dataEntryType: string; circleNames?: string[] }[];
    registrationOpen?: boolean;
    registrationDeadline?: string;
    adminName?: string;
  };

  const results: string[] = [];

  try {
    // 1. Upsert tracks + circles
    const existingTracks = await db.select({ name: tracksTable.name }).from(tracksTable);
    const existingNames = new Set(existingTracks.map(t => t.name));
    const existingCircles = await db.select({ name: circlesTable.name }).from(circlesTable);
    const existingCircleNames = new Set(existingCircles.map(c => c.name));

    let tracksAdded = 0, circlesAdded = 0;

    for (const t of (tracks ?? [])) {
      let trackId: number;
      if (!existingNames.has(t.name)) {
        const [row] = await db.insert(tracksTable).values({
          name: t.name,
          dataEntryType: t.dataEntryType,
        }).returning({ id: tracksTable.id });
        trackId = row!.id;
        tracksAdded++;
      } else {
        const [row] = await db.select({ id: tracksTable.id })
          .from(tracksTable).where(eq(tracksTable.name, t.name));
        trackId = row!.id;
      }

      for (const cn of (t.circleNames ?? [])) {
        if (!existingCircleNames.has(cn)) {
          await db.insert(circlesTable).values({
            name: cn, track: t.name, trackType: t.dataEntryType, trackId,
          });
          existingCircleNames.add(cn);
          circlesAdded++;
        }
      }
    }

    // Always ensure أرشيف + التسجيل circles exist
    if (!existingCircleNames.has("أرشيف")) {
      await db.insert(circlesTable).values({ name: "أرشيف", track: "أرشيف", trackType: "archive" });
      circlesAdded++;
    }
    if (!existingCircleNames.has("التسجيل")) {
      await db.insert(circlesTable).values({ name: "التسجيل", track: "التسجيل", trackType: "registration" });
      circlesAdded++;
    }

    results.push(`تم إضافة ${tracksAdded} مسار و${circlesAdded} حلقة`);

    // 2. Registration settings
    if (registrationOpen !== undefined) {
      const existing = await db.select().from(registrationSettingsTable);
      const vals: any = { isOpen: registrationOpen };
      if (registrationDeadline) vals.deadline = registrationDeadline;
      if (existing.length === 0) {
        await db.insert(registrationSettingsTable).values(vals);
      } else {
        await db.update(registrationSettingsTable).set(vals);
      }
      results.push(`التسجيل: ${registrationOpen ? "مفتوح" : "مغلق"}`);
    }

    // 3. Update leader display name if provided
    if (adminName?.trim()) {
      await db.update(usersTable)
        .set({ name: adminName.trim() })
        .where(eq(usersTable.id, (req as any).userId));
      results.push(`تم تحديث اسم المشرفة`);
    }

    res.json({ ok: true, results });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message ?? "خطأ غير معروف" });
  }
});

// GET /api/setup/init — create leader from INITIAL_ADMIN_EMAIL (called on cold start).
// Unauthenticated by necessity (no leader exists yet to log in as), but this
// meant anyone who requested it before the real operator did could capture
// the returned temporary password and permanently control the admin account.
// It's now gated behind the same SETUP_TOKEN secret used by /api/setup-leader,
// and the temp password is generated with a CSPRNG instead of Math.random().
router.get("/setup/init", async (req, res): Promise<void> => {
  const setupToken = process.env.SETUP_TOKEN;
  const provided = typeof req.query.token === "string" ? req.query.token : "";
  const providedBuf = Buffer.from(provided);
  const expectedBuf = Buffer.from(setupToken ?? "");
  const authorized =
    !!setupToken &&
    providedBuf.length === expectedBuf.length &&
    timingSafeEqual(providedBuf, expectedBuf);
  if (!authorized) {
    res.status(403).json({ ok: false, message: "Missing or invalid setup token" });
    return;
  }

  const email = process.env.INITIAL_ADMIN_EMAIL;
  const name = process.env.VITE_SCHOOL_NAME ?? "المشرفة العامة";
  if (!email) {
    res.json({ ok: false, message: "INITIAL_ADMIN_EMAIL not set" });
    return;
  }
  try {
    const tempPassword = randomBytes(12).toString("base64url");
    const hash = hashPassword(tempPassword);
    const existing = await db.select({ id: usersTable.id })
      .from(usersTable)
      .where(and(eq(usersTable.email, email), eq(usersTable.role, "leader")));

    if (existing.length === 0) {
      await db.insert(usersTable).values({
        email, name, passwordHash: hash, role: "leader",
      });
      res.json({ ok: true, created: true, email, tempPassword });
    } else {
      res.json({ ok: true, created: false, message: "Leader already exists" });
    }
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message });
  }
});

export default router;
