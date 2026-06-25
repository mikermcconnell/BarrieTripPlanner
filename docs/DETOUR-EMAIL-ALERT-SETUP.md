# Detour Email Alert Setup Status

Date: 2026-06-24

## Goal

Send an email to Michael when BTTP detects a new transit detour.

Recipient:

- michaelryanmcconnell@gmail.com

## Current Status

Implemented in the repo:

- A detour email monitor script:
  - `api-proxy/scripts/detour-email-monitor.js`
- Email monitor logic:
  - `api-proxy/services/detourEmailMonitor.js`
- Tests:
  - `api-proxy/__tests__/detourEmailMonitor.test.js`
- GitHub Actions workflow:
  - `.github/workflows/detour-email-monitor.yml`
- Package script:
  - `npm --prefix api-proxy run detour:email-monitor`
- Documentation updates:
  - `README.md`
  - `docs/API-PROXY-OPERATIONS.md`
  - `.env.example`

## How It Works

1. The detour worker writes detour events to Firestore history.
2. The GitHub Actions workflow runs every 5 minutes.
3. The monitor checks recent detour history events.
4. It sends an email only for first-time `DETOUR_DETECTED` events that are public/rider-visible (`riderVisible: true`).
5. It records sent alerts in Firestore collection `detourEmailNotifications` so the same detour is not emailed repeatedly.

Email content now includes:

- public/rider-visible detour context enriched from the active detour record when available
- approximate likely closed section text
- approximate likely detour path text from road-matched road names
- route-scoped skipped-stop text when available
- an inline PNG schematic showing:
  - likely closed route section in red
  - likely detour path in purple
  - entry/exit markers
- an attached `detour-schematic.png` fallback for Outlook or other clients that block inline CID images

The schematic is not a full app map and is not to scale. It is generated from the same GPS-derived geometry used by the detour email event.
The schematic is suppressed when the monitor only has a single closed-segment line and no trustworthy detour path, because that produces misleading email images.

## Verification Already Completed

Passed:

- Full API test suite: 58 test suites, 672 tests
- New detour email monitor tests: 6 tests
- Safe disabled-mode CLI run
- JavaScript syntax checks

## Continued Setup Completed On 2026-06-24

- Confirmed GitHub CLI is authenticated for `mikermcconnell/BarrieTripPlanner`.
- Added GitHub Actions secret:
  - `DETOUR_ALERT_RECIPIENTS`
- Confirmed no local `RESEND_API_KEY`, `FIREBASE_SERVICE_ACCOUNT_JSON`, or `GOOGLE_APPLICATION_CREDENTIALS` value is available in the shell or `.env`.
- Added GitHub Actions secret:
  - `RESEND_API_KEY`
- Added GitHub Actions secret:
  - `FIREBASE_SERVICE_ACCOUNT_JSON`
- Confirmed the Firebase service account JSON is valid for project `barrie-transit-trip-plan-cc84e`.
- Added a `.gitignore` guard for `*firebase-adminsdk*.json` so the local private key file is not accidentally committed.
- Merged the detour email monitor workflow into `master`.
- Fixed the workflow install step to use `npm --prefix api-proxy ci --omit=dev --ignore-scripts`, because the production-only install does not include the root `patch-package` dev dependency.
- Ran the workflow manually:
  - Run: `28105751772`
  - Result: success.
  - Firestore history collection checked: `detourEventHistoryV2`.
  - Dedupe collection: `detourEmailNotifications`.
  - Recent events checked: `0`.
  - Emails sent: `0`.
- Added a manual workflow input, `send_test_email=true`, for synthetic delivery checks.
- The first synthetic test failed because the default `updates.barrietransit.ca` sender domain is not verified in Resend.
- Added GitHub Actions secret:
  - `DETOUR_ALERT_FROM=BTTP Detour Alerts <onboarding@resend.dev>`
- Ran a synthetic test detour email:
  - Run: `28106138011`
  - Result: success.
  - Recipient count: `1`.
  - Resend provider message ID: `c933af71-822c-4a5c-8320-ec1b65dc50d0`.
- Added richer text and inline schematic support:
  - likely closed section
  - likely detour path
  - skipped stops
  - PNG schematic attached inline with CID
- Re-ran verification:
  - `npm --prefix api-proxy test` passed: 58 test suites, 672 tests.
  - `npx jest --runInBand --runTestsByPath __tests__/detourEmailMonitor.test.js` passed from `api-proxy/`.
  - `node --check` passed for the monitor service and CLI script.
  - Disabled-mode CLI run skipped safely.

There are no remaining setup blockers. The workflow is installed, secrets are configured, and a manual run has completed successfully.

## Outlook Image Fallback

Outlook may show the inline schematic as a broken image even when the email was sent correctly. The monitor now:

- sends the inline schematic using Resend's REST attachment field names (`content_id` and `content_type`)
- includes a normal attached copy named `detour-schematic.png`
- adds fallback text telling the recipient to open the attachment if the inline image does not display

## Email Quality Guard

The monitor now enriches a history event from the current active public detour document before composing the email. This lets the email use the same richer rider-facing fields that power the app, such as location labels, skipped/affected stops, road names, and trustworthy detour geometry.

If the active detour record is not public/rider-visible, the monitor skips the email.
If the active detour record has no trustworthy likely-detour path, the monitor sends text only and does not attach the schematic image.

## What We Need To Do Next

### 1. Add GitHub Actions secrets

Required secrets:

- `RESEND_API_KEY` - Resend API key. Added on 2026-06-24.
- `DETOUR_ALERT_RECIPIENTS` - `michaelryanmcconnell@gmail.com`. Added on 2026-06-24.
- `FIREBASE_SERVICE_ACCOUNT_JSON` - Firebase Admin service account JSON. Added on 2026-06-24.

Optional secrets:

- `DETOUR_ALERT_FROM` - sender address, for example `Barrie Transit Detours <detours@updates.barrietransit.ca>`
- `DETOUR_ALERT_APP_URL` - app or dashboard link to include in emails

Current sender:

- `BTTP Detour Alerts <onboarding@resend.dev>`

Before using `detours@updates.barrietransit.ca`, verify `updates.barrietransit.ca` in Resend, then update the `DETOUR_ALERT_FROM` GitHub secret.

### 2. Run a manual workflow test

After the PR is merged:

1. Go to GitHub Actions.
2. Open **Detour Email Monitor**.
3. Click **Run workflow**.
4. Confirm it completes successfully.
5. Confirm no duplicate email is sent for the same detour event.

### 3. Confirm Firestore access

The GitHub workflow needs Firebase Admin credentials that can:

- Read detour history collection, usually `detourEventHistoryV2`
- Write dedupe records to `detourEmailNotifications`

## Notes

- Default alert event type is `DETOUR_DETECTED` only.
- Backend-only candidates, hidden geometry warnings, and events with `riderVisible: false` or missing `riderVisible` are not emailed.
- `DETOUR_CLEARED` emails are not enabled by default.
- The monitor uses Firestore dedupe, not GitHub cache, so retries should not duplicate alerts.
- No API keys or service account JSON should be stored in Markdown, source code, or committed files.
