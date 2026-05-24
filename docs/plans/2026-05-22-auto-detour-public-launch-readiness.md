# Auto-Detour Public Launch Readiness Plan — 2026-05-22

## Goal

Prepare auto-detour detection for public launch while keeping the launch conservative: show confirmed rider-facing detours, but only clear active detours after normal-route GPS proof.

## Source of truth

- Behavior and UX: `docs/AUTO-DETOUR-DETECTION.md`
- Backend operations: `docs/API-PROXY-OPERATIONS.md`
- Live QA checklist: `docs/AUTO-DETOUR-QA-CHECKLIST.md`
- This file is a dated rollout plan only.


## Update — 2026-05-24 memory baseline

The implementation now uses the low-cost scheduled memory baseline from `docs/superpowers/plans/2026-05-24-auto-detour-memory-baseline.md`:

- Cloud Scheduler should call `POST /api/detour-run-once` once per minute during service hours.
- `DETOUR_BURST_SAMPLING_ENABLED=false` is the normal production setting.
- Backend candidate memory can confirm low-frequency detours across 30–60 minute headways without retaining all raw GPS points.
- Runtime state and active Firestore snapshots protect published detours during cold starts.

## Launch policy decisions

- Keep `EXPO_PUBLIC_ENABLE_AUTO_DETOURS` as the app-side launch switch.
- Keep the rider setting for detour display.
- Do not change the Firestore active-detour schema for launch.
- Active detours clear only after same-bus normal-route traversal proof through the affected segment.
- Stale/headway checks are monitoring only; they must not delete active detours.
- The local simulation clear endpoint remains separate from production clearing.
- Route-family projection remains enabled unless validation shows false sibling-route alerts.

## Code changes

- Remove detector-owned stale zero-vehicle active-detour clearing.
- Keep `clear-pending` as the visible transition state before deletion.
- Keep deletion of active docs after the detector finalizes a GPS-proven clear.
- Return stale/headway decisions as advisory GPS-required decisions, including low-confidence validation-only cases.

## Required validation routes

- Route `8A` and `8B`: validate route-family behavior and opposite directions.
- Route `12A` and `12B`: validate sibling-route projection and opposite directions.
- Route `11`: validate the Farmers Market preset/local simulation path.
- One non-detour control route: confirm no banner, no overlay, no false affected stops.

## Manual launch checklist

- Banner appears for medium/high confidence detours.
- Low-confidence detours remain hidden from rider-facing UI.
- Map overlay shows closed regular segment and likely detour path only when trusted.
- Details sheet shows affected/skipped stops and clear wording.
- Detour mode works on native and web.
- `clear-pending` looks faded/clearing and disappears after deletion.
- Deleted Firestore docs remove the banner, overlay, upcoming strip, and details sheet.
- `/api/detour-rollout-health` has no launch blockers.
- Stored baseline is trusted and not refreshed during a known active detour.

## Test checklist

- Backend: stale zero-vehicle active detours do not auto-clear.
- Backend: low-confidence validation-only stale detours do not auto-clear.
- Backend: same-bus normal-route traversal still clears through `clear-pending`.
- Backend: route-family projection does not create false sibling detours.
- Backend: low-frequency two-bus confirmation works beyond the short geometry/evidence window.
- Backend: cold-start runtime/snapshot hydration does not delete active Firestore detours prematurely.
- Frontend: medium/high visibility, low hidden, `clear-pending` faded, deleted docs removed.

## Out of scope

- Push notifications.
- ETA rewriting around detours.
- Staff dashboard/manual moderation UI.
