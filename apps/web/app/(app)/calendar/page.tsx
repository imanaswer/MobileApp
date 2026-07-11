"use client";

import { PERMISSIONS } from "@repo/constants";
import { can } from "@repo/core";
import type { CalendarEventDto, CalendarEventTypeKey } from "@repo/types";
import Link from "next/link";
import { useState } from "react";

import {
  destructiveBtn,
  inputClass,
  labelClass,
  outlineBtn,
  primaryBtn,
} from "@/src/components/academic/ui";
import {
  CALENDAR_EVENT_TYPES,
  EVENT_TYPE_LABEL,
  formatDate,
} from "@/src/components/announcement/ui";
import { downloadCsv } from "@/src/components/attendance/ui";
import { trpc } from "@/src/trpc/react";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Calendar management (M11, ADR-019 Step 7). A month grid + list of events with a type
 * filter; admins (academic:manage) create/edit/delete events; anyone with calendar:read
 * views + exports CSV. Thin client — the service gates writes and validates ranges.
 */
export default function CalendarPage() {
  const now = new Date();
  const me = trpc.auth.me.useQuery();
  const canManage = me.data?.role !== undefined && can(me.data.role, PERMISSIONS.ACADEMIC_MANAGE);

  const [year, setYear] = useState(now.getUTCFullYear());
  const [month, setMonth] = useState(now.getUTCMonth() + 1);
  const [type, setType] = useState<CalendarEventTypeKey | "ALL">("ALL");
  const [editing, setEditing] = useState<CalendarEventDto | "new" | null>(null);

  const typeArg = type === "ALL" ? {} : { eventType: type };
  const query = trpc.calendar.month.useQuery({ year, month, ...typeArg });
  const events = query.data ?? [];

  const step = (delta: number) => {
    const m0 = month - 1 + delta;
    setYear((y) => y + Math.floor(m0 / 12));
    setMonth((((m0 % 12) + 12) % 12) + 1);
  };

  const exportCsv = () => {
    const rows: string[][] = [
      ["Title", "Type", "Start", "End", "All day", "Description"],
      ...events.map((e) => [
        e.title,
        EVENT_TYPE_LABEL[e.eventType],
        e.startDate,
        e.endDate,
        e.isAllDay ? "yes" : "no",
        e.description ?? "",
      ]),
    ];
    downloadCsv(`calendar-${year}-${pad(month)}.csv`, rows);
  };

  // Month grid cells (Sunday-start).
  const firstDow = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells: (string | null)[] = [
    ...Array<null>(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => `${year}-${pad(month)}-${pad(i + 1)}`),
  ];
  const eventsOn = (day: string) => events.filter((e) => e.startDate <= day && day <= e.endDate);

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/dashboard" className="text-sm text-primary">
            ← Dashboard
          </Link>
          <h1 className="text-2xl font-semibold text-foreground">School calendar</h1>
        </div>
        <div className="flex gap-2">
          <button type="button" className={outlineBtn} onClick={exportCsv}>
            Export CSV
          </button>
          {canManage ? (
            <button type="button" className={primaryBtn} onClick={() => setEditing("new")}>
              New event
            </button>
          ) : null}
        </div>
      </header>

      {editing ? (
        <EventForm
          event={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => void query.refetch()}
        />
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <button type="button" className={outlineBtn} onClick={() => step(-1)}>
            ←
          </button>
          <span className="min-w-40 text-center font-medium text-foreground">
            {MONTHS[month - 1]} {year}
          </span>
          <button type="button" className={outlineBtn} onClick={() => step(1)}>
            →
          </button>
        </div>
        <select
          className={inputClass}
          value={type}
          onChange={(e) => setType(e.target.value as CalendarEventTypeKey | "ALL")}
        >
          <option value="ALL">All types</option>
          {CALENDAR_EVENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {EVENT_TYPE_LABEL[t]}
            </option>
          ))}
        </select>
      </div>

      {/* Month grid */}
      <div className="grid grid-cols-7 overflow-hidden rounded-md border border-border">
        {DOW.map((d) => (
          <div
            key={d}
            className="border-b border-border bg-muted px-2 py-1 text-center text-xs font-medium text-muted-foreground"
          >
            {d}
          </div>
        ))}
        {cells.map((day, i) => (
          <div
            key={day ?? `blank-${i}`}
            className="min-h-20 border-b border-r border-border p-1 align-top"
          >
            {day ? (
              <>
                <div className="text-xs text-muted-foreground">{Number(day.slice(-2))}</div>
                <div className="flex flex-col gap-0.5">
                  {eventsOn(day).map((e) => (
                    <span
                      key={e.id}
                      title={e.title}
                      className="truncate rounded bg-primary/10 px-1 text-[10px] text-primary"
                    >
                      {e.title}
                    </span>
                  ))}
                </div>
              </>
            ) : null}
          </div>
        ))}
      </div>

      {/* List */}
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">Events this month</h2>
        {query.isLoading ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : events.length === 0 ? (
          <p className="text-muted-foreground">No events.</p>
        ) : (
          events.map((e) => (
            <div
              key={e.id}
              className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-card p-3"
            >
              <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                {EVENT_TYPE_LABEL[e.eventType]}
              </span>
              <span className="flex-1 font-medium text-foreground">{e.title}</span>
              <span className="text-sm text-muted-foreground">
                {e.startDate === e.endDate
                  ? formatDate(e.startDate)
                  : `${formatDate(e.startDate)} – ${formatDate(e.endDate)}`}
              </span>
              {canManage ? (
                <button type="button" className={outlineBtn} onClick={() => setEditing(e)}>
                  Edit
                </button>
              ) : null}
            </div>
          ))
        )}
      </section>
    </main>
  );
}

