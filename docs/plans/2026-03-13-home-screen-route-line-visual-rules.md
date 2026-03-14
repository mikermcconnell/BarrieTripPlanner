# Home Screen Route Line Visual Rules

Date: March 13, 2026

## Purpose

Define how route lines should render on the native home screen so the default map prioritizes live buses over route-line clutter.

This rule set is for the main map only.

It assumes two different product modes:

1. Network view
When the user has not selected a specific route and is looking at the general system map.

2. Route focus view
When the user has selected one or more routes and expects route-specific detail.

## Core Principle

In the default all-routes state, route lines are context.

Live buses are the primary signal.

The map should stop trying to explain directionality, branch naming, and overlapping service patterns all at once when the user has not asked for that detail.

## Route Pattern Types

### Type A: Branch Pairs / Out-and-Back Variants

Examples:

- `2A` and `2B`
- `8A` and `8B`
- `12A` and `12B`

Characteristics:

- Same family
- Same general corridor
- Usually directional or branch variants
- User usually does not need both full line drawings at once in the all-routes state

### Type B: Loop Pairs / Distinct Loop Routes

Examples:

- `10` and `11`
- `100` and `101`

Characteristics:

- Different route identities
- Different colors
- Often share road segments
- Operate as separate loops or directional loop patterns
- Should remain distinguishable, but not at the cost of map legibility

## View States

### State 1: All Routes Visible

Definition:

- No route selected
- User is browsing the network

Design intent:

- Calm backdrop
- Minimal annotation
- Preserve bus visibility
- Suppress unnecessary directional detail

### State 2: One Route Selected

Definition:

- Exactly one route or route family selected

Design intent:

- Show full route detail
- Restore route labels and directional emphasis
- Make the selected route behave like the map subject

### State 3: Multiple Routes Selected

Definition:

- Two or more specific routes selected

Design intent:

- Show more detail than all-routes mode
- Show less detail than single-route mode
- Avoid returning to full clutter

## Zoom Tiers

These tiers should be used to decide how much line detail is visible.

### Tier 1: Context Zoom

Suggested threshold:

- `zoom < 13.2`

Intent:

- City/network overview

Behavior:

- No route arrows
- No route labels
- Strongest line simplification

### Tier 2: Corridor Zoom

Suggested threshold:

- `13.2 <= zoom < 14.2`

Intent:

- Neighborhood/corridor understanding

Behavior:

- Limited route labels only in focused states
- Branch family merging still active in all-routes state
- Shared-segment overlap handling still active

### Tier 3: Detail Zoom

Suggested threshold:

- `zoom >= 14.2`

Intent:

- Street-level route inspection

Behavior:

- Restore more route-specific line detail when focused
- Keep all-routes mode restrained even here

## Rendering Rules

### Rule Group A: All Routes Visible

#### A1. Branch pairs should render as a family corridor

For branch-pair families such as `2A/2B`, `8A/8B`, and `12A/12B`:

- Render one shared family corridor instead of two equal-weight full lines
- Use the family color as the displayed line color
- Do not show `A` or `B` suffix labels on the line in this state
- Do not show direction arrows

Implementation note:

- Treat the base family id as the branch group key
- Example: `2A` and `2B` collapse into family `2`

#### A2. Branch divergence should only appear where geometry meaningfully splits

If the `A` and `B` patterns separate enough to read as distinct paths:

- Keep the shared trunk merged
- Let only the divergent outer tails separate visually
- Keep those tails lighter and shorter than focused-route rendering

This avoids drawing duplicate out-and-back lines over the same corridor for most of the map.

#### A3. Loop pairs should keep identity, but shared segments should collapse

For loop pairs such as `10/11` and `100/101`:

- Keep each route as its own route identity
- On segments where both routes use the same road, collapse the overlap into one shared segment treatment
- Once the loops diverge, restore their individual colored lines

Shared segment treatment options, in priority order:

1. Neutral shared trunk stroke
2. Slightly darkened composite stroke
3. One dominant route color plus an understated edge accent from the second route

Recommended default:

- Use a neutral shared trunk stroke for overlap in all-routes mode

Reason:

- It communicates “multiple routes use this corridor” without giving false emphasis to one of them

#### A4. All-routes mode should not show route-line labels

When no route is selected:

- Do not render route short-name labels on lines
- Do not render line arrows
- Do not place repeated text on overlapping geometry

The buses already provide route identity.

