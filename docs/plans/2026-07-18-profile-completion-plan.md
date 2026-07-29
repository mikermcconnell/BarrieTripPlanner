# Profile Completion Implementation Plan

Date: 2026-07-18  
Status: Implemented baseline; map high-contrast control intentionally hidden  
Owner: Codex

> Non-default context. This is a dated delivery plan. `AGENTS.md`, `README.md`,
> `docs/API-PROXY-OPERATIONS.md`, and implemented code remain authoritative.

## Objective

Finish the Profile surface so every visible action either completes a real rider task or is presented as non-interactive information. Remove broken contact paths, misleading labels, stale metadata, no-op rows, and "coming soon" actions.

## Implementation Outcome

- Releases A-C were implemented on 2026-07-18.
- Help, feedback, legal links, About/version metadata, account editing/deletion, and truthful notification settings are implemented.
- Nearby Alerts and High Contrast are hidden rather than presented as incomplete controls. High Contrast still requires the separately scoped native/web map validation described in Phase 4 before it can return to Settings.
- Focused app/API tests, the full app suite, API suite, web export, platform-parity check, and browser smoke checks were completed.

## Product Decisions

1. **Do not ship dead controls.** A feature that is not ready should be hidden rather than opening a placeholder alert.
2. **Use one verified support destination.** Help, app feedback, and account support must use centrally configured, validated contact details.
3. **Keep legal content outside the app.** Open approved HTTPS Terms and Privacy pages rather than maintaining duplicate legal text in the app.
4. **Make account deletion self-service.** Do not require riders to email support to delete an account.
5. **Do not add background location only to complete Nearby Alerts.** Hide that setting for now. Restore it only through a separately approved privacy, battery, and Play Store permissions project.
6. **Treat High Contrast as a real accessibility feature.** Do not relabel a small colour tweak as complete; implement and validate it across the rider-facing map or keep it hidden until that work is done.

## Scope

### Included

- Help & Support and both app-feedback entry points
- About/version information
- Terms of Service and Privacy Policy links
- account name editing, verified email-change flow, password reset, and account deletion
- Settings no-op and placeholder rows
- notification-setting accuracy and failure handling
- map high-contrast mode
- Profile and destination-screen test coverage
- Android and web smoke verification

### Not Included

- redesigning the whole Profile tab
- background location/geofencing for Nearby Alerts
- changing completed My Transit, Trip History, Service Alerts, Transit News, survey, sign-in, sign-out, or Detour Review workflows except for regression fixes
- a general app-wide theme rewrite

## Delivery Order

## Phase 0: Confirm External Product Inputs

Before implementation, obtain and verify:

- a working support mailbox or HTTPS support form
- the approved Terms of Service URL
- the approved Privacy Policy URL
- the account-deletion retention policy: which rider data must be deleted immediately and whether any legally required records must be retained
- the final support owner and expected response wording

Add production preflight validation so a release fails when these required values are missing, malformed, use an unapproved host, or point at the current non-resolving `barrietransit.app` domain.

**Exit criteria**

- each external URL returns a successful HTTPS response
- the support destination has been tested end to end
- the deletion policy is written and approved

## Phase 1: Repair Support, Feedback, Legal, and About

### Work

1. Replace hardcoded support/version values in `src/config/constants.js` with a single app-metadata/config helper.
   - read the display version from Expo runtime config
   - include Android build number/version code where useful for support
   - expose validated support, Terms, and Privacy destinations

2. Add a shared external-link helper.
   - validate `https:` and `mailto:` destinations
   - use `Linking.canOpenURL`/`Linking.openURL`
   - return a result instead of silently failing
   - show a rider-friendly fallback when no compatible app is available

3. Replace the Profile **Help & Support** alert with a small dedicated screen.
   - short FAQ for sign-in, saved transit, alerts, and trip-planning problems
   - working **Contact support** action
   - working **Share app feedback** action
   - show app version/build and platform in the prefilled support message

4. Route the feedback callout and **App feedback** menu item through the same tested helper so they cannot drift.

5. Replace the Profile **About** alert with accurate app name, version/build, data-source attribution, and legal links. This may be an About screen or a complete modal, but it must not duplicate version constants.

6. In Settings:
   - make Terms and Privacy open approved URLs
   - make Contact Support use the shared helper
   - render Cache Size and Version as information rows without chevrons or press handlers
   - make Text Size either open device settings or render it as non-interactive guidance
   - remove all "coming soon" alerts

### Likely Files

- `src/config/constants.js`
- `app.config.js` or `app.base.json`
- `src/utils/externalLinks.js` (new)
- `src/screens/ProfileScreen.js`
- `src/screens/HelpSupportScreen.js` (new)
- `src/screens/AboutScreen.js` (new, if a modal is not used)
- `src/screens/SettingsScreen.js`
- `src/navigation/TabNavigator.js`
- `scripts/preflight-android-production-env.js`

