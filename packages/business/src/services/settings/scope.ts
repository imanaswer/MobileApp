// Shared helpers for the settings domain (ADR-024). recordAudit writes the
// AuditLog row inside the mutation's transaction (ADR-007); isFullAccess is unused
// here (config reads are permission-gated or public projections, not row-scoped) —
// re-exported for symmetry with the other domain modules.
export { recordAudit, isFullAccess } from "../people/scope";
