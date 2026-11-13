-- حسابات الطالبات التي بقيت «بلا حلقة» أو على قائمة التسجيل بعد إضافتهن إلى حلقة فعلية (مرة واحدة):
-- يُنقل الحساب إلى حلقتها الحالية (الأساسية أولًا)، وإن كان لها حساب هناك بنفس البريد يُوقف المكرر.

UPDATE "users" u SET "is_archived" = true
WHERE u."role" = 'student' AND u."is_archived" = false AND u."student_id" IS NOT NULL
  AND (u."circle_id" IS NULL OR u."circle_id" IN (SELECT "id" FROM "circles" WHERE "track_type" = 'registration'))
  AND EXISTS (
    SELECT 1 FROM "users" o
    JOIN "student_enrollments" e ON e."student_id" = o."student_id" AND e."circle_id" = o."circle_id" AND e."is_archived" = false
    JOIN "circles" c ON c."id" = e."circle_id" AND c."track_type" IS DISTINCT FROM 'registration'
    WHERE o."id" <> u."id" AND o."role" = 'student' AND o."is_archived" = false
      AND o."student_id" = u."student_id" AND lower(o."email") = lower(u."email")
  );
--> statement-breakpoint

UPDATE "users" u SET "circle_id" = (
  SELECT e."circle_id" FROM "student_enrollments" e
  JOIN "students" s ON s."id" = e."student_id"
  JOIN "circles" c ON c."id" = e."circle_id"
  WHERE e."student_id" = u."student_id" AND e."is_archived" = false AND c."track_type" IS DISTINCT FROM 'registration'
  ORDER BY (e."circle_id" = s."circle_id") DESC, e."id"
  LIMIT 1
)
WHERE u."role" = 'student' AND u."is_archived" = false AND u."student_id" IS NOT NULL
  AND (u."circle_id" IS NULL OR u."circle_id" IN (SELECT "id" FROM "circles" WHERE "track_type" = 'registration'))
  AND EXISTS (
    SELECT 1 FROM "student_enrollments" e
    JOIN "circles" c ON c."id" = e."circle_id"
    WHERE e."student_id" = u."student_id" AND e."is_archived" = false AND c."track_type" IS DISTINCT FROM 'registration'
  );
--> statement-breakpoint

-- عضوية قائمة التسجيل لمن صارت في حلقة فعلية تُحذف (لا تبقى في القائمة)
DELETE FROM "student_enrollments" e
WHERE e."circle_id" IN (SELECT "id" FROM "circles" WHERE "track_type" = 'registration')
  AND EXISTS (
    SELECT 1 FROM "student_enrollments" a
    JOIN "circles" c ON c."id" = a."circle_id"
    WHERE a."student_id" = e."student_id" AND a."is_archived" = false AND c."track_type" IS DISTINCT FROM 'registration'
  );
