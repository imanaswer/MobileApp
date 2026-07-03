/**
 * User roles (Dev PRD §5). Fixed set — mirrored as a Prisma enum in M1.
 * No STUDENT (students are records, not users). "Class Teacher" is not a role
 * (it's a `TeacherAssignment` flag, added later).
 */
export const ROLES = ["SUPER_ADMIN", "OFFICE_ADMIN", "TEACHER", "PARENT", "ACCOUNTANT"] as const;
export type RoleKey = (typeof ROLES)[number];
