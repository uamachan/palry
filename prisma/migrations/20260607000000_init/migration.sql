-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "users" (
    "id" VARCHAR(80) NOT NULL,
    "source" VARCHAR(40) NOT NULL DEFAULT 'user',
    "is_legacy_profile" BOOLEAN NOT NULL DEFAULT false,
    "firebase_uid" VARCHAR(128),
    "email" VARCHAR(190),
    "name" VARCHAR(80) NOT NULL,
    "gender" VARCHAR(40),
    "riot_id" VARCHAR(80),
    "age" INTEGER,
    "age_range" VARCHAR(40),
    "region" VARCHAR(60),
    "rank" VARCHAR(60),
    "peak_rank" VARCHAR(60),
    "role" VARCHAR(60),
    "agents" JSONB,
    "tags" JSONB,
    "modes" JSONB,
    "reasons" JSONB,
    "x_handle" VARCHAR(80),
    "bio" TEXT,
    "profile_photo" TEXT,
    "voice_intro" TEXT,
    "voice" VARCHAR(120),
    "active_time" VARCHAR(120),
    "opener" TEXT,
    "match_score" INTEGER,
    "match_chance" DOUBLE PRECISION,
    "trust" INTEGER,
    "guarded" BOOLEAN,
    "plan" VARCHAR(20) NOT NULL DEFAULT 'FREE',
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "auto_hidden" BOOLEAN NOT NULL DEFAULT false,
    "auto_hidden_at" TIMESTAMPTZ(3),
    "auto_hidden_reporters" INTEGER,
    "agreed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3),
    "legacy_data" JSONB,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "likes" (
    "id" VARCHAR(80) NOT NULL,
    "from_user_id" VARCHAR(80) NOT NULL,
    "to_user_id" VARCHAR(80) NOT NULL,
    "type" VARCHAR(20) NOT NULL DEFAULT 'like',
    "plan" VARCHAR(20),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "likes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "received_likes" (
    "id" VARCHAR(80) NOT NULL,
    "for_user_id" VARCHAR(80) NOT NULL,
    "from_user_id" VARCHAR(80) NOT NULL,
    "type" VARCHAR(20) NOT NULL DEFAULT 'like',
    "status" VARCHAR(30) NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accepted_at" TIMESTAMPTZ(3),
    "auto_hidden_at" TIMESTAMPTZ(3),
    "blocked_at" TIMESTAMPTZ(3),
    "unhidden_at" TIMESTAMPTZ(3),

    CONSTRAINT "received_likes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "matches" (
    "id" VARCHAR(80) NOT NULL,
    "user_id" VARCHAR(80) NOT NULL,
    "profile_id" VARCHAR(80) NOT NULL,
    "profile_name" VARCHAR(80),
    "opener" TEXT,
    "conversation_id" VARCHAR(80),
    "dm_unlocked" BOOLEAN NOT NULL DEFAULT true,
    "read_at" TIMESTAMPTZ(3),
    "blocked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" VARCHAR(80) NOT NULL,
    "match_id" VARCHAR(80),
    "conversation_id" VARCHAR(80),
    "sender_user_id" VARCHAR(80),
    "sender" VARCHAR(20),
    "legacy_user_id" VARCHAR(80),
    "legacy_profile_id" VARCHAR(80),
    "body" VARCHAR(500) NOT NULL,
    "read_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blocks" (
    "id" VARCHAR(80) NOT NULL,
    "user_id" VARCHAR(80) NOT NULL,
    "profile_id" VARCHAR(80) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" VARCHAR(80) NOT NULL,
    "reporter_user_id" VARCHAR(80) NOT NULL,
    "profile_id" VARCHAR(80) NOT NULL,
    "reason" VARCHAR(120) NOT NULL,
    "status" VARCHAR(30) NOT NULL DEFAULT 'open',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dismissed_at" TIMESTAMPTZ(3),

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" VARCHAR(80) NOT NULL,
    "action" VARCHAR(80) NOT NULL,
    "actor_id" VARCHAR(80),
    "target_id" VARCHAR(80),
    "meta" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchases" (
    "id" VARCHAR(80) NOT NULL,
    "user_id" VARCHAR(80) NOT NULL,
    "plan" VARCHAR(20) NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" VARCHAR(30) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "single_purchases" (
    "id" VARCHAR(80) NOT NULL,
    "user_id" VARCHAR(80) NOT NULL,
    "item" VARCHAR(80) NOT NULL,
    "perk" VARCHAR(40) NOT NULL,
    "kind" VARCHAR(30) NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" VARCHAR(30) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3),
    "remaining" INTEGER,

    CONSTRAINT "single_purchases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_firebase_uid_key" ON "users"("firebase_uid");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_riot_id_key" ON "users"("riot_id");

-- CreateIndex
CREATE INDEX "users_auto_hidden_created_at_idx" ON "users"("auto_hidden", "created_at");

-- CreateIndex
CREATE INDEX "users_source_idx" ON "users"("source");

-- CreateIndex
CREATE INDEX "likes_from_user_id_created_at_idx" ON "likes"("from_user_id", "created_at");

-- CreateIndex
CREATE INDEX "likes_to_user_id_created_at_idx" ON "likes"("to_user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "likes_from_user_id_to_user_id_key" ON "likes"("from_user_id", "to_user_id");

-- CreateIndex
CREATE INDEX "received_likes_for_user_id_status_created_at_idx" ON "received_likes"("for_user_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "received_likes_from_user_id_status_created_at_idx" ON "received_likes"("from_user_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "matches_conversation_id_created_at_idx" ON "matches"("conversation_id", "created_at");

-- CreateIndex
CREATE INDEX "matches_user_id_dm_unlocked_created_at_idx" ON "matches"("user_id", "dm_unlocked", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "matches_user_id_profile_id_key" ON "matches"("user_id", "profile_id");

-- CreateIndex
CREATE INDEX "messages_conversation_id_created_at_idx" ON "messages"("conversation_id", "created_at");

-- CreateIndex
CREATE INDEX "messages_match_id_created_at_idx" ON "messages"("match_id", "created_at");

-- CreateIndex
CREATE INDEX "messages_sender_user_id_created_at_idx" ON "messages"("sender_user_id", "created_at");

-- CreateIndex
CREATE INDEX "blocks_profile_id_created_at_idx" ON "blocks"("profile_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "blocks_user_id_profile_id_key" ON "blocks"("user_id", "profile_id");

-- CreateIndex
CREATE INDEX "reports_profile_id_status_created_at_idx" ON "reports"("profile_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "reports_reporter_user_id_created_at_idx" ON "reports"("reporter_user_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "audit_logs_action_created_at_idx" ON "audit_logs"("action", "created_at");

-- CreateIndex
CREATE INDEX "purchases_user_id_created_at_idx" ON "purchases"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "single_purchases_user_id_perk_expires_at_idx" ON "single_purchases"("user_id", "perk", "expires_at");

-- CreateIndex
CREATE INDEX "single_purchases_user_id_kind_created_at_idx" ON "single_purchases"("user_id", "kind", "created_at");

-- AddForeignKey
ALTER TABLE "likes" ADD CONSTRAINT "likes_from_user_id_fkey" FOREIGN KEY ("from_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "likes" ADD CONSTRAINT "likes_to_user_id_fkey" FOREIGN KEY ("to_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "received_likes" ADD CONSTRAINT "received_likes_for_user_id_fkey" FOREIGN KEY ("for_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "received_likes" ADD CONSTRAINT "received_likes_from_user_id_fkey" FOREIGN KEY ("from_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_user_id_fkey" FOREIGN KEY ("sender_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_user_id_fkey" FOREIGN KEY ("reporter_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "single_purchases" ADD CONSTRAINT "single_purchases_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
