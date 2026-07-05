import { Text } from "react-native";

import { AcademicListScreen, ListRow } from "../../../components/academic-list";
import { trpc } from "../../../lib/trpc";

/**
 * Read-only teacher (staff) profiles list (M3 — manage on web). Row scope is
 * applied by the service: admins see all profiles; a teacher sees only their
 * own. Names live on the User record; rows are labelled by employee id.
 */
export default function TeacherProfilesScreen() {
  const me = trpc.auth.me.useQuery();
  const profiles = trpc.teacherProfile.list.useQuery();

  return (
    <AcademicListScreen
      title="Teacher profiles"
      isLoading={profiles.isLoading}
      isError={profiles.isError}
      items={profiles.data}
      keyExtractor={(profile) => profile.id}
      emptyText="No teacher profiles yet."
      renderItem={(profile) => (
        <ListRow>
          <Text className="font-medium text-foreground">
            Employee {profile.employeeId}
            {profile.userId === me.data?.userId ? " · You" : ""}
          </Text>
          <Text className="text-sm text-muted-foreground">
            {profile.department ?? "No department"} · {profile.qualification ?? "—"}
          </Text>
          <Text className="text-sm text-muted-foreground">
            Joined {profile.joiningDate ?? "—"} ·{" "}
            {profile.experienceYears != null ? `${profile.experienceYears} yrs experience` : "—"}
          </Text>
        </ListRow>
      )}
    />
  );
}
