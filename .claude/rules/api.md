# API Rules — YOI Dashboard

## Structure
- All server logic in `app/api/**/route.ts` (App Router route handlers). Secrets never reach the client.
- Shared server libs in `lib/` (`lighthouse.ts`, `auth.ts`, `google.ts`, `qbo.ts`, `db.ts`, `menu.ts`, …).

## Data sources
- **Lighthouse** (Shift4 EchoPro reporting) is the LIVE source — auth via `x-access-token` header, token in `LIGHTHOUSE_TOKEN` (also `LIGHTHOUSE_LOCATION_ID`, `LIGHTHOUSE_MERCHANT_ID`).
- `data/dashboard.json` is the scraped daily cache (`history[]` with per-day metrics).
- `sales-trend` backfills any day with stored gross `< $100` from the live API, and only overwrites when the live value is **higher** (never lower a good stored value).

## Auth & secrets
- Custom JWT auth via `jose`, enforced in `middleware.ts`; `bcryptjs` for passwords; MFA via OTP (Twilio). Admin routes must verify admin.
- Secrets live ONLY in `.env.local` (gitignored) / Vercel env vars: `LIGHTHOUSE_TOKEN`, `SHIFT4_API_KEY`, Google/QBO/Twilio creds, JWT secret.
- NEVER log tokens, JWTs, or customer/transaction PII.
- Lighthouse token is rotated via `/api/admin/update-token` (writes the Vercel env var). A Vercel **redeploy is required** for a new token to take effect — env updates alone do not apply to running functions.

## Conventions
- Consistent error shape: `{ error: string }` with proper status codes.
- Money: stored/Lighthouse values are already in dollars (use `round2`); raw Shift4 charge amounts are in cents (÷100).
- Business day starts 4 AM CDT — shift `Date.now()` back 4h before extracting the date.
