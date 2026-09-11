-- =============================================
-- مقرأة سنا الآي — Schema كامل لـ Supabase
-- نفّذي هذا الملف من Supabase > SQL Editor
-- =============================================

CREATE TABLE IF NOT EXISTS "users" (
  "id" serial PRIMARY KEY,
  "email" text NOT NULL,
  "name" text NOT NULL,
  "password_hash" text NOT NULL,
  "role" text NOT NULL DEFAULT 'student',
  "track" text,
  "circle_id" integer,
  "phone" text,
  "country" text,
  "age_range" text,
  "education_level" text,
  "is_archived" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "users_email_role_unique_idx" ON "users" ("email", "role");

CREATE TABLE IF NOT EXISTS "tracks" (
  "id" serial PRIMARY KEY,
  "name" text NOT NULL UNIQUE,
  "data_entry_type" text NOT NULL DEFAULT 'girls',
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "circles" (
  "id" serial PRIMARY KEY,
  "name" text NOT NULL,
  "track" text NOT NULL,
  "track_type" text NOT NULL DEFAULT 'girls',
  "track_id" integer,
  "teacher_id" integer,
  "supervisor_id" integer,
  "meeting_time" text,
  "whatsapp_link" text,
  "new_student_capacity" integer,
  "is_archived" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "students" (
  "id" serial PRIMARY KEY,
  "full_name" text NOT NULL,
  "circle_id" integer,
  "phone" text,
  "country" text,
  "age_range" text,
  "education_level" text,
  "memorize_from" text,
  "extra_data" text,
  "is_archived" boolean NOT NULL DEFAULT false,
  "leave_start" text,
  "leave_end" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "student_leave_history" (
  "id" serial PRIMARY KEY,
  "student_id" integer NOT NULL,
  "leave_start" text NOT NULL,
  "leave_end" text NOT NULL,
  "granted_by_id" integer,
  "granted_at" timestamptz NOT NULL DEFAULT now(),
  "cancelled_at" timestamptz,
  "cancelled_by_id" integer
);

CREATE TABLE IF NOT EXISTS "student_transfers" (
  "id" serial PRIMARY KEY,
  "student_id" integer NOT NULL,
  "from_circle_id" integer,
  "to_circle_id" integer NOT NULL,
  "transferred_by_id" integer NOT NULL,
  "note" text,
  "transferred_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "student_notes" (
  "id" serial PRIMARY KEY,
  "student_id" integer NOT NULL,
  "author_id" integer NOT NULL,
  "content" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "messages" (
  "id" serial PRIMARY KEY,
  "sender_id" integer NOT NULL,
  "target_type" text NOT NULL,
  "target_id" text NOT NULL,
  "content" text NOT NULL,
  "expires_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "records" (
  "id" serial PRIMARY KEY,
  "student_id" integer NOT NULL,
  "circle_id" integer NOT NULL,
  "entered_by_id" integer NOT NULL,
  "date" text NOT NULL,
  "is_absent" boolean NOT NULL DEFAULT false,
  "memorize_surah_start" text,
  "memorize_ayah_start" integer,
  "memorize_surah_end" text,
  "memorize_ayah_end" integer,
  "memorize_pages" real,
  "review_near_surah_start" text,
  "review_near_ayah_start" integer,
  "review_near_surah_end" text,
  "review_near_ayah_end" integer,
  "review_near_pages" real,
  "review_far_surah_start" text,
  "review_far_ayah_start" integer,
  "review_far_surah_end" text,
  "review_far_ayah_end" integer,
  "review_far_pages" real,
  "review_surah_start" text,
  "review_ayah_start" integer,
  "review_surah_end" text,
  "review_ayah_end" integer,
  "review_pages" real,
  "recitation_surah_start" text,
  "recitation_ayah_start" integer,
  "recitation_surah_end" text,
  "recitation_ayah_end" integer,
  "recitation_pages" real,
  "repetitions" integer,
  "listened_to_reciter" boolean,
  "shortcoming_override" boolean,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "registration_settings" (
  "id" serial PRIMARY KEY,
  "is_open" boolean NOT NULL DEFAULT false,
  "staff_registration_open" boolean NOT NULL DEFAULT true,
  "existing_student_reg_open" boolean NOT NULL DEFAULT false,
  "deadline" text,
  "custom_questions" text,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- Insert default row so app finds settings
INSERT INTO "registration_settings" ("is_open") VALUES (false) ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS "teacher_absences" (
  "id" serial PRIMARY KEY,
  "circle_id" integer NOT NULL,
  "date" text NOT NULL,
  "reported_by_id" integer NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("circle_id", "date")
);

CREATE TABLE IF NOT EXISTS "track_supervisor_names" (
  "id" serial PRIMARY KEY,
  "track_id" integer NOT NULL,
  "name" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "daily_circle_tasks" (
  "id" serial PRIMARY KEY,
  "circle_id" integer NOT NULL,
  "date" text NOT NULL,
  "supervisor_name_id" integer NOT NULL,
  "teacher_attendance" text NOT NULL,
  "prep_status" text NOT NULL,
  "motivation_status" text NOT NULL,
  "report_status" text NOT NULL,
  "circle_absence_count" integer NOT NULL DEFAULT 0,
  "notes" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("circle_id", "date", "supervisor_name_id")
);

CREATE TABLE IF NOT EXISTS "custom_questions" (
  "id" serial PRIMARY KEY,
  "question" text NOT NULL,
  "date_from" text NOT NULL,
  "date_to" text NOT NULL,
  "created_by_id" integer NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "custom_question_answers" (
  "id" serial PRIMARY KEY,
  "question_id" integer NOT NULL,
  "supervisor_name_id" integer NOT NULL,
  "date" text NOT NULL,
  "answer" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("question_id", "supervisor_name_id", "date")
);

CREATE TABLE IF NOT EXISTS "calendar_events" (
  "id" serial PRIMARY KEY,
  "title" text NOT NULL,
  "date" text NOT NULL,
  "end_date" text,
  "color" text NOT NULL DEFAULT '#6366f1',
  "event_type" text NOT NULL DEFAULT 'general',
  "description" text,
  "created_by_id" integer NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "store_products" (
  "id" serial PRIMARY KEY,
  "title" text NOT NULL,
  "description" text,
  "price" text NOT NULL,
  "image_url" text,
  "whatsapp_number" text NOT NULL,
  "category" text,
  "is_active" boolean NOT NULL DEFAULT true,
  "display_order" integer NOT NULL DEFAULT 0,
  "created_by_id" integer NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "exam_records" (
  "id" serial PRIMARY KEY,
  "student_id" integer NOT NULL,
  "examiner_id" integer NOT NULL,
  "date" text NOT NULL,
  "juz_number" integer,
  "responded" boolean NOT NULL DEFAULT false,
  "grade" text,
  "notes" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "badge_events" (
  "id" serial PRIMARY KEY,
  "name" text NOT NULL,
  "description" text,
  "emoji" text NOT NULL DEFAULT '🏅',
  "color" text NOT NULL DEFAULT '#f59e0b',
  "target_type" text NOT NULL,
  "date_from" text NOT NULL,
  "date_to" text NOT NULL,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_by_id" integer NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "badge_assignments" (
  "id" serial PRIMARY KEY,
  "badge_event_id" integer NOT NULL,
  "entity_type" text NOT NULL,
  "entity_id" integer NOT NULL,
  "entity_name" text NOT NULL,
  "notes" text,
  "created_by_id" integer NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "exam_rotations" (
  "id" serial PRIMARY KEY,
  "name" text NOT NULL,
  "start_date" text NOT NULL,
  "end_date" text NOT NULL,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_by_id" integer NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "exam_teacher_assignments" (
  "id" serial PRIMARY KEY,
  "rotation_id" integer NOT NULL,
  "teacher_id" integer NOT NULL,
  "original_circle_id" integer NOT NULL,
  "exam_circle_id" integer NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "review_plans" (
  "id" serial PRIMARY KEY,
  "student_id" integer NOT NULL,
  "circle_id" integer NOT NULL,
  "plan_type" text NOT NULL,
  "status" text NOT NULL DEFAULT 'active',
  "quota_type" text,
  "quota_juz" integer,
  "quota_surah_start" text,
  "quota_ayah_start" integer,
  "quota_surah_end" text,
  "quota_ayah_end" integer,
  "plan_mode" text,
  "total_pages" real,
  "quantity" text,
  "start_date" text NOT NULL,
  "theme_color" text NOT NULL DEFAULT '#E8D5F5',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "review_plan_days" (
  "id" serial PRIMARY KEY,
  "plan_id" integer NOT NULL,
  "day_number" integer NOT NULL,
  "surah_start" text,
  "ayah_start" integer,
  "surah_end" text,
  "ayah_end" integer,
  "pages" real,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
