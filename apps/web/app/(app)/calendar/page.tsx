"use client";

import { PERMISSIONS } from "@repo/constants";
import { can } from "@repo/core";
import type { CalendarEventDto, CalendarEventTypeKey } from "@repo/types";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";

import {
  CALENDAR_EVENT_TYPES,
  EVENT_TYPE_LABEL,
  formatDate,
} from "@/src/components/announcement/ui";
import { downloadCsv } from "@/src/components/attendance/ui";
import {
  Button,
  Card,
  DateField,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Select,
  SkeletonText,
  StatusChip,
  useToast,
} from "@/src/components/ui";
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

const textareaClass =
  "w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-body text-neutral-800 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary-600 focus:border-primary-600 disabled:cursor-not-allowed disabled:bg-neutral-50 disabled:opacity-60";

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
    <main className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
      <PageHeader
        title="School calendar"
        breadcrumb={
          <Link href="/dashboard" className="hover:text-neutral-800">
            ← Dashboard
          </Link>
        }
        action={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={exportCsv}>
              Export CSV
            </Button>
            {canManage ? (
              <Button icon={CalendarDays} onClick={() => setEditing("new")}>
                New event
              </Button>
            ) : null}
          </div>
        }
      />

      {editing ? (
        <EventForm
          event={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => void query.refetch()}
        />
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            icon={ChevronLeft}
            aria-label="Previous month"
            onClick={() => step(-1)}
          />
          <span className="min-w-40 text-center font-medium text-neutral-800">
            {MONTHS[month - 1]} {year}
          </span>
          <Button
            variant="secondary"
            size="sm"
            icon={ChevronRight}
            aria-label="Next month"
            onClick={() => step(1)}
          />
        </div>
        <Select
          label="Type"
          value={type}
          onChange={(e) => setType(e.target.value as CalendarEventTypeKey | "ALL")}
        >
          <option value="ALL">All types</option>
          {CALENDAR_EVENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {EVENT_TYPE_LABEL[t]}
            </option>
          ))}
        </Select>
      </div>

      {/* Month grid */}
      <div className="grid grid-cols-7 overflow-hidden rounded-card border border-neutral-200">
        {DOW.map((d) => (
          <div
            key={d}
            className="border-b border-neutral-200 bg-neutral-50 px-2 py-1 text-center text-caption font-medium text-neutral-500"
          >
            {d}
          </div>
        ))}
        {cells.map((day, i) => (
          <div
            key={day ?? `blank-${i}`}
            className="min-h-20 border-b border-r border-neutral-200 p-1 align-top"
          >
            {day ? (
              <>
                <div className="text-caption text-neutral-500">{Number(day.slice(-2))}</div>
                <div className="flex flex-col gap-0.5">
                  {eventsOn(day).map((e) => (
                    <span
                      key={e.id}
                      title={e.title}
                      className="truncate rounded bg-primary-50 px-1 text-[10px] text-primary-700"
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
        <h2 className="text-sm font-medium text-neutral-500">Events this month</h2>
        {query.isLoading ? (
          <Card>
            <SkeletonText lines={3} />
          </Card>
        ) : events.length === 0 ? (
          <Card>
            <EmptyState icon={CalendarDays} title="No events" />
          </Card>
        ) : (
          events.map((e) => (
            <Card key={e.id} className="flex flex-wrap items-center gap-2 p-3">
              <StatusChip status={e.eventType} label={EVENT_TYPE_LABEL[e.eventType]} />
              <span className="flex-1 font-medium text-neutral-800">{e.title}</span>
              <span className="text-sm text-neutral-500">
                {e.startDate === e.endDate
                  ? formatDate(e.startDate)
                  : `${formatDate(e.startDate)} – ${formatDate(e.endDate)}`}
              </span>
              {canManage ? (
                <Button variant="secondary" size="sm" onClick={() => setEditing(e)}>
                  Edit
                </Button>
              ) : null}
            </Card>
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
  const { show } = useToast();
  const [title, setTitle] = useState(event?.title ?? "");
  const [description, setDescription] = useState(event?.description ?? "");
  const [eventType, setEventType] = useState<CalendarEventTypeKey>(event?.eventType ?? "HOLIDAY");
  const [startDate, setStartDate] = useState(event?.startDate ?? "");
  const [endDate, setEndDate] = useState(event?.endDate ?? "");
  const [error, setError] = useState<string | null>(null);
  const descId = useId();

  const done = (message: string) => () => {
    onSaved();
    show("success", message);
    onClose();
  };
  const create = trpc.calendar.create.useMutation({
    onSuccess: done("Event created."),
    onError: (e) => setError(e.message),
  });
  const update = trpc.calendar.update.useMutation({
    onSuccess: done("Event saved."),
    onError: (e) => setError(e.message),
  });
  const remove = trpc.calendar.delete.useMutation({ onSuccess: done("Event deleted.") });

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
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-title text-neutral-900">{event ? "Edit event" : "New event"}</h2>
        <Button variant="secondary" size="sm" onClick={onClose}>
          Close
        </Button>
      </div>
      {error ? <p className="text-sm text-danger-600">{error}</p> : null}

      <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
      <Field label="Description" htmlFor={descId}>
        <textarea
          id={descId}
          className={`${textareaClass} min-h-20`}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>
      <div className="flex flex-wrap gap-3">
        <Select
          label="Type"
          value={eventType}
          onChange={(e) => setEventType(e.target.value as CalendarEventTypeKey)}
        >
          {CALENDAR_EVENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {EVENT_TYPE_LABEL[t]}
            </option>
          ))}
        </Select>
        <DateField
          label="Start date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
        />
        <DateField label="End date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button disabled={!valid} onClick={save}>
          {event ? "Save" : "Create"}
        </Button>
        {event ? (
          <Button variant="destructive" onClick={() => remove.mutate({ id: event.id })}>
            Delete
          </Button>
        ) : null}
      </div>
    </Card>
  );
}
