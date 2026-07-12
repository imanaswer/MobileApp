import { ConflictError, ForbiddenError } from "@repo/core";
import type {
  AcademicYear,
  Class,
  Document,
  DocumentStatus,
  Enrollment,
  Parent,
  Repositories,
  Section,
  Student,
} from "@repo/db";
import { createNotificationService } from "@repo/notifications";
import { describe, expect, it, vi } from "vitest";

import type { Principal } from "../../authorization";
import type { ServiceContext } from "../../context";
import type { StoragePort } from "../people/document-storage.service";

import {
  approveDocument,
  archiveDocument,
  createUploadedDocument,
  deleteDraftDocument,
  documentDownloadUrl,
  generateDocument,
  listStudentDocuments,
} from "./document.service";

const admin: Principal = {
  userId: "u-admin",
  schoolId: "s-1",
  role: "OFFICE_ADMIN",
  status: "ACTIVE",
};
const teacher: Principal = {
  userId: "u-teacher",
  schoolId: "s-1",
  role: "TEACHER",
  status: "ACTIVE",
};
const parent: Principal = { userId: "u-parent", schoolId: "s-1", role: "PARENT", status: "ACTIVE" };

const d = new Date("2026-06-01T00:00:00.000Z");
const student = {
  id: "st-1",
  schoolId: "s-1",
  firstName: "Anu",
  lastName: "A",
  admissionNo: "A001",
} as Student;

const doc = (over: Partial<Document> = {}): Document =>
  ({
    id: "doc-1",
    schoolId: "s-1",
    studentId: "st-1",
    type: "BONAFIDE_CERTIFICATE",
    status: "GENERATED",
    templateId: null,
    snapshotJson: null,
    storagePath: null,
    fileName: null,
    mimeType: null,
    sizeBytes: null,
    generatedByUserId: "u-admin",
    uploadedByUserId: null,
    approvedByUserId: null,
    approvedAt: null,
    archivedAt: null,
    createdAt: d,
    updatedAt: d,
    ...over,
  }) as Document;

/** Stateful document repo so lifecycle transitions are exercised for real. */
function makeRepos(start: Document, opts: { parentChild?: boolean } = {}) {
  const row = { ...start };
  return {
    audit: { record: vi.fn(async (): Promise<void> => undefined) },
    students: { findById: vi.fn(async (): Promise<Student | null> => student) },
    documents: {
      findById: vi.fn(async (): Promise<Document | null> => ({ ...row })),
      create: vi.fn(async (input: Record<string, unknown>): Promise<Document> => {
        Object.assign(row, { ...input, id: "doc-new", createdAt: d, updatedAt: d });
        return { ...row } as Document;
      }),
      update: vi.fn(async (_id: string, patch: Partial<Document>): Promise<Document> => {
        Object.assign(row, patch);
        return { ...row };
      }),
      delete: vi.fn(async (): Promise<void> => undefined),
      listByStudent: vi.fn(
        async (_sid: string, filter?: { status?: DocumentStatus }): Promise<Document[]> => {
          const all = [
            doc({ status: "APPROVED", id: "d-appr" }),
            doc({ status: "GENERATED", id: "d-draft" }),
          ];
          return filter?.status ? all.filter((x) => x.status === filter.status) : all;
        },
      ),
    },
    documentTemplates: { findById: vi.fn(async () => null) },
    academicYears: {
      findActive: vi.fn(async (): Promise<AcademicYear | null> => ({ id: "ay1" }) as AcademicYear),
      findById: vi.fn(
        async (): Promise<AcademicYear | null> => ({ id: "ay1", name: "2026-27" }) as AcademicYear,
      ),
    },
    enrollments: {
      findByStudentYear: vi.fn(
        async (): Promise<Enrollment | null> =>
          ({
            id: "e-1",
            studentId: "st-1",
            classId: "c1",
            sectionId: "sec1",
            academicYearId: "ay1",
          }) as Enrollment,
      ),
      listByStudent: vi.fn(async (): Promise<Enrollment[]> => []),
      studentIdsInSections: vi.fn(async (): Promise<string[]> => []),
    },
    sections: {
      findById: vi.fn(async (): Promise<Section | null> => ({ id: "sec1", name: "A" }) as Section),
    },
    classes: {
      findById: vi.fn(async (): Promise<Class | null> => ({ id: "c1", name: "Grade 1" }) as Class),
    },
    parents: {
      findByUserId: vi.fn(async (): Promise<Parent | null> =>
        opts.parentChild ? ({ id: "par-1", schoolId: "s-1", userId: "u-parent" } as Parent) : null,
      ),
    },
    studentParents: {
      studentIdsForParent: vi.fn(async (): Promise<string[]> => (opts.parentChild ? ["st-1"] : [])),
    },
    teacherAssignments: { list: vi.fn(async () => []) },
  };
}

