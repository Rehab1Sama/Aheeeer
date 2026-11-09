import app from "./app";
import { logger } from "./lib/logger";
import { db, usersTable, studentsTable, studentMemorizationsTable, circlesTable, studentEnrollmentsTable } from "@workspace/db";
import { eq, and, isNull, isNotNull, sql } from "drizzle-orm";
import { hashPassword } from "./lib/auth";
import cron from "node-cron";
import { runWeeklyMoonBadgeAward } from "./lib/weeklyMoonBadge";

async function migrateGlobalSettings() {
  try {
    await db.execute(sql.raw(`
      CREATE TABLE IF NOT EXISTS global_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `));
    logger.info("global_settings migration complete");
  } catch (err: any) {
    logger.warn({ msg: err?.message?.slice(0, 120) }, "global_settings migration skipped");
  }
}

async function migrateReviewPlansTable() {
  const steps = [
    `ALTER TABLE review_plans
      ADD COLUMN IF NOT EXISTS circle_id integer,
      ADD COLUMN IF NOT EXISTS quota_type text,
      ADD COLUMN IF NOT EXISTS quota_juz integer,
      ADD COLUMN IF NOT EXISTS quota_surah_start text,
      ADD COLUMN IF NOT EXISTS quota_ayah_start integer,
      ADD COLUMN IF NOT EXISTS quota_surah_end text,
      ADD COLUMN IF NOT EXISTS quota_ayah_end integer,
      ADD COLUMN IF NOT EXISTS plan_mode text,
      ADD COLUMN IF NOT EXISTS quantity text,
      ADD COLUMN IF NOT EXISTS theme_color text NOT NULL DEFAULT '#E8D5F5'`,
    `ALTER TABLE review_plans
      ALTER COLUMN track_type DROP NOT NULL,
      ALTER COLUMN plan_entries DROP NOT NULL,
      ALTER COLUMN theme DROP NOT NULL,
      ALTER COLUMN cycle_count DROP NOT NULL,
      ALTER COLUMN cycle_length DROP NOT NULL,
      ALTER COLUMN total_pages DROP NOT NULL,
      ALTER COLUMN current_cycle_start DROP NOT NULL,
      ALTER COLUMN start_date DROP NOT NULL`,
    `ALTER TABLE review_plans DROP CONSTRAINT IF EXISTS review_plans_student_id_key`,
    `ALTER TABLE review_plans
      ADD COLUMN IF NOT EXISTS extra_ranges text,
      ADD COLUMN IF NOT EXISTS review_source_snapshot text`,
  ];
  let ok = 0;
  for (const step of steps) {
    try {
      await db.execute(sql.raw(step));
      ok++;
    } catch (err: any) {
      logger.warn({ msg: err?.message?.slice(0, 120) }, "review_plans migration step skipped");
    }
  }
  logger.info({ steps: ok }, "review_plans migration complete");
}

// إضافة أعمدة teacherScope وselectedTracks لجدول exam_rotations (migration 0003)
async function migrateExamRotationsScope() {
  const steps = [
    `ALTER TABLE exam_rotations ADD COLUMN IF NOT EXISTS "teacher_scope" text NOT NULL DEFAULT 'girls'`,
    `ALTER TABLE exam_rotations ADD COLUMN IF NOT EXISTS "selected_tracks" text NOT NULL DEFAULT '[]'`,
  ];
  for (const step of steps) {
    try { await db.execute(sql.raw(step)); } catch (err: any) {
      logger.warn({ msg: err?.message?.slice(0, 120) }, "exam_rotations scope migration step skipped");
    }
  }
  logger.info("exam_rotations scope columns ensured");
}

