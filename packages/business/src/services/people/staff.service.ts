import { PERMISSIONS } from "@repo/constants";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@repo/core";
import type { Staff } from "@repo/db";
import type { StaffDto } from "@repo/types";

import { assertCan } from "../../authorization";
import type { ServiceContext } from "../../context";

import { mapStaff } from "./mappers";
import { isFullAccess, recordAudit } from "./scope";

export interface CreateStaffInput {
  userId: string;
  employeeId: string;
  department?: string | undefined;
  qualification?: string | undefined;
  experienceYears?: number | undefined;
  joiningDate?: Date | undefined;
  bio?: string | undefined;
}

export interface UpdateStaffInput {
  employeeId?: string | undefined;
  department?: string | null | undefined;
  qualification?: string | null | undefined;
  experienceYears?: number | null | undefined;
  joiningDate?: Date | null | undefined;
  bio?: string | null | undefined;
}

/** List staff profiles (admin → all; TEACHER → only their own). */
export async function listStaff(ctx: ServiceContext): Promise<StaffDto[]> {
  assertCan(ctx.user, PERMISSIONS.STAFF_READ);
  if (isFullAccess(ctx)) {
    const rows = await ctx.repositories.staff.list(ctx.user.schoolId);
    return rows.map(mapStaff);
  }
  const own = await ctx.repositories.staff.findByUserId(ctx.user.userId);
  return own ? [mapStaff(own)] : [];
}

export async function getStaff(ctx: ServiceContext, id: string): Promise<StaffDto> {
  assertCan(ctx.user, PERMISSIONS.STAFF_READ);
  const staff = await loadStaffInSchool(ctx, id);
  if (!isFullAccess(ctx) && staff.userId !== ctx.user.userId) {
    throw new ForbiddenError("Out of scope for this staff profile");
  }
  return mapStaff(staff);
}

export async function createStaff(ctx: ServiceContext, input: CreateStaffInput): Promise<StaffDto> {
  assertCan(ctx.user, PERMISSIONS.STAFF_MANAGE);
  await assertUserInSchool(ctx, input.userId);
  if (await ctx.repositories.staff.findByUserId(input.userId)) {
    throw new ConflictError("That user already has a staff profile");
  }
  if (await ctx.repositories.staff.findByEmployeeId(ctx.user.schoolId, input.employeeId)) {
    throw new ConflictError(`Employee id "${input.employeeId}" is already in use`);
  }
  return ctx.withTransaction(async (repos) => {
    const created = await repos.staff.create({ schoolId: ctx.user.schoolId, ...input });
    await recordAudit(ctx, repos, {
      action: "STAFF_CREATE",
      entityType: "Staff",
      entityId: created.id,
      after: { employeeId: created.employeeId, userId: created.userId },
    });
    return mapStaff(created);
  });
}

export async function updateStaff(
  ctx: ServiceContext,
  id: string,
  input: UpdateStaffInput,
): Promise<StaffDto> {
  assertCan(ctx.user, PERMISSIONS.STAFF_MANAGE);
  const before = await loadStaffInSchool(ctx, id);
  if (input.employeeId && input.employeeId !== before.employeeId) {
    const clash = await ctx.repositories.staff.findByEmployeeId(ctx.user.schoolId, input.employeeId);
    if (clash && clash.id !== id) {
      throw new ConflictError(`Employee id "${input.employeeId}" is already in use`);
    }
  }
  return ctx.withTransaction(async (repos) => {
    const after = await repos.staff.update(id, input);
    await recordAudit(ctx, repos, {
      action: "STAFF_UPDATE",
      entityType: "Staff",
      entityId: id,
      before: { employeeId: before.employeeId },
      after: { employeeId: after.employeeId },
    });
    return mapStaff(after);
  });
}

export async function deleteStaff(ctx: ServiceContext, id: string): Promise<void> {
  assertCan(ctx.user, PERMISSIONS.STAFF_MANAGE);
  const before = await loadStaffInSchool(ctx, id);
  await ctx.withTransaction(async (repos) => {
    await repos.staff.delete(id);
    await recordAudit(ctx, repos, {
      action: "STAFF_DELETE",
      entityType: "Staff",
      entityId: id,
      before: { employeeId: before.employeeId },
    });
  });
}

async function loadStaffInSchool(ctx: ServiceContext, id: string): Promise<Staff> {
  const staff = await ctx.repositories.staff.findById(id);
  if (!staff || staff.schoolId !== ctx.user.schoolId) {
    throw new NotFoundError("Staff profile not found");
  }
  return staff;
}

async function assertUserInSchool(ctx: ServiceContext, userId: string): Promise<void> {
  const user = await ctx.repositories.users.findById(userId);
  if (!user || user.schoolId !== ctx.user.schoolId) {
    throw new ValidationError("User not found in this school");
  }
}
