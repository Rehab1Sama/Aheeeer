import { Router, type IRouter } from "express";
import { db, usersTable, tracksTable, circlesTable, studentsTable, studentEnrollmentsTable } from "@workspace/db";
import { eq, and, isNull, isNotNull } from "drizzle-orm";
import { randomBytes, timingSafeEqual } from "crypto";
import { hashPassword } from "../lib/auth";
import { authenticate, requireRole } from "../middlewares/authenticate";

const router: IRouter = Router();

// This whole file exists to bootstrap a brand-new deployment (create the
// first leader account + default tracks/circles). It used to be reachable by
// anyone who knew the URL, with a password hardcoded in the source code that
// got reset on *every* call — meaning anyone could take over the leader
// account at any time, not just on first run. It is now gated behind a
// secret SETUP_TOKEN (set it once in your deployment's environment
// variables, share it only with whoever runs first-time setup, then you can
// remove/rotate it) and never overwrites an existing account's password.
function isAuthorizedSetupRequest(req: { query: Record<string, unknown> }): boolean {
  const setupToken = process.env.SETUP_TOKEN;
  if (!setupToken || setupToken.trim().length === 0) return false;
  const provided = typeof req.query.token === "string" ? req.query.token : "";
  const providedBuf = Buffer.from(provided);
  const expectedBuf = Buffer.from(setupToken);
  return providedBuf.length === expectedBuf.length && timingSafeEqual(providedBuf, expectedBuf);
}

const TRACKS = [
  { name: "البهور",    dataEntryType: "girls" },
  { name: "إشراق",    dataEntryType: "girls" },
  { name: "قبس",      dataEntryType: "girls" },
  { name: "ضياء",     dataEntryType: "girls" },
  { name: "وهج",      dataEntryType: "girls" },
  { name: "سراج",     dataEntryType: "simple_review" },
  { name: "ألق",      dataEntryType: "simple_review" },
  { name: "مهج",      dataEntryType: "simple_review" },
  { name: "مشكاة نور", dataEntryType: "recitation" },
] as const;

const CIRCLES_PER_TRACK: Record<string, string[]> = {
  "البهور":    Array.from({length:11}, (_,i) => `البهور ${i+1}`),
  "إشراق":    Array.from({length:10}, (_,i) => `إشراق ${i+1}`),
  "قبس":      Array.from({length:11}, (_,i) => `قبس ${i+1}`),
  "ضياء":     Array.from({length:10}, (_,i) => `ضياء ${i+1}`),
  "وهج":      Array.from({length:10}, (_,i) => `وهج ${i+1}`),
  "سراج":     Array.from({length:8},  (_,i) => `سراج ${i+1}`),
  "ألق":      Array.from({length:9},  (_,i) => `ألق ${i+1}`),
  "مهج":      Array.from({length:8},  (_,i) => `مهج ${i+1}`),
  "مشكاة نور": Array.from({length:8}, (_,i) => `مشكاة ${i+1}`),
};

