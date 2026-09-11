ALTER TABLE "data_entry_sessions"
  ADD COLUMN IF NOT EXISTS "supervisor_name_id" integer;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "data_entry_sessions_supervisor_name_idx"
  ON "data_entry_sessions" ("supervisor_name_id", "date");
