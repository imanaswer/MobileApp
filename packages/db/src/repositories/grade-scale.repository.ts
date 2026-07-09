import type { GradeBand, GradeScale } from "@prisma/client";

import type { DbClient } from "../db-client";

export type { GradeBand, GradeScale };

export type GradeScaleWithBands = GradeScale & { bands: GradeBand[] };

export interface CreateGradeBandInput {
  grade: string;
  minPercent: number;
  maxPercent: number;
  gradePoint?: number | null;
}

export interface CreateGradeScaleInput {
  schoolId: string;
  name: string;
  isDefault: boolean;
  bands: CreateGradeBandInput[];
}

/** GradeScale/GradeBand persistence (M5). Persistence only. Bands sorted by minPercent. */
export interface GradeScaleRepository {
  listBySchool(schoolId: string): Promise<GradeScaleWithBands[]>;
  findByIdWithBands(id: string): Promise<GradeScaleWithBands | null>;
  findDefaultWithBands(schoolId: string): Promise<GradeScaleWithBands | null>;
  create(input: CreateGradeScaleInput): Promise<GradeScaleWithBands>;
}

const withBands = { include: { bands: { orderBy: { minPercent: "asc" } } } } as const;

export function createGradeScaleRepository(client: DbClient): GradeScaleRepository {
  return {
    listBySchool: (schoolId) =>
      client.gradeScale.findMany({ where: { schoolId }, orderBy: { name: "asc" }, ...withBands }),
    findByIdWithBands: (id) => client.gradeScale.findUnique({ where: { id }, ...withBands }),
    findDefaultWithBands: (schoolId) =>
      client.gradeScale.findFirst({ where: { schoolId, isDefault: true }, ...withBands }),
    create: (input) =>
      client.gradeScale.create({
        data: {
          schoolId: input.schoolId,
          name: input.name,
          isDefault: input.isDefault,
          bands: {
            create: input.bands.map((b) => ({
              grade: b.grade,
              minPercent: b.minPercent,
              maxPercent: b.maxPercent,
              gradePoint: b.gradePoint ?? null,
            })),
          },
        },
        ...withBands,
      }),
  };
}
