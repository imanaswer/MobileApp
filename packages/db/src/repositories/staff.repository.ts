import type { Staff } from "@prisma/client";

import type { DbClient } from "../db-client";

export type { Staff };

export interface CreateStaffInput {
  schoolId: string;
  userId: string;
  name: string;
  employeeId: string;
  department?: string | null | undefined;
  qualification?: string | null | undefined;
  experienceYears?: number | null | undefined;
  joiningDate?: Date | null | undefined;
  bio?: string | null | undefined;
  photoPath?: string | null | undefined;
}

export interface UpdateStaffInput {
  name?: string | undefined;
  employeeId?: string | undefined;
  department?: string | null | undefined;
  qualification?: string | null | undefined;
  experienceYears?: number | null | undefined;
  joiningDate?: Date | null | undefined;
  bio?: string | null | undefined;
  photoPath?: string | null | undefined;
}

/** Persistence for `Staff` (employment profile; extends User 1:1). ADR-003. */
export interface StaffRepository {
  list(schoolId: string): Promise<Staff[]>;
  findById(id: string): Promise<Staff | null>;
  findByUserId(userId: string): Promise<Staff | null>;
  findByEmployeeId(schoolId: string, employeeId: string): Promise<Staff | null>;
  create(input: CreateStaffInput): Promise<Staff>;
  update(id: string, data: UpdateStaffInput): Promise<Staff>;
  delete(id: string): Promise<void>;
}

export function createStaffRepository(client: DbClient): StaffRepository {
  return {
    list: (schoolId) =>
      client.staff.findMany({ where: { schoolId }, orderBy: { employeeId: "asc" } }),
    findById: (id) => client.staff.findUnique({ where: { id } }),
    findByUserId: (userId) => client.staff.findUnique({ where: { userId } }),
    findByEmployeeId: (schoolId, employeeId) =>
      client.staff.findUnique({ where: { schoolId_employeeId: { schoolId, employeeId } } }),
    create: (input) =>
      client.staff.create({
        data: {
          schoolId: input.schoolId,
          userId: input.userId,
          name: input.name,
          employeeId: input.employeeId,
          ...(input.department !== undefined ? { department: input.department } : {}),
          ...(input.qualification !== undefined ? { qualification: input.qualification } : {}),
          ...(input.experienceYears !== undefined
            ? { experienceYears: input.experienceYears }
            : {}),
          ...(input.joiningDate !== undefined ? { joiningDate: input.joiningDate } : {}),
          ...(input.bio !== undefined ? { bio: input.bio } : {}),
          ...(input.photoPath !== undefined ? { photoPath: input.photoPath } : {}),
        },
      }),
    update: (id, data) =>
      client.staff.update({
        where: { id },
        data: {
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.employeeId !== undefined ? { employeeId: data.employeeId } : {}),
          ...(data.department !== undefined ? { department: data.department } : {}),
          ...(data.qualification !== undefined ? { qualification: data.qualification } : {}),
          ...(data.experienceYears !== undefined ? { experienceYears: data.experienceYears } : {}),
          ...(data.joiningDate !== undefined ? { joiningDate: data.joiningDate } : {}),
          ...(data.bio !== undefined ? { bio: data.bio } : {}),
          ...(data.photoPath !== undefined ? { photoPath: data.photoPath } : {}),
        },
      }),
    delete: async (id) => {
      await client.staff.delete({ where: { id } });
    },
  };
}
