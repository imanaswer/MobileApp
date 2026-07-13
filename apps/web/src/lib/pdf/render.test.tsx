import { Document, Page, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { describe, expect, it } from "vitest";

// De-risk: confirm @react-pdf/renderer renders to a real PDF byte buffer in Node.
describe("react-pdf render", () => {
  it("produces a non-empty PDF buffer", async () => {
    const buf = await renderToBuffer(
      <Document>
        <Page size="A4">
          <View>
            <Text>Smoke test</Text>
          </View>
        </Page>
      </Document>,
    );
    expect(buf.length).toBeGreaterThan(0);
    // PDF magic bytes.
    expect(buf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });
});
