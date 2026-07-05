import type { PreferredContactKey } from "@repo/types";
import { Text } from "react-native";

import { AcademicListScreen, ListRow } from "../../../components/academic-list";
import { trpc } from "../../../lib/trpc";

const CONTACT_LABEL: Record<PreferredContactKey, string> = {
  PHONE: "phone",
  EMAIL: "email",
  WHATSAPP: "WhatsApp",
};

/**
 * Read-only parents list (M3 — manage on web). Row scope is applied by the
 * service: admins see all parents; the PARENT role sees only their own record.
 */
export default function ParentsScreen() {
  const parents = trpc.parent.list.useQuery();

  return (
    <AcademicListScreen
      title="Parents"
      isLoading={parents.isLoading}
      isError={parents.isError}
      items={parents.data}
      keyExtractor={(parent) => parent.id}
      emptyText="No parents visible to you."
      renderItem={(parent) => (
        <ListRow>
          <Text className="font-medium text-foreground">{parent.name}</Text>
          <Text className="text-sm text-muted-foreground">
            {parent.phone}
            {parent.email ? ` · ${parent.email}` : ""}
          </Text>
          <Text className="text-sm text-muted-foreground">
            {parent.occupation ?? "—"} · Prefers {CONTACT_LABEL[parent.preferredContact]}
          </Text>
        </ListRow>
      )}
    />
  );
}
