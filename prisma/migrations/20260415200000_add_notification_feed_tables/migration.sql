-- Add notification feed visibility layer:
--   NotificationFeedDismissal — per-item dismiss records
--   NotificationFeedState     — per-user cleared_before watermark
--
-- Dismissing or clearing does NOT touch the underlying business records
-- (Notification, TeamMember, BrandTransfer).

-- Enum for the source type of a feed item
CREATE TYPE "NotificationFeedSourceType" AS ENUM (
  'notification',
  'team_invitation',
  'incoming_transfer',
  'outgoing_transfer'
);

-- Per-item dismissal records
CREATE TABLE "NotificationFeedDismissal" (
  "id"           TEXT        NOT NULL,
  "user_id"      TEXT        NOT NULL,
  "source_type"  "NotificationFeedSourceType" NOT NULL,
  "source_id"    TEXT        NOT NULL,
  "dismissed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "NotificationFeedDismissal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NotificationFeedDismissal_user_id_source_type_source_id_key"
  ON "NotificationFeedDismissal"("user_id", "source_type", "source_id");

CREATE INDEX "NotificationFeedDismissal_user_id_idx"
  ON "NotificationFeedDismissal"("user_id");

ALTER TABLE "NotificationFeedDismissal"
  ADD CONSTRAINT "NotificationFeedDismissal_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Per-user feed state (clear-all watermark)
CREATE TABLE "NotificationFeedState" (
  "id"             TEXT         NOT NULL,
  "user_id"        TEXT         NOT NULL,
  "cleared_before" TIMESTAMP(3),
  "updated_at"     TIMESTAMP(3) NOT NULL,

  CONSTRAINT "NotificationFeedState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NotificationFeedState_user_id_key"
  ON "NotificationFeedState"("user_id");

ALTER TABLE "NotificationFeedState"
  ADD CONSTRAINT "NotificationFeedState_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
