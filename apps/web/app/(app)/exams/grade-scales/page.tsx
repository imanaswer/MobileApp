"use client";

import { Award } from "lucide-react";
import { useState } from "react";

import {
  Button,
  DataTable,
  Dialog,
  EmptyState,
  ErrorState,
  Input,
  PageHeader,
  Skeleton,
  useToast,
  type Column,
} from "@/src/components/ui";
import { trpc } from "@/src/trpc/react";

type BandForm = { grade: string; minPercent: string; maxPercent: string; gradePoint: string };
const blankBand: BandForm = { grade: "", minPercent: "", maxPercent: "", gradePoint: "" };

type Band = {
  id: string;
  grade: string;
  minPercent: number;
  maxPercent: number;
  gradePoint: number | null;
};

const bandColumns: Column<Band>[] = [
  {
    key: "grade",
    header: "Grade",
    render: (b) => <span className="font-medium text-neutral-800">{b.grade}</span>,
  },
  { key: "min", header: "Min %", align: "right", render: (b) => b.minPercent },
  { key: "max", header: "Max %", align: "right", render: (b) => b.maxPercent },
  { key: "point", header: "Point", align: "right", render: (b) => b.gradePoint ?? "—" },
];

/**
 * Grade-scale management (M5, ADR-012). A scale is a set of percent bands with an
 * optional grade point. Marks snapshot the letter/point at lock, so scales are
 * append-only here (edits never mutate published history — create a new scale).
 */
export default function GradeScalesPage() {
  const scales = trpc.gradeScale.list.useQuery();
  const [creating, setCreating] = useState(false);

  return (
    <section className="flex flex-col gap-4">
      <PageHeader
        title="Grade scales"
        action={
          <Button icon={Award} onClick={() => setCreating(true)}>
            New grade scale
          </Button>
        }
      />

      {scales.isLoading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : scales.isError ? (
        <ErrorState message="Couldn’t load grade scales." onRetry={() => void scales.refetch()} />
      ) : (scales.data ?? []).length === 0 ? (
        <EmptyState icon={Award} title="No grade scales yet." />
      ) : (
        (scales.data ?? []).map((scale) => (
          <div key={scale.id} className="flex flex-col gap-2">
            <p className="font-medium text-neutral-800">
              {scale.name}
              {scale.isDefault ? (
                <span className="ml-2 text-sm font-normal text-neutral-500">(default)</span>
              ) : null}
            </p>
            <DataTable
              columns={bandColumns}
              rows={[...scale.bands].sort((a, b) => b.minPercent - a.minPercent)}
              rowKey={(b) => b.id}
              empty={<EmptyState title="No bands." />}
            />
          </div>
        ))
      )}

      {creating ? <GradeScaleFormModal onClose={() => setCreating(false)} /> : null}
    </section>
  );
}

function GradeScaleFormModal({ onClose }: { onClose: () => void }) {
  const { show } = useToast();
  const utils = trpc.useUtils();
  const create = trpc.gradeScale.create.useMutation({
    onSuccess: () => {
      void utils.gradeScale.list.invalidate();
      show("success", "Grade scale created");
      onClose();
    },
    onError: (e) => show("error", e.message),
  });

  const [name, setName] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [bands, setBands] = useState<BandForm[]>([{ ...blankBand }]);

  const setBand = (i: number, patch: Partial<BandForm>) =>
    setBands((prev) => prev.map((b, j) => (j === i ? { ...b, ...patch } : b)));

  return (
    <Dialog title="New grade scale" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate({
            name: name.trim(),
            isDefault,
            bands: bands.map((b) => ({
              grade: b.grade.trim(),
              minPercent: Number(b.minPercent),
              maxPercent: Number(b.maxPercent),
              gradePoint: b.gradePoint.trim() === "" ? null : Number(b.gradePoint),
            })),
          });
        }}
        className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto"
      >
        <Input
          label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="CBSE 2024"
          required
        />
        <label className="flex items-center gap-2 text-sm font-medium text-neutral-800">
          <input
            type="checkbox"
            checked={isDefault}
            onChange={(e) => setIsDefault(e.target.checked)}
          />
          Default scale
        </label>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-neutral-800">Bands</span>
          {bands.map((b, i) => (
            <div key={i} className="flex flex-wrap items-end gap-2">
              <Input
                label="Grade"
                value={b.grade}
                onChange={(e) => setBand(i, { grade: e.target.value })}
                className="w-16"
                required
              />
              <Input
                label="Min %"
                type="number"
                min={0}
                value={b.minPercent}
                onChange={(e) => setBand(i, { minPercent: e.target.value })}
                className="w-20"
                required
              />
              <Input
                label="Max %"
                type="number"
                min={0}
                value={b.maxPercent}
                onChange={(e) => setBand(i, { maxPercent: e.target.value })}
                className="w-20"
                required
              />
              <Input
                label="Point"
                type="number"
                min={0}
                step="0.1"
                value={b.gradePoint}
                onChange={(e) => setBand(i, { gradePoint: e.target.value })}
                className="w-20"
                placeholder="—"
              />
              {bands.length > 1 ? (
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={() => setBands((prev) => prev.filter((_, j) => j !== i))}
                >
                  Remove
                </Button>
              ) : null}
            </div>
          ))}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="self-start"
            onClick={() => setBands((prev) => [...prev, { ...blankBand }])}
          >
            Add band
          </Button>
        </div>

        {create.error ? <p className="text-sm text-danger-600">{create.error.message}</p> : null}

        <div className="mt-2 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={create.isPending}>
            Save
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
