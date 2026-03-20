# Plans Folder Guide

This folder contains dated working notes, design passes, handoffs, and refactor plans.

## How To Use This Folder

- Treat files here as non-default context.
- Read a plan here only when the task explicitly calls for implementation history, a dated design decision, or an unfinished workstream.
- Prefer repo-wide durable docs first:
  - [`../../AGENTS.md`](../../AGENTS.md)
  - [`../../README.md`](../../README.md)
  - [`../API-PROXY-OPERATIONS.md`](../API-PROXY-OPERATIONS.md)
  - [`../AUTO-DETOUR-DETECTION.md`](../AUTO-DETOUR-DETECTION.md)
  - [`../archive/README.md`](../archive/README.md) for root-level historical docs that were moved out of default context

## Current High-Value Files

- [`2026-03-07-phase-0-3-deliverables.md`](./2026-03-07-phase-0-3-deliverables.md)
  - summary of completed cleanup and refactor deliverables through Phase 3
- [`2026-03-07-app-stabilization-roadmap.md`](./2026-03-07-app-stabilization-roadmap.md)
  - proposed staged cleanup roadmap; useful for follow-on maintainability work

## Important Boundary

- Files in this folder do not override implemented code.
- Older dated files may describe superseded designs, partial implementations, or work-in-progress reasoning.
- If a plan here conflicts with the README or current code, treat the plan as historical unless the task explicitly revives it.
