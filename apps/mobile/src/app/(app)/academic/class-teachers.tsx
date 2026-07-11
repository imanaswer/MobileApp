import { Text } from "react-native";

import { AcademicListScreen, ListRow } from "../../../components/academic-list";
import { trpc } from "../../../lib/trpc";

/**
 * Read-only class-teacher display (M6.5, ADR-015). For the ACTIVE academic year,
 * lists each section with its current class teacher. NOTHING more — assign/replace/
 * remove is web-only (Step 8). Gated on ACADEMIC_READ (home link); the service
 * enforces it. Teacher shown as "You" or a user id, matching the M2 assignments
 * screen convention (no people directory on mobile).
 */
export default function ClassTeachersScreen() {
  const me = trpc.auth.me.useQuery();
  const years = trpc.academicYear.list.useQuery();
  const classes = trpc.class.list.useQuery();

  const activeYear = years.data?.find((y) => y.status === "ACTIVE");

  const sectionLists = trpc.useQueries((t) =>
    (classes.data ?? []).map((item) => t.section.list({ classId: item.id })),
  );
  const className = new Map((classes.data ?? []).map((c) => [c.id, c.name]));
  const sections = sectionLists.flatMap((q) => q.data ?? []);

  // One classTeacher.get per section (only when an ACTIVE year exists to key by).
  const classTeacherQueries = trpc.useQueries((t) =>
    activeYear
      ? sections.map((s) => t.classTeacher.get({ academicYearId: activeYear.id, sectionId: s.id }))
      : [],
  );
  const rows = sections.map((section, i) => ({ section, ct: classTeacherQueries[i] }));

  const isLoading = years.isLoading || classes.isLoading || sectionLists.some((q) => q.isLoading);
  const isError = years.isError || classes.isError || sectionLists.some((q) => q.isError);

  return (
    <AcademicListScreen
      title="Class teachers"
      isLoading={isLoading}
      isError={isError}
      items={rows}
      keyExtractor={(row) => row.section.id}
      emptyText={activeYear ? "No sections yet." : "No active academic year."}
      renderItem={({ section, ct }) => {
        const data = ct?.data;
        const teacherLabel = !activeYear
          ? "—"
          : ct?.isLoading
            ? "…"
            : data == null
              ? "Not assigned"
              : `${data.teacherName}${data.teacherId === me.data?.userId ? " (You)" : ""}`;
        return (
          <ListRow>
            <Text className="font-medium text-foreground">
              {`${className.get(section.classId) ?? ""} ${section.name}`.trim()}
            </Text>
            <Text className="text-sm text-muted-foreground">Class teacher: {teacherLabel}</Text>
            {data ? (
              <Text className="text-xs text-muted-foreground">
                Since {new Date(data.assignedAt).toLocaleDateString()}
              </Text>
            ) : null}
          </ListRow>
        );
      }}
    />
  );
}
