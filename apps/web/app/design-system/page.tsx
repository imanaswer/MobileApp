import { notFound } from "next/navigation";

import { Showcase } from "./showcase";

export const dynamic = "force-dynamic";

/**
 * Living component reference (ADR-UX1 Step 2) — every kit component in every
 * state. DEV-ONLY: 404 in production so it never ships to users.
 */
export default function DesignSystemPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <Showcase />;
}
