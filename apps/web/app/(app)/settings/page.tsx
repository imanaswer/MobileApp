"use client";

import { PERMISSIONS, STORAGE_BUCKETS } from "@repo/constants";
import { can } from "@repo/core";
import type { BrandingDto, SchoolSettingsDto, SystemSettingsDto } from "@repo/types";
import { useState } from "react";

import { inputClass, labelClass, primaryBtn } from "@/src/components/academic/ui";
import { downloadCsv } from "@/src/components/analytics/csv";
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
    return <p className="p-6 text-muted-foreground">Loading…</p>;
  }
  return can(role, PERMISSIONS.SETTINGS_MANAGE) ? <AdminConsole /> : <ReadOnlySettings />;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5">
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      {children}
    </section>
  );
}

function AdminConsole() {
  const utils = trpc.useUtils();
  const branding = trpc.branding.get.useQuery();
  const school = trpc.settings.get.useQuery();
  const system = trpc.configuration.get.useQuery();

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold text-foreground">Administration</h1>
          <p className="text-muted-foreground">School configuration &amp; branding</p>
        </div>
        {branding.data && school.data && system.data ? (
          <ExportButton branding={branding.data} school={school.data} system={system.data} />
        ) : null}
      </div>

      {branding.data ? <BrandingForm current={branding.data} utils={utils} /> : null}
      {school.data ? <SchoolForm current={school.data} utils={utils} /> : null}
      {system.data ? <SystemForm current={system.data} utils={utils} /> : null}

      <Section title="Configuration history &amp; audit">
        <p className="text-sm text-muted-foreground">
          Every change here is written to the audit log. A dedicated audit-history viewer is not
          part of this milestone (no audit-read surface exists yet — deferred, ADR-024).
        </p>
      </Section>
    </main>
  );
}

type Utils = ReturnType<typeof trpc.useUtils>;

function BrandingForm({ current, utils }: { current: BrandingDto; utils: Utils }) {
  const [displayName, setDisplayName] = useState(current.displayName ?? "");
  const [primaryColor, setPrimaryColor] = useState(current.primaryColor ?? "#1d4ed8");
  const [secondaryColor, setSecondaryColor] = useState(current.secondaryColor ?? "#0f172a");
  const [logoPath, setLogoPath] = useState<string | null>(current.logoPath);
  const [busy, setBusy] = useState(false);
  const logoUrl = trpc.branding.logoUrl.useMutation();

  const mintLogo = trpc.branding.logoUploadUrl.useMutation();
  const save = trpc.branding.update.useMutation({
    onSuccess: () => void utils.branding.get.invalidate(),
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
      <label className={labelClass}>
        Display name
        <input
          className={inputClass}
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="School name shown in the app"
        />
      </label>
      <div className="flex gap-4">
        <label className={labelClass}>
          Primary colour
          <input
            type="color"
            className="h-10 w-16 rounded border border-border"
            value={primaryColor}
            onChange={(e) => setPrimaryColor(e.target.value)}
          />
        </label>
        <label className={labelClass}>
          Secondary colour
          <input
            type="color"
            className="h-10 w-16 rounded border border-border"
            value={secondaryColor}
            onChange={(e) => setSecondaryColor(e.target.value)}
          />
        </label>
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-foreground">Logo</span>
        <div className="flex items-center gap-3">
          <input
            type="file"
            accept="image/*"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onLogo(f);
            }}
          />
          {logoPath ? (
            <button
              type="button"
              className="text-sm text-primary underline"
              onClick={() => logoUrl.mutate()}
            >
              Preview current logo
            </button>
          ) : (
            <span className="text-sm text-muted-foreground">No logo uploaded</span>
          )}
        </div>
        {logoUrl.data ? (
          <img src={logoUrl.data.url} alt="School logo" className="h-16 w-auto rounded border" />
        ) : null}
      </div>
      <div>
        <button
          type="button"
          className={primaryBtn}
          disabled={save.isPending}
          onClick={() =>
            save.mutate({
              displayName: displayName.trim() || null,
              primaryColor,
              secondaryColor,
            })
          }
        >
          {save.isPending ? "Saving…" : "Save branding"}
        </button>
        {save.error ? (
          <span className="ml-3 text-sm text-destructive">{save.error.message}</span>
        ) : null}
      </div>
    </Section>
  );
}

