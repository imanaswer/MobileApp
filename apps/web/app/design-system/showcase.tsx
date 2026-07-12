"use client";

import { CalendarCheck, Plus, Trash2, Users } from "lucide-react";
import { useState } from "react";

import {
  Avatar,
  Badge,
  Banner,
  Button,
  Card,
  ConfirmDialog,
  DataTable,
  Dialog,
  EmptyState,
  ErrorState,
  Input,
  PageHeader,
  SearchInput,
  Select,
  Skeleton,
  SkeletonText,
  StatCard,
  StatusChip,
  Tabs,
  TableToolbar,
  ToastProvider,
  useToast,
  type Column,
} from "@/src/components/ui";

interface Row {
  id: string;
  name: string;
  status: string;
  marks: number;
}
const ROWS: Row[] = [
  { id: "1", name: "Priya Nair", status: "PRESENT", marks: 92 },
  { id: "2", name: "Arjun Menon", status: "ABSENT", marks: 74 },
  { id: "3", name: "Fathima Rahman", status: "LATE", marks: 88 },
];
const COLUMNS: Column<Row>[] = [
  { key: "name", header: "Student", render: (r) => <span className="font-medium">{r.name}</span> },
  { key: "status", header: "Status", render: (r) => <StatusChip status={r.status} /> },
  { key: "marks", header: "Marks", align: "right", sortable: true, render: (r) => r.marks },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-title text-neutral-900">{title}</h2>
      <div className="flex flex-wrap items-start gap-4">{children}</div>
    </section>
  );
}

function ToastDemo() {
  const { show } = useToast();
  return (
    <div className="flex gap-2">
      <Button size="sm" variant="secondary" onClick={() => show("success", "Saved successfully")}>
        Success
      </Button>
      <Button size="sm" variant="secondary" onClick={() => show("error", "Something went wrong")}>
        Error
      </Button>
      <Button size="sm" variant="secondary" onClick={() => show("info", "Heads up")}>
        Info
      </Button>
    </div>
  );
}

export function Showcase() {
  const [dialog, setDialog] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [tab, setTab] = useState("all");

  return (
    <ToastProvider>
      <main className="mx-auto flex max-w-[1200px] flex-col gap-10 bg-neutral-50 p-8">
        <PageHeader
          title="Design System"
          breadcrumb="Dev · living reference"
          action={<Button icon={Plus}>Primary action</Button>}
        />

        <Section title="Buttons">
          <Button variant="primary">Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive" icon={Trash2}>
            Destructive
          </Button>
          <Button loading>Loading</Button>
          <Button disabled>Disabled</Button>
          <Button size="sm">Small</Button>
          <Button size="lg">Large</Button>
        </Section>

        <Section title="Fields">
          <div className="w-64">
            <Input
              label="Full name"
              required
              placeholder="e.g. Priya Nair"
              helper="As per records"
            />
          </div>
          <div className="w-64">
            <Input label="Email" error="Enter a valid email" defaultValue="not-an-email" />
          </div>
          <div className="w-64">
            <Select label="Class" required>
              <option>Class 8 · A</option>
              <option>Class 8 · B</option>
            </Select>
          </div>
          <div className="w-64">
            <Input label="Date of birth" type="date" />
          </div>
          <div className="w-64">
            <SearchInput />
          </div>
        </Section>

        <Section title="Status & badges">
          {["PRESENT", "ABSENT", "LATE", "PUBLISHED", "DRAFT", "OVERDUE", "PAID", "PENDING"].map(
            (s) => (
              <StatusChip key={s} status={s} />
            ),
          )}
          <Badge tone="danger">3</Badge>
          <Badge tone="info">New</Badge>
        </Section>

        <Section title="Banner">
          <div className="w-full max-w-xl">
            <Banner>3 sections have not been marked for attendance today.</Banner>
          </div>
        </Section>

        <Section title="Cards">
          <StatCard
            label="Present today"
            value="1,204"
            delta={{ value: "+2.1%", positive: true }}
            icon={Users}
          />
          <StatCard
            label="Fees overdue"
            value="₹48,200"
            delta={{ value: "12 invoices" }}
            icon={CalendarCheck}
            accent="fees"
          />
          <Card accent="attendance" className="w-64">
            <p className="text-title text-neutral-900">Attendance</p>
            <p className="text-sm text-neutral-500">Domain-accented card</p>
          </Card>
        </Section>

        <Section title="Overlays & toast">
          <Button variant="secondary" onClick={() => setDialog(true)}>
            Open dialog
          </Button>
          <Button variant="destructive" onClick={() => setConfirm(true)}>
            Delete…
          </Button>
          <ToastDemo />
          {dialog && (
            <Dialog
              title="Edit class"
              description="Update the class details."
              onClose={() => setDialog(false)}
            >
              <Input label="Class name" defaultValue="Class 8" />
              <div className="mt-4 flex justify-end">
                <Button size="sm" onClick={() => setDialog(false)}>
                  Save
                </Button>
              </div>
            </Dialog>
          )}
          {confirm && (
            <ConfirmDialog
              title="Delete class?"
              objectName="Class 8 · A"
              message="This permanently removes"
              busy={false}
              onCancel={() => setConfirm(false)}
              onConfirm={() => setConfirm(false)}
            />
          )}
        </Section>

        <Section title="Tabs">
          <Tabs
            tabs={[
              { key: "all", label: "All" },
              { key: "active", label: "Active" },
              { key: "archived", label: "Archived" },
            ]}
            active={tab}
            onChange={setTab}
          />
        </Section>

        <Section title="Avatars">
          <Avatar name="Priya Nair" />
          <Avatar name="Arjun Menon" size="lg" />
          <Avatar name="Fathima Rahman" size="sm" />
        </Section>

        <Section title="Loading (skeleton)">
          <div className="w-64">
            <SkeletonText lines={3} />
          </div>
          <Skeleton className="h-24 w-64" />
        </Section>

        <Section title="Empty & error states">
          <Card className="w-80 p-0">
            <EmptyState
              title="No students yet"
              message="Add your first student to get started."
              action={
                <Button size="sm" icon={Plus}>
                  Add student
                </Button>
              }
            />
          </Card>
          <Card className="w-80 p-0">
            <ErrorState onRetry={() => undefined} />
          </Card>
        </Section>

        <Section title="DataTable — populated">
          <div className="w-full">
            <DataTable
              columns={COLUMNS}
              rows={ROWS}
              rowKey={(r) => r.id}
              toolbar={
                <TableToolbar
                  search={<SearchInput />}
                  actions={
                    <Button size="sm" icon={Plus}>
                      Add
                    </Button>
                  }
                />
              }
            />
          </div>
        </Section>

        <Section title="DataTable — loading / empty">
          <div className="w-full">
            <DataTable columns={COLUMNS} rows={[]} rowKey={(r) => r.id} loading />
          </div>
          <div className="w-full">
            <DataTable
              columns={COLUMNS}
              rows={[]}
              rowKey={(r) => r.id}
              empty={<EmptyState title="No results" message="Try a different filter." />}
            />
          </div>
        </Section>
      </main>
    </ToastProvider>
  );
}
