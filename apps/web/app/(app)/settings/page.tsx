"use client";

import { PERMISSIONS, STORAGE_BUCKETS } from "@repo/constants";
import { can } from "@repo/core";
import type { BrandingDto, SchoolSettingsDto, SystemSettingsDto } from "@repo/types";
import { Download } from "lucide-react";
import { useState } from "react";

import { downloadCsv } from "@/src/components/analytics/csv";
import { Button, Card, Field, Input, PageHeader, Select, useToast } from "@/src/components/ui";
import { getSupabaseClient } from "@/src/lib/supabase/client";
import { trpc } from "@/src/trpc/react";

/**
 * School Administration & Configuration console (M16, ADR-024 Step 7). Admins
 * (settings:manage) edit branding (+ logo upload), school profile, numbering,
 * academic + system defaults (timezone/language/theme/working week), and export
 * the current configuration as CSV. Non-admins get a read-only view of the public
 * settings. Thin client over the tRPC surface; the service is the authority.
 *
 * Configuration influences only FUTURE actions and is read by no frozen engine in v1
 * (ADR-024 §5) — numbering/timezone/academic values are stored, not yet wired.
 */
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function SettingsPage() {
  const me = trpc.auth.me.useQuery();
  const role = me.data?.role;
  if (role === undefined) {
    return <p className="p-6 text-neutral-500">Loading…</p>;
  }
  return can(role, PERMISSIONS.SETTINGS_MANAGE) ? <AdminConsole /> : <ReadOnlySettings />;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="flex flex-col gap-4">
      <h2 className="text-title text-neutral-800">{title}</h2>
      {children}
    </Card>
  );
}

function AdminConsole() {
  const utils = trpc.useUtils();
  const branding = trpc.branding.get.useQuery();
  const school = trpc.settings.get.useQuery();
  const system = trpc.configuration.get.useQuery();

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 p-6">
      <PageHeader
        title="Administration"
        breadcrumb="School configuration & branding"
        action={
          branding.data && school.data && system.data ? (
            <ExportButton branding={branding.data} school={school.data} system={system.data} />
          ) : undefined
        }
      />

      {branding.data ? <BrandingForm current={branding.data} utils={utils} /> : null}
      {school.data ? <SchoolForm current={school.data} utils={utils} /> : null}
      {system.data ? <SystemForm current={system.data} utils={utils} /> : null}

      <Section title="Configuration history & audit">
        <p className="text-sm text-neutral-500">
          Every change here is written to the audit log. A dedicated audit-history viewer is not
          part of this milestone (no audit-read surface exists yet — deferred, ADR-024).
        </p>
      </Section>
    </main>
  );
}

type Utils = ReturnType<typeof trpc.useUtils>;

