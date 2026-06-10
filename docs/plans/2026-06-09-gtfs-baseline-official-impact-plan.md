# GTFS Baseline Change + Official Impact Plan

## Summary

Detect meaningful static GTFS route changes that are large enough to become the new baseline, match them to official MyRide notices, and publish them as official service impacts instead of auto-detected detours.

## Product rule

Do not show GTFS baseline changes to riders unless both are true:

1. The GTFS route/stop pattern changed materially.
2. An official MyRide/news/alert item explains the change.

Unmatched changes are operational review signals only.

## Phase 1: Dry-run backend foundation

- Status: implemented.
- Added a route stop-sequence diff engine.
- Detects major removed stops, terminal changes, and multi-stop removals.
- Matches significant changes against normalized MyRide news.
- Returns official baseline impact candidates from a dry-run scan.
- Keeps this separate from `activeDetours`.

## Phase 2: Snapshot persistence

- Status: implemented.
- Stores a compact previous GTFS snapshot:
  - feed hash
  - route stop sequences
  - stop metadata
  - captured timestamp
- Compares previous vs current on a manual/scheduled scanner run.
- Saves the current snapshot after the scan.

## Phase 3: Operational publishing

- Status: backend foundation implemented.
- Publishes matched candidates to the review collection `officialServiceImpactCandidates` when explicitly enabled.
- Adds scan status metrics:
  - last scan time
  - changed route count
  - significant change count
  - matched candidate count
- Still remaining: promote reviewed/high-confidence records to `officialServiceImpacts`.

## Phase 4: Rider-facing UI

- Status: partially implemented.

Show matched records as official notices, not auto-detours:

- Map notice strip — implemented for active official impacts.
- News screen active impacts — implemented.
- Route details warning — remaining.
- Stop details warning — remaining.
- Trip planner warning — remaining.

Recommended copy pattern:

> Official notice: Route 12 is following a long-term Mapleview detour. Route 12 does not directly serve Barrie South GO. Use Route 15 shuttle.

## Route 12 validation fixture

Use the Mapleview case as the first regression fixture:

- Route 12 loses direct Barrie South GO service.
- MyRide notice `1652` mentions Mapleview detour, Barrie South GO, and Route 15 shuttle.
- Expected result: high-confidence official baseline impact candidate.

## Guardrails

- Do not mutate detector trusted baseline from this workflow.
- Do not publish unmatched GTFS diffs to riders.
- Do not merge these records into `activeDetours`.
- Keep official-notice wording distinct from GPS-detected detour wording.
