"use client";

import type { ImportReportDto } from "@repo/types";
import { Upload } from "lucide-react";
import { useState } from "react";

import { downloadCsv } from "@/src/components/analytics/csv";
import { Button, Dialog } from "@/src/components/ui";
import { trpc } from "@/src/trpc/react";

/** Must match IMPORT_COLUMNS in the business import service (fixed headers, no mapping UI). */
const TEMPLATE_HEADERS = [
  "admissionNo",
  "firstName",
  "lastName",
  "dob",
  "gender",
  "bloodGroup",
  "nationality",
  "aadhaar",
  "passport",
  "address",
  "guardianName",
  "guardianPhone",
  "guardianEmail",
  "guardianRelationship",
  "guardianIsPrimary",
];
const TEMPLATE_SAMPLE = [
  "ADM-001",
  "Asha",
  "Nair",
  "2015-06-01",
  "FEMALE",
  "O+",
  "Indian",
  "",
  "",
  "12 Beach Road, Kochi",
  "Meera Nair",
  "+919999900001",
  "meera@example.com",
  "MOTHER",
  "true",
];

/**
 * Bulk student/guardian CSV import (PRD §8.2, ADR-027). Upload → dry-run
 * validation report (zero writes) → explicit commit → summary + downloadable
 * per-row error report. Repeat a student's admissionNo on a second row to
 * attach another guardian.
 */
export function ImportCsvDialog({ onClose }: { onClose: () => void }) {
  const utils = trpc.useUtils();
  const [csv, setCsv] = useState<string | null>(null);
  const [report, setReport] = useState<ImportReportDto | null>(null);
  const importCsv = trpc.student.importCsv.useMutation({
    onSuccess: (r) => {
      setReport(r);
      if (!r.dryRun) {
        void utils.student.list.invalidate();
        void utils.parent.list.invalidate();
      }
    },
  });

  // Validate first (dryRun) — nothing is written until the operator confirms.
  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const text = await file.text();
    setCsv(text);
    importCsv.mutate({ csv: text, dryRun: true });
  };

  return (
    <Dialog title="Import students from CSV" onClose={onClose} size="lg">
      {report === null ? (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-neutral-600">
            Fixed columns — download the template, fill one student per row (repeat an admission
            number on a second row to add another guardian), then upload. Guardians are matched by
            phone number, so existing guardians are reused, not duplicated.
          </p>
          <Button
            variant="secondary"
            onClick={() =>
              downloadCsv("students-template.csv", TEMPLATE_HEADERS, [TEMPLATE_SAMPLE])
            }
          >
            Download template
          </Button>
          <label className="flex flex-col gap-1 text-sm text-neutral-700">
            CSV file
            <input
              type="file"
              accept=".csv,text/csv"
              disabled={importCsv.isPending}
              onChange={(e) => void onFile(e.target.files?.[0])}
              className="rounded-md border border-neutral-300 p-2"
            />
          </label>
          {importCsv.isPending && <p className="text-sm text-neutral-500">Importing…</p>}
          {importCsv.isError && (
            <p role="alert" className="text-sm text-danger-600">
              {importCsv.error.message}
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-neutral-700">
            {report.dryRun ? (
              <>
                Validation only — nothing imported yet. {report.studentsCreated} student
                {report.studentsCreated === 1 ? "" : "s"} · {report.guardiansCreated} new guardian
                {report.guardiansCreated === 1 ? "" : "s"} · {report.guardiansLinked} link
                {report.guardiansLinked === 1 ? "" : "s"} would be created · {report.errors.length}{" "}
                row{report.errors.length === 1 ? "" : "s"} with errors
              </>
            ) : (
              <>
                {report.studentsCreated} of {report.totalRows} rows imported ·{" "}
                {report.guardiansCreated} guardians created · {report.guardiansLinked} linked ·{" "}
                {report.errors.length} failed
              </>
            )}
          </p>
          {report.errors.length > 0 && (
            <>
              <div className="max-h-48 overflow-y-auto rounded-md border border-neutral-200">
                <table className="w-full text-sm">
                  <tbody>
                    {report.errors.map((e) => (
                      <tr key={e.row} className="border-b border-neutral-100 last:border-0">
                        <td className="w-16 px-3 py-1.5 text-neutral-500">Row {e.row}</td>
                        <td className="px-3 py-1.5 text-neutral-800">{e.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Button
                variant="secondary"
                onClick={() =>
                  downloadCsv(
                    "import-errors.csv",
                    ["row", "error"],
                    report.errors.map((e) => [e.row, e.message]),
                  )
                }
              >
                Download error report
              </Button>
            </>
          )}
          {report.dryRun ? (
            <div className="flex gap-2">
              <Button
                disabled={report.studentsCreated + report.guardiansLinked === 0}
                loading={importCsv.isPending}
                onClick={() => csv !== null && importCsv.mutate({ csv })}
              >
                {report.errors.length > 0 ? "Import valid rows anyway" : "Import"}
              </Button>
              <Button variant="secondary" onClick={() => setReport(null)}>
                Choose another file
              </Button>
            </div>
          ) : (
            <Button onClick={onClose}>Done</Button>
          )}
        </div>
      )}
    </Dialog>
  );
}

export function ImportCsvButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" icon={Upload} onClick={() => setOpen(true)}>
        Import CSV
      </Button>
      {open && <ImportCsvDialog onClose={() => setOpen(false)} />}
    </>
  );
}
