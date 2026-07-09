"use client";

import { useState } from "react";

import {
  inputClass,
  labelClass,
  Modal,
  outlineBtn,
  primaryBtn,
  smallDangerBtn,
  TableShell,
} from "@/src/components/academic/ui";
import { trpc } from "@/src/trpc/react";

type BandForm = { grade: string; minPercent: string; maxPercent: string; gradePoint: string };
const blankBand: BandForm = { grade: "", minPercent: "", maxPercent: "", gradePoint: "" };

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
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-foreground">Grade scales</h2>
        <button type="button" onClick={() => setCreating(true)} className={primaryBtn}>
          New grade scale
        </button>
      </div>

      {scales.isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : scales.isError ? (
        <p className="text-destructive">Couldn’t load grade scales.</p>
      ) : (scales.data ?? []).length === 0 ? (
        <p className="text-muted-foreground">No grade scales yet.</p>
      ) : (
        (scales.data ?? []).map((scale) => (
          <div key={scale.id} className="flex flex-col gap-2 rounded-md border border-border p-4">
            <p className="font-medium text-foreground">
              {scale.name}
              {scale.isDefault ? (
                <span className="ml-2 text-sm font-normal text-muted-foreground">(default)</span>
              ) : null}
            </p>
            <TableShell
              head={["Grade", "Min %", "Max %", "Point"]}
              isLoading={false}
              isError={false}
              isEmpty={scale.bands.length === 0}
              emptyText="No bands."
            >
              {[...scale.bands]
                .sort((a, b) => b.minPercent - a.minPercent)
                .map((b) => (
                  <tr key={b.id} className="border-b border-border last:border-b-0">
                    <td className="px-4 py-2 font-medium text-foreground">{b.grade}</td>
                    <td className="px-4 py-2 text-muted-foreground">{b.minPercent}</td>
                    <td className="px-4 py-2 text-muted-foreground">{b.maxPercent}</td>
                    <td className="px-4 py-2 text-muted-foreground">{b.gradePoint ?? "—"}</td>
                  </tr>
                ))}
            </TableShell>
          </div>
        ))
      )}

      {creating ? <GradeScaleFormModal onClose={() => setCreating(false)} /> : null}
    </section>
  );
}

function GradeScaleFormModal({ onClose }: { onClose: () => void }) {
  const utils = trpc.useUtils();
  const create = trpc.gradeScale.create.useMutation({
    onSuccess: () => {
      void utils.gradeScale.list.invalidate();
      onClose();
    },
  });

  const [name, setName] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [bands, setBands] = useState<BandForm[]>([{ ...blankBand }]);

  const setBand = (i: number, patch: Partial<BandForm>) =>
    setBands((prev) => prev.map((b, j) => (j === i ? { ...b, ...patch } : b)));

  return (
    <Modal title="New grade scale" onClose={onClose}>
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
        <label className={labelClass}>
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
            placeholder="CBSE 2024"
            required
          />
        </label>
        <label className="flex items-center gap-2 text-sm font-medium text-foreground">
          <input
            type="checkbox"
            checked={isDefault}
            onChange={(e) => setIsDefault(e.target.checked)}
          />
          Default scale
        </label>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-foreground">Bands</span>
          {bands.map((b, i) => (
            <div key={i} className="flex flex-wrap items-end gap-2">
              <label className={`${labelClass} text-xs`}>
                Grade
                <input
                  value={b.grade}
                  onChange={(e) => setBand(i, { grade: e.target.value })}
                  className={`${inputClass} w-16`}
                  required
                />
              </label>
              <label className={`${labelClass} text-xs`}>
                Min %
                <input
                  type="number"
                  min={0}
                  value={b.minPercent}
                  onChange={(e) => setBand(i, { minPercent: e.target.value })}
                  className={`${inputClass} w-20`}
                  required
                />
              </label>
              <label className={`${labelClass} text-xs`}>
                Max %
                <input
                  type="number"
                  min={0}
                  value={b.maxPercent}
                  onChange={(e) => setBand(i, { maxPercent: e.target.value })}
                  className={`${inputClass} w-20`}
                  required
                />
              </label>
              <label className={`${labelClass} text-xs`}>
                Point
                <input
                  type="number"
                  min={0}
                  step="0.1"
                  value={b.gradePoint}
                  onChange={(e) => setBand(i, { gradePoint: e.target.value })}
                  className={`${inputClass} w-20`}
                  placeholder="—"
                />
              </label>
              {bands.length > 1 ? (
                <button
                  type="button"
                  onClick={() => setBands((prev) => prev.filter((_, j) => j !== i))}
                  className={smallDangerBtn}
                >
                  Remove
                </button>
              ) : null}
            </div>
          ))}
          <button
            type="button"
            onClick={() => setBands((prev) => [...prev, { ...blankBand }])}
            className={`${outlineBtn} self-start`}
          >
            Add band
          </button>
        </div>

        {create.error ? <p className="text-sm text-destructive">{create.error.message}</p> : null}

        <div className="mt-2 flex justify-end gap-2">
          <button type="button" onClick={onClose} className={outlineBtn}>
            Cancel
          </button>
          <button type="submit" disabled={create.isPending} className={primaryBtn}>
            {create.isPending ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
