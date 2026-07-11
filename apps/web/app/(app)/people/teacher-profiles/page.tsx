"use client";

import { PERMISSIONS } from "@repo/constants";
import { can } from "@repo/core";
import type { StaffDto } from "@repo/types";
import { useCallback, useState } from "react";

import {
  ConfirmDelete,
  inputClass,
  labelClass,
  ListToolbar,
  Modal,
  outlineBtn,
  Paginator,
  primaryBtn,
  smallDangerBtn,
  smallGhostBtn,
  TableShell,
  usePagedSearch,
} from "@/src/components/academic/ui";
import { trpc } from "@/src/trpc/react";

/**
 * Teacher (staff) profiles CRUD — the employment profile EXTENDING a User
 * (one-to-one; authentication stays on User). Creation takes the user id, like
 * the M2 teacher-assignment form — a user directory picker can replace it
 * later. A TEACHER sees only their own profile (service row scope), no actions.
 */
export default function TeacherProfilesPage() {
  const me = trpc.auth.me.useQuery();
  const canManage = me.data !== undefined && can(me.data.role, PERMISSIONS.STAFF_MANAGE);

  const profiles = trpc.teacherProfile.list.useQuery();
  const utils = trpc.useUtils();
  const invalidate = () => utils.teacherProfile.list.invalidate();

  const create = trpc.teacherProfile.create.useMutation({ onSuccess: invalidate });
  const update = trpc.teacherProfile.update.useMutation({ onSuccess: invalidate });
  const remove = trpc.teacherProfile.delete.useMutation({ onSuccess: invalidate });

  const [editing, setEditing] = useState<StaffDto | "new" | null>(null);
  const [deleting, setDeleting] = useState<StaffDto | null>(null);

  const paged = usePagedSearch(
    profiles.data,
    useCallback(
      (profile: StaffDto, q: string) =>
        profile.employeeId.toLowerCase().includes(q) ||
        (profile.department ?? "").toLowerCase().includes(q),
      [],
    ),
  );

  return (
    <section className="flex flex-col gap-4">
      <ListToolbar
        searchValue={paged.query}
        onSearch={paged.setQuery}
        searchLabel="Search teacher profiles"
        action={
          canManage ? (
            <button
              type="button"
              onClick={() => {
                create.reset();
                update.reset();
                setEditing("new");
              }}
              className={primaryBtn}
            >
              New profile
            </button>
          ) : undefined
        }
      />

      <TableShell
        head={["Employee id", "Department", "Qualification", "Experience", "Joined", "Actions"]}
        isLoading={profiles.isLoading}
        isError={profiles.isError}
        isEmpty={paged.total === 0}
        emptyText="No teacher profiles yet."
      >
        {paged.pageItems.map((profile) => (
          <tr key={profile.id} className="border-b border-border last:border-b-0">
            <td className="px-4 py-3 font-medium text-foreground">{profile.employeeId}</td>
            <td className="px-4 py-3 text-muted-foreground">{profile.department ?? "—"}</td>
            <td className="px-4 py-3 text-muted-foreground">{profile.qualification ?? "—"}</td>
            <td className="px-4 py-3 text-muted-foreground">
              {profile.experienceYears != null ? `${profile.experienceYears} yrs` : "—"}
            </td>
            <td className="px-4 py-3 text-muted-foreground">{profile.joiningDate ?? "—"}</td>
            <td className="px-4 py-3">
              {canManage ? (
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      create.reset();
                      update.reset();
                      setEditing(profile);
                    }}
                    className={smallGhostBtn}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      remove.reset();
                      setDeleting(profile);
                    }}
                    className={smallDangerBtn}
                  >
                    Delete
                  </button>
                </div>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </td>
          </tr>
        ))}
      </TableShell>

      <Paginator
        page={paged.page}
        pageCount={paged.pageCount}
        total={paged.total}
        onPage={paged.setPage}
      />

      {editing !== null ? (
        <StaffFormModal
          profile={editing === "new" ? null : editing}
          busy={create.isPending || update.isPending}
          error={create.error?.message ?? update.error?.message ?? null}
          onClose={() => setEditing(null)}
          onSubmit={(values) => {
            const done = { onSuccess: () => setEditing(null) };
            if (editing === "new") {
              create.mutate(
                {
                  userId: values.userId,
                  name: values.name,
                  employeeId: values.employeeId,
                  ...(values.department ? { department: values.department } : {}),
                  ...(values.qualification ? { qualification: values.qualification } : {}),
                  ...(values.experienceYears != null
                    ? { experienceYears: values.experienceYears }
                    : {}),
                  ...(values.joiningDate ? { joiningDate: values.joiningDate } : {}),
                  ...(values.bio ? { bio: values.bio } : {}),
                },
                done,
              );
            } else {
              update.mutate(
                {
                  id: editing.id,
                  name: values.name,
                  employeeId: values.employeeId,
                  department: values.department || null,
                  qualification: values.qualification || null,
                  experienceYears: values.experienceYears,
                  joiningDate: values.joiningDate || null,
                  bio: values.bio || null,
                },
                done,
              );
            }
          }}
        />
      ) : null}

      {deleting !== null ? (
        <ConfirmDelete
          title="Delete teacher profile"
          message={`Permanently delete profile “${deleting.employeeId}”? The user account is NOT deleted — only the employment profile.`}
          busy={remove.isPending}
          error={remove.error?.message ?? null}
          onCancel={() => setDeleting(null)}
          onConfirm={() =>
            remove.mutate({ id: deleting.id }, { onSuccess: () => setDeleting(null) })
          }
        />
      ) : null}
    </section>
  );
}

