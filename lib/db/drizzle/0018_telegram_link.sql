ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "telegram_chat_id" text;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "telegram_link_token" text;
