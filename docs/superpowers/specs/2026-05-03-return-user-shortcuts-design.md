# Return User Shortcuts Design

Date: 2026-05-03
Status: Draft for review

## Goal

Make BTTP more useful for signed-in return users by letting them quickly re-plan common trips and reuse important places. The feature should reduce repeated typing without saving stale transit results.

## Current App Fit

BTTP already supports account-backed favorite stops, favorite routes, trip history, and local-to-Firestore migration after sign-in. Recent trips already appear in the trip planner empty state. This design extends that model into saved places and saved trip templates.

## Recommended Approach

Build **My Places + Saved Trips**.

- **My Places** are saved locations such as Home, Work, School, Grocery, Doctor, Gym, or Custom.
- **Saved Trips** are reusable origin-to-destination templates, such as Home to Work.
- Saved trips should re-run the live trip planner each time. They should not store a full itinerary as the source of truth because schedules, alerts, detours, and vehicle positions change.

## User Experience

### Trip Planner

When the trip planner opens, signed-in users see shortcut chips near the origin and destination fields:

- Home
- Work
- Saved Trips
- Recent

Tapping a place fills the active field. Tapping a saved trip fills both fields and immediately searches, unless the user has selected a future departure or arrival time.

### Trip Results

After a successful trip search, users can save the origin and destination as a named trip. The action should be lightweight:

- Button: `Save trip`
- Default name: `{Origin} to {Destination}`
- Optional icon: Route, Home, Work, School, Grocery, Custom

### Trip History

Each history item should support:

- Re-plan
- Save trip
- Delete from history

This turns repeated history into intentional saved trips.

### Favorites Area

Use **My Transit** as the user-facing screen title, while keeping the existing internal `Favorites` route name for a lower-risk first release. Recommended tabs:

1. Places
2. Trips
3. Stops
4. Routes

The existing stop and route favorites remain intact.

### Profile Screen

Update the account value message to reflect the richer signed-in benefit:

- Current idea: `Save favorites and sync across devices`
- Proposed: `Save places, trips, stops, and routes across devices`

## Data Model

Use user-scoped Firestore collections, matching the existing favorites/history pattern.

### Saved Place

Collection: `users/{uid}/savedPlaces/{placeId}`

Fields:

- `id`
- `name`
- `labelType`: `home | work | school | grocery | gym | doctor | custom`
- `icon`
- `addressText`
- `lat`
- `lon`
- `createdAt`
- `updatedAt`
- `lastUsedAt`
- `isPinned`

### Saved Trip

Collection: `users/{uid}/savedTrips/{tripId}`

Fields:

- `id`
- `name`
- `icon`
- `from`: saved location snapshot with name, address text, lat, lon
- `to`: saved location snapshot with name, address text, lat, lon
- `timePreference`: optional, with mode `now | departAt | arriveBy`
- `createdAt`
- `updatedAt`
- `lastUsedAt`
- `useCount`
- `isPinned`

Do not store full itinerary legs as the saved trip source of truth.

## Local and Signed-Out Behaviour

For signed-out users, keep recent trips local as today. Saved places and saved trips may also be stored locally as a soft preview, then migrated after sign-in using the same pattern as current favorites and trip history.

If that feels too large for the first release, restrict saved places and saved trips to signed-in users and show a clear sign-in prompt.

Recommended first release: signed-in only, with local preview deferred.

## Error Handling

- If a saved place has missing coordinates, ask the user to reselect the address.
- If a saved trip no longer returns results, show the normal trip-planning error and offer to edit the trip.
- If Firestore save fails, keep the current trip visible and show a short retry message.
- If the user is offline, show cached saved places/trips but disable live trip planning until data is available.

## Privacy and Trust

Saved places can reveal sensitive personal routines. The app should:

- Make saved places opt-in only.
- Avoid auto-saving Home or Work without confirmation.
- Let users delete saved places and trips easily.
- Avoid showing exact home/work labels in analytics. Track only broad events, such as `saved_place_added` with `labelType`, not addresses.

## Analytics

Useful events:

- `saved_place_added`
- `saved_place_used`
- `saved_trip_added`
- `saved_trip_used`
- `trip_history_saved_as_trip`

Avoid sending address text or exact coordinates in analytics.

## Implementation Options

### Option A: Minimal MVP

- Add saved trips only.
- Let users save from trip history and trip results.
- Show saved trips in the trip planner empty state.

Pros: fastest path.  
Cons: misses the Home/Work/Grocery shortcut idea.

### Option B: Recommended MVP

- Add saved places and saved trips.
- Add shortcut chips in the trip planner.
- Add Places and Trips tabs to Favorites/My Transit.
- Re-plan saved trips with live data.

Pros: best rider value and fits the product direction.  
Cons: more UI and Firestore work.

### Option C: Smart Commute Layer

- Add time-aware suggestions such as “Go to Work” in the morning and “Go Home” in the afternoon.
- Add alert badges for saved trips.

Pros: feels highly personalized.  
Cons: depends on saved places/trips and should come later.

## Recommended Release Phases

### Phase 1: Saved Places and Saved Trips

- Firestore services and AuthContext methods for saved places/trips.
- Places and Trips tabs in Favorites/My Transit.
- Save trip action from trip results/history.
- Trip planner shortcut chips.
- Tests for data services and basic UI flows.

### Phase 2: Smarter Return User Experience

- Suggested saved trips based on repeated history.
- Pinning and ordering.
- Alert badges for saved routes and saved trips.
- Next departures near favorite stops.

### Phase 3: Proactive Commute Help

- Morning/afternoon commute suggestions.
- Optional reminders.
- “Leave soon” notifications.

## Acceptance Criteria for Phase 1

- A signed-in user can create, edit, and delete saved places.
- A signed-in user can create, rename, use, and delete saved trips.
- Saved places and trips sync across devices through Firestore.
- Tapping a saved trip re-runs trip planning with current live data.
- Existing favorite stops, favorite routes, and trip history continue to work.
- No exact addresses or coordinates are sent to analytics.
- Tests cover the new service methods and the main trip planner integration points.

## Phase 1 Product Decisions

1. Use `My Transit` as the visible screen title, but keep the existing internal `Favorites` route name.
2. Saved places and saved trips are signed-in only in Phase 1. Local signed-out migration is deferred.
3. First icon set: Home, Work, School, Grocery, Gym, Doctor, Route, and Custom.

## Recommendation

Proceed with Option B as Phase 1, but keep signed-out local saved places/trips deferred. This gives signed-in return users the biggest benefit while keeping the first build focused and safer.

