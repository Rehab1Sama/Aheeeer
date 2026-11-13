-- تنظيف بقايا النقل (مرة واحدة): لا تبقى الطالبة المنقولة في حلقتها القديمة ولا أرشيفها،
-- ولا يبقى لها حساب دخول يشير إلى حلقة لم تعد فيها، ولا حسابات مكررة في الحلقة نفسها.

-- ١) ربط حسابات الطالبات غير المربوطة بسجلها، إن طابق الاسم طالبة واحدة مسجَّلة في حلقة الحساب
UPDATE "users" u SET "student_id" = m."sid"
FROM (
  SELECT u2."id" AS "uid", MIN(s."id") AS "sid"
  FROM "users" u2
  JOIN "student_enrollments" e ON e."circle_id" = u2."circle_id" AND e."is_archived" = false
  JOIN "students" s ON s."id" = e."student_id" AND s."is_archived" = false AND trim(s."full_name") = trim(u2."name")
  WHERE u2."role" = 'student' AND u2."is_archived" = false AND u2."student_id" IS NULL
  GROUP BY u2."id"
  HAVING COUNT(DISTINCT s."id") = 1
) m
WHERE u."id" = m."uid";
--> statement-breakpoint

-- ٢) حذف عضويات الحلقات المؤرشفة التي نُقلت منها الطالبة (أو قائمة التسجيل) وهي مسجَّلة الآن في حلقة أخرى
DELETE FROM "student_enrollments" e
WHERE e."is_archived" = true
  AND (
    EXISTS (SELECT 1 FROM "student_transfers" t WHERE t."student_id" = e."student_id" AND t."from_circle_id" = e."circle_id")
    OR e."circle_id" IN (SELECT c."id" FROM "circles" c WHERE c."track_type" = 'registration')
  )
  AND EXISTS (
    SELECT 1 FROM "student_enrollments" a
    WHERE a."student_id" = e."student_id" AND a."is_archived" = false AND a."circle_id" <> e."circle_id"
  );
--> statement-breakpoint

-- ٣) إيقاف حساب يشير إلى حلقة لم تعد الطالبة فيها، إن كان لها بنفس البريد حساب في حلقة حالية
UPDATE "users" u SET "is_archived" = true
WHERE u."role" = 'student' AND u."is_archived" = false AND u."student_id" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "student_enrollments" e
    WHERE e."student_id" = u."student_id" AND e."circle_id" = u."circle_id" AND e."is_archived" = false
  )
  AND EXISTS (
    SELECT 1 FROM "users" o
    JOIN "student_enrollments" e2 ON e2."student_id" = o."student_id" AND e2."circle_id" = o."circle_id" AND e2."is_archived" = false
    WHERE o."id" <> u."id" AND o."role" = 'student' AND o."is_archived" = false
      AND o."student_id" = u."student_id" AND lower(o."email") = lower(u."email")
  );
--> statement-breakpoint

-- ٤) الحساب الوحيد الباقي على حلقة قديمة: يُنقل إلى حلقة حالية للطالبة (الأساسية أولًا)
UPDATE "users" u SET "circle_id" = (
  SELECT e."circle_id" FROM "student_enrollments" e
  JOIN "students" s ON s."id" = e."student_id"
  WHERE e."student_id" = u."student_id" AND e."is_archived" = false
  ORDER BY (e."circle_id" = s."circle_id") DESC, e."id"
  LIMIT 1
)
WHERE u."role" = 'student' AND u."is_archived" = false AND u."student_id" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "student_enrollments" e
    WHERE e."student_id" = u."student_id" AND e."circle_id" = u."circle_id" AND e."is_archived" = false
  )
  AND EXISTS (
    SELECT 1 FROM "student_enrollments" e
    WHERE e."student_id" = u."student_id" AND e."is_archived" = false
  );
--> statement-breakpoint

-- ٥) حساب واحد لكل (بريد، طالبة، حلقة): يبقى الأحدث دخولًا، وتُوقف البقية
UPDATE "users" u SET "is_archived" = true
WHERE u."id" IN (
  SELECT "id" FROM (
    SELECT "id", row_number() OVER (
      PARTITION BY lower("email"), "student_id", "circle_id"
      ORDER BY "last_login_at" DESC NULLS LAST, "id" DESC
    ) AS rn
    FROM "users"
    WHERE "role" = 'student' AND "is_archived" = false AND "student_id" IS NOT NULL
  ) x
  WHERE x.rn > 1
);
