"use client";

import { PERMISSIONS } from "@repo/constants";
import { can } from "@repo/core";
import type { StaffDto } from "@repo/types";
import { GraduationCap } from "lucide-react";
import { useCallback, useState } from "react";

import { Paginator, usePagedSearch } from "@/src/components/academic/ui";
import {
  Avatar,
  Button,
  ConfirmDialog,
  DataTable,
  Dialog,
  EmptyState,
  Input,
  PageHeader,
  SearchInput,
  TableToolbar,
  useToast,
  type Column,
} from "@/src/components/ui";
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
  const { show } = useToast();

  const profiles = trpc.teacherProfile.list.useQuery();
  const utils = trpc.useUtils();
  const invalidate = () => utils.teacherProfile.list.invalidate();

  const create = trpc.teacherProfile.create.useMutation({
    onSuccess: () => {
      invalidate();
      show("success", "Profile created");
    },
    onError: (e) => show("error", e.message),
  });
  const update = trpc.teacherProfile.update.useMutation({
    onSuccess: () => {
      invalidate();
      show("success", "Profile updated");
    },
    onError: (e) => show("error", e.message),
  });
  const remove = trpc.teacherProfile.delete.useMutation({
    onSuccess: () => {
      invalidate();
      show("success", "Profile deleted");
    },
    onError: (e) => show("error", e.message),
  });

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

  const columns: Column<StaffDto>[] = [
    {
      key: "teacher",
      header: "Teacher",
      render: (p) => (
        <div className="flex items-center gap-3">
          <Avatar name={p.name} size="sm" />
          <div className="flex flex-col">
            <span className="font-medium text-neutral-800">{p.name}</span>
            <span className="text-caption text-neutral-500">{p.employeeId}</span>
          </div>
        </div>
      ),
    },
    { key: "department", header: "Department", render: (p) => p.department ?? "—" },
    { key: "qualification", header: "Qualification", render: (p) => p.qualification ?? "—" },
    {
      key: "experience",
      header: "Experience",
      render: (p) => (p.experienceYears != null ? `${p.experienceYears} yrs` : "—"),
    },
    { key: "joined", header: "Joined", render: (p) => p.joiningDate ?? "—" },
    {
      key: "actions",
      header: "Actions",
      render: (p) =>
        canManage ? (
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                create.reset();
                update.reset();
                setEditing(p);
              }}
            >
              Edit
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-danger-600 hover:bg-danger-50"
              onClick={() => {
                remove.reset();
                setDeleting(p);
              }}
            >
              Delete
            </Button>
          </div>
        ) : (
          <span className="text-neutral-500">—</span>
        ),
    },
  ];

  return (
    <section className="flex flex-col gap-4">
      <PageHeader
        title="Teacher profiles"
        action={
          canManage ? (
            <Button
              icon={GraduationCap}
              onClick={() => {
                create.reset();
                update.reset();
                setEditing("new");
              }}
            >
              New profile
            </Button>
          ) : undefined
        }
      />

      <DataTable
        columns={columns}
        rows={paged.pageItems}
        rowKey={(p) => p.id}
        loading={profiles.isLoading}
        error={profiles.isError}
        onRetry={() => void profiles.refetch()}
        empty={<EmptyState icon={GraduationCap} title="No teacher profiles yet." />}
        toolbar={
          <TableToolbar
            search={
              <SearchInput
                value={paged.query}
                onChange={(e) => paged.setQuery(e.target.value)}
                aria-label="Search teacher profiles"
              />
            }
          />
        }
        footer={
          <Paginator
            page={paged.page}
            pageCount={paged.pageCount}
            total={paged.total}
            onPage={paged.setPage}
          />
        }
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
        <ConfirmDialog
          title="Delete teacher profile"
          objectName={deleting.employeeId}
          message="Permanently delete this profile? The user account is NOT deleted — only the employment profile:"
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
    <Dialog title={profile ? "Edit teacher profile" : "New teacher profile"} onClose={onClose}>
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
        className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto pr-1"
      >
        <Input
          label="User id (the teacher’s account)"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          required
          disabled={profile !== null}
          placeholder="From the user admin list"
        />
        <Input
          label="Full name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          placeholder="e.g. Anaswer Rajan"
        />
        <Input
          label="Employee id"
          value={employeeId}
          onChange={(e) => setEmployeeId(e.target.value)}
          required
        />
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Department"
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
          />
          <Input
            label="Qualification"
            value={qualification}
            onChange={(e) => setQualification(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Experience (years)"
            type="number"
            min={0}
            max={80}
            value={experienceYears}
            onChange={(e) => setExperienceYears(e.target.value)}
          />
          <Input
            label="Joining date"
            type="date"
            value={joiningDate}
            onChange={(e) => setJoiningDate(e.target.value)}
          />
        </div>
        <label className="flex flex-col gap-1 text-sm font-medium text-neutral-800">
          Bio
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            className="min-h-20 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-body text-neutral-800 focus:border-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-600"
            rows={3}
          />
        </label>

        {error ? <p className="text-sm text-danger-600">{error}</p> : null}

        <div className="mt-2 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={busy}>
            Save
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