function BrandingForm({ current, utils }: { current: BrandingDto; utils: Utils }) {
  const { show } = useToast();
  const [displayName, setDisplayName] = useState(current.displayName ?? "");
  const [primaryColor, setPrimaryColor] = useState(current.primaryColor ?? "#1d4ed8");
  const [secondaryColor, setSecondaryColor] = useState(current.secondaryColor ?? "#0f172a");
  const [logoPath, setLogoPath] = useState<string | null>(current.logoPath);
  const [busy, setBusy] = useState(false);
  const logoUrl = trpc.branding.logoUrl.useMutation();

  const mintLogo = trpc.branding.logoUploadUrl.useMutation();
  const save = trpc.branding.update.useMutation({
    onSuccess: () => {
      show("success", "Branding saved");
      return utils.branding.get.invalidate();
    },
    onError: (e) => show("error", e.message),
  });

  async function onLogo(file: File) {
    setBusy(true);
    try {
      const minted = await mintLogo.mutateAsync({ fileName: file.name });
      const { error } = await getSupabaseClient()
        .storage.from(STORAGE_BUCKETS.BRANDING)
        .uploadToSignedUrl(minted.storagePath, minted.token, file);
      if (error) throw error;
      setLogoPath(minted.storagePath);
      await save.mutateAsync({ logoPath: minted.storagePath });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="Branding">
      <Input
        label="Display name"
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
        placeholder="School name shown in the app"
      />
      <div className="flex gap-4">
        <Field label="Primary colour" htmlFor="primary-colour">
          <input
            id="primary-colour"
            type="color"
            className="h-11 w-16 rounded-md border border-neutral-300"
            value={primaryColor}
            onChange={(e) => setPrimaryColor(e.target.value)}
          />
        </Field>
        <Field label="Secondary colour" htmlFor="secondary-colour">
          <input
            id="secondary-colour"
            type="color"
            className="h-11 w-16 rounded-md border border-neutral-300"
            value={secondaryColor}
            onChange={(e) => setSecondaryColor(e.target.value)}
          />
        </Field>
      </div>
      <Field label="Logo" htmlFor="logo-upload">
        <div className="flex items-center gap-3">
          <input
            id="logo-upload"
            type="file"
            accept="image/*"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onLogo(f);
            }}
          />
          {logoPath ? (
            <Button variant="ghost" size="sm" onClick={() => logoUrl.mutate()}>
              Preview current logo
            </Button>
          ) : (
            <span className="text-sm text-neutral-500">No logo uploaded</span>
          )}
        </div>
      </Field>
      {logoUrl.data ? (
        <img src={logoUrl.data.url} alt="School logo" className="h-16 w-auto rounded-md border" />
      ) : null}
      <div className="flex items-center gap-3">
        <Button
          loading={save.isPending}
          onClick={() =>
            save.mutate({
              displayName: displayName.trim() || null,
              primaryColor,
              secondaryColor,
            })
          }
        >
          Save branding
        </Button>
        {save.error ? <span className="text-sm text-danger-600">{save.error.message}</span> : null}
      </div>
    </Section>
  );
}

