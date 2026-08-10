ALTER TABLE "room" ADD COLUMN IF NOT EXISTS "last_human_action_at" timestamp with time zone DEFAULT now() NOT NULL;

UPDATE "room" SET "last_human_action_at" = "created_at" WHERE "last_human_action_at" IS NULL;