async function migrateRecordsUniqueConstraint() {
  try {
    // فحص أولاً — إذا كان القيد موجوداً لا نحاول إضافته
    const existing = await db.execute(sql.raw(`
      SELECT 1 FROM pg_constraint
      WHERE conname = 'records_student_circle_date_unique'
      LIMIT 1
    `));
    if ((existing as any).rows?.length > 0) {
      logger.info("records unique constraint already exists — skipped");
      return;
    }
    // خطوة 1: حذف السجلات المكررة — الاحتفاظ بالسجل الأحدث
    await db.execute(sql.raw(`
      DELETE FROM records
      WHERE id NOT IN (
        SELECT MAX(id)
        FROM records
        GROUP BY student_id, circle_id, date
      )
    `));
    // خطوة 2: إضافة القيد الفريد المركب
    await db.execute(sql.raw(`
      ALTER TABLE records
        ADD CONSTRAINT records_student_circle_date_unique
        UNIQUE (student_id, circle_id, date)
    `));
    logger.info("records unique constraint (student+circle+date) applied");
  } catch (err: any) {
    const errMsg = String(err?.message ?? err ?? "").slice(0, 300);
    logger.warn("records unique constraint migration skipped: " + errMsg);
  }
}

const historicalJuzCumulative = [
  21, 41, 61, 81.5, 101, 120.5, 141, 161, 181, 200.5,
  221, 241, 261, 281, 301, 321, 341, 361, 381, 401,
  421, 441, 461, 481, 501.5, 521, 541, 561, 581, 603.5,
];

function legacyJuzNumbers(value: string): number[] {
  const normalized = value.replace(/[٠-٩]/g, digit => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));
  const match = normalized.match(/أجزاء?\s*:\s*([0-9\s،,]+)/);
  if (!match) return [];
  return [...new Set((match[1].match(/\d+/g) ?? []).map(Number).filter(number => number >= 1 && number <= 30))]
    .sort((left, right) => left - right);
}

function legacyJuzCredit(juzNumbers: number[]): number {
  return Math.round(juzNumbers.reduce((total, juz) => {
    const end = historicalJuzCumulative[juz - 1];
    const start = juz === 1 ? 0 : historicalJuzCumulative[juz - 2];
    return total + end - start;
  }, 0) * 2) / 2;
}

async function migrateStudentMemorizations() {
  try {
    await db.execute(sql.raw(`
      CREATE TABLE IF NOT EXISTS student_memorizations (
        id SERIAL PRIMARY KEY,
        student_id INTEGER NOT NULL,
        label TEXT NOT NULL,
        juz_numbers TEXT,
        pages REAL NOT NULL DEFAULT 0,
        created_by_id INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS student_memorizations_student_id_idx
        ON student_memorizations (student_id);
      CREATE UNIQUE INDEX IF NOT EXISTS student_memorizations_legacy_per_student_idx
        ON student_memorizations (student_id) WHERE created_by_id IS NULL;
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'student_memorizations_student_id_fk'
        ) THEN
          ALTER TABLE student_memorizations
            ADD CONSTRAINT student_memorizations_student_id_fk
            FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'student_memorizations_pages_range'
        ) THEN
          ALTER TABLE student_memorizations
            ADD CONSTRAINT student_memorizations_pages_range
            CHECK (pages >= 0 AND pages <= 604);
        END IF;
      END $$;
    `));

    const candidates = await db.select({
      id: studentsTable.id,
      extraData: studentsTable.extraData,
    }).from(studentsTable).where(sql`
      ${studentsTable.extraData} LIKE '%المحفوظات%'
      AND ${studentsTable.extraData} NOT LIKE '%__memorizationMigrated%'
    `);
    let imported = 0;
    for (let offset = 0; offset < candidates.length; offset += 30) {
      const batch = candidates.slice(offset, offset + 30);
      const results = await Promise.all(batch.map(async student => {
      let extra: Record<string, unknown>;
      try {
        const value = student.extraData ? JSON.parse(student.extraData) : {};
        extra = value && typeof value === "object" && !Array.isArray(value) ? value : {};
      } catch {
        return false;
      }
      if (extra.__memorizationMigrated === true) return false;
      const legacy = typeof extra["المحفوظات"] === "string" ? extra["المحفوظات"].trim() : "";
      if (!legacy) return false;
      const juzNumbers = legacyJuzNumbers(legacy);
      await db.insert(studentMemorizationsTable).values({
        studentId: student.id,
        label: legacy,
        juzNumbers: juzNumbers.length ? JSON.stringify(juzNumbers) : null,
        pages: juzNumbers.length ? legacyJuzCredit(juzNumbers) : 0,
      }).onConflictDoNothing();
      extra.__memorizationMigrated = true;
      await db.update(studentsTable)
        .set({ extraData: JSON.stringify(extra) })
        .where(eq(studentsTable.id, student.id));
      return true;
      }));
      imported += results.filter(Boolean).length;
    }
    logger.info({ imported }, "student_memorizations migration complete");
  } catch (err: any) {
    logger.error({ msg: err?.message?.slice(0, 200) }, "student_memorizations migration failed");
    throw err;
  }
}