function makeCtx(user: Principal, repos: ReturnType<typeof makeRepos>) {
  const repositories = repos as unknown as Repositories;
  const ctx: ServiceContext = {
    user,
    repositories,
    notifications: createNotificationService([]),
    withTransaction: <T>(fn: (r: Repositories) => Promise<T>) => fn(repositories),
  };
  return { ctx, repos };
}

const storage: StoragePort = {
  createSignedUploadUrl: vi.fn(async () => ({ signedUrl: "u", token: "t" })),
  createSignedDownloadUrl: vi.fn(async () => "https://signed/url"),
};

describe("document lifecycle (ADR-023)", () => {
  it("generate: freezes a system-sourced snapshot; no file yet (metadata-only)", async () => {
    const repos = makeRepos(doc());
    const { ctx } = makeCtx(admin, repos);
    const out = await generateDocument(ctx, { studentId: "st-1", type: "BONAFIDE_CERTIFICATE" });
    expect(out.status).toBe("GENERATED");
    expect(out.hasFile).toBe(false);
    expect(out.snapshot).toMatchObject({
      studentName: "Anu A",
      admissionNo: "A001",
      class: "Grade 1",
      section: "A",
      academicYear: "2026-27",
    });
    expect(repos.audit.record).toHaveBeenCalledTimes(1);
  });

  it("approve: GENERATED → APPROVED; only a draft can be approved", async () => {
    const { ctx: c1 } = makeCtx(admin, makeRepos(doc({ status: "GENERATED" })));
    expect((await approveDocument(c1, "doc-1")).status).toBe("APPROVED");
    const { ctx: c2 } = makeCtx(admin, makeRepos(doc({ status: "APPROVED" })));
    await expect(approveDocument(c2, "doc-1")).rejects.toBeInstanceOf(ConflictError);
  });

  it("archive: only an APPROVED document can be archived", async () => {
    const { ctx: ok } = makeCtx(admin, makeRepos(doc({ status: "APPROVED" })));
    expect((await archiveDocument(ok, "doc-1")).status).toBe("ARCHIVED");
    const { ctx: bad } = makeCtx(admin, makeRepos(doc({ status: "GENERATED" })));
    await expect(archiveDocument(bad, "doc-1")).rejects.toBeInstanceOf(ConflictError);
  });

  it("deleteDraft: only a draft; deleting an APPROVED doc is refused", async () => {
    const { ctx: ok, repos } = makeCtx(admin, makeRepos(doc({ status: "UPLOADED" })));
    await deleteDraftDocument(ok, "doc-1");
    expect(repos.documents.delete).toHaveBeenCalledTimes(1);
    const { ctx: bad } = makeCtx(admin, makeRepos(doc({ status: "APPROVED" })));
    await expect(deleteDraftDocument(bad, "doc-1")).rejects.toBeInstanceOf(ConflictError);
  });

  it("teacher cannot generate/upload (view-only)", async () => {
    const { ctx } = makeCtx(teacher, makeRepos(doc()));
    await expect(
      generateDocument(ctx, { studentId: "st-1", type: "BONAFIDE_CERTIFICATE" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      createUploadedDocument(ctx, {
        studentId: "st-1",
        type: "OTHER",
        storagePath: "p",
        fileName: "f",
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("list: admin sees all statuses; parent (own child) sees APPROVED only", async () => {
    const { ctx: a } = makeCtx(admin, makeRepos(doc()));
    expect(await listStudentDocuments(a, "st-1")).toHaveLength(2);
    const { ctx: p } = makeCtx(parent, makeRepos(doc(), { parentChild: true }));
    const out = await listStudentDocuments(p, "st-1");
    expect(out).toHaveLength(1);
    expect(out[0]?.status).toBe("APPROVED");
  });

  it("list: parent NOT linked to the child is refused", async () => {
    const { ctx } = makeCtx(parent, makeRepos(doc(), { parentChild: false }));
    await expect(listStudentDocuments(ctx, "st-1")).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("download: a metadata-only GENERATED doc has no file → ConflictError", async () => {
    const { ctx } = makeCtx(admin, makeRepos(doc({ status: "GENERATED", storagePath: null })));
    await expect(documentDownloadUrl(ctx, storage, "doc-1")).rejects.toBeInstanceOf(ConflictError);
  });

  it("download: parent on a non-APPROVED doc is refused (no draft leak)", async () => {
    const { ctx } = makeCtx(
      parent,
      makeRepos(doc({ status: "UPLOADED", storagePath: "p/x" }), { parentChild: true }),
    );
    await expect(documentDownloadUrl(ctx, storage, "doc-1")).rejects.toBeInstanceOf(ConflictError);
  });

  it("download: admin gets a signed URL for an approved doc with a file", async () => {
    const { ctx } = makeCtx(
      admin,
      makeRepos(doc({ status: "APPROVED", storagePath: "p/x", fileName: "cert.pdf" })),
    );
    const out = await documentDownloadUrl(ctx, storage, "doc-1");
    expect(out.url).toBe("https://signed/url");
    expect(out.fileName).toBe("cert.pdf");
  });
});