router.get("/setup-leader", async (req, res): Promise<void> => {
  if (!isAuthorizedSetupRequest(req)) {
    res.status(403).send(html("❌ غير مصرح", `
      <p>هذا المسار يتطلب رمز إعداد صحيح (?token=...).</p>
      <p>اضبطي متغير البيئة <strong>SETUP_TOKEN</strong> على السيرفر ثم افتحي الرابط مع نفس القيمة.</p>
    `));
    return;
  }

  const results: string[] = [];
  let leaderCredentialsHtml = "";

  try {
    // ─── 1. Leader account ─────────────────────────────────────────────
    // Only ever created if it doesn't already exist — never resets an
    // existing account's password (that used to let anyone with the URL
    // take the leader account over at any time).
    const leaderEmail = (process.env.INITIAL_ADMIN_EMAIL || "sana.qur3n@gmail.com").toLowerCase().trim();
    const existingLeader = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(and(eq(usersTable.email, leaderEmail), eq(usersTable.role, "leader")));

    if (existingLeader.length === 0) {
      const initialPassword = process.env.INITIAL_ADMIN_PASSWORD || randomBytes(9).toString("base64url");
      await db.insert(usersTable).values({
        email: leaderEmail,
        name: process.env.VITE_SCHOOL_NAME || "سنا",
        passwordHash: hashPassword(initialPassword),
        role: "leader",
      });
      results.push("✅ تم إنشاء حساب القائدة");
      leaderCredentialsHtml = `
        <p><strong>الإيميل:</strong> ${leaderEmail}</p>
        <p><strong>كلمة المرور المؤقتة:</strong> ${initialPassword}</p>
        <p style="color:#b91c1c;font-size:13px;">مهم: غيّري كلمة المرور فور الدخول — هذه الصفحة لن تعرضها مرة أخرى.</p>
      `;
    } else {
      results.push("✅ حساب القائدة موجود مسبقًا (لم تُغيَّر كلمة مروره)");
    }

    // ─── 2. Tracks ─────────────────────────────────────────────────────
    const existingTracks = await db.select({ name: tracksTable.name }).from(tracksTable);
    const existingTrackNames = new Set(existingTracks.map(t => t.name));
    let tracksAdded = 0;

    const trackIdMap: Record<string, number> = {};

    for (const t of TRACKS) {
      if (!existingTrackNames.has(t.name)) {
        const [inserted] = await db.insert(tracksTable).values({
          name: t.name,
          dataEntryType: t.dataEntryType,
        }).returning({ id: tracksTable.id });
        trackIdMap[t.name] = inserted!.id;
        tracksAdded++;
      } else {
        const [existing] = await db.select({ id: tracksTable.id }).from(tracksTable).where(eq(tracksTable.name, t.name));
        if (existing) trackIdMap[t.name] = existing.id;
      }
    }
    results.push(tracksAdded > 0 ? `✅ تم إضافة ${tracksAdded} مسار` : "✅ المسارات موجودة مسبقًا");

    // ─── 3. Circles ────────────────────────────────────────────────────
    const existingCircles = await db.select({ name: circlesTable.name }).from(circlesTable);
    const existingCircleNames = new Set(existingCircles.map(c => c.name));
    let circlesAdded = 0;

    for (const track of TRACKS) {
      const trackId = trackIdMap[track.name];
      const circleNames = CIRCLES_PER_TRACK[track.name] ?? [];
      for (const circleName of circleNames) {
        if (!existingCircleNames.has(circleName)) {
          await db.insert(circlesTable).values({
            name: circleName,
            track: track.name,
            trackType: track.dataEntryType,
            trackId: trackId ?? null,
          });
          circlesAdded++;
        }
      }
    }

    // Special circles: أرشيف + التسجيل
    if (!existingCircleNames.has("أرشيف")) {
      await db.insert(circlesTable).values({ name: "أرشيف", track: "أرشيف", trackType: "archive" });
      circlesAdded++;
    }
    if (!existingCircleNames.has("التسجيل")) {
      await db.insert(circlesTable).values({ name: "التسجيل", track: "التسجيل", trackType: "registration" });
      circlesAdded++;
    }

    results.push(circlesAdded > 0 ? `✅ تم إضافة ${circlesAdded} حلقة` : "✅ الحلقات موجودة مسبقًا");

    // ─── 4. Sync trackId for circles that have track name but missing trackId ──
    const allTracksForSync = await db.select({ id: tracksTable.id, name: tracksTable.name, dataEntryType: tracksTable.dataEntryType }).from(tracksTable);
    const trackNameToId: Record<string, number> = {};
    const trackNameToType: Record<string, string> = {};
    for (const t of allTracksForSync) {
      trackNameToId[t.name] = t.id;
      trackNameToType[t.name] = t.dataEntryType;
    }

    const circlesWithNullTrackId = await db.select().from(circlesTable).where(isNull(circlesTable.trackId));
    let synced = 0;
    for (const circle of circlesWithNullTrackId) {
      const tid = trackNameToId[circle.track];
      const ttype = trackNameToType[circle.track];
      if (tid) {
        await db.update(circlesTable)
          .set({ trackId: tid, ...(ttype ? { trackType: ttype } : {}) })
          .where(eq(circlesTable.id, circle.id));
        synced++;
      }
    }
    results.push(synced > 0 ? `✅ تم ربط ${synced} حلقة بمسارها (trackId)` : "✅ جميع الحلقات مرتبطة بمساراتها");

    res.send(html("✅ اكتمل الإعداد", `
      ${results.map(r => `<p>${r}</p>`).join("")}
      <br>
      ${leaderCredentialsHtml}
      <a href="/">ادخلي الآن →</a>
    `));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const cause = (err as any)?.cause instanceof Error
      ? (err as any).cause.message
      : (err as any)?.cause ? String((err as any).cause) : "";
    res.status(500).send(html("❌ خطأ", `
      <p style="color:#dc2626;font-size:13px;word-break:break-all;">${message}</p>
      ${cause ? `<p style="color:#b91c1c;font-size:12px;word-break:break-all;">السبب: ${cause}</p>` : ""}
      <p>تأكدي أن <strong>DATABASE_URL</strong> مضبوط في Render Environment وأن Schema الـ SQL نُفِّذ في Supabase.</p>
    `));
  }
});

