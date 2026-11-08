-- المعلمة والمشرفة تُحسبان بعينهما (لا بالحلقة): كل غياب/تأخر/مهمة يحمل الشخص الفعلي يومها،
-- فينتقل سجلها وأوسمتها معها إن انتقلت من حلقة لأخرى.
ALTER TABLE "teacher_absences" ADD COLUMN IF NOT EXISTS "teacher_id" integer;
--> statement-breakpoint
-- مصدر الغياب: entry = من إدخال الأنصبة، tasks = من مهام مسؤولة المسار اليومية
ALTER TABLE "teacher_absences" ADD COLUMN IF NOT EXISTS "source" text NOT NULL DEFAULT 'entry';
--> statement-breakpoint
ALTER TABLE "daily_circle_tasks" ADD COLUMN IF NOT EXISTS "teacher_id" integer;
--> statement-breakpoint
ALTER TABLE "daily_circle_tasks" ADD COLUMN IF NOT EXISTS "supervisor_id" integer;
--> statement-breakpoint
-- البيانات القديمة: أفضل تقدير = معلمة/مشرفة الحلقة الحالية
UPDATE "teacher_absences" ta SET "teacher_id" = c."teacher_id"
  FROM "circles" c WHERE ta."circle_id" = c."id" AND ta."teacher_id" IS NULL;
--> statement-breakpoint
UPDATE "daily_circle_tasks" t SET "teacher_id" = c."teacher_id", "supervisor_id" = c."supervisor_id"
  FROM "circles" c WHERE t."circle_id" = c."id" AND t."teacher_id" IS NULL AND t."supervisor_id" IS NULL;
--> statement-breakpoint
-- توحيد مصدرَي الغياب: غياب مسجّل في المهام اليومية يصير صفًّا واحدًا في غياب المعلمات
-- (القيد الفريد على الحلقة واليوم يمنع غيابين في اليوم نفسه)
INSERT INTO "teacher_absences" ("circle_id", "date", "reported_by_id", "teacher_id", "source")
  SELECT t."circle_id", t."date", COALESCE((SELECT "id" FROM "users" WHERE "role" = 'leader' ORDER BY "id" LIMIT 1), 0), t."teacher_id", 'tasks'
  FROM "daily_circle_tasks" t WHERE t."teacher_attendance" = 'absent'
  ON CONFLICT ("circle_id", "date") DO NOTHING;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "teacher_absences_teacher_date_idx" ON "teacher_absences" ("teacher_id", "date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "daily_circle_tasks_teacher_idx" ON "daily_circle_tasks" ("teacher_id", "date");
