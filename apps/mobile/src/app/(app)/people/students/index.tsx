import type { StudentStatusKey } from "@repo/types";
import { Link } from "expo-router";
import { Pressable, Text } from "react-native";

import { AcademicListScreen, ListRow } from "../../../../components/academic-list";
import { trpc } from "../../../../lib/trpc";

const STATUS_CLASS: Record<StudentStatusKey, string> = {
  ACTIVE: "text-success",
  ARCHIVED: "text-muted-foreground",
  GRADUATED: "text-info",
  WITHDRAWN: "text-destructive",
};

/**
 * Read-only students list (M3 — manage on web). Row scope is applied by the
 * service: teachers see students enrolled in sections they teach, parents see
 * only their own children, admins see the whole school.
 */
export default function StudentsScreen() {
  const students = trpc.student.list.useQuery();

  return (
    <AcademicListScreen
      title="Students"
      isLoading={students.isLoading}
      isError={students.isError}
      items={students.data}
      keyExtractor={(student) => student.id}
      emptyText="No students visible to you."
      renderItem={(student) => (
        <Link href={{ pathname: "/people/students/[id]", params: { id: student.id } }} asChild>
          <Pressable accessibilityRole="button">
            <ListRow>
              <Text className="font-medium text-foreground">
                {student.firstName} {student.lastName}
              </Text>
              <Text className="text-sm text-muted-foreground">
                Admission no {student.admissionNo}
              </Text>
              <Text className={`text-sm font-medium ${STATUS_CLASS[student.status]}`}>
                {student.status}
              </Text>
            </ListRow>
          </Pressable>
        </Link>
      )}
    />
  );
}