if (!process.env.SESSION_SECRET) {
  logger.warn("[SECURITY] SESSION_SECRET is not set — using insecure fallback. Set it before going to production!");
}

// مزامنة users.circle_id مع students.circle_id لجميع الطالبات
// ويصلح كذلك students.circle_id=NULL إذا كان للطالبة enrollment نشط في حلقة حقيقية
async function syncStudentUserCircleIds() {
  try {
    // الخطوة أ: ملء students.circle_id الفارغ من أفضل enrollment نشط
    const stepA = await db.execute(sql.raw(`
      WITH ranked AS (
        SELECT se.student_id, se.circle_id,
          ROW_NUMBER() OVER (
            PARTITION BY se.student_id
            ORDER BY
              CASE c.track_type
                WHEN 'girls'         THEN 1
                WHEN 'fixation'      THEN 2
                WHEN 'simple_review' THEN 3
                ELSE 4
              END,
              se.id DESC
          ) AS rn
        FROM student_enrollments se
        JOIN circles c ON c.id = se.circle_id AND c.track_type != 'registration'
        JOIN students s ON s.id = se.student_id AND s.is_archived = false AND s.circle_id IS NULL
        WHERE se.is_archived = false
      )
      UPDATE students s SET circle_id = r.circle_id
      FROM ranked r WHERE s.id = r.student_id AND r.rn = 1
    `));
    const fixedStudents = (stepA as any).rowCount ?? 0;

    // الخطوة ب: ملء students.circle_id=registration من أفضل enrollment في حلقة حقيقية
    const stepB = await db.execute(sql.raw(`
      WITH ranked AS (
        SELECT se.student_id, se.circle_id,
          ROW_NUMBER() OVER (
            PARTITION BY se.student_id
            ORDER BY
              CASE c.track_type
                WHEN 'girls'         THEN 1
                WHEN 'fixation'      THEN 2
                WHEN 'simple_review' THEN 3
                ELSE 4
              END,
              se.id DESC
          ) AS rn
        FROM student_enrollments se
        JOIN circles c ON c.id = se.circle_id AND c.track_type != 'registration'
        JOIN students s ON s.id = se.student_id AND s.is_archived = false
        JOIN circles reg ON reg.id = s.circle_id AND reg.track_type = 'registration'
        WHERE se.is_archived = false
      )
      UPDATE students s SET circle_id = r.circle_id
      FROM ranked r WHERE s.id = r.student_id AND r.rn = 1
    `));
    const fixedRegStudents = (stepB as any).rowCount ?? 0;

    // الخطوة ج: مزامنة users.circle_id = students.circle_id
    // استثناء: إذا كان للمستخدم enrollment نشط في حلقته الحالية → لا نبدّل (يعني التصحيح اليدوي محفوظ)
    const stepC = await db.execute(sql.raw(`
      UPDATE users u SET circle_id = s.circle_id
      FROM students s
      WHERE u.student_id = s.id
        AND u.role = 'student'
        AND s.is_archived = false
        AND s.circle_id IS NOT NULL
        AND (u.circle_id IS NULL OR u.circle_id != s.circle_id)
        AND NOT EXISTS (
          SELECT 1 FROM student_enrollments se
          WHERE se.student_id = u.student_id
            AND se.circle_id = u.circle_id
            AND se.is_archived = false
        )
    `));
    const fixedUsers = (stepC as any).rowCount ?? 0;

    if (fixedStudents + fixedRegStudents + fixedUsers > 0) {
      logger.info(
        { fixedStudents, fixedRegStudents, fixedUsers },
        "Synced student→user circle_id links"
      );
    }
  } catch (err) {
    logger.error({ err }, "Failed to sync student user circle IDs");
  }
}

