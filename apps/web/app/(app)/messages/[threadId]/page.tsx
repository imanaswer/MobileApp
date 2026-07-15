"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";

import { Button, Card, PageHeader, SkeletonText } from "@/src/components/ui";
import { trpc } from "@/src/trpc/react";

const inputClass =
  "w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-body text-neutral-800 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary-600 focus:border-primary-600";

/**
 * A conversation (M18). Messages arrive newest-first; rendered oldest→newest with the
 * caller's messages on the right. Compose posts via `send` (invalidates on success);
 * the other party's unread messages are flipped read on mount. The header labels come
 * from the list row's nav params — a deep link falls back to a generic title.
 */
export default function ConversationPage({
  params,
  searchParams,
}: {
  params: Promise<{ threadId: string }>;
  searchParams: Promise<{ name?: string; student?: string }>;
}) {
  const { threadId } = use(params);
  const { name, student } = use(searchParams);
  const me = trpc.auth.me.useQuery();
  const myUserId = me.data?.userId;
  const utils = trpc.useUtils();

  // Modest poll so the counterparty's reply appears while the conversation is open.
  const query = trpc.message.threadMessages.useQuery({ threadId }, { refetchInterval: 15_000 });
  // Newest-first from the server → render oldest at top.
  const messages = [...(query.data?.items ?? [])].reverse();

  // Flip incoming messages to read whenever a NEW one arrives (poll), not just on
  // mount — keeps the sidebar unread badge honest while the thread is open.
  const latestIncomingId = query.data?.items.find((m) => m.senderUserId !== myUserId)?.id;
  const markRead = trpc.message.markRead.useMutation({
    onSuccess: () => void utils.message.unreadCount.invalidate(),
  });
  useEffect(() => {
    markRead.mutate({ threadId });
  }, [threadId, latestIncomingId]);

  const [body, setBody] = useState("");
  const send = trpc.message.send.useMutation({
    onSuccess: () => {
      setBody("");
      void utils.message.threadMessages.invalidate({ threadId });
      void utils.message.listThreads.invalidate();
    },
  });

  const submit = () => {
    const trimmed = body.trim();
    if (trimmed.length === 0) return;
    send.mutate({ threadId, body: trimmed });
  };

  const title = name || "Conversation";
  const subtitle = student;

  return (
    <main className="mx-auto flex h-[calc(100vh-4rem)] max-w-3xl flex-col gap-4 p-6">
      <PageHeader
        title={title}
        breadcrumb={
          <Link href="/messages" className="hover:text-neutral-800">
            ← Messages
          </Link>
        }
      />
      {subtitle ? <p className="-mt-2 text-caption text-neutral-500">About {subtitle}</p> : null}

      <section
        className="flex flex-1 flex-col gap-2 overflow-y-auto"
        aria-live="polite"
        aria-label="Messages"
      >
        {query.isLoading ? (
          <Card>
            <SkeletonText lines={4} />
          </Card>
        ) : messages.length === 0 ? (
          <p className="m-auto text-neutral-500">No messages yet. Say hello.</p>
        ) : (
          messages.map((m) => {
            const mine = m.senderUserId === myUserId;
            return (
              <div key={m.id} className={mine ? "flex justify-end" : "flex justify-start"}>
                <div
                  className={`max-w-[80%] rounded-lg px-3 py-2 text-body ${
                    mine
                      ? "bg-primary-600 text-white"
                      : "border border-neutral-200 bg-white text-neutral-800"
                  }`}
                >
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                  <p
                    className={`mt-1 text-caption ${mine ? "text-primary-100" : "text-neutral-400"}`}
                  >
                    {new Date(m.createdAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </section>

      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <textarea
          className={`${inputClass} min-h-11 flex-1 resize-none`}
          rows={1}
          value={body}
          placeholder="Write a message…"
          aria-label="Write a message"
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <Button type="submit" disabled={body.trim().length === 0} loading={send.isPending}>
          Send
        </Button>
      </form>
    </main>
  );
}
