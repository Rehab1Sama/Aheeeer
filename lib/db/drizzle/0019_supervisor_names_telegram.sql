ALTER TABLE "track_supervisor_names" ADD COLUMN IF NOT EXISTS "telegram_chat_id" text;
--> statement-breakpoint
ALTER TABLE "track_supervisor_names" ADD COLUMN IF NOT EXISTS "telegram_link_token" text;
