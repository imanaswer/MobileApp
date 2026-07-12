# Runbook — Supabase Project Setup & School Bootstrap

How to take a fresh Supabase project to a verified, sign-in-ready deployment.
Written for the infrastructure milestone (post-M1); re-run for staging/production.
Security requirements trace to `docs/SECURITY_REVIEW_M1.md`.

## 1. Project & credentials

1. Create the project at supabase.com (region close to users — e.g. `ap-southeast-1` / `ap-south-1`).
2. Collect four values and put them in the repo-root `.env` (copy `.env.example`):
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL` + `EXPO_PUBLIC_SUPABASE_URL`
   - **anon key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY` + `EXPO_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role key** → `SUPABASE_SERVICE_ROLE` (server/ops only — never `NEXT_PUBLIC_`/`EXPO_PUBLIC_`)
   - **DB connection string** → `DATABASE_URL` — use the **session pooler** (port **5432**), and URL-encode special characters in the password (`#` → `%23`).
3. Also set the bootstrap variables: `SEED_SCHOOL_NAME`, `SEED_SUPER_ADMIN_EMAIL`,
   `SEED_SUPER_ADMIN_PASSWORD` (≥ 10 chars), `TEST_OTP_PHONE`, `TEST_OTP_CODE`.

## 2. Auth configuration (security checklist)

**Preferred: config-as-code via the Management API** — repeatable and verifiable.
Generate a personal access token (supabase.com/dashboard/account/tokens), then
`PATCH https://api.supabase.com/v1/projects/<ref>/config/auth` with:

```json
{
  "disable_signup": true,
  "external_phone_enabled": true,
  "sms_provider": "twilio",
  "sms_twilio_account_sid": "ACffffffffffffffffffffffffffffffff",
  "sms_twilio_auth_token": "placeholder-token-not-real",
  "sms_twilio_message_service_sid": "MGffffffffffffffffffffffffffffffff",
  "sms_test_otp": "919999900001=123456",
  "sms_test_otp_valid_until": "2027-12-31T23:59:59Z",
  "sms_otp_exp": 600,
  "sms_otp_length": 6,
  "password_min_length": 10,
  "site_url": "http://localhost:3000",
  "uri_allow_list": "http://localhost:3000/update-password"
}
```

Gotchas learned live: `sms_test_otp` requires `sms_test_otp_valid_until`;
`password_hibp_enabled: true` (leaked-password protection) is **Pro-plan-only**
(402 on free tier) — enable it when the project is upgraded [SR-4, partial].
Revoke the access token after use. The same settings can be applied manually
in the dashboard (each panel has its own Save button):

| # | Setting | Where | Value |
|---|---|---|---|
| 1 | **Allow new users to sign up → OFF** [SR-1] | Auth → Sign In / Providers | accounts are Admin-API-provisioned only (ADR-001) |
| 2 | Phone provider → **ON** | Auth → Sign In / Providers → Phone | needed for parent OTP |
| 3 | **Test OTP** for the verification number | Auth → Sign In / Providers → Phone → Test phone numbers | `TEST_OTP_PHONE` → `TEST_OTP_CODE` (e.g. `+919999900001` → `123456`); no SMS is sent for test numbers |
| 4 | SMS provider | same screen | leave unconfigured until a provider is chosen (Twilio native / MSG91 via send-SMS hook; India production needs DLT). Real numbers cannot receive OTP until then |
| 5 | OTP expiry ≤ **600 s**, 6-digit codes [SR-2] | Phone provider settings | default 1 h is too long |
| 6 | Auth **rate limits** left ON (defaults) [SR-3] | Auth → Rate Limits | sign-in attempts / OTP sends / verifications |
| 7 | Password **minimum length ≥ 10** + leaked-password protection (HIBP) [SR-4] | Auth → Sign In / Providers → Email / Passwords | |
| 8 | **Redirect URL allowlist** [SR-5] | Auth → URL Configuration | only real origins + `/update-password` (dev: `http://localhost:3000/update-password`) |
| 9 | **Site URL** [SR-6] | Auth → URL Configuration | the app origin (dev: `http://localhost:3000`) |
| 10 | Email provider | Auth → Emails | built-in Supabase email is fine for dev (low hourly cap); configure custom SMTP (e.g. Resend) before production |

## 3. Apply schema, bootstrap, verify (from the repo root)

```bash
# 1. Apply migrations to the live database
pnpm --filter @repo/db exec dotenv -e ../../.env -- prisma migrate deploy

# 2. Bootstrap the school + super-admin (idempotent)
pnpm --filter @repo/business run bootstrap

# 3. Provision the test parent for the OTP check (idempotent)
pnpm --filter @repo/business run provision -- --role PARENT --phone +919999900001 --locale ml

# 4. Run the live verification suite — all checks must PASS
pnpm --filter @repo/business run verify:auth
```

`verify:auth` exercises: DB connectivity · public-signup disabled · OTP rejected
for unknown phones · staff email login · super-admin bootstrap · INVITED→ACTIVE
activation (idempotent) · session restoration · token refresh · logout · parent
test-OTP login · parent provisioning + activation.

## 3b. Storage buckets (M3 — student documents)

Create the **private** bucket the document feature uses (ADR-004: no public
buckets; access is via short-lived signed URLs minted server-side after a
business-layer authz check):

