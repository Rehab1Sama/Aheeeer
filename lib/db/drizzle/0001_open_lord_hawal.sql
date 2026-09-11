CREATE TABLE "student_archive_events" (
        "id" serial PRIMARY KEY NOT NULL,
        "student_id" integer NOT NULL,
        "event_type" text NOT NULL,
        "circle_id_at_time" integer,
        "performed_by_id" integer,
        "event_date" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "student_enrollments" (
        "id" serial PRIMARY KEY NOT NULL,
        "student_id" integer NOT NULL,
        "circle_id" integer NOT NULL,
        "is_archived" boolean DEFAULT false NOT NULL,
        "archived_at" timestamp with time zone,
        "leave_start" text,
        "leave_end" text,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
        CONSTRAINT "student_circle_unique" UNIQUE("student_id","circle_id")
);
--> statement-breakpoint
CREATE TABLE "student_leave_history" (
        "id" serial PRIMARY KEY NOT NULL,
        "student_id" integer NOT NULL,
        "leave_start" text NOT NULL,
        "leave_end" text NOT NULL,
        "granted_by_id" integer,
        "granted_at" timestamp with time zone DEFAULT now() NOT NULL,
        "cancelled_at" timestamp with time zone,
        "cancelled_by_id" integer
);
--> statement-breakpoint
CREATE TABLE "plan_notifications" (
        "id" serial PRIMARY KEY NOT NULL,
        "student_id" integer NOT NULL,
        "student_name" text NOT NULL,
        "circle_id" integer NOT NULL,
        "circle_name" text NOT NULL,
        "track" text NOT NULL,
        "type" text DEFAULT 'plan_created' NOT NULL,
        "cycle_count" integer DEFAULT 1 NOT NULL,
        "total_pages" real DEFAULT 0 NOT NULL,
        "is_read" boolean DEFAULT false NOT NULL,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deputy_tasks" (
        "id" serial PRIMARY KEY NOT NULL,
        "title" text NOT NULL,
        "description" text,
        "task_type" text DEFAULT 'general' NOT NULL,
        "answer_type" text DEFAULT 'text' NOT NULL,
        "select_options" text,
        "response" text,
        "is_completed" boolean DEFAULT false NOT NULL,
        "completed_at" timestamp with time zone,
        "created_by_id" integer NOT NULL,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deputy_circle_visits" (
        "id" serial PRIMARY KEY NOT NULL,
        "circle_id" integer NOT NULL,
        "visit_date" text NOT NULL,
        "notes" text,
        "created_by_id" integer NOT NULL,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "low_memorization_alerts" (
        "id" serial PRIMARY KEY NOT NULL,
        "student_id" integer NOT NULL,
        "student_name" text NOT NULL,
        "circle_id" integer NOT NULL,
        "circle_name" text NOT NULL,
        "track" text NOT NULL,
        "track_type" text DEFAULT 'girls' NOT NULL,
        "total_pages" real DEFAULT 0 NOT NULL,
        "period_days" integer DEFAULT 14 NOT NULL,
        "is_read" boolean DEFAULT false NOT NULL,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_entry_circle_assignments" (
        "id" serial PRIMARY KEY NOT NULL,
        "data_entry_user_id" integer NOT NULL,
        "circle_id" integer NOT NULL,
        "assigned_by_id" integer NOT NULL,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_entry_sessions" (
        "id" serial PRIMARY KEY NOT NULL,
        "user_id" integer NOT NULL,
        "date" text NOT NULL,
        "morning_minutes" real DEFAULT 0 NOT NULL,
        "evening_minutes" real DEFAULT 0 NOT NULL,
        "last_heartbeat_at" timestamp with time zone,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whitelabel_configs" (
        "id" serial PRIMARY KEY NOT NULL,
        "school_name" text NOT NULL,
        "school_tagline" text DEFAULT 'نظام إدارة المقرأة',
        "logo_url" text,
        "admin_email" text,
        "primary_hsl" text DEFAULT '210 51% 21%' NOT NULL,
        "secondary_hsl" text DEFAULT '177 35% 57%' NOT NULL,
        "sidebar_hsl" text DEFAULT '210 51% 21%' NOT NULL,
        "enabled_features" text DEFAULT '[]' NOT NULL,
        "data_entry_roles" text DEFAULT '["teacher","supervisor","data_entry"]' NOT NULL,
        "role_names" text DEFAULT '{}' NOT NULL,
        "track_types" text DEFAULT '[]' NOT NULL,
        "circle_genders" text DEFAULT '["girls"]' NOT NULL,
        "render_service_id" text,
        "render_db_id" text,
        "render_service_url" text,
        "deploy_status" text DEFAULT 'draft' NOT NULL,
        "deploy_error" text,
        "custom_database_url" text,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "users_email_role_unique_idx";--> statement-breakpoint
ALTER TABLE "custom_question_answers" ALTER COLUMN "supervisor_name_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "review_plans" ALTER COLUMN "theme" SET DEFAULT '{"primaryColor":"#a78bdb","secondaryColor":"#f3f0fd","accentColor":"#5b21b6","bgPattern":"plain","fontStyle":"rounded"}'::jsonb;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "registration_status" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_verification_token" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "password_reset_token" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "password_reset_token_expiry" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "extra_data" text;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "is_newcomer" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "registration_settings" ADD COLUMN "auto_approve_students" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "registration_settings" ADD COLUMN "start_date" text;--> statement-breakpoint
ALTER TABLE "registration_settings" ADD COLUMN "staff_custom_questions" text;--> statement-breakpoint
ALTER TABLE "custom_question_answers" ADD COLUMN "track_id" integer;--> statement-breakpoint
ALTER TABLE "custom_questions" ADD COLUMN "question_type" text DEFAULT 'individual' NOT NULL;--> statement-breakpoint
ALTER TABLE "custom_questions" ADD COLUMN "answer_type" text DEFAULT 'text' NOT NULL;--> statement-breakpoint
ALTER TABLE "custom_questions" ADD COLUMN "answer_options" text;--> statement-breakpoint
ALTER TABLE "review_plans" ADD COLUMN "previous_plans" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
-- Backfill: create enrollment records for every existing student that has a circle_id
INSERT INTO student_enrollments (student_id, circle_id, is_archived, archived_at, leave_start, leave_end, created_at, updated_at)
SELECT
  id,
  circle_id,
  is_archived,
  archived_at,
  leave_start,
  leave_end,
  created_at,
  NOW()
FROM students
WHERE circle_id IS NOT NULL
ON CONFLICT (student_id, circle_id) DO NOTHING;