### Tests

- version is sourced from runtime configuration and matches the release config
- valid support/legal links open correctly
- invalid/unavailable links show a fallback
- both Profile feedback buttons use the same destination and prefilled context
- no Profile/Settings action points at `barrietransit.app`
- no visible row in these screens uses an empty handler or "coming soon" alert

**Exit criteria**

- Help, feedback, About, Terms, Privacy, and support work on Android and web
- displayed version matches `app.base.json`
- no dead or misleading informational rows remain

## Phase 2: Complete Account Management

### Work

1. Update the Manage Account description to match the delivered actions.

2. Add display-name editing.
   - validate length and whitespace
   - update Firebase Auth `displayName`
   - update the rider's Firestore profile
   - refresh `AuthContext` immediately
   - handle partial-failure reconciliation explicitly

3. Add email-change support for email/password accounts.
   - require a valid new email
   - use Firebase's verified-email-change flow
   - explain that the old address remains active until verification completes
   - handle recent-login requirements without exposing provider details
   - hide or adapt this action for Google-only accounts

4. Retain password reset for compatible accounts, but make provider-specific availability clear.

5. Add self-service account deletion behind a protected backend endpoint.
   - authenticate with the rider's Firebase Bearer token
   - derive the UID from the verified token; never accept an arbitrary target UID
   - require recent authentication in the client before the destructive request
   - show a two-step confirmation describing what will be deleted
   - recursively delete the rider profile and subcollections, including favourites, trip history, saved places/trips, settings, subscriptions, and push token
   - delete the Firebase Auth user last
   - make retries idempotent and avoid logging PII or tokens
   - clear local cached rider data and return to signed-out Profile state

6. Document the endpoint, deployment variables, operational recovery, and deletion audit policy in `docs/API-PROXY-OPERATIONS.md`.

### Likely Files

- `src/screens/AccountScreen.js`
- `src/context/AuthContext.js`
- `src/services/firebase/authService.js`
- `src/services/firebase/userFirestoreService.js`
- `src/services/accountService.js` (new client API wrapper)
- `api-proxy/accountRoutes.js` (new)
- `api-proxy/index.js`
- `firestore.rules` only if a rule adjustment is proven necessary; backend deletion should use Admin SDK
- `docs/API-PROXY-OPERATIONS.md`

### Security and Failure Tests

- unauthenticated deletion is rejected
- one user cannot name or delete another UID
- expired/revoked tokens are rejected
- reauthentication failures leave the account untouched
- partial Firestore deletion can be retried safely
- Auth deletion occurs only after application data cleanup succeeds
- local data is cleared after success and retained after failure
- Google-only and email/password accounts show appropriate actions

**Exit criteria**

- riders can edit their name, request a verified email change, reset a compatible password, and delete their account without contacting support
- account state remains consistent across Firebase Auth, Firestore, and the local cache

## Phase 3: Make Settings Truthful and Reliable

### Work

1. Split notification settings into capabilities the app actually supports:
   - **Trip reminders**: keep; verify scheduling and cancellation behavior
   - **Transit news**: keep; request notification permission and register/sync the push token when enabling
   - **Service alerts**: rename or expand so the label accurately describes the notifications currently produced; do not imply all GTFS alerts are pushed if only qualifying detours are handled
   - **Nearby alerts**: remove from the visible screen and defaults until a separate background-location feature is approved and implemented

2. Make toggles transactional.
   - request permission before showing an enabled state
   - save locally and to Firestore only after required setup succeeds
   - restore the previous state and show an error if persistence fails
   - unregister or invalidate the push token when all push categories are disabled, if supported by the backend design

3. Add loading and error states for initial settings/subscription reads. Current failures must not silently appear as successful defaults.

4. Keep **Show Detours** and **Clear Cache**, but add failure handling and prevent repeated taps while work is in progress.

5. Update backend notification selection only if the Service Alerts scope is expanded beyond current detour notifications. Add server tests before enabling broader pushes.

### Likely Files

- `src/screens/SettingsScreen.js`
- `src/services/notificationService.js`
- `src/context/TransitContext.js`
- `src/services/firebase/userFirestoreService.js`
- `api-proxy/pushNotifier.js` if Service Alerts are expanded
- related app and API tests

### Tests

- enabling push cannot display as on when permission/token registration fails
- route subscription and Transit News preferences remain synchronized
- failed local or Firestore writes roll back the switch
- Nearby Alerts is absent
- Service Alerts wording matches actual delivery behavior
- cache and detour actions report failures

