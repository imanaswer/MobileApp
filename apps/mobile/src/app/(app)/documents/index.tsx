import { Link, useRouter } from "expo-router";
import { FlatList, Pressable, Text, View } from "react-native";

import { Header, Loading } from "../../../components/behaviour-ui";
import { trpc } from "../../../lib/trpc";

/**
 * Documents entry point (M15 Step 6). Pick a student to open their document center.
 * `student.list` is role-scoped — a parent sees only their children, teacher/admin the
 * school's students. Parents download; teachers view; admins generate/approve/archive.
 */
export default function DocumentsHomeScreen() {
  const router = useRouter();
  const students = trpc.student.list.useQuery();
  const rows = students.data ?? [];

  return (
    <View className="flex-1 bg-background">
      <Header title="Documents" onBack={() => router.back()} />
      {students.isLoading ? (
        <Loading />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(s) => s.id}
          contentContainerClassName="p-4 gap-3"
          ListEmptyComponent={<Text className="text-muted-foreground">No students found.</Text>}
          renderItem={({ item }) => (
            <Link
              href={{ pathname: "/documents/student/[studentId]", params: { studentId: item.id } }}
              asChild
            >
              <Pressable
                accessibilityRole="button"
                className="gap-1 rounded-md border border-border bg-card p-4"
              >
                <Text className="font-medium text-foreground">
                  {item.firstName} {item.lastName}
                </Text>
                <Text className="text-sm text-muted-foreground">Admission {item.admissionNo}</Text>
              </Pressable>
            </Link>
          )}
        />
      )}
    </View>
  );
}
