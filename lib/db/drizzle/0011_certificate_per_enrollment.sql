-- الشهادة لكل تسجيل (طالبة + حلقة): الطالبة في حلقتين لها نتيجتان مستقلتان.
-- (لا توجد درجات محفوظة بعد، فتغيير القيد آمن)
ALTER TABLE "certificate_scores" DROP CONSTRAINT IF EXISTS "certificate_score_term_student_unique";
--> statement-breakpoint
ALTER TABLE "certificate_scores" DROP CONSTRAINT IF EXISTS "certificate_score_term_student_circle_unique";
--> statement-breakpoint
ALTER TABLE "certificate_scores" ADD CONSTRAINT "certificate_score_term_student_circle_unique" UNIQUE ("term_id", "student_id", "circle_id");
--> statement-breakpoint
-- نسخة النتيجة لحظة النشر
ALTER TABLE "certificate_scores" ADD COLUMN IF NOT EXISTS "snapshot" jsonb;
