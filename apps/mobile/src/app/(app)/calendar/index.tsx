import type { CalendarEventDto, CalendarEventTypeKey } from "@repo/types";
import { useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";

import { EVENT_TYPE_LABEL, formatDate, Loading } from "../../../components/announcements-ui";
import { ScreenScaffold } from "../../../components/attendance-ui";
import { trpc } from "../../../lib/trpc";

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
const TYPE_FILTERS: (CalendarEventTypeKey | "ALL")[] = [
  "ALL",
  "HOLIDAY",
  "EXAM",
  "EVENT",
  "MEETING",
];

/**
 * School calendar (M11 Step 6). Upcoming (soonest first) or a month view; a type
 * filter covers "upcoming holidays" and the "exam schedule". Read-only for teachers
 * and parents (calendar:read). Events are enriched date strings — no id lookups.
 */
export default function CalendarScreen() {
  const now = new Date();
  const [mode, setMode] = useState<"UPCOMING" | "MONTH">("UPCOMING");
  const [type, setType] = useState<CalendarEventTypeKey | "ALL">("ALL");
  const [year, setYear] = useState(now.getUTCFullYear());
  const [month, setMonth] = useState(now.getUTCMonth() + 1); // 1-based

  const typeArg = type === "ALL" ? {} : { eventType: type };
  const upcoming = trpc.calendar.upcoming.useQuery(
    { limit: 50, ...typeArg },
    { enabled: mode === "UPCOMING" },
  );
  const monthly = trpc.calendar.month.useQuery(
    { year, month, ...typeArg },
    { enabled: mode === "MONTH" },
  );
  const query = mode === "UPCOMING" ? upcoming : monthly;
  const events = query.data ?? [];

  const stepMonth = (delta: number) => {
    const m0 = month - 1 + delta;
    setYear((y) => y + Math.floor(m0 / 12));
    setMonth((((m0 % 12) + 12) % 12) + 1);
  };

  return (
    <ScreenScaffold title="Calendar">
      <View className="flex-row gap-2">
        {(["UPCOMING", "MONTH"] as const).map((m) => (
          <Chip
            key={m}
            label={m === "UPCOMING" ? "Upcoming" : "Month"}
            active={mode === m}
            onPress={() => setMode(m)}
          />
        ))}
      </View>

      <View className="flex-row flex-wrap gap-2">
        {TYPE_FILTERS.map((t) => (
          <Chip
            key={t}
            label={t === "ALL" ? "All" : EVENT_TYPE_LABEL[t]}
            active={type === t}
            onPress={() => setType(t)}
          />
        ))}
      </View>

      {mode === "MONTH" ? (
        <View className="flex-row items-center justify-between">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Previous month"
            onPress={() => stepMonth(-1)}
            className="min-h-11 min-w-11 items-center justify-center rounded-md border border-border"
          >
            <Text className="text-foreground">←</Text>
          </Pressable>
          <Text className="font-medium text-foreground">
            {MONTHS[month - 1]} {year}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Next month"
            onPress={() => stepMonth(1)}
            className="min-h-11 min-w-11 items-center justify-center rounded-md border border-border"
          >
            <Text className="text-foreground">→</Text>
          </Pressable>
        </View>
      ) : null}

      {query.isLoading ? (
        <Loading />
      ) : (
        <FlatList
          data={events}
          keyExtractor={(e) => e.id}
          scrollEnabled={false}
          contentContainerClassName="gap-3"
          ListEmptyComponent={
            <Text className="text-muted-foreground">
              {mode === "UPCOMING" ? "No upcoming events." : "No events this month."}
            </Text>
          }
          renderItem={({ item }) => <EventRow event={item} />}
        />
      )}
    </ScreenScaffold>
  );
}

function EventRow({ event }: { event: CalendarEventDto }) {
  const range =
    event.startDate === event.endDate
      ? formatDate(event.startDate)
      : `${formatDate(event.startDate)} – ${formatDate(event.endDate)}`;
  return (
    <View className="gap-1 rounded-md border border-border bg-card p-4">
      <View className="flex-row items-center gap-2">
        <Text className="flex-1 font-medium text-foreground">{event.title}</Text>
        <Text className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
          {EVENT_TYPE_LABEL[event.eventType]}
        </Text>
      </View>
      <Text className="text-sm text-muted-foreground">{range}</Text>
      {event.description ? (
        <Text className="text-sm text-muted-foreground">{event.description}</Text>
      ) : null}
    </View>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className={`min-h-11 justify-center rounded-md px-3 ${
        active ? "bg-primary" : "border border-border bg-background"
      }`}
    >
      <Text className={active ? "text-primary-foreground" : "text-foreground"}>{label}</Text>
    </Pressable>
  );
}
