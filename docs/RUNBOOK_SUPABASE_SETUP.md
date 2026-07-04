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
