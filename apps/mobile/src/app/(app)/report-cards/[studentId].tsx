import type { ReportCardDto, ReportCardKindKey } from "@repo/types";
import { useLocalSearchParams } from "expo-router";
import { ActivityIndicator, Text, View } from "react-native";

import { ScreenScaffold } from "../../../components/attendance-ui";
import { trpc } from "../../../lib/trpc";

const KIND_LABEL: Record<ReportCardKindKey, string> = {
  EXAM: "Exam report card",
  TERM: "Term report card",
  ANNUAL: "Annual report card",
};

/**
 * A child's PUBLISHED report cards for the current (ACTIVE) enrollment (M7, parent).
 * The service returns PUBLISHED-only for a parent; snapshot fields (rank, attendance %,
 * GPA) render without a PDF. Read-only.
 *
 * ponytail: current-year cards only — cross-year trail (Q6) needs a listForStudent
 * endpoint that does not exist yet; add it when the year-over-year view is built.
 */
export default function StudentReportCardsScreen() {
  const { studentId } = useLocalSearchParams<{ studentId: string }>();
  const enabled = studentId !== undefined && studentId !== "";
  const enrollments = trpc.enrollment.listByStudent.useQuery(
    { studentId: studentId ?? "" },
    { enabled },
  );
  const active = (enrollments.data ?? []).find((e) => e.status === "ACTIVE");

  const cards = trpc.reportCard.listForEnrollment.useQuery(
    { enrollmentId: active?.id ?? "" },
    { enabled: active != null },
  );

  if (enrollments.isLoading) {
    return (
      <ScreenScaffold title="Report cards">
        <ActivityIndicator />
      </ScreenScaffold>
    );
  }
  if (active == null) {
    return (
      <ScreenScaffold title="Report cards">
        <Text className="text-muted-foreground">No current enrollment for this student.</Text>
      </ScreenScaffold>
    );
  }

  const rows = cards.data ?? [];
  return (
    <ScreenScaffold title="Report cards">
      {cards.isLoading ? (
        <ActivityIndicator />
      ) : rows.length === 0 ? (
        <Text className="text-muted-foreground">No published report cards yet.</Text>
      ) : (
        rows.map((c) => <ReportCardView key={c.id} card={c} />)
      )}
    </ScreenScaffold>
  );
}

function ReportCardView({ card }: { card: ReportCardDto }) {
  const rank =
    card.rank != null && card.cohortSize != null ? `${card.rank} of ${card.cohortSize}` : "—";
  const attendance = card.attendancePercentage != null ? `${card.attendancePercentage}%` : "—";
  const gpa = card.gpaSnapshot != null ? card.gpaSnapshot.toFixed(2) : "Not available";

  const scopeName = card.examName ?? card.termName; // null for ANNUAL (no exam/term scope)

  return (
    <View className="gap-2 rounded-md border border-border bg-card p-4">
      <View>
        <Text className="font-medium text-foreground">{KIND_LABEL[card.kind]}</Text>
        {scopeName ? <Text className="text-sm text-muted-foreground">{scopeName}</Text> : null}
      </View>
      <View className="flex-row flex-wrap gap-x-6 gap-y-1">
        <Stat label="Rank" value={rank} />
        <Stat label="Attendance" value={attendance} />
        <Stat label="GPA" value={gpa} />
        {card.promotionDecision ? <Stat label="Result" value={card.promotionDecision} /> : null}
      </View>
      {card.classTeacherRemark ? (
        <Remark
          label={
            card.classTeacherName ? `Class teacher · ${card.classTeacherName}` : "Class teacher"
          }
          body={card.classTeacherRemark}
        />
      ) : null}
      {card.principalRemark ? <Remark label="Principal" body={card.principalRemark} /> : null}
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View className="gap-0.5">
      <Text className="text-xs text-muted-foreground">{label}</Text>
      <Text className="font-medium text-foreground">{value}</Text>
    </View>
  );
}

function Remark({ label, body }: { label: string; body: string }) {
  return (
    <View className="gap-0.5">
      <Text className="text-xs text-muted-foreground">{label} remark</Text>
      <Text className="text-sm text-foreground">{body}</Text>
    </View>
  );
}