function SchoolForm({ current, utils }: { current: SchoolSettingsDto; utils: Utils }) {
  const { show } = useToast();
  const [f, setF] = useState({
    contactEmail: current.contactEmail ?? "",
    contactPhone: current.contactPhone ?? "",
    website: current.website ?? "",
    principalName: current.principalName ?? "",
    invoicePrefix: current.invoicePrefix ?? "",
    certificatePrefix: current.certificatePrefix ?? "",
    academicYearStartMonth: current.academicYearStartMonth?.toString() ?? "",
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF((p) => ({ ...p, [k]: e.target.value }));
  const save = trpc.settings.update.useMutation({
    onSuccess: () => {
      show("success", "School settings saved");
      return utils.settings.get.invalidate();
    },
    onError: (e) => show("error", e.message),
  });

  return (
    <Section title="School profile, numbering & academic defaults">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input label="Principal name" value={f.principalName} onChange={set("principalName")} />
        <Input label="Contact email" value={f.contactEmail} onChange={set("contactEmail")} />
        <Input label="Contact phone" value={f.contactPhone} onChange={set("contactPhone")} />
        <Input label="Website" value={f.website} onChange={set("website")} />
        <Input
          label="Invoice number prefix"
          value={f.invoicePrefix}
          onChange={set("invoicePrefix")}
        />
        <Input
          label="Certificate number prefix"
          value={f.certificatePrefix}
          onChange={set("certificatePrefix")}
        />
        <Input
          label="Academic year start month (1–12)"
          inputMode="numeric"
          value={f.academicYearStartMonth}
          onChange={set("academicYearStartMonth")}
        />
      </div>
      <p className="text-caption text-neutral-500">
        Numbering &amp; academic defaults are stored but not yet applied to invoice/certificate
        generation (ADR-024 §5 — configuration influences future actions only).
      </p>
      <div className="flex items-center gap-3">
        <Button
          loading={save.isPending}
          onClick={() => {
            const m = parseInt(f.academicYearStartMonth, 10);
            save.mutate({
              contactEmail: f.contactEmail.trim() || null,
              contactPhone: f.contactPhone.trim() || null,
              website: f.website.trim() || null,
              principalName: f.principalName.trim() || null,
              invoicePrefix: f.invoicePrefix.trim() || null,
              certificatePrefix: f.certificatePrefix.trim() || null,
              academicYearStartMonth: Number.isFinite(m) && m >= 1 && m <= 12 ? m : null,
            });
          }}
        >
          Save school settings
        </Button>
        {save.error ? <span className="text-sm text-danger-600">{save.error.message}</span> : null}
      </div>
    </Section>
  );
}

function SystemForm({ current, utils }: { current: SystemSettingsDto; utils: Utils }) {
  const { show } = useToast();
  const [timezone, setTimezone] = useState(current.timezone);
  const [language, setLanguage] = useState<"en" | "ml">(current.language);
  const [theme, setTheme] = useState<"light" | "dark" | "system">(
    (current.theme as "light" | "dark" | "system") ?? "light",
  );
  const [workingDays, setWorkingDays] = useState<number[]>(current.workingDays);
  const save = trpc.configuration.update.useMutation({
    onSuccess: () => {
      show("success", "System settings saved");
      return utils.configuration.get.invalidate();
    },
    onError: (e) => show("error", e.message),
  });

  const toggleDay = (d: number) =>
    setWorkingDays((p) =>
      p.includes(d) ? p.filter((x) => x !== d) : [...p, d].sort((a, b) => a - b),
    );

  return (
    <Section title="System & localization">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Input label="Timezone" value={timezone} onChange={(e) => setTimezone(e.target.value)} />
        <Select
          label="Language"
          value={language}
          onChange={(e) => setLanguage(e.target.value as "en" | "ml")}
        >
          <option value="en">English</option>
          <option value="ml">Malayalam</option>
        </Select>
        <Select
          label="Theme"
          value={theme}
          onChange={(e) => setTheme(e.target.value as "light" | "dark" | "system")}
        >
          <option value="light">Light</option>
          <option value="dark">Dark</option>
          <option value="system">System</option>
        </Select>
      </div>
      <Field label="Working week">
        <div className="flex flex-wrap gap-2">
          {DAYS.map((d, i) => {
            const on = workingDays.includes(i);
            return (
              <Button
                key={d}
                type="button"
                variant={on ? "primary" : "secondary"}
                aria-pressed={on}
                onClick={() => toggleDay(i)}
              >
                {d}
              </Button>
            );
          })}
        </div>
      </Field>
      <div className="flex items-center gap-3">
        <Button
          loading={save.isPending}
          onClick={() => save.mutate({ timezone: timezone.trim(), language, theme, workingDays })}
        >
          Save system settings
        </Button>
        {save.error ? <span className="text-sm text-danger-600">{save.error.message}</span> : null}
      </div>
    </Section>
  );
}

function ExportButton({
  branding,
  school,
  system,
}: {
  branding: BrandingDto;
  school: SchoolSettingsDto;
  system: SystemSettingsDto;
}) {
  return (
    <Button
      variant="secondary"
      icon={Download}
      onClick={() => {
        const rows: [string, string][] = [
          ["Display name", branding.displayName ?? ""],
          ["Primary colour", branding.primaryColor ?? ""],
          ["Secondary colour", branding.secondaryColor ?? ""],
          ["Principal", school.principalName ?? ""],
          ["Contact email", school.contactEmail ?? ""],
          ["Contact phone", school.contactPhone ?? ""],
          ["Website", school.website ?? ""],
          ["Invoice prefix", school.invoicePrefix ?? ""],
          ["Certificate prefix", school.certificatePrefix ?? ""],
          ["Academic year start month", school.academicYearStartMonth?.toString() ?? ""],
          ["Timezone", system.timezone],
          ["Language", system.language],
          ["Theme", system.theme],
          ["Working days", system.workingDays.join(" ")],
        ];
        downloadCsv("school-configuration.csv", ["Setting", "Value"], rows);
      }}
    >
      Export CSV
    </Button>
  );
}

function ReadOnlySettings() {
  const pub = trpc.settings.getPublic.useQuery();
  if (!pub.data) {
    return <p className="p-6 text-neutral-500">Loading…</p>;
  }
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 p-6">
      <PageHeader title="Settings" />
      <Section title="School">
        <Row label="Name" value={pub.data.branding.displayName ?? "—"} />
        <Row label="Theme" value={pub.data.theme} />
        <Row label="Language" value={pub.data.language} />
      </Section>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-neutral-200 py-2 text-sm">
      <span className="text-neutral-500">{label}</span>
      <span className="font-medium text-neutral-800">{value}</span>
    </div>
  );
}
