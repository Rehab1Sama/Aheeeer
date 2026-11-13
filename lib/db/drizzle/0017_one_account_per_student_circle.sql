-- حساب دخول واحد للطالبة في الحلقة الواحدة (ولو اختلف البريد): يبقى الأحدث دخولًا وتُوقف البقية.
-- من يدخل بحساب موقوف يُحوَّل تلقائيًا إلى حسابها النشط.
UPDATE "users" u SET "is_archived" = true
WHERE u."id" IN (
  SELECT "id" FROM (
    SELECT "id", row_number() OVER (
      PARTITION BY "student_id", "circle_id"
      ORDER BY "last_login_at" DESC NULLS LAST, "id" DESC
    ) AS rn
    FROM "users"
    WHERE "role" = 'student' AND "is_archived" = false AND "student_id" IS NOT NULL AND "circle_id" IS NOT NULL
  ) x
  WHERE x.rn > 1
);
