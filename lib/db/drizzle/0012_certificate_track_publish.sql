-- نشر الشهادات لكل مسار على حدة: أسماء المسارات المنشورة في الفصل
ALTER TABLE "certificate_terms" ADD COLUMN IF NOT EXISTS "published_tracks" jsonb NOT NULL DEFAULT '[]'::jsonb;