**Exit criteria**

- every visible setting affects real behavior
- settings never claim success after a failed permission or persistence operation

## Phase 4: Deliver Map High-Contrast Mode

This phase may ship separately, but the placeholder must remain hidden until it passes the exit criteria.

### Work

1. Define high-contrast map tokens for route lines, selected routes, closed segments, detours, stops, vehicles, alert markers, sheets, and legends.

2. Persist the setting locally and sync it for authenticated riders.

3. Apply the mode to both native MapLibre and web MapLibre renderers without changing transit geometry or interaction behavior.

4. Add non-colour cues where colour alone currently communicates state, such as line patterns, outlines, icons, or labels.

5. Verify text and control contrast against WCAG 2.2 AA targets and check common colour-vision deficiencies.

### Likely Files

- `src/screens/SettingsScreen.js`
- a focused accessibility/settings context or hook (new)
- `src/config/theme.js`
- `src/components/MapView.js` and native map-layer components
- `src/components/WebMapView.js`
- marker, alert, detour, and legend components using map colours

### Tests

- preference persistence and authenticated sync
- native/web style parity for each map state
- selected route, detour, closure, stop, and vehicle remain distinguishable without colour alone
- map touch targets and Android bottom safe spacing do not regress

**Exit criteria**

- the mode works across the complete map surface on Android and web
- accessibility review passes before the Settings row becomes visible

## Phase 5: End-to-End Profile Completion Gate

Add a focused Profile action matrix covering signed-out, signed-in, provider-specific, and authorized Detour Review states.

### Automated Gate

- component tests press every visible Profile action and assert its destination or effect
- destination screens cover success, empty, loading, permission-denied, offline, and backend-error states where relevant
- app and API suites pass with `npm run test:all`
- production environment preflight passes
- platform parity check passes with `npm run check:parity`
- source guard rejects `Coming Soon`, empty press handlers, the obsolete support domain, and hardcoded release versions in Profile-owned screens

### Manual Android Gate

- signed-out and signed-in Profile paths
- email/password and Google account variations
- feedback/support app handoff and fallback
- password reset, verified email change, and account deletion in a test Firebase project
- notification permission denied/allowed flows
- legal links, cache clear, detour setting, and high-contrast map states
- bottom content remains above Android system navigation

### Manual Web Gate

- all Profile navigation destinations
- feedback/support fallback where `mailto:` is unavailable
- legal links open safely
- unsupported native notification capabilities are explained rather than presented as working toggles
- high-contrast map parity

## Recommended Release Slices

1. **Release A — Trust fixes:** Phase 0 and Phase 1. Highest priority because current support/feedback is broken and the displayed version is wrong.
2. **Release B — Account control:** Phase 2, including backend deployment and destructive-flow security review.
3. **Release C — Settings accuracy:** Phase 3. Remove Nearby Alerts immediately rather than waiting for background-location work.
4. **Release D — Accessibility:** Phase 4 after native/web visual validation.
5. Run the Phase 5 gate for every slice, with the relevant rows hidden until their slice is complete.

## Risks and Mitigations

| Risk | Mitigation |
| --- | --- |
| Unverified support/legal destinations block completion | Treat them as Phase 0 release inputs; do not ship placeholder values. |
| Account deletion leaves orphaned data | Backend recursive deletion, Auth deletion last, idempotency tests, documented recovery. |
| Email changes create Auth/Firestore drift | Use Firebase verification flow and reconcile profile data after confirmed Auth state changes. |
| Notification switches promise unavailable behavior | Capability-based UI, permission-first state changes, transactional rollback. |
| Nearby alerts create privacy/battery/store-policy scope | Remove the setting; require a separate approved project before restoring it. |
| High contrast works on one map renderer only | Native/web parity tests and a single shared semantic token contract. |
| Existing unrelated detour work is disturbed | Keep changes scoped to Profile-owned files and do not overwrite unrelated working-tree changes. |

## PM Review

**Recommendation: APPROVE WITH CHANGES**

- Approve the staged completion work because it fixes broken rider trust paths and makes secondary settings honest.
- Require verified support/legal destinations before Release A.
- Require security review and test-project validation before deploying account deletion.
- Remove Nearby Alerts instead of introducing background-location scope.
- Keep High Contrast hidden until both map renderers meet the same completion gate.

## Definition of Done

The Profile surface is complete when:

- every visible control performs the task its label promises
- no Profile-owned flow contains a no-op or "coming soon" action
- support, feedback, legal, and version information are verified and current
- riders can manage and delete their own accounts safely
- notification settings describe and control real behavior
- the high-contrast option is either fully validated or not visible
- automated and Android/web manual gates pass
