-- ---------------------------------------------------------------------------
-- M18 — Teacher ↔ Parent Messaging.
--
-- Two additive tables over frozen M1–M17:
--
--   • MessageThread — a 1:1 direct-message thread between a staff (teacher) party
--     and a guardian (parent) party, ABOUT one student (the scope anchor). Exactly
--     TWO parties (staffUserId + guardianUserId → User), so a single readAt per
--     Message suffices (B12). The party unique makes createThread idempotent —
--     one thread per (teacher, guardian, student). lastMessageAt orders the thread
--     list and is bumped on each send.
--
--   • Message — one message within a thread. readAt is when the OTHER party read it
--     (1:1 → one readAt; B12). Cascade-deletes with its thread; sender FK Restrict.
--
-- One new NotificationType enum VALUE (MESSAGE) is added for the send fan-out to the
-- other party via the canonical *AndNotify best-effort path (M10 reused, never edited).
-- This is an ALTER TYPE … ADD VALUE — an enum extension, NOT a frozen-*table* ALTER,
-- and additive (the new value is not used in DML in this migration).
--
-- Purely additive: creates 2 tables + 1 enum value + their FKs/indexes/unique. NO
-- frozen table (User, Student, Notification) is altered — the *.threadsAs* /
-- messageThreads / sentMessages back-relations are VIRTUAL (no SQL column).
-- RLS is a separate migration (messaging_rls).
-- ---------------------------------------------------------------------------

-- AlterEnum — additive enum VALUE for the M18 send fan-out.
-- Not a frozen-table ALTER; the new value is not used in DML in this migration.
ALTER TYPE "NotificationType" ADD VALUE 'MESSAGE';

-- CreateTable
CREATE TABLE "MessageThread" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "staffUserId" TEXT NOT NULL,
    "guardianUserId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessageThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "senderUserId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateIndex  — one thread per (teacher, guardian, student); createThread upserts on it
CREATE UNIQUE INDEX "MessageThread_staffUserId_guardianUserId_studentId_key" ON "MessageThread"("staffUserId", "guardianUserId", "studentId");

-- CreateIndex  — a staff party's thread list, newest first (keyset on lastMessageAt)
CREATE INDEX "MessageThread_staffUserId_lastMessageAt_idx" ON "MessageThread"("staffUserId", "lastMessageAt");

-- CreateIndex  — a guardian party's thread list, newest first (keyset on lastMessageAt)
CREATE INDEX "MessageThread_guardianUserId_lastMessageAt_idx" ON "MessageThread"("guardianUserId", "lastMessageAt");

-- CreateIndex
CREATE INDEX "MessageThread_schoolId_idx" ON "MessageThread"("schoolId");

-- CreateIndex  — keyset pagination within a thread
CREATE INDEX "Message_threadId_createdAt_idx" ON "Message"("threadId", "createdAt");

-- AddForeignKey
ALTER TABLE "MessageThread" ADD CONSTRAINT "MessageThread_staffUserId_fkey" FOREIGN KEY ("staffUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageThread" ADD CONSTRAINT "MessageThread_guardianUserId_fkey" FOREIGN KEY ("guardianUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageThread" ADD CONSTRAINT "MessageThread_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "MessageThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_senderUserId_fkey" FOREIGN KEY ("senderUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
