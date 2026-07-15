import { PERMISSIONS } from "@repo/constants";
import { can } from "@repo/core";
import { useTranslation } from "@repo/i18n";
import { Link, type Href } from "expo-router";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";

import { formatDate } from "../../components/announcements-ui";
import { formatPaise } from "../../components/fees-ui";
import { NotificationBell } from "../../components/notifications-ui";
import { OfflineBanner } from "../../components/offline-banner";
import { SyncQueueIndicator } from "../../components/sync-queue-indicator";
import { trpc } from "../../lib/trpc";
import { useAuthStore } from "../../stores/auth-store";
import { useOfflineQueueStore } from "../../stores/offline-queue-store";

/**
 * Role-aware home dashboard. Scrollable (every role's nav + today-context fits any phone;
 * F1) with a greeting, a today-context card (a teacher's sections / a parent's children,
 * from existing queries), and permission-gated nav grouped into cards (F7). No M0 placeholder.
 */
export default function AppHome() {
  const { dict } = useTranslation();
  const t = dict.home;
  const me = trpc.auth.me.useQuery();
  const logout = useAuthStore((state) => state.logout);
  const role = me.data?.role;

  const has = (p: (typeof PERMISSIONS)[keyof typeof PERMISSIONS]) =>
    role !== undefined && can(role, p);
  const isParent = role === "PARENT";

  const canReadMessages = has(PERMISSIONS.MESSAGE_READ);
  // Unread-messages badge on the nav entry (polled; permission-gated to avoid 403s).
  const unreadMessages =
    trpc.message.unreadCount.useQuery(undefined, {
      enabled: canReadMessages,
      refetchInterval: 30_000,
      retry: false,
    }).data?.count ?? 0;

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
          <Text className="text-2xl font-semibold text-foreground">{dict.common.appName}</Text>
          <Text className="text-muted-foreground">
            {role ? t.signedInAs(role.replace("_", " ").toLowerCase()) : t.signedIn}
          </Text>
        </View>
        <NotificationBell />
      </View>

      <ScrollView contentContainerClassName="p-4 gap-4">
        <OfflineBanner />
        <SyncQueueIndicator />
        {overview.isLoading ? (
          <ContextCard title={t.atAGlance}>
            <Muted>{dict.common.loading}</Muted>
          </ContextCard>
        ) : overview.data?.role === "PARENT" ? (
          overview.data.children.map((child) => (
            <ContextCard
              key={child.studentId}
              title={childName.get(child.studentId) ?? t.yourChild}
            >
              <StatGrid>
                <StatTile label={t.attendance} value={pct(child.attendancePercentage)} />
                <StatTile label={t.gpa} value={child.gpa === null ? "—" : child.gpa.toFixed(1)} />
                <StatTile
                  label={t.homework}
                  value={
                    child.homeworkCompletionRate === null
                      ? "—"
                      : `${Math.round(child.homeworkCompletionRate * 100)}%`
                  }
                />
                <StatTile label={t.dues} value={formatPaise(child.dues)} />
                <StatTile
                  label={t.behaviour}
                  value={`${child.openBehaviourCount}/${child.behaviourCount}`}
                />
              </StatGrid>
            </ContextCard>
          ))
        ) : overview.data?.role === "TEACHER" ? (
          <ContextCard title={t.atAGlance}>
            <StatGrid>
              <StatTile
                label={t.referrals}
                value={String(overview.data.teacher.behaviourReferralCount)}
              />
            </StatGrid>
            {overview.data.teacher.sections.length === 0 ? (
              <Muted>{t.noSectionsAssigned}</Muted>
            ) : (
              overview.data.teacher.sections.map((s) => (
                <PercentBar
                  key={s.sectionId}
                  label={sectionName.get(s.sectionId) ?? t.section}
                  pct={s.attendancePercentage}
                />
              ))
            )}
          </ContextCard>
        ) : overview.data?.role === "ADMIN" ? (
          <ContextCard title={t.schoolAtAGlance}>
            <StatGrid>
              <StatTile label={t.students} value={String(overview.data.school.headcount)} />
              <StatTile
                label={t.attendance}
                value={pct(overview.data.school.attendancePercentage)}
              />
              <StatTile
                label={t.collectedToday}
                value={formatPaise(overview.data.school.collectionToday)}
              />
              <StatTile
                label={t.outstanding}
                value={formatPaise(overview.data.school.fees.totalOutstanding)}
              />
            </StatGrid>
          </ContextCard>
        ) : null}

        {canReadAnnouncements ? (
          <View className="gap-2 rounded-md border border-border bg-card p-4">
            <Text className="text-sm font-medium text-muted-foreground">
              {t.recentAnnouncements}
            </Text>
            {recentAnnouncements.isLoading ? (
              <Muted>{dict.common.loading}</Muted>
            ) : (recentAnnouncements.data ?? []).length === 0 ? (
              <Muted>{t.nothingNew}</Muted>
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
          <ContextCard title={t.yourChildren}>
            {children.isLoading ? (
              <Muted>{dict.common.loading}</Muted>
            ) : (children.data ?? []).length === 0 ? (
              <Muted>{t.noChildrenLinked}</Muted>
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
          <ContextCard title={t.yourSections}>
            <Text className="text-foreground">{mySections.join(" · ")}</Text>
          </ContextCard>
        ) : null}

        {showTimetable ? (
          <ContextCard title={t.todaysSchedule}>
            {today.isLoading ? (
              <Muted>{dict.common.loading}</Muted>
            ) : todayRows.length === 0 ? (
              <Muted>{t.noClassesToday}</Muted>
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
          <NavCard title={t.academicStructure}>
            <NavLink href="/academic/years" label={t.academicYears} />
            <NavLink href="/academic/classes" label={t.classes} />
            <NavLink href="/academic/subjects" label={t.subjects} />
            <NavLink href="/academic/assignments" label={t.teacherAssignments} />
            <NavLink href="/academic/class-teachers" label={t.classTeachers} />
          </NavCard>
        ) : null}

        {canReadStudents || canReadParents || canReadStaff ? (
          <NavCard title={t.people}>
            {canReadStudents ? <NavLink href="/people/students" label={t.students} /> : null}
            {canReadParents ? <NavLink href="/people/parents" label={t.parents} /> : null}
            {canReadStaff ? (
              <NavLink href="/people/teacher-profiles" label={t.teacherProfiles} />
            ) : null}
          </NavCard>
        ) : null}

        {canReadAttendance ? (
          <NavCard title={t.attendance}>
            {canMarkAttendance ? (
              <NavLink href="/attendance/sections" label={t.markAttendance} />
            ) : null}
            {canSubmitCorrection ? (
              <NavLink href="/attendance/my-corrections" label={t.myCorrections} />
            ) : null}
            {canApplyLeave ? <NavLink href="/attendance/leave" label={t.leaveRequests} /> : null}
            <Text className="px-1 text-xs text-muted-foreground">{t.attendanceHint}</Text>
          </NavCard>
        ) : null}

        {canEnterMarks || (canReadMarks && isParent) ? (
          <NavCard title={t.examinations}>
            {canEnterMarks ? <NavLink href="/exam/markable" label={t.enterMarks} /> : null}
            {canReadMarks && isParent ? (
              <NavLink href="/exam/children" label={t.marksAndGrades} />
            ) : null}
          </NavCard>
        ) : null}

        {canManageHomework || (canReadHomework && isParent) ? (
          <NavCard title={t.homework}>
            <NavLink
              href="/homework"
              label={canManageHomework ? t.homework : t.myChildrensHomework}
            />
          </NavCard>
        ) : null}

        {canReadReportCards && isParent ? (
          <NavCard title={t.reportCards}>
            <NavLink href="/report-cards/children" label={t.myChildrensReportCards} />
          </NavCard>
        ) : null}

        {showTimetable ? (
          <NavCard title={t.timetable}>
            <NavLink
              href="/timetable"
              label={isParent ? t.myChildrensTimetable : t.myWeeklyTimetable}
            />
          </NavCard>
        ) : null}

        {canReadBehaviour ? (
          <NavCard title={t.behaviourAndDiscipline}>
            {isParent ? (
              <NavLink href="/behaviour/children" label={t.myChildrensBehaviour} />
            ) : canRecordBehaviour ? (
              <NavLink href="/behaviour" label={t.myBehaviourReferrals} />
            ) : null}
            {!isParent ? (
              <Text className="px-1 text-xs text-muted-foreground">{t.behaviourHint}</Text>
            ) : null}
          </NavCard>
        ) : null}

        {canReadFees ? (
          <NavCard title={t.fees}>
            <NavLink
              href="/fees"
              label={
                canManageFees ? t.feesAndPayments : isParent ? t.myChildrensFees : t.studentFees
              }
            />
            {isParent ? (
              <Text className="px-1 text-xs text-muted-foreground">{t.feesHint}</Text>
            ) : null}
          </NavCard>
        ) : null}

        {canReadDocuments ? (
          <NavCard title={t.documents}>
            <NavLink
              href="/documents"
              label={
                canManageDocuments
                  ? t.documentsAndCertificates
                  : isParent
                    ? t.myChildrensDocuments
                    : t.studentDocuments
              }
            />
            {isParent ? (
              <Text className="px-1 text-xs text-muted-foreground">{t.documentsHint}</Text>
            ) : null}
          </NavCard>
        ) : null}

        {canReadAnnouncements || canReadCalendar || canReadMessages ? (
          <NavCard title={t.communication}>
            {canReadMessages ? (
              <NavLink
                href="/messages"
                label={unreadMessages > 0 ? `${t.messages} (${unreadMessages})` : t.messages}
              />
            ) : null}
            {canReadAnnouncements ? (
              <NavLink href="/announcements" label={t.announcements} />
            ) : null}
            {canReadCalendar ? <NavLink href="/calendar" label={t.schoolCalendar} /> : null}
          </NavCard>
        ) : null}

        <NavCard title={t.settings}>
          <NavLink
            href="/settings"
            label={canManageSettings ? t.schoolConfiguration : t.preferences}
          />
        </NavCard>

        <Pressable
          accessibilityRole="button"
          onPress={() => {
            // Unsynced offline attendance must never be silently dropped
            // (OFFLINE_STRATEGY). While `me` is still loading, treat every
            // entry as the current user's (conservative).
            const myId = me.data?.userId;
            const { queue, purgeUser } = useOfflineQueueStore.getState();
            const unsynced = queue.filter((e) => !myId || e.userId === myId);
            if (unsynced.length === 0) {
              void logout();
              return;
            }
            Alert.alert(
              dict.sync.logoutUnsyncedTitle,
              dict.sync.logoutUnsyncedBody(unsynced.length),
              [
                { text: dict.sync.cancel, style: "cancel" },
                {
                  text: dict.sync.logoutDiscard,
                  style: "destructive",
                  onPress: () => {
                    unsynced.forEach((e) => purgeUser(e.userId));
                    void logout();
                  },
                },
              ],
            );
          }}
          className="min-h-11 items-center justify-center rounded-md border border-border px-4 py-3"
        >
          <Text className="font-medium text-foreground">{t.logOut}</Text>
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