#### A5. All-routes mode should slightly lower line prominence

When no route is selected:

- Keep route lines visible
- Reduce opacity and annotation weight relative to buses
- Preserve enough contrast to understand network coverage

Recommended baseline:

- Base route-line opacity around `0.45` to `0.6`
- Overlap/shared trunk opacity around `0.38` to `0.52`

## Rule Group B: One Route Selected

#### B1. Restore full route-specific geometry

When one route is selected:

- Show the actual selected route line, not the family abstraction
- Restore route-specific branch geometry
- Restore divergence detail

Examples:

- Selecting `2A` should show `2A`, not family `2`
- Selecting `100` should show `100`, not a collapsed `100/101` shared trunk treatment

#### B2. Allow route labels and arrows only in single-route focus

When exactly one route is selected:

- Route labels may appear at corridor or detail zoom
- Direction arrows may appear only at detail zoom

Recommended thresholds:

- Route labels: `zoom >= 13.4`
- Direction arrows: `zoom >= 14.0`

#### B3. Dim unselected routes aggressively

When one route is selected:

- Non-selected routes should remain available as background context
- They should not compete with the selected route

Recommended treatment:

- Non-selected route opacity `0.12` to `0.25`
- No labels or arrows on non-selected routes

## Rule Group C: Multiple Routes Selected

#### C1. Keep selected routes explicit, but still suppress annotation

When two or more routes are selected:

- Show selected route geometry directly
- Do not collapse selected routes into family trunks
- Avoid route arrows
- Allow labels only when selection count is low and zoom is high enough

Recommended rule:

- Show line labels only when `selected count <= 2` and `zoom >= 13.6`
- Do not show line arrows unless `selected count === 1`

#### C2. Preserve overlap cleanup where possible

If two selected loop routes share long segments:

- Keep them separate if the user explicitly selected both
- But prefer offset or layered rendering only at higher zoom
- At lower zoom, use stronger simplification to avoid unreadable double strokes

## Live Bus Rules

These rules apply across all map states.

### D1. All buses remain fully visible

- Do not hide buses
- Do not suppress buses because another bus on the same route is nearby
- Do not collapse buses into a cluster at normal operating zoom levels

### D2. Route-line simplification must never reduce vehicle visibility

If there is a tradeoff between line detail and live bus clarity:

- Reduce line detail first
- Keep buses readable

### D3. Buses provide route identity in all-routes mode

In the all-routes state:

- The buses carry route numbers
- The lines carry corridor context

This is the main conceptual split behind the visual system.

## Family Grouping Rules

### Branch Family Grouping

Use route-family grouping for explicit branch families:

- `2A`, `2B` -> family `2`
- `8A`, `8B` -> family `8`
- `12A`, `12B` -> family `12`

Only apply this grouping in all-routes mode.

### Loop Pair Grouping

Use explicit overlap treatment, not suffix-family grouping, for loop pairs:

- `10` and `11`
- `100` and `101`

These should remain separate routes, but they may share neutral overlap trunks in all-routes mode.

## Label Rules

### Default Map

- No route labels
- No arrows
- No repeated corridor text

### Selected Route

- Route labels allowed
- Arrows allowed only at higher zoom
- Keep label spacing wide enough to avoid repeated collisions

Recommended spacing:

- Default label spacing at least `320` to `420`

## Color Rules

### Branch Families

In all-routes mode:

- Use one stable family color
- Do not alternate between `A` and `B` colors if they are currently distinct in data

### Loop Pairs

In all-routes mode:

- Preserve each route color only on non-overlapping segments
- Use a neutral shared trunk on overlapping segments

### Selected Routes

- Restore original route colors
- Restore route-specific contrast and stroke weight

## Recommended Initial Implementation

If this is implemented incrementally, use this order:

1. Remove all default-state route labels and arrows
2. Add branch-family merging for `2A/2B`, `8A/8B`, `12A/12B`
3. Add overlap detection and shared-trunk rendering for `10/11` and `100/101`
4. Reintroduce focused-state labels only for selected routes

## Success Criteria

The rules are working if:

- The default map reads as a clean transit network backdrop
- Dense corridors no longer look like stacked duplicate lines
- All buses remain visible and equally important
- Selecting a route restores the detailed route explanation the user actually asked for

## Non-Goals

- Do not remove live buses from dense corridors
- Do not force users into a single featured route model
- Do not make all route lines identical
- Do not hide branch distinctions when the user explicitly focuses a route