/** Create / edit / delete a calendar event (admin). */
function EventForm({
  event,
  onClose,
  onSaved,
}: {
  event: CalendarEventDto | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(event?.title ?? "");
  const [description, setDescription] = useState(event?.description ?? "");
  const [eventType, setEventType] = useState<CalendarEventTypeKey>(event?.eventType ?? "HOLIDAY");
  const [startDate, setStartDate] = useState(event?.startDate ?? "");
  const [endDate, setEndDate] = useState(event?.endDate ?? "");
  const [error, setError] = useState<string | null>(null);

  const done = () => {
    onSaved();
    onClose();
  };
  const create = trpc.calendar.create.useMutation({
    onSuccess: done,
    onError: (e) => setError(e.message),
  });
  const update = trpc.calendar.update.useMutation({
    onSuccess: done,
    onError: (e) => setError(e.message),
  });
  const remove = trpc.calendar.delete.useMutation({ onSuccess: done });

  const valid = title.trim() && startDate && endDate && endDate >= startDate;

  const save = () => {
    setError(null);
    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      eventType,
      startDate,
      endDate,
    };
    if (event) update.mutate({ id: event.id, ...payload });
    else create.mutate(payload);
  };

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-foreground">{event ? "Edit event" : "New event"}</h2>
        <button type="button" className={outlineBtn} onClick={onClose}>
          Close
        </button>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <label className={labelClass}>
        Title
        <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label className={labelClass}>
        Description
        <textarea
          className={`${inputClass} min-h-20`}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>
      <div className="flex flex-wrap gap-3">
        <label className={labelClass}>
          Type
          <select
            className={inputClass}
            value={eventType}
            onChange={(e) => setEventType(e.target.value as CalendarEventTypeKey)}
          >
            {CALENDAR_EVENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {EVENT_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          Start date
          <input
            type="date"
            className={inputClass}
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </label>
        <label className={labelClass}>
          End date
          <input
            type="date"
            className={inputClass}
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" className={primaryBtn} disabled={!valid} onClick={save}>
          {event ? "Save" : "Create"}
        </button>
        {event ? (
          <button
            type="button"
            className={destructiveBtn}
            onClick={() => remove.mutate({ id: event.id })}
          >
            Delete
          </button>
        ) : null}
      </div>
    </div>
  );
}
