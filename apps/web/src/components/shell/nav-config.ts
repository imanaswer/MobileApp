import { PERMISSIONS, type Permission, type RoleKey } from "@repo/constants";
import { can } from "@repo/core";
import {
  BookOpen,
  Building2,
  CalendarCheck,
  CalendarDays,
  Clock,
  FileText,
  GraduationCap,
  LayoutDashboard,
  Megaphone,
  Settings,
  ShieldAlert,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

/**
 * Sidebar navigation config (ADR-UX1 §3). The `permission` gate on each item is
 * the EXACT same `can(role, …)` check the dashboard used — presentation moves to
 * the sidebar, the gating is unchanged. `href` is the module landing route.
 */
export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Omitted = always visible (Dashboard). */
  permission?: Permission;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

const GROUPS: NavGroup[] = [
  {
    label: "",
    items: [{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Academics",
    items: [
      {
        href: "/academic/years",
        label: "Academic structure",
        icon: Building2,
        permission: PERMISSIONS.ACADEMIC_READ,
      },
      {
        href: "/exams",
        label: "Examinations",
        icon: GraduationCap,
        permission: PERMISSIONS.EXAM_MANAGE,
      },
      {
        href: "/homework",
        label: "Homework",
        icon: BookOpen,
        permission: PERMISSIONS.HOMEWORK_READ,
      },
      {
        href: "/timetable",
        label: "Timetable",
        icon: Clock,
        permission: PERMISSIONS.TIMETABLE_MANAGE,
      },
    ],
  },
  {
    label: "People",
    items: [
      {
        href: "/people/students",
        label: "People",
        icon: Users,
        permission: PERMISSIONS.STUDENT_READ,
      },
    ],
  },
  {
    label: "Operations",
    items: [
      {
        href: "/attendance/mark",
        label: "Attendance",
        icon: CalendarCheck,
        permission: PERMISSIONS.ATTENDANCE_READ,
      },
      {
        href: "/behaviour",
        label: "Behaviour & discipline",
        icon: ShieldAlert,
        permission: PERMISSIONS.BEHAVIOUR_MANAGE,
      },
      { href: "/fees", label: "Fees & payments", icon: Wallet, permission: PERMISSIONS.FEE_MANAGE },
      {
        href: "/documents",
        label: "Documents & certificates",
        icon: FileText,
        permission: PERMISSIONS.DOCUMENT_READ,
      },
      {
        href: "/settings",
        label: "Administration",
        icon: Settings,
        permission: PERMISSIONS.SETTINGS_MANAGE,
      },
    ],
  },
  {
    label: "Communication",
    items: [
      {
        href: "/announcements",
        label: "Announcements",
        icon: Megaphone,
        permission: PERMISSIONS.ANNOUNCEMENT_READ,
      },
      {
        href: "/calendar",
        label: "School calendar",
        icon: CalendarDays,
        permission: PERMISSIONS.CALENDAR_READ,
      },
    ],
  },
];

/** Groups with only the items this role may see (same gating as before). */
export function visibleNavGroups(role: RoleKey): NavGroup[] {
  return GROUPS.map((g) => ({
    label: g.label,
    items: g.items.filter((i) => !i.permission || can(role, i.permission)),
  })).filter((g) => g.items.length > 0);
}
