import type { CertificatePdfData, ReportCardPdfData } from "@repo/api";
import { describe, expect, it } from "vitest";

import { createPdfRenderer } from "./renderer";

const pdf = createPdfRenderer();

const cert: CertificatePdfData = {
  schoolName: "Green Valley School",
  title: "Bonafide Certificate",
  studentName: "Anu A",
  class: "Grade 5",
  section: "B",
  academicYear: "2026-27",
  issuedOn: "2026-07-13",
  rows: [
    { label: "Admission No", value: "A001" },
    { label: "Purpose", value: "Bank account" },
  ],
};

const card: ReportCardPdfData = {
  schoolName: "Green Valley School",
  title: "Report Card",
  studentName: "Anu A",
  class: "Grade 5",
  section: "B",
  issuedOn: "2026-07-13",
  rows: [
    { label: "Assessment", value: "Term 1" },
    { label: "Rank", value: "3 of 40" },
    { label: "GPA", value: "8.6" },
    { label: "Attendance", value: "94%" },
  ],
};

// PDF magic bytes — a real, non-empty document.
function assertPdf(bytes: Uint8Array) {
  expect(bytes.length).toBeGreaterThan(0);
  expect(Buffer.from(bytes.subarray(0, 5)).toString("latin1")).toBe("%PDF-");
}

describe("web pdf renderer (ADR-026)", () => {
  it("renders a certificate to a real PDF buffer", async () => {
    assertPdf(await pdf.renderCertificate(cert));
  });
  it("renders a report card to a real PDF buffer", async () => {
    assertPdf(await pdf.renderReportCard(card));
  });
});
