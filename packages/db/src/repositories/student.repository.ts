import type { Prisma, Student } from "@prisma/client";

import type { DbClient } from "../db-client";

export type { Student };

export interface CreateStudentInput {
  schoolId: string;
  admissionNo: string;
  firstName: string;
  lastName: string;
  dob?: Date | null | undefined;
  gender?: "MALE" | "FEMALE" | "OTHER" | null | undefined;
  bloodGroup?: string | null | undefined;
  nationality?: string | null | undefined;
  aadhaar?: string | null | undefined;
  passport?: string | null | undefined;
  address?: string | null | undefined;
  photoPath?: string | null | undefined;
  status?: "ACTIVE" | "ARCHIVED" | "GRADUATED" | "WITHDRAWN" | undefined;
}

export interface UpdateStudentInput {
  firstName?: string | undefined;
  lastName?: string | undefined;
  dob?: Date | null | undefined;
  gender?: "MALE" | "FEMALE" | "OTHER" | null | undefined;
  bloodGroup?: string | null | undefined;
  nationality?: string | null | undefined;
  aadhaar?: string | null | undefined;
  passport?: string | null | undefined;
  address?: string | null | undefined;
  photoPath?: string | null | undefined;
  status?: "ACTIVE" | "ARCHIVED" | "GRADUATED" | "WITHDRAWN" | undefined;
}

export interface StudentListFilter {
  status?: "ACTIVE" | "ARCHIVED" | "GRADUATED" | "WITHDRAWN";
  /** Case-insensitive match on first/last name or admission number. */
  search?: string;
}

/** Persistence for `Student` (ADR-003). No authorization/business rules. */
export interface StudentRepository {
  list(schoolId: string, filter?: StudentListFilter): Promise<Student[]>;
  /** Scoped reads (teacher/parent) resolve allowed ids, then fetch here. */
  listByIds(ids: readonly string[], filter?: StudentListFilter): Promise<Student[]>;
  findById(id: string): Promise<Student | null>;
  findByAdmissionNo(schoolId: string, admissionNo: string): Promise<Student | null>;
  findByAadhaar(schoolId: string, aadhaar: string): Promise<Student | null>;
  create(input: CreateStudentInput): Promise<Student>;
  update(id: string, data: UpdateStudentInput): Promise<Student>;
}

function whereFilter(filter?: StudentListFilter): Prisma.StudentWhereInput {
  return {
    ...(filter?.status ? { status: filter.status } : {}),
    ...(filter?.search
      ? {
          OR: [
            { firstName: { contains: filter.search, mode: "insensitive" } },
            { lastName: { contains: filter.search, mode: "insensitive" } },
            { admissionNo: { contains: filter.search, mode: "insensitive" } },
          ],
        }
      : {}),
  };
}

const byName: Prisma.StudentOrderByWithRelationInput[] = [
  { lastName: "asc" },
  { firstName: "asc" },
];

export function createStudentRepository(client: DbClient): StudentRepository {
  return {
    list: (schoolId, filter) =>
      client.student.findMany({ where: { schoolId, ...whereFilter(filter) }, orderBy: byName }),
    listByIds: (ids, filter) =>
      ids.length === 0
        ? Promise.resolve([])
        : client.student.findMany({
            where: { id: { in: [...ids] }, ...whereFilter(filter) },
            orderBy: byName,
          }),
    findById: (id) => client.student.findUnique({ where: { id } }),
    findByAdmissionNo: (schoolId, admissionNo) =>
      client.student.findUnique({ where: { schoolId_admissionNo: { schoolId, admissionNo } } }),
    findByAadhaar: (schoolId, aadhaar) =>
      client.student.findFirst({ where: { schoolId, aadhaar } }),
    create: (input) =>
      client.student.create({
        data: {
          schoolId: input.schoolId,
          admissionNo: input.admissionNo,
          firstName: input.firstName,
          lastName: input.lastName,
          ...(input.dob !== undefined ? { dob: input.dob } : {}),
          ...(input.gender !== undefined ? { gender: input.gender } : {}),
          ...(input.bloodGroup !== undefined ? { bloodGroup: input.bloodGroup } : {}),
          ...(input.nationality !== undefined ? { nationality: input.nationality } : {}),
          ...(input.aadhaar !== undefined ? { aadhaar: input.aadhaar } : {}),
          ...(input.passport !== undefined ? { passport: input.passport } : {}),
          ...(input.address !== undefined ? { address: input.address } : {}),
          ...(input.photoPath !== undefined ? { photoPath: input.photoPath } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
        },
      }),
    update: (id, data) =>
      client.student.update({
        where: { id },
        data: {
          ...(data.firstName !== undefined ? { firstName: data.firstName } : {}),
          ...(data.lastName !== undefined ? { lastName: data.lastName } : {}),
          ...(data.dob !== undefined ? { dob: data.dob } : {}),
          ...(data.gender !== undefined ? { gender: data.gender } : {}),
          ...(data.bloodGroup !== undefined ? { bloodGroup: data.bloodGroup } : {}),
          ...(data.nationality !== undefined ? { nationality: data.nationality } : {}),
          ...(data.aadhaar !== undefined ? { aadhaar: data.aadhaar } : {}),
          ...(data.passport !== undefined ? { passport: data.passport } : {}),
          ...(data.address !== undefined ? { address: data.address } : {}),
          ...(data.photoPath !== undefined ? { photoPath: data.photoPath } : {}),
          ...(data.status !== undefined ? { status: data.status } : {}),
        },
      }),
  };
}