async function repairMissingEnrollments() {
  // استعلام واحد بدل استعلام لكل طالبة في كل تشغيل للخادم (كان ~١٠٠٠ استعلام مع كل إقلاع).
  try {
    const result = await db.execute(sql.raw(`
      INSERT INTO student_enrollments (student_id, circle_id, is_archived)
      SELECT s.id, s.circle_id, false
      FROM students s
      WHERE s.is_archived = false AND s.circle_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM student_enrollments e
          WHERE e.student_id = s.id AND e.circle_id = s.circle_id AND e.is_archived = false
        )
      ON CONFLICT DO NOTHING
    `));
    const created = (result as any).rowCount ?? 0;
    if (created > 0) logger.info({ created }, "Repaired missing student enrollments");
  } catch (err) {
    logger.error({ err }, "Failed to repair missing enrollments");
  }
}

// تصحيح إيميلات المستخدمين (إزالة المسافات + تحويل لحروف صغيرة)
async function normalizeEmails() {
  try {
    const result = await db.execute(
      sql`UPDATE users SET email = LOWER(TRIM(email)) WHERE email != LOWER(TRIM(email))`
    );
    const count = (result as any).rowCount ?? 0;
    if (count > 0) logger.info({ count }, "Normalized user emails (trim + lowercase)");
  } catch (err) {
    logger.error({ err }, "Failed to normalize emails");
  }
}

// ربط المعلمات والمشرفات بحلقاتهن عند بدء التشغيل
async function syncCircleStaff() {
  try {
    let updated = 0;
    const staff = await db
      .select({ id: usersTable.id, role: usersTable.role, circleId: usersTable.circleId })
      .from(usersTable)
      .where(and(eq(usersTable.isArchived, false), isNotNull(usersTable.circleId)));

    for (const u of staff) {
      if (!u.circleId) continue;
      if (u.role === "teacher") {
        const r = await db.update(circlesTable)
          .set({ teacherId: u.id })
          .where(and(eq(circlesTable.id, u.circleId), isNull(circlesTable.teacherId)));
        if ((r as any).rowCount > 0) updated++;
      } else if (u.role === "supervisor") {
        const r = await db.update(circlesTable)
          .set({ supervisorId: u.id })
          .where(and(eq(circlesTable.id, u.circleId), isNull(circlesTable.supervisorId)));
        if ((r as any).rowCount > 0) updated++;
      }
    }
    if (updated > 0) logger.info({ updated }, "Synced circle staff (teacher/supervisor) links");
  } catch (err) {
    logger.error({ err }, "Failed to sync circle staff");
  }
}

