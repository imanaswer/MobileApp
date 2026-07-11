import { PERMISSIONS } from "@repo/constants";
import { can } from "@repo/core";
import { Link, type Href } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";

import { NotificationBell } from "../../components/notifications-ui";
import { trpc } from "../../lib/trpc";
import { useAuthStore } from "../../stores/auth-store";

/**
 * Role-aware home dashboard. Scrollable (every role's nav + today-context fits any phone;
 * F1) with a greeting, a today-context card (a teacher's sections / a parent's children,
 * from existing queries), and permission-gated nav grouped into cards (F7). No M0 placeholder.
 */
export default function AppHome() {
  const me = trpc.auth.me.useQuery();
  const logout = useAuthStore((state) => state.logout);
  const role = me.data?.role;

  const has = (p: (typeof PERMISSIONS)[keyof typeof PERMISSIONS]) =>
    role !== undefined && can(role, p);
  const isParent = role === "PARENT";

  const canReadAcademic = has(PERMISSIONS.ACADEMIC_READ);
  const canReadStudents = has(PERMISSIONS.STUDENT_READ);
  const canReadParents = has(PERMISSIONS.PARENT_READ);
  const canReadStaff = has(PERMISSIONS.STAFF_READ);
  const canMarkAttendance = has(PERMISSIONS.ATTENDANCE_MARK);
  const canSubmitCorrection = has(PERMISSIONS.ATTENDANCE_CORRECT_SUBMIT);
  const canApplyLeave = has(PERMISSIONS.LEAVE_APPLY);
  const canReadAttendance = has(PERMISSIONS.ATTENDANCE_READ);
  const canEnterMarks = has(PERMISSIONS.MARK_ENTER);
  const canReadMarks = has(PERMISSIONS.MARK_READ);
  const canManageHomework = has(PERMISSIONS.HOMEWORK_MANAGE);
  const canReadHomework = has(PERMISSIONS.HOMEWORK_READ);
  const canReadReportCards = has(PERMISSIONS.REPORT_CARD_READ);
  const canReadTimetable = has(PERMISSIONS.TIMETABLE_READ);
  const showTimetable = canReadTimetable && (role === "TEACHER" || isParent);

  // Today-context, from existing queries only.
  const children = trpc.student.list.useQuery(undefined, { enabled: isParent });
  const teaching = trpc.homework.targets.useQuery(undefined, {
    enabled: role === "TEACHER" && canManageHomework,
  });
  const mySections = [...new Set((teaching.data ?? []).map((t) => t.sectionName))];
  const today = trpc.timetable.today.useQuery({}, { enabled: showTimetable });
  const todayRows = today.data ?? [];

  return (
    <View className="flex-1 bg-background">
      <View className="flex-row items-center border-b border-border px-4 py-4">
        <View className="flex-1">
          <Text className="text-2xl font-semibold text-foreground">School Portal</Text>
          <Text className="text-muted-foreground">
            {role ? `Signed in as ${role.replace("_", " ").toLowerCase()}` : "Signed in"}
          </Text>
        </View>
        <NotificationBell />
      </View>

      <ScrollView contentContainerClassName="p-4 gap-4">
        {isParent ? (
          <ContextCard title="Your children">
            {children.isLoading ? (
              <Muted>Loading…</Muted>
            ) : (children.data ?? []).length === 0 ? (
              <Muted>No children are linked to your account.</Muted>
            ) : (
              (children.data ?? []).map((c) => (
                <Text key={c.id} className="text-foreground">
                  {c.firstName} {c.lastName}
                  <Text className="text-muted-foreground"> · {c.admissionNo}</Text>
                </Text>
              ))
            )}
          </ContextCard>
        ) : null}

        {role === "TEACHER" && mySections.length > 0 ? (
          <ContextCard title="Your sections">
            <Text className="text-foreground">{mySections.join(" · ")}</Text>
          </ContextCard>
        ) : null}

        {showTimetable ? (
          <ContextCard title="Today’s schedule">
            {today.isLoading ? (
              <Muted>Loading…</Muted>
            ) : todayRows.length === 0 ? (
              <Muted>No classes scheduled today.</Muted>
            ) : (
              todayRows.map((e) => (
                <Text key={e.id} className="text-foreground">
                  {e.startTime} {e.subjectName}
                  <Text className="text-muted-foreground">
                    {" · "}
                    {isParent ? e.teacherName : e.sectionName}
                    {e.room ? ` · ${e.room}` : ""}
                  </Text>
                </Text>
              ))
            )}
          </ContextCard>
        ) : null}

        {canReadAcademic ? (
          <NavCard title="Academic structure">
            <NavLink href="/academic/years" label="Academic years" />
            <NavLink href="/academic/classes" label="Classes" />
            <NavLink href="/academic/subjects" label="Subjects" />
            <NavLink href="/academic/assignments" label="Teacher assignments" />
            <NavLink href="/academic/class-teachers" label="Class teachers" />
          </NavCard>
        ) : null}

        {canReadStudents || canReadParents || canReadStaff ? (
          <NavCard title="People">
            {canReadStudents ? <NavLink href="/people/students" label="Students" /> : null}
            {canReadParents ? <NavLink href="/people/parents" label="Parents" /> : null}
            {canReadStaff ? (
              <NavLink href="/people/teacher-profiles" label="Teacher profiles" />
            ) : null}
          </NavCard>
        ) : null}

        {canReadAttendance ? (
          <NavCard title="Attendance">
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
          </NavCard>
        ) : null}

        {canEnterMarks || (canReadMarks && isParent) ? (
          <NavCard title="Examinations">
            {canEnterMarks ? <NavLink href="/exam/markable" label="Enter marks" /> : null}
            {canReadMarks && isParent ? (
              <NavLink href="/exam/children" label="Marks & grades" />
            ) : null}
          </NavCard>
        ) : null}

        {canManageHomework || (canReadHomework && isParent) ? (
          <NavCard title="Homework">
            <NavLink
              href="/homework"
              label={canManageHomework ? "Homework" : "My children’s homework"}
            />
          </NavCard>
        ) : null}

        {canReadReportCards && isParent ? (
          <NavCard title="Report cards">
            <NavLink href="/report-cards/children" label="My children’s report cards" />
          </NavCard>
        ) : null}

        {showTimetable ? (
          <NavCard title="Timetable">
            <NavLink
              href="/timetable"
              label={isParent ? "My children’s timetable" : "My weekly timetable"}
            />
          </NavCard>
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
      </ScrollView>
    </View>
  );
}

function NavCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="gap-2 rounded-md border border-border bg-card p-4">
      <Text className="text-sm font-medium text-muted-foreground">{title}</Text>
      {children}
    </View>
  );
}

function ContextCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="gap-1 rounded-md border border-border bg-card p-4">
      <Text className="text-sm font-medium text-muted-foreground">{title}</Text>
      {children}
    </View>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return <Text className="text-sm text-muted-foreground">{children}</Text>;
}

function NavLink({ href, label }: { href: Href; label: string }) {
  return (
    <Link href={href} asChild>
      <Pressable
        accessibilityRole="button"
        className="min-h-11 justify-center rounded-md border border-border bg-background px-4 py-3"
      >
        <Text className="font-medium text-foreground">{label}</Text>
      </Pressable>
    </Link>
  );
}