- Dashboard → Storage → New bucket → name **`student-documents`** → Public **OFF**.
- Or via API: `POST /storage/v1/bucket` with `{"name":"student-documents","public":false}`
  (service-role key).

No storage RLS policies are added for clients: browsers only ever touch the
bucket with single-use signed upload URLs / expiring signed read URLs, both
minted by the server (`studentDocument.uploadUrl` / `.downloadUrl`). Keep the
bucket private; never enable public access.

## 3c. Storage buckets (M6 — homework files)

Create the second **private** bucket homework attachments use (ADR-013 §9; same
ADR-004 posture — server-minted signed URLs only, authz in the business layer):

- Dashboard → Storage → New bucket → name **`homework-files`** → Public **OFF**.
- Or via API: `POST /storage/v1/bucket` with `{"name":"homework-files","public":false}`
  (service-role key).

Server-minted only (`homework.attachmentUploadUrl`/`.attachmentDownloadUrl`,
`submission.attachmentUploadUrl`/`.attachmentDownloadUrl`). Paths are server-chosen
and namespaced by `schoolId`. Keep private; never enable public access.

**Verification (do this once after provisioning — it is the only file-path check the
automated test suite cannot run, since no bucket exists in CI):**

1. As a **teacher**, open a DRAFT homework on the web → **Add file** → confirm the
   upload succeeds and **Open** returns the file (signed URL).
2. As a **parent**, open that homework (once PUBLISHED) → **Attach file** + note →
   **Submit** → confirm the file uploads and **Open** returns it.
3. As the **teacher**, open the submission in the review table → confirm the parent's
   file opens.
4. **Negative check:** a *different* parent (not linked to the child) must NOT be able
   to open the submission file (the service returns Forbidden before any URL is minted).

If all four hold, the M6 storage round-trip is proven end-to-end against live infra.

## 3d. Storage buckets (M15 — documents & certificates)

Create the **private** bucket the document center uses (ADR-023 §1; same ADR-004
posture — server-minted signed URLs only, **60-second** read expiry, authz in the
business layer). Distinct from `student-documents` (M3 KYC uploads):

- Dashboard → Storage → New bucket → name **`documents`** → Public **OFF**.
- Or via API: `POST /storage/v1/bucket` with `{"name":"documents","public":false}`
  (service-role key).

Server-minted only (`document.uploadUrl`/`document.downloadUrl`). Paths are
server-chosen and namespaced by `schoolId`. Keep private; never enable public access.

**Verification (once after provisioning — CI cannot run it, no bucket exists there):**

1. As **office/admin**, upload a certificate for a student → confirm upload succeeds
   and, once **APPROVED**, **Open** returns the file (60s signed URL).
2. As the **parent** of that child, open the document center → confirm the APPROVED
   document opens; a **draft** (GENERATED/UPLOADED) is not visible.
3. **Negative check:** a *different* parent (not linked to the child) must NOT be able
   to open it (the service returns Forbidden before any URL is minted).

## 3e. Storage buckets (M16 — branding)

Create the **private** bucket the branding/logo feature uses (ADR-024; same ADR-004
posture — server-minted signed URLs only, **signed on read**, authz in the business
layer). Distinct from `documents` (M15) and `student-documents` (M3 KYC uploads):

- Dashboard → Storage → New bucket → name **`branding`** → Public **OFF**.
- Or via API: `POST /storage/v1/bucket` with `{"name":"branding","public":false}`
  (service-role key).

Server-minted only (`branding.logoUploadUrl`/`branding.logoUrl`). Paths are
server-chosen and namespaced by `schoolId`. Keep private; never enable public access.

**Verification (once after provisioning — CI cannot run it, no bucket exists there):**

1. As **office/admin** (`settings:manage`), upload a school logo → confirm upload
   succeeds and the logo renders (signed read URL).
2. As any **authenticated** non-admin, open Settings → confirm branding (logo/colours)
   loads read-only via `branding.get`/`branding.logoUrl`.

## 4. Ongoing user provisioning

Single-user Admin-API provisioning (M1 decision D3) until the admin UI lands (M2+):

```bash
pnpm --filter @repo/business run provision -- --role TEACHER --email teacher@school.example --password <temp-password>
pnpm --filter @repo/business run provision -- --role PARENT --phone +91XXXXXXXXXX [--locale ml]
```

Accounts are created INVITED and self-activate on first sign-in. Every
provisioning writes a `USER_PROVISIONED` audit row.

## 5. Environment verification (web + mobile)

```bash
# Web: build with real env validation (no SKIP_ENV_VALIDATION)
pnpm --filter web exec dotenv -e ../../.env -- next build

# Mobile: export the bundle (validates EXPO_PUBLIC_* at import)
pnpm --filter mobile exec dotenv -e ../../.env -- npx expo export
```

## 6. Before production (deferred, tracked)

- Real SMS provider + India DLT registration; remove/replace test OTP numbers.
- Custom SMTP for auth emails.
- Rotate any credentials that were shared during setup (dashboard → Settings →
  API / Database); update `.env` everywhere.
- Content-Security-Policy + app-level rate limiting (`docs/SECURITY_REVIEW_M1.md` deferred items).