// إضافة عمود student_id إلى جدول users وربط الحسابات الموجودة تلقائياً
async function migrateAndLinkStudentIds() {
  try {
    // 1. إضافة العمود إذا لم يكن موجوداً
    await db.execute(sql.raw(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS student_id integer REFERENCES students(id)
    `));

    // 1-b. إصلاح circle_id للطالبات اللي نُقلن من حلقة التسجيل لحلقتهن الحقيقية
    //      المنطق: لو الحساب لا يزال مشيراً لحلقة التسجيل (أو circle_id=NULL)
    //              ويوجد سجل نقل من تلك الحلقة باسم الطالبة → نحدّث circle_id للحلقة الجديدة
    await db.execute(sql.raw(`
      WITH latest_transfers AS (
        SELECT DISTINCT ON (st.student_id)
          st.student_id,
          st.from_circle_id,
          st.to_circle_id,
          TRIM(s.full_name) AS full_name
        FROM student_transfers st
        JOIN students s ON s.id = st.student_id AND s.is_archived = false
        JOIN circles from_c ON from_c.id = st.from_circle_id AND from_c.track_type = 'registration'
        WHERE s.circle_id = st.to_circle_id
        ORDER BY st.student_id, st.id DESC
      )
      UPDATE users u
      SET circle_id  = lt.to_circle_id,
          student_id = lt.student_id
      FROM latest_transfers lt
      WHERE u.role = 'student'
        AND u.is_archived = false
        AND TRIM(u.name) = lt.full_name
        AND (u.circle_id = lt.from_circle_id OR u.circle_id IS NULL)
        AND (u.student_id IS NULL OR u.student_id = lt.student_id)
        -- أمان: اسم الطالبة فريد في سجلات النقل (لا لبس)
        AND (SELECT COUNT(*) FROM latest_transfers WHERE full_name = TRIM(u.name)) = 1
    `));

    // 2. ربط الحسابات بالاسم (TRIM) + circleId المباشر على جدول students
    await db.execute(sql.raw(`
      UPDATE users u
      SET student_id = s.id
      FROM students s
      WHERE u.role = 'student'
        AND u.student_id IS NULL
        AND u.is_archived = false
        AND TRIM(s.full_name) = TRIM(u.name)
        AND s.circle_id = u.circle_id
        AND s.is_archived = false
    `));

    // 3. ربط الحسابات عبر student_enrollments (النظام الجديد)
    await db.execute(sql.raw(`
      UPDATE users u
      SET student_id = se.student_id
      FROM student_enrollments se
      INNER JOIN students s ON s.id = se.student_id AND s.is_archived = false
      WHERE u.role = 'student'
        AND u.student_id IS NULL
        AND u.is_archived = false
        AND TRIM(s.full_name) = TRIM(u.name)
        AND se.circle_id = u.circle_id
        AND se.is_archived = false
    `));

    // 4. ربط ما تبقى بالاسم (TRIM) فقط — فقط إذا كان الاسم فريداً (لتجنب الربط الخاطئ)
    await db.execute(sql.raw(`
      UPDATE users u
      SET student_id = s.id
      FROM (
        SELECT id, TRIM(full_name) as trimmed_name
        FROM students
        WHERE is_archived = false
          AND TRIM(full_name) IN (
            SELECT TRIM(full_name) FROM students WHERE is_archived = false
            GROUP BY TRIM(full_name) HAVING COUNT(*) = 1
          )
      ) s
      WHERE u.role = 'student'
        AND u.student_id IS NULL
        AND u.is_archived = false
        AND TRIM(u.name) = s.trimmed_name
    `));

    // 6. بعد الربط: اكمل circle_id في users من سجل الطالبة (للطالبات القديمات التي circle_id=NULL)
    //    تنبيه: لا تكتب فوق circle_id إذا كانت الطالبة مسجّلة في أكثر من حلقة (لتجنب الربط الخاطئ)
    await db.execute(sql.raw(`
      UPDATE users u
      SET circle_id = s.circle_id
      FROM students s
      WHERE u.role = 'student'
        AND u.student_id = s.id
        AND u.circle_id IS NULL
        AND s.circle_id IS NOT NULL
        AND s.is_archived = false
        AND u.is_archived = false
        -- فقط للطالبات في حلقة واحدة (لا غموض في الربط)
        AND (
          SELECT COUNT(*)
          FROM student_enrollments se_check
          WHERE se_check.student_id = s.id AND se_check.is_archived = false
        ) <= 1
    `));

    // 7. circle_id عبر student_enrollments لمن لا يزال circle_id=NULL
    //    استخدام DISTINCT ON لضمان اختيار حدّد واحد فقط لكل حساب
    //    تنبيه: لا تعيّن إذا كانت الطالبة في أكثر من حلقة (circle_id يبقى NULL ويُصحَّح يدوياً)
    await db.execute(sql.raw(`
      UPDATE users u
      SET circle_id = se.circle_id
      FROM student_enrollments se
      WHERE u.role = 'student'
        AND u.student_id = se.student_id
        AND u.circle_id IS NULL
        AND se.is_archived = false
        AND u.is_archived = false
        -- فقط إذا كان للطالبة تسجيل في حلقة واحدة فقط (لتجنب الربط العشوائي)
        AND (
          SELECT COUNT(*)
          FROM student_enrollments se2
          WHERE se2.student_id = u.student_id AND se2.is_archived = false
        ) = 1
    `))

    const result = await db.execute(sql.raw(
      `SELECT
         COUNT(*) FILTER (WHERE student_id IS NOT NULL) as linked,
         COUNT(*) FILTER (WHERE circle_id IS NOT NULL) as with_circle,
         COUNT(*) as total
       FROM users WHERE role = 'student' AND is_archived = false`
    ));
    const row = (result as any).rows?.[0] ?? {};
    logger.info({ linked: row.linked, with_circle: row.with_circle, total: row.total }, "student_id migration complete");
  } catch (err: any) {
    logger.warn({ msg: err?.message?.slice(0, 200) }, "student_id migration skipped");
  }
}

async function ensureRegistrationCircle() {
  try {
    const existing = await db.select({ id: circlesTable.id }).from(circlesTable).where(eq(circlesTable.trackType, "registration"));
    if (existing.length === 0) {
      await db.insert(circlesTable).values({
        name: "تسجيل",
        track: "تسجيل",
        trackType: "registration",
        isArchived: false,
      });
      logger.info("Registration holding circle created automatically");
    }
  } catch (err) {
    logger.error({ err }, "Failed to ensure registration circle");
  }
}

// رصد سجلات الطالبات المكررة (نفس الاسم في جدول students) — لا يُنفَّذ أي دمج
// أو أرشفة تلقائية إطلاقًا. ثبت أن الاعتماد على تطابق الاسم وحده (حتى مع فحص
// الحلقة) قد يؤدي لأرشفة طالبة حقيقية نشطة دون أي تدخل بشري. الأرشفة يجب أن
// تحدث فقط بفعل فاعل حقيقي (قائدة/مسؤولة مسار) عبر شاشة الدمج اليدوي. هنا
// فقط نسجّل الحالات المحتملة بالـ log لمراجعتها يدويًا.
async function mergeDuplicateStudents() {
  try {
    const dupsResult = await db.execute(sql.raw(`
      SELECT TRIM(full_name) AS name, array_agg(id ORDER BY id) AS ids
      FROM students
      WHERE is_archived = false
      GROUP BY TRIM(full_name)
      HAVING COUNT(*) > 1
    `));
    const groups = (dupsResult as any).rows ?? [];
    if (groups.length === 0) {
      logger.info("No duplicate student records found");
      return;
    }

    for (const group of groups) {
      const ids: number[] = group.ids;
      const canonicalId = ids[0]; // أقدم سجل — لأغراض العرض بالـ log فقط
      const dupIds = ids.slice(1);

      for (const dupId of dupIds) {
        const canonicalPhoneResult = await db.execute(sql.raw(
          `SELECT phone FROM students WHERE id = ${canonicalId}`
        ));
        const canonicalPhone: string | null = (canonicalPhoneResult as any).rows?.[0]?.phone ?? null;
        const dupPhoneResult = await db.execute(sql.raw(
          `SELECT phone FROM students WHERE id = ${dupId}`
        ));
        const dupPhone: string | null = (dupPhoneResult as any).rows?.[0]?.phone ?? null;
        const phonesMatch = Boolean(canonicalPhone && dupPhone && canonicalPhone.trim() === dupPhone.trim());
        logger.warn(
          { canonicalId, dupId, canonicalPhone, dupPhone, phonesMatch, name: group.name },
          "mergeDuplicateStudents: possible duplicate detected — NOT merged automatically, review manually"
        );
      }
    }

    logger.info({ groups: groups.length }, "mergeDuplicateStudents: candidate groups logged for manual review (auto-merge disabled)");
  } catch (err) {
    logger.error({ err }, "Failed to scan duplicate students");
  }
}


async function seedLeader() {
  try {
    const configuredEmail = process.env.INITIAL_ADMIN_EMAIL?.trim().toLowerCase();
    const email = configuredEmail || "sana.qur3n@gmail.com";
    const name = process.env.VITE_SCHOOL_NAME || (configuredEmail ? "المشرفة العامة" : "سنا");
    // The old hardcoded fallback password ("mnbvcxzrr") is gone even for the
    // no-env-configured case — a leader account is only auto-created here if
    // an explicit INITIAL_ADMIN_PASSWORD is provided.
    const initialPassword = process.env.INITIAL_ADMIN_PASSWORD || null;

    if (!initialPassword) {
      logger.warn("INITIAL_ADMIN_PASSWORD is not configured; initial leader was not created");
      return;
    }

    const existing = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(and(eq(usersTable.email, email), eq(usersTable.role, "leader")));

    if (existing.length === 0) {
      await db.insert(usersTable).values({
        email,
        name,
        passwordHash: hashPassword(initialPassword),
        role: "leader",
      });
      logger.info({ email }, "Leader account created automatically");
    } else {
      logger.info({ email }, "Leader account already exists");
    }
  } catch (err) {
    logger.error({ err }, "Failed to seed leader account");
  }
}

const rawPort = process.env["PORT"] ?? "3001";

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// review_plans must be migrated before accepting requests because girls-plan
// reads include the immutable source snapshot column.
void Promise.all([migrateStudentMemorizations(), migrateReviewPlansTable()]).then(() => app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  // دوال المخطط والإعدادات — مستقلة، تشتغل معاً
  void migrateGlobalSettings();
  void migrateExamRotationsScope();
  void migrateRecordsUniqueConstraint();
  void normalizeEmails();
  void repairMissingEnrollments();
  void syncCircleStaff();
  void syncStudentUserCircleIds();
  void ensureRegistrationCircle();
  // دوال بيانات الطالبات — يجب أن تشتغل بالترتيب:
  // 1) ربط student_id
  // 2) دمج النسخ المكررة الحقيقية فقط (بعد الحماية الجديدة)
  void (async () => {
    await migrateAndLinkStudentIds();
    await seedLeader();
    await mergeDuplicateStudents();
  })();

  // النسخ الاحتياطي: كان يحفظ ملف Excel على قرص Render المؤقت (يُمحى مع كل إعادة تشغيل)؛
  // البديل الفعلي: .github/workflows/weekly-backup.yml (نسخة كاملة مشفّرة كل جمعة).

  // وسام "قمر الأسبوع" التلقائي: يشتغل كل جمعة (بعد ما ينتهي أسبوع العمل الأحد-الخميس)
  cron.schedule("0 3 * * 5", () => {
    logger.info("Starting weekly moon badge award...");
    runWeeklyMoonBadgeAward()
      .then(() => logger.info("Weekly moon badge award completed"))
      .catch((e: unknown) => logger.error({ err: e }, "Weekly moon badge award failed"));
  }, { timezone: "Asia/Riyadh" });
  logger.info("Weekly moon badge cron scheduled (Fridays 3:00 AM Riyadh time)");
})).catch(err => {
  logger.fatal({ err }, "Cannot start without student_memorizations migration");
  process.exit(1);
});