function SchoolForm({ current, utils }: { current: SchoolSettingsDto; utils: Utils }) {
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
    onSuccess: () => void utils.settings.get.invalidate(),
  });

  return (
    <Section title="School profile, numbering &amp; academic defaults">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className={labelClass}>
          Principal name
          <input className={inputClass} value={f.principalName} onChange={set("principalName")} />
        </label>
        <label className={labelClass}>
          Contact email
          <input className={inputClass} value={f.contactEmail} onChange={set("contactEmail")} />
        </label>
        <label className={labelClass}>
          Contact phone
          <input className={inputClass} value={f.contactPhone} onChange={set("contactPhone")} />
        </label>
        <label className={labelClass}>
          Website
          <input className={inputClass} value={f.website} onChange={set("website")} />
        </label>
        <label className={labelClass}>
          Invoice number prefix
          <input className={inputClass} value={f.invoicePrefix} onChange={set("invoicePrefix")} />
        </label>
        <label className={labelClass}>
          Certificate number prefix
          <input
            className={inputClass}
            value={f.certificatePrefix}
            onChange={set("certificatePrefix")}
          />
        </label>
        <label className={labelClass}>
          Academic year start month (1–12)
          <input
            className={inputClass}
            inputMode="numeric"
            value={f.academicYearStartMonth}
            onChange={set("academicYearStartMonth")}
          />
        </label>
      </div>
      <p className="text-xs text-muted-foreground">
        Numbering &amp; academic defaults are stored but not yet applied to invoice/certificate
        generation (ADR-024 §5 — configuration influences future actions only).
      </p>
      <div>
        <button
          type="button"
          className={primaryBtn}
          disabled={save.isPending}
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
          {save.isPending ? "Saving…" : "Save school settings"}
        </button>
        {save.error ? (
          <span className="ml-3 text-sm text-destructive">{save.error.message}</span>
        ) : null}
      </div>
    </Section>
  );
}

function SystemForm({ current, utils }: { current: SystemSettingsDto; utils: Utils }) {
  const [timezone, setTimezone] = useState(current.timezone);
  const [language, setLanguage] = useState<"en" | "ml">(current.language);
  const [theme, setTheme] = useState<"light" | "dark" | "system">(
    (current.theme as "light" | "dark" | "system") ?? "light",
  );
  const [workingDays, setWorkingDays] = useState<number[]>(current.workingDays);
  const save = trpc.configuration.update.useMutation({
    onSuccess: () => void utils.configuration.get.invalidate(),
  });

  const toggleDay = (d: number) =>
    setWorkingDays((p) =>
      p.includes(d) ? p.filter((x) => x !== d) : [...p, d].sort((a, b) => a - b),
    );

  return (
    <Section title="System &amp; localization">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <label className={labelClass}>
          Timezone
          <input
            className={inputClass}
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
          />
        </label>
        <label className={labelClass}>
          Language
          <select
            className={inputClass}
            value={language}
            onChange={(e) => setLanguage(e.target.value as "en" | "ml")}
          >
            <option value="en">English</option>
            <option value="ml">Malayalam</option>
          </select>
        </label>
        <label className={labelClass}>
          Theme
          <select
            className={inputClass}
            value={theme}
            onChange={(e) => setTheme(e.target.value as "light" | "dark" | "system")}
          >
            <option value="light">Light</option>
            <option value="dark">Dark</option>
            <option value="system">System</option>
          </select>
        </label>
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-foreground">Working week</span>
        <div className="flex flex-wrap gap-2">
          {DAYS.map((d, i) => {
            const on = workingDays.includes(i);
            return (
              <button
                key={d}
                type="button"
                onClick={() => toggleDay(i)}
                className={`min-h-11 rounded-md border px-3 py-2 text-sm font-medium ${
                  on
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-foreground"
                }`}
              >
                {d}
              </button>
            );
          })}
        </div>
      </div>
      <div>
        <button
          type="button"
          className={primaryBtn}
          disabled={save.isPending}
          onClick={() => save.mutate({ timezone: timezone.trim(), language, theme, workingDays })}
        >
          {save.isPending ? "Saving…" : "Save system settings"}
        </button>
        {save.error ? (
          <span className="ml-3 text-sm text-destructive">{save.error.message}</span>
        ) : null}
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
    <button
      type="button"
      className={primaryBtn}
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
    </button>
  );
}

function ReadOnlySettings() {
  const pub = trpc.settings.getPublic.useQuery();
  if (!pub.data) {
    return <p className="p-6 text-muted-foreground">Loading…</p>;
  }
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 p-6">
      <h1 className="text-3xl font-semibold text-foreground">Settings</h1>
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
    <div className="flex justify-between border-b border-border py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}
