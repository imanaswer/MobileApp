import { PERMISSIONS } from "@repo/constants";
import { can } from "@repo/core";
import { Link, type Href } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";

import { formatDate } from "../../components/announcements-ui";
import { formatPaise } from "../../components/fees-ui";
import { NotificationBell } from "../../components/notifications-ui";
import { OfflineBanner } from "../../components/offline-banner";
import { SyncQueueIndicator } from "../../components/sync-queue-indicator";
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
  const canReadAnnouncements = has(PERMISSIONS.ANNOUNCEMENT_READ);
  const canReadCalendar = has(PERMISSIONS.CALENDAR_READ);
  const canReadBehaviour = has(PERMISSIONS.BEHAVIOUR_READ);
  const canRecordBehaviour = has(PERMISSIONS.BEHAVIOUR_RECORD) || has(PERMISSIONS.BEHAVIOUR_MANAGE);
  const canReadFees = has(PERMISSIONS.FEE_READ);
  const canManageFees = has(PERMISSIONS.FEE_MANAGE);
  const canReadDocuments = has(PERMISSIONS.DOCUMENT_READ);
  const canManageDocuments = has(PERMISSIONS.DOCUMENT_MANAGE);
  const canManageSettings = has(PERMISSIONS.SETTINGS_MANAGE);

  // Today-context, from existing queries only.
  const children = trpc.student.list.useQuery(undefined, { enabled: isParent });
  const teaching = trpc.homework.targets.useQuery(undefined, {
    enabled: role === "TEACHER" && canManageHomework,
  });
  const mySections = [...new Set((teaching.data ?? []).map((t) => t.sectionName))];
  const today = trpc.timetable.today.useQuery({}, { enabled: showTimetable });
  const todayRows = today.data ?? [];

  // M14 analytics — one role-aware query drives the "at a glance" overview (self-authorizing).
  const overview = trpc.analytics.dashboard.useQuery(undefined, {
    enabled:
      role === "SUPER_ADMIN" || role === "OFFICE_ADMIN" || role === "TEACHER" || role === "PARENT",
  });
  const recentAnnouncements = trpc.announcement.list.useQuery(
    { limit: 5 },
    { enabled: canReadAnnouncements },
  );
  // Resolve ids → names from queries the page already runs (no new API, no raw-id labels).
  const childName = new Map(
    (children.data ?? []).map((c) => [c.id, `${c.firstName} ${c.lastName}`]),
  );
  const sectionName = new Map((teaching.data ?? []).map((t) => [t.sectionId, t.sectionName]));

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
        <OfflineBanner />
        <SyncQueueIndicator />
        {overview.isLoading ? (
          <ContextCard title="At a glance">
            <Muted>Loading…</Muted>
          </ContextCard>
        ) : overview.data?.role === "PARENT" ? (
          overview.data.children.map((child) => (
            <ContextCard
              key={child.studentId}
              title={childName.get(child.studentId) ?? "Your child"}
            >
              <StatGrid>
                <StatTile label="Attendance" value={pct(child.attendancePercentage)} />
                <StatTile label="GPA" value={child.gpa === null ? "—" : child.gpa.toFixed(1)} />
                <StatTile
                  label="Homework"
                  value={
                    child.homeworkCompletionRate === null
                      ? "—"
                      : `${Math.round(child.homeworkCompletionRate * 100)}%`
                  }
                />
                <StatTile label="Dues" value={formatPaise(child.dues)} />
                <StatTile
                  label="Behaviour"
                  value={`${child.openBehaviourCount}/${child.behaviourCount}`}
                />
              </StatGrid>
            </ContextCard>
          ))
        ) : overview.data?.role === "TEACHER" ? (
          <ContextCard title="At a glance">
            <StatGrid>
              <StatTile
                label="Referrals"
                value={String(overview.data.teacher.behaviourReferralCount)}
              />
            </StatGrid>
            {overview.data.teacher.sections.length === 0 ? (
              <Muted>No sections assigned.</Muted>
            ) : (
              overview.data.teacher.sections.map((s) => (
                <PercentBar
                  key={s.sectionId}
                  label={sectionName.get(s.sectionId) ?? "Section"}
                  pct={s.attendancePercentage}
                />
              ))
            )}
          </ContextCard>
        ) : overview.data?.role === "ADMIN" ? (
          <ContextCard title="School at a glance">
            <StatGrid>
              <StatTile label="Students" value={String(overview.data.school.headcount)} />
              <StatTile label="Attendance" value={pct(overview.data.school.attendancePercentage)} />
              <StatTile
                label="Collected today"
                value={formatPaise(overview.data.school.collectionToday)}
              />
              <StatTile
                label="Outstanding"
                value={formatPaise(overview.data.school.fees.totalOutstanding)}
              />
            </StatGrid>
          </ContextCard>
        ) : null}

        {canReadAnnouncements ? (
          <View className="gap-2 rounded-md border border-border bg-card p-4">
            <Text className="text-sm font-medium text-muted-foreground">Recent announcements</Text>
            {recentAnnouncements.isLoading ? (
              <Muted>Loading…</Muted>
            ) : (recentAnnouncements.data ?? []).length === 0 ? (
              <Muted>Nothing new.</Muted>
            ) : (
              (recentAnnouncements.data ?? []).slice(0, 3).map((a) => (
                <Link key={a.id} href={`/announcements/${a.id}`} asChild>
                  <Pressable className="min-h-11 justify-center">
                    <Text className="font-medium text-foreground" numberOfLines={1}>
                      {a.title}
                    </Text>
                    <Text className="text-xs text-muted-foreground">
                      {formatDate(a.publishedAt ?? a.createdAt)}
                    </Text>
                  </Pressable>
                </Link>
              ))
            )}
          </View>
        ) : null}

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

        {canReadBehaviour ? (
          <NavCard title="Behaviour & discipline">
            {isParent ? (
              <NavLink href="/behaviour/children" label="My children’s behaviour" />
            ) : canRecordBehaviour ? (
              <NavLink href="/behaviour" label="My behaviour referrals" />
            ) : null}
            {!isParent ? (
              <Text className="px-1 text-xs text-muted-foreground">
                Open a student’s profile to view or record incidents.
              </Text>
            ) : null}
          </NavCard>
        ) : null}

        {canReadFees ? (
          <NavCard title="Fees">
            <NavLink
              href="/fees"
              label={
                canManageFees ? "Fees & payments" : isParent ? "My children’s fees" : "Student fees"
              }
            />
            {isParent ? (
              <Text className="px-1 text-xs text-muted-foreground">
                View invoices, dues and receipts. Payments are collected at the school office.
              </Text>
            ) : null}
          </NavCard>
        ) : null}

        {canReadDocuments ? (
          <NavCard title="Documents">
            <NavLink
              href="/documents"
              label={
                canManageDocuments
                  ? "Documents & certificates"
                  : isParent
                    ? "My children’s documents"
                    : "Student documents"
              }
            />
            {isParent ? (
              <Text className="px-1 text-xs text-muted-foreground">
                Download approved certificates. New documents are issued by the school office.
              </Text>
            ) : null}
          </NavCard>
        ) : null}

        {canReadAnnouncements || canReadCalendar ? (
          <NavCard title="Communication">
            {canReadAnnouncements ? <NavLink href="/announcements" label="Announcements" /> : null}
            {canReadCalendar ? <NavLink href="/calendar" label="School calendar" /> : null}
          </NavCard>
        ) : null}

        <NavCard title="Settings">
          <NavLink
            href="/settings"
            label={canManageSettings ? "School configuration" : "Preferences"}
          />
        </NavCard>

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

/** Weighted-% → display string (null = no data). */
function pct(v: number | null): string {
  return v === null ? "—" : `${v}%`;
}

function StatGrid({ children }: { children: React.ReactNode }) {
  return <View className="flex-row flex-wrap gap-2">{children}</View>;
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <View className="min-w-[30%] flex-1 rounded-md border border-border bg-background p-3">
      <Text className="text-xs text-muted-foreground">{label}</Text>
      <Text className="text-lg font-semibold text-foreground">{value}</Text>
    </View>
  );
}

/** Hand-rolled attendance bar (mobile v1 has no chart lib — ADR-022 §7). */
function PercentBar({ label, pct: value }: { label: string; pct: number | null }) {
  const width = value === null ? 0 : Math.max(0, Math.min(100, value));
  return (
    <View className="gap-1">
      <View className="flex-row justify-between">
        <Text className="text-sm text-foreground">{label}</Text>
        <Text className="text-sm text-muted-foreground">{pct(value)}</Text>
      </View>
      <View className="h-2 rounded-full bg-muted">
        <View className="h-2 rounded-full bg-primary" style={{ width: `${width}%` }} />
      </View>
    </View>
  );
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
