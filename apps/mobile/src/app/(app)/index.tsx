import { PERMISSIONS } from "@repo/constants";
import { can } from "@repo/core";
import { Link, type Href } from "expo-router";
import { Pressable, Text, View } from "react-native";

import { trpc } from "../../lib/trpc";
import { useAuthStore } from "../../stores/auth-store";

/**
 * Role-aware placeholder home. M2 adds read-only academic-structure links for
 * roles holding ACADEMIC_READ (admins + teachers); M3 adds People links gated
 * per permission (students/parents/teacher profiles — row scope applied by the
 * services). Feature screens (attendance, marks, …) arrive in later milestones.
 */
export default function AppHome() {
  const me = trpc.auth.me.useQuery();
  const logout = useAuthStore((state) => state.logout);
  const role = me.data?.role;
  const canReadAcademic = role !== undefined && can(role, PERMISSIONS.ACADEMIC_READ);
  const canReadStudents = role !== undefined && can(role, PERMISSIONS.STUDENT_READ);
  const canReadParents = role !== undefined && can(role, PERMISSIONS.PARENT_READ);
  const canReadStaff = role !== undefined && can(role, PERMISSIONS.STAFF_READ);
  const canMarkAttendance = role !== undefined && can(role, PERMISSIONS.ATTENDANCE_MARK);
  const canSubmitCorrection =
    role !== undefined && can(role, PERMISSIONS.ATTENDANCE_CORRECT_SUBMIT);
  const canApplyLeave = role !== undefined && can(role, PERMISSIONS.LEAVE_APPLY);
  const canReadAttendance = role !== undefined && can(role, PERMISSIONS.ATTENDANCE_READ);
  const canEnterMarks = role !== undefined && can(role, PERMISSIONS.MARK_ENTER);
  const canReadMarks = role !== undefined && can(role, PERMISSIONS.MARK_READ);

  return (
    <View className="flex-1 items-center justify-center gap-4 bg-background p-6">
      <Text className="text-2xl font-semibold text-foreground">School Portal</Text>
      <Text className="text-center text-muted-foreground">
        Signed in{role ? ` as ${role}` : ""}. Your dashboard appears here once features are enabled.
      </Text>

      {canReadAcademic ? (
        <View className="w-full gap-2">
          <Text className="text-sm font-medium text-muted-foreground">Academic structure</Text>
          <NavLink href="/academic/years" label="Academic years" />
          <NavLink href="/academic/classes" label="Classes" />
          <NavLink href="/academic/subjects" label="Subjects" />
          <NavLink href="/academic/assignments" label="Teacher assignments" />
        </View>
      ) : null}

      {canReadStudents || canReadParents || canReadStaff ? (
        <View className="w-full gap-2">
          <Text className="text-sm font-medium text-muted-foreground">People</Text>
          {canReadStudents ? <NavLink href="/people/students" label="Students" /> : null}
          {canReadParents ? <NavLink href="/people/parents" label="Parents" /> : null}
          {canReadStaff ? (
            <NavLink href="/people/teacher-profiles" label="Teacher profiles" />
          ) : null}
        </View>
      ) : null}

      {canReadAttendance ? (
        <View className="w-full gap-2">
          <Text className="text-sm font-medium text-muted-foreground">Attendance</Text>
          {canMarkAttendance ? (
            <NavLink href="/attendance/sections" label="Mark attendance" />
          ) : null}
          {canSubmitCorrection ? (
            <NavLink href="/attendance/my-corrections" label="My corrections" />
          ) : null}
          {canApplyLeave ? <NavLink href="/attendance/leave" label="Leave requests" /> : null}
          <Text className="px-1 text-xs text-muted-foreground">
            Open a student to view their attendance & calendar.
          </Text>
        </View>
      ) : null}

      {canEnterMarks || (canReadMarks && role === "PARENT") ? (
        <View className="w-full gap-2">
          <Text className="text-sm font-medium text-muted-foreground">Examinations</Text>
          {canEnterMarks ? <NavLink href="/exam/markable" label="Enter marks" /> : null}
          {canReadMarks && role === "PARENT" ? (
            <NavLink href="/exam/children" label="Marks & grades" />
          ) : null}
        </View>
      ) : null}

      <Pressable
        accessibilityRole="button"
        onPress={() => {
          void logout();
        }}
        className="min-h-11 items-center justify-center rounded-md border border-border px-4 py-3"
      >
        <Text className="font-medium text-foreground">Log out</Text>
      </Pressable>
    </View>
  );
}

function NavLink({ href, label }: { href: Href; label: string }) {
  return (
    <Link href={href} asChild>
      <Pressable
        accessibilityRole="button"
        className="min-h-11 justify-center rounded-md border border-border bg-card px-4 py-3"
      >
        <Text className="font-medium text-foreground">{label}</Text>
      </Pressable>
    </Link>
  );
}