// ─── JSON sync endpoint (called from the UI) ─────────────────────────────────
// Was previously reachable with no authentication at all — anyone could
// trigger repeated inserts of tracks/circles/enrollment-repair records.
router.post("/setup/sync", authenticate, requireRole("leader"), async (_req, res): Promise<void> => {
  try {
    const results: string[] = [];

    // 1. Ensure all TRACKS exist
    const existingTracks = await db.select({ name: tracksTable.name }).from(tracksTable);
    const existingTrackNames = new Set(existingTracks.map(t => t.name));
    let tracksAdded = 0;
    for (const t of TRACKS) {
      if (!existingTrackNames.has(t.name)) {
        await db.insert(tracksTable).values({ name: t.name, dataEntryType: t.dataEntryType });
        tracksAdded++;
      }
    }
    results.push(tracksAdded > 0 ? `تم إضافة ${tracksAdded} مسار` : "المسارات موجودة");

    // 2. Sync circle trackId where null
    const allTracks = await db.select({ id: tracksTable.id, name: tracksTable.name, dataEntryType: tracksTable.dataEntryType }).from(tracksTable);
    const trackNameToId: Record<string, number> = {};
    const trackNameToType: Record<string, string> = {};
    for (const t of allTracks) {
      trackNameToId[t.name] = t.id;
      trackNameToType[t.name] = t.dataEntryType;
    }

    const circlesNull = await db.select().from(circlesTable).where(isNull(circlesTable.trackId));
    let synced = 0;
    for (const circle of circlesNull) {
      const tid = trackNameToId[circle.track];
      const ttype = trackNameToType[circle.track];
      if (tid) {
        await db.update(circlesTable)
          .set({ trackId: tid, ...(ttype ? { trackType: ttype } : {}) })
          .where(eq(circlesTable.id, circle.id));
        synced++;
      }
    }
    results.push(synced > 0 ? `تم ربط ${synced} حلقة بمسارها` : "جميع الحلقات مرتبطة");

    // 3. Create 10 circles per track if missing
    const allCircles = await db.select({ name: circlesTable.name, trackId: circlesTable.trackId }).from(circlesTable);
    const circleNameSet = new Set(allCircles.map(c => c.name));
    let circlesAdded = 0;
    for (const t of allTracks) {
      for (let i = 1; i <= 10; i++) {
        const name = `${t.name} ${i}`;
        if (!circleNameSet.has(name)) {
          await db.insert(circlesTable).values({
            name,
            track: t.name,
            trackId: t.id,
            trackType: t.dataEntryType ?? "girls",
            isArchived: false,
          });
          circlesAdded++;
        }
      }
    }
    results.push(circlesAdded > 0 ? `تم إنشاء ${circlesAdded} حلقة` : "الحلقات مكتملة");

    // 4. Repair missing student enrollment records
    const studentsWithCircle = await db
      .select({ id: studentsTable.id, circleId: studentsTable.circleId })
      .from(studentsTable)
      .where(and(eq(studentsTable.isArchived, false), isNotNull(studentsTable.circleId)));
    let enrollmentsFixed = 0;
    for (const s of studentsWithCircle) {
      if (!s.circleId) continue;
      const existing = await db.select({ id: studentEnrollmentsTable.id })
        .from(studentEnrollmentsTable)
        .where(and(
          eq(studentEnrollmentsTable.studentId, s.id),
          eq(studentEnrollmentsTable.circleId, s.circleId),
          eq(studentEnrollmentsTable.isArchived, false),
        ));
      if (existing.length === 0) {
        await db.insert(studentEnrollmentsTable)
          .values({ studentId: s.id, circleId: s.circleId, isArchived: false })
          .onConflictDoNothing();
        enrollmentsFixed++;
      }
    }
    if (enrollmentsFixed > 0) results.push(`تم إصلاح ${enrollmentsFixed} سجل تسجيل للطالبات`);

    const updatedTracks = await db.select().from(tracksTable).orderBy(tracksTable.createdAt);
    res.json({ ok: true, results, tracks: updatedTracks });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ ok: false, error: message });
  }
});

function html(title: string, body: string): string {
  return `<!DOCTYPE html><html lang="ar" dir="rtl">
<head><meta charset="UTF-8"><title>${title}</title>
<style>
  body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;
    min-height:100vh;margin:0;background:#f5f3ff;}
  .box{background:#fff;border-radius:16px;padding:40px;text-align:center;
    box-shadow:0 4px 20px #0001;max-width:420px;width:90%;}
  h2{margin-bottom:16px;}p{color:#555;margin:6px 0;}
  a{display:inline-block;margin-top:20px;padding:12px 28px;background:#6d28d9;
    color:#fff;border-radius:8px;text-decoration:none;font-size:16px;}
</style></head>
<body><div class="box"><h2>${title}</h2>${body}</div></body></html>`;
}

export default router;
