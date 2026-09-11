CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" text DEFAULT 'student' NOT NULL,
	"track" text,
	"circle_id" integer,
	"phone" text,
	"country" text,
	"age_range" text,
	"education_level" text,
	"is_archived" boolean DEFAULT false NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tracks" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"data_entry_type" text DEFAULT 'girls' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tracks_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "circles" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"track" text NOT NULL,
	"track_type" text DEFAULT 'girls' NOT NULL,
	"track_id" integer,
	"teacher_id" integer,
	"supervisor_id" integer,
	"meeting_time" text,
	"whatsapp_link" text,
	"new_student_capacity" integer,
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"sender_id" integer NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"content" text NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "student_notes" (
	"id" serial PRIMARY KEY NOT NULL,
	"student_id" integer NOT NULL,
	"author_id" integer NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "student_transfers" (
	"id" serial PRIMARY KEY NOT NULL,
	"student_id" integer NOT NULL,
	"from_circle_id" integer,
	"to_circle_id" integer NOT NULL,
	"transferred_by_id" integer NOT NULL,
	"note" text,
	"transferred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "students" (
	"id" serial PRIMARY KEY NOT NULL,
	"full_name" text NOT NULL,
	"circle_id" integer,
	"phone" text,
	"country" text,
	"age_range" text,
	"education_level" text,
	"memorize_from" text,
	"extra_data" text,
	"is_archived" boolean DEFAULT false NOT NULL,
	"leave_start" text,
	"leave_end" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "records" (
	"id" serial PRIMARY KEY NOT NULL,
	"student_id" integer NOT NULL,
	"circle_id" integer NOT NULL,
	"entered_by_id" integer NOT NULL,
	"date" text NOT NULL,
	"is_absent" boolean DEFAULT false NOT NULL,
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
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "registration_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"is_open" boolean DEFAULT false NOT NULL,
	"staff_registration_open" boolean DEFAULT true NOT NULL,
	"existing_student_reg_open" boolean DEFAULT false NOT NULL,
	"deadline" text,
	"custom_questions" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teacher_absences" (
	"id" serial PRIMARY KEY NOT NULL,
	"circle_id" integer NOT NULL,
	"date" text NOT NULL,
	"reported_by_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "teacher_absences_circle_id_date_unique" UNIQUE("circle_id","date")
);
--> statement-breakpoint
CREATE TABLE "custom_question_answers" (
	"id" serial PRIMARY KEY NOT NULL,
	"question_id" integer NOT NULL,
	"supervisor_name_id" integer NOT NULL,
	"date" text NOT NULL,
	"answer" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "custom_question_answers_question_id_supervisor_name_id_date_unique" UNIQUE("question_id","supervisor_name_id","date")
);
--> statement-breakpoint
CREATE TABLE "custom_questions" (
	"id" serial PRIMARY KEY NOT NULL,
	"question" text NOT NULL,
	"date_from" text NOT NULL,
	"date_to" text NOT NULL,
	"created_by_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_circle_tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"circle_id" integer NOT NULL,
	"date" text NOT NULL,
	"supervisor_name_id" integer NOT NULL,
	"teacher_attendance" text NOT NULL,
	"prep_status" text NOT NULL,
	"motivation_status" text NOT NULL,
	"report_status" text NOT NULL,
	"circle_absence_count" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_circle_tasks_circle_id_date_supervisor_name_id_unique" UNIQUE("circle_id","date","supervisor_name_id")
);
--> statement-breakpoint
CREATE TABLE "track_supervisor_names" (
	"id" serial PRIMARY KEY NOT NULL,
	"track_id" integer NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calendar_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"date" text NOT NULL,
	"end_date" text,
	"color" text DEFAULT '#6366f1' NOT NULL,
	"event_type" text DEFAULT 'general' NOT NULL,
	"description" text,
	"created_by_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_products" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"price" text NOT NULL,
	"image_url" text,
	"whatsapp_number" text NOT NULL,
	"category" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_by_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exam_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"student_id" integer NOT NULL,
	"examiner_id" integer NOT NULL,
	"date" text NOT NULL,
	"juz_number" integer,
	"responded" boolean DEFAULT false NOT NULL,
	"grade" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "badge_assignments" (
	"id" serial PRIMARY KEY NOT NULL,
	"badge_event_id" integer NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" integer NOT NULL,
	"entity_name" text NOT NULL,
	"notes" text,
	"created_by_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "badge_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"emoji" text DEFAULT '🏅' NOT NULL,
	"color" text DEFAULT '#f59e0b' NOT NULL,
	"target_type" text NOT NULL,
	"date_from" text NOT NULL,
	"date_to" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exam_rotations" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"start_date" text NOT NULL,
	"end_date" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exam_teacher_assignments" (
	"id" serial PRIMARY KEY NOT NULL,
	"rotation_id" integer NOT NULL,
	"teacher_id" integer NOT NULL,
	"original_circle_id" integer NOT NULL,
	"exam_circle_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "student_goals" (
	"id" serial PRIMARY KEY NOT NULL,
	"student_id" integer NOT NULL,
	"title" text NOT NULL,
	"target_date" text,
	"notes" text,
	"motivational_message" text,
	"created_by_id" integer NOT NULL,
	"is_completed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"student_id" integer NOT NULL,
	"track_type" text NOT NULL,
	"plan_type" text DEFAULT 'auto' NOT NULL,
	"cycle_count" integer DEFAULT 1 NOT NULL,
	"total_pages" real NOT NULL,
	"cycle_length" integer DEFAULT 21 NOT NULL,
	"start_date" text NOT NULL,
	"current_cycle_start" text NOT NULL,
	"memorized_up_to_surah" text,
	"memorized_up_to_ayah" integer,
	"plan_entries" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"theme" jsonb DEFAULT '{"primaryColor":"#059669","secondaryColor":"#d1fae5","accentColor":"#065f46","bgPattern":"plain","fontStyle":"rounded"}'::jsonb NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "review_plans_student_id_unique" UNIQUE("student_id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_role_unique_idx" ON "users" USING btree ("email","role");