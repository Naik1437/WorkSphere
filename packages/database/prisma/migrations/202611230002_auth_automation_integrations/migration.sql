CREATE TABLE "sessions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "user_id" UUID NOT NULL,
  "refresh_token_hash" VARCHAR(128) NOT NULL, "expires_at" TIMESTAMP(3) NOT NULL,
  "revoked_at" TIMESTAMP(3), "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "sessions_refresh_token_hash_key" ON "sessions"("refresh_token_hash");
CREATE INDEX "sessions_user_id_expires_at_idx" ON "sessions"("user_id", "expires_at");
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "invitations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "organization_id" UUID NOT NULL,
  "email" VARCHAR(320) NOT NULL, "role" "Role" NOT NULL DEFAULT 'MEMBER',
  "token_hash" VARCHAR(128) NOT NULL, "expires_at" TIMESTAMP(3) NOT NULL,
  "accepted_at" TIMESTAMP(3), CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "invitations_token_hash_key" ON "invitations"("token_hash");
CREATE UNIQUE INDEX "invitations_organization_id_email_key" ON "invitations"("organization_id", "email");
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "attachments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "task_id" UUID NOT NULL,
  "filename" VARCHAR(255) NOT NULL, "content_type" VARCHAR(127) NOT NULL,
  "storage_key" VARCHAR(512) NOT NULL, "size_bytes" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "attachments_storage_key_key" ON "attachments"("storage_key");
CREATE INDEX "attachments_task_id_idx" ON "attachments"("task_id");
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "notifications" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "user_id" UUID NOT NULL,
  "event_key" VARCHAR(128) NOT NULL, "channel" VARCHAR(32) NOT NULL, "payload" JSONB NOT NULL,
  "sent_at" TIMESTAMP(3), "failed_at" TIMESTAMP(3), "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "notifications_event_key_key" ON "notifications"("event_key");
CREATE INDEX "notifications_user_id_created_at_idx" ON "notifications"("user_id", "created_at");
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "jobs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "idempotency_key" VARCHAR(128) NOT NULL,
  "type" VARCHAR(64) NOT NULL, "payload" JSONB NOT NULL, "attempts" INTEGER NOT NULL DEFAULT 0,
  "available_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "completed_at" TIMESTAMP(3),
  "failed_at" TIMESTAMP(3), "last_error" TEXT, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "jobs_idempotency_key_key" ON "jobs"("idempotency_key");
CREATE INDEX "jobs_completed_at_available_at_idx" ON "jobs"("completed_at", "available_at");

CREATE TABLE "webhook_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "provider" VARCHAR(64) NOT NULL,
  "external_id" VARCHAR(255) NOT NULL, "payload" JSONB NOT NULL,
  "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "webhook_events_provider_external_id_key" ON "webhook_events"("provider", "external_id");
