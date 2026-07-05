import { PERMISSIONS } from "@repo/constants";
import { can } from "@repo/core";
import type { EnrollmentStatusKey, StudentRelationshipKey } from "@repo/types";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";

import { ListRow } from "../../../../components/academic-list";
import { trpc } from "../../../../lib/trpc";

const ENROLLMENT_STATUS_CLASS: Record<EnrollmentStatusKey, string> = {
  ADMITTED: "text-info",
  ACTIVE: "text-success",
  PROMOTED: "text-muted-foreground",
  RETAINED: "text-muted-foreground",
  TRANSFERRED: "text-muted-foreground",
  DROPPED: "text-destructive",
  ALUMNI: "text-muted-foreground",
};

const RELATIONSHIP_LABEL: Record<StudentRelationshipKey, string> = {
  FATHER: "Father",
  MOTHER: "Mother",
  GUARDIAN: "Guardian",
  EMERGENCY_CONTACT: "Emergency contact",
};

/**
 * Read-only student profile (M3 — manage on web): identity, enrollment history
 * (ADR-010 — one row per year, never mutated), and guardians. The service
 * enforces row scope; name lookups (year/class/section, parent) run only for
 * roles holding the corresponding read permission and fall back to raw ids.
 */
export default function StudentProfileScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const me = trpc.auth.me.useQuery();
  const role = me.data?.role;
  const canReadAcademic = role !== undefined && can(role, PERMISSIONS.ACADEMIC_READ);
  const canReadParents = role !== undefined && can(role, PERMISSIONS.PARENT_READ);

  const enabled = id !== undefined;
  const student = trpc.student.get.useQuery({ id: id ?? "" }, { enabled });
  const enrollments = trpc.enrollment.listByStudent.useQuery({ studentId: id ?? "" }, { enabled });
  const guardians = trpc.parent.guardians.useQuery({ studentId: id ?? "" }, { enabled });
  const years = trpc.academicYear.list.useQuery(undefined, { enabled: canReadAcademic });
  const classes = trpc.class.list.useQuery(undefined, { enabled: canReadAcademic });
  const parents = trpc.parent.list.useQuery(undefined, { enabled: canReadParents });

  const classIds = [...new Set((enrollments.data ?? []).map((e) => e.classId))];
  const sectionLists = trpc.useQueries((t) =>
    canReadAcademic ? classIds.map((classId) => t.section.list({ classId })) : [],
  );

  const yearName = new Map((years.data ?? []).map((y) => [y.id, y.name]));
  const className = new Map((classes.data ?? []).map((c) => [c.id, c.name]));
  const sectionName = new Map(
    sectionLists.flatMap((query) => query.data?.map((s) => [s.id, s.name] as const) ?? []),
  );
  const parentName = new Map((parents.data ?? []).map((p) => [p.id, p.name]));

  return (
    <View className="flex-1 bg-background">
      <View className="flex-row items-center gap-3 border-b border-border px-4 py-3">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={() => {
            router.back();
          }}
          className="min-h-11 min-w-11 items-center justify-center rounded-md"
        >
          <Text className="text-lg text-foreground">←</Text>
        </Pressable>
        <Text className="text-xl font-semibold text-foreground">Student profile</Text>
      </View>

      {student.isError ? (
        <View className="flex-1 items-center justify-center p-6">
          <Text className="text-center text-destructive">
            Couldn’t load this student. You may not have access, or the server is unreachable.
          </Text>
        </View>
      ) : student.isLoading || student.data === undefined ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      ) : (
        <ScrollView contentContainerClassName="p-4 gap-3">
          <ListRow>
            <Text className="text-lg font-semibold text-foreground">
              {student.data.firstName} {student.data.lastName}
            </Text>
            <Field label="Admission no" value={student.data.admissionNo} />
            <Field label="Status" value={student.data.status} />
            <Field label="Date of birth" value={student.data.dob} />
            <Field label="Gender" value={student.data.gender} />
            <Field label="Blood group" value={student.data.bloodGroup} />
            <Field label="Nationality" value={student.data.nationality} />
            <Field label="Address" value={student.data.address} />
          </ListRow>

          <Text className="text-sm font-medium text-muted-foreground">Enrollment history</Text>
          {enrollments.data === undefined ? (
            <ActivityIndicator />
          ) : enrollments.data.length === 0 ? (
            <Text className="text-sm text-muted-foreground">No enrollments yet.</Text>
          ) : (
            enrollments.data.map((enrollment) => (
              <ListRow key={enrollment.id}>
                <Text className="font-medium text-foreground">
                  {yearName.get(enrollment.academicYearId) ?? enrollment.academicYearId}
                </Text>
                <Text className="text-sm text-muted-foreground">
                  {className.get(enrollment.classId) ?? enrollment.classId}
                  {enrollment.sectionId
                    ? ` · Section ${sectionName.get(enrollment.sectionId) ?? enrollment.sectionId}`
                    : " · No section"}
                  {enrollment.rollNo != null ? ` · Roll ${enrollment.rollNo}` : ""}
                </Text>
                <Text
                  className={`text-sm font-medium ${ENROLLMENT_STATUS_CLASS[enrollment.status]}`}
                >
                  {enrollment.status}
                </Text>
              </ListRow>
            ))
          )}

          <Text className="text-sm font-medium text-muted-foreground">Guardians</Text>
          {guardians.data === undefined ? (
            <ActivityIndicator />
          ) : guardians.data.length === 0 ? (
            <Text className="text-sm text-muted-foreground">No guardians linked.</Text>
          ) : (
            guardians.data.map((guardian) => (
              <ListRow key={`${guardian.parentId}:${guardian.relationship}`}>
                <Text className="font-medium text-foreground">
                  {parentName.get(guardian.parentId) ?? RELATIONSHIP_LABEL[guardian.relationship]}
                </Text>
                <Text className="text-sm text-muted-foreground">
                  {RELATIONSHIP_LABEL[guardian.relationship]}
                  {guardian.isPrimary ? " · Primary contact" : ""}
                </Text>
              </ListRow>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

/** Label/value line inside the identity card. Absent optionals render "—". */
function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <View className="flex-row justify-between gap-3">
      <Text className="text-sm text-muted-foreground">{label}</Text>
      <Text className="flex-1 text-right text-sm text-foreground">{value ?? "—"}</Text>
    </View>
  );
}
