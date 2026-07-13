import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { CertificatePdfData, PdfRenderer, PdfRow, ReportCardPdfData } from "@repo/api";

/**
 * The web host's `PdfRenderer` adapter (ADR-026). This is the ONLY place react-pdf
 * is imported — the business layer stays framework-free and hands us plain, already
 * FROZEN data (ADR-014). Two clean institutional templates: a school header, a title,
 * a label/value table of the snapshot, and the issue date.
 */

const styles = StyleSheet.create({
  page: {
    paddingVertical: 48,
    paddingHorizontal: 56,
    fontSize: 11,
    color: "#1a1a1a",
    fontFamily: "Helvetica",
  },
  header: {
    borderBottomWidth: 2,
    borderBottomColor: "#1a1a1a",
    paddingBottom: 10,
    marginBottom: 24,
  },
  schoolName: { fontSize: 18, fontFamily: "Helvetica-Bold" },
  title: {
    fontSize: 15,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
    marginBottom: 6,
  },
  subline: { fontSize: 10, color: "#555", textAlign: "center", marginBottom: 24 },
  row: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e2e2",
    paddingVertical: 6,
  },
  label: { width: "40%", fontFamily: "Helvetica-Bold", color: "#333" },
  value: { width: "60%" },
  issued: { marginTop: 32, fontSize: 10, color: "#555" },
});

function placement(cls: string | null, section: string | null): string {
  return [cls, section].filter(Boolean).join(" · ") || "—";
}

function TableDoc(props: {
  schoolName: string;
  title: string;
  studentName: string;
  placementLine: string;
  rows: PdfRow[];
  issuedOn: string;
}) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.schoolName}>{props.schoolName}</Text>
        </View>
        <Text style={styles.title}>{props.title}</Text>
        <Text style={styles.subline}>
          {props.studentName} — {props.placementLine}
        </Text>
        <View>
          {props.rows.map((r, i) => (
            <View key={i} style={styles.row}>
              <Text style={styles.label}>{r.label}</Text>
              <Text style={styles.value}>{r.value}</Text>
            </View>
          ))}
        </View>
        <Text style={styles.issued}>Issued on {props.issuedOn}</Text>
      </Page>
    </Document>
  );
}

/** Build the web host's PDF renderer. `renderToBuffer` returns a Node Buffer (a Uint8Array). */
export function createPdfRenderer(): PdfRenderer {
  return {
    renderCertificate: (data: CertificatePdfData) =>
      renderToBuffer(
        <TableDoc
          schoolName={data.schoolName}
          title={data.title}
          studentName={data.studentName}
          placementLine={placement(data.class, data.section)}
          rows={[
            ...(data.academicYear ? [{ label: "Academic Year", value: data.academicYear }] : []),
            ...data.rows,
          ]}
          issuedOn={data.issuedOn}
        />,
      ),
    renderReportCard: (data: ReportCardPdfData) =>
      renderToBuffer(
        <TableDoc
          schoolName={data.schoolName}
          title={data.title}
          studentName={data.studentName}
          placementLine={placement(data.class, data.section)}
          rows={data.rows}
          issuedOn={data.issuedOn}
        />,
      ),
  };
}
