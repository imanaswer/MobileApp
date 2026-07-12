// M16 School Administration & Configuration (ADR-024). The brief's three logical
// services — brandingService / settingsService / configurationService — as
// functions in one domain module. Every mutation is an audited upsert on the single
// per-school row; reads are a role-shaped projection (public) or admin-only.
export * from "./branding.service";
export * from "./school-settings.service";
export * from "./system-settings.service";