interface StaffFormValues {
  userId: string;
  name: string;
  employeeId: string;
  department: string;
  qualification: string;
  experienceYears: number | null;
  joiningDate: string;
  bio: string;
}

function StaffFormModal({
  profile,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  profile: StaffDto | null;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (values: StaffFormValues) => void;
}) {
  const [userId, setUserId] = useState(profile?.userId ?? "");
  const [name, setName] = useState(profile?.name ?? "");
  const [employeeId, setEmployeeId] = useState(profile?.employeeId ?? "");
  const [department, setDepartment] = useState(profile?.department ?? "");
  const [qualification, setQualification] = useState(profile?.qualification ?? "");
  const [experienceYears, setExperienceYears] = useState(
    profile?.experienceYears != null ? String(profile.experienceYears) : "",
  );
  const [joiningDate, setJoiningDate] = useState<string>(profile?.joiningDate ?? "");
  const [bio, setBio] = useState(profile?.bio ?? "");

  return (
    <Modal title={profile ? "Edit teacher profile" : "New teacher profile"} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit({
            userId: userId.trim(),
            name: name.trim(),
            employeeId: employeeId.trim(),
            department: department.trim(),
            qualification: qualification.trim(),
            experienceYears: experienceYears === "" ? null : Number(experienceYears),
            joiningDate,
            bio: bio.trim(),
          });
        }}
        className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto pr-1"
      >
        <label className={labelClass}>
          User id (the teacher’s account)
          <input
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className={inputClass}
            required
            disabled={profile !== null}
            placeholder="From the user admin list"
          />
        </label>
        <label className={labelClass}>
          Full name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
            required
            placeholder="e.g. Anaswer Rajan"
          />
        </label>
        <label className={labelClass}>
          Employee id
          <input
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
            className={inputClass}
            required
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className={labelClass}>
            Department
            <input
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className={inputClass}
            />
          </label>
          <label className={labelClass}>
            Qualification
            <input
              value={qualification}
              onChange={(e) => setQualification(e.target.value)}
              className={inputClass}
            />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className={labelClass}>
            Experience (years)
            <input
              type="number"
              min={0}
              max={80}
              value={experienceYears}
              onChange={(e) => setExperienceYears(e.target.value)}
              className={inputClass}
            />
          </label>
          <label className={labelClass}>
            Joining date
            <input
              type="date"
              value={joiningDate}
              onChange={(e) => setJoiningDate(e.target.value)}
              className={inputClass}
            />
          </label>
        </div>
        <label className={labelClass}>
          Bio
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            className={`${inputClass} min-h-20`}
            rows={3}
          />
        </label>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <div className="mt-2 flex justify-end gap-2">
          <button type="button" onClick={onClose} className={outlineBtn}>
            Cancel
          </button>
          <button type="submit" disabled={busy} className={primaryBtn}>
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
