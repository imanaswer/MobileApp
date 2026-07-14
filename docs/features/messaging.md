# Feature — Teacher ↔ Parent Messaging (M18 / post-M17 Phase 6)

**Spec:** PRD v2 core scope ("announcements + teacher↔parent messaging") · shipped post-M17 (commits `04f79a0` backend, `8964dfe` UI).
**Status:** Implemented. Mobile runtime-unverified (no device run) — standing post-M17 caveat.

1:1 threads between a teacher and a guardian, always **about one student**. No group chat, no attachments,
no editing/deleting messages, no typing indicators — plain persistent text threads with unread tracking.

## Model (grain)

```
MessageThread  @@unique([staffUserId, guardianUserId, studentId])   ← createThread is idempotent
   │  schoolId · lastMessageAt (thread-list sort key)
   └─1:N─ Message  @@index([threadId, createdAt])
             senderUserId · body · readAt?   (exactly two parties ⇒ a single readAt suffices)
```

FKs Restrict except `Message.threadId` **Cascade**. RLS (two migrations: `messaging_management` +
`messaging_rls` with rolled-back `rls-verify.sql` proof): thread visible to its two parties only, messages via
thread-party EXISTS, anon nothing — defense-in-depth under the service-role app path (ADR-001).

## Authorization (business, ADR-002 — the real gate)

Permissions `message:send` / `message:read`, granted **TEACHER + PARENT only** (PERMISSIONS_MATRIX).
Scope on `createThread` (and mirrored by `counterparties`):

- **Teacher** → a guardian (with a login) of a student in their sections (`accessibleStudentIds` + student's parents).
- **Parent** → a teacher of their own child's section.
- `send` / `threadMessages` / `markRead` → caller must be a thread party.

## API & delivery

Router `message.*` — see `API_INVENTORY.md §Messaging` for the six procedures. Reads are keyset-paginated
(`lastMessageAt` for the thread list, `createdAt` newest-first for messages). `send` emits a post-commit,
best-effort `NotificationType.MESSAGE` to the other party (`actionUrl=/messages/<threadId>`) over the ADR-018
seam — so push delivery rides Phase 1 when `PUSH_NOTIFICATIONS_ENABLED` is set.

## Clients

- **Web:** `/messages` (thread list + compose dialog), `/messages/[threadId]` (conversation; mark-read on mount,
  Enter-to-send). Sidebar entry gated by `message:read`.
- **Mobile:** `(app)/messages` (list + student→recipient chip composer), `(app)/messages/[threadId]` (inverted
  chat list). Home "Communication" card link. **Never cached offline** (Phase 2 `NEVER_PERSIST` — privacy).
- Counterparty names come from `message.counterparties` (the only client-resolvable source of the other party's
  `userId`/name); a thread whose student left the caller's scope degrades to a role label, never an error.
