CREATE TABLE IF NOT EXISTS "badge_award_counts" (
        "id" serial PRIMARY KEY NOT NULL,
        "entity_type" text NOT NULL,
        "entity_id" integer NOT NULL,
        "badge_id" text NOT NULL,
        "tier" integer NOT NULL DEFAULT 0,
        "count" integer NOT NULL DEFAULT 0,
        "last_period" text NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "badge_award_counts_entity_badge_idx"
  ON "badge_award_counts" ("entity_type", "entity_id", "badge_id");
