# Return User Shortcuts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Phase 1 saved places and saved trips for signed-in return users.

**Architecture:** Add focused saved-transit helpers, one Firestore service, AuthContext state/listeners/actions, and small UI integrations in the trip planner, My Transit screen, and trip history. Saved trips store reusable origin/destination templates and always re-run live trip planning.

**Tech Stack:** Expo SDK 54, React Native, Firebase Auth/Firestore, AsyncStorage cache, Jest.

---

## File Map

- Create `src/utils/savedTransitUtils.js`: shared normalization, label metadata, payload builders, and trip/place display helpers.
- Create `src/services/firebase/savedTransitFirestoreService.js`: Firestore CRUD and subscriptions for `savedPlaces` and `savedTrips`.
- Modify `src/context/AuthContext.js`: saved places/trips state, listeners, methods, and cache keys.
- Modify `src/components/TripSearchHeader.js` and `src/components/TripSearchHeader.web.js`: show saved place/trip shortcut chips.
- Modify `src/components/TripBottomSheet.js` and `src/components/TripBottomSheet.web.js`: show saved trips in the empty state and a `Save trip` action in results.
- Modify `src/screens/HomeScreen.js` and `src/screens/HomeScreen.web.js`: wire saved place/trip actions into trip planning.
- Modify `src/screens/FavoritesScreen.js`: show My Transit tabs for Places, Trips, Stops, and Routes.
- Modify `src/screens/TripHistoryScreen.js`: add Re-plan and Save trip actions.
- Add tests: `src/__tests__/savedTransitUtils.test.js` and `src/__tests__/savedTransitFirestoreService.test.js`.

---

### Task 1: Saved-transit utility contract

**Files:**
- Create: `src/utils/savedTransitUtils.js`
- Test: `src/__tests__/savedTransitUtils.test.js`

- [ ] **Step 1: Write failing utility tests**

Create tests covering label defaults, saved place payload normalization, saved trip payload normalization, and invalid coordinate rejection.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- savedTransitUtils.test.js --runInBand`
Expected: FAIL because `savedTransitUtils.js` does not exist.

- [ ] **Step 3: Implement utility functions**

Export `SAVED_PLACE_LABELS`, `normalizeSavedLocation`, `buildSavedPlacePayload`, `buildSavedTripPayload`, `getSavedPlaceDisplayName`, `getSavedTripDisplayName`, and `getSavedLocationPoint`.

- [ ] **Step 4: Verify utility tests pass**

Run: `npm test -- savedTransitUtils.test.js --runInBand`
Expected: PASS.

---

### Task 2: Firestore saved-transit service

**Files:**
- Create: `src/services/firebase/savedTransitFirestoreService.js`
- Test: `src/__tests__/savedTransitFirestoreService.test.js`

- [ ] **Step 1: Write failing Firestore service tests**

Mock Firebase Firestore and verify that adding a place writes to `users/{uid}/savedPlaces/{id}`, adding a trip writes to `users/{uid}/savedTrips/{id}`, delete methods use the correct document paths, and snapshots map timestamp fields to ISO strings.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- savedTransitFirestoreService.test.js --runInBand`
Expected: FAIL because the service does not exist.

- [ ] **Step 3: Implement service**

Use the existing favorites/history service style. Methods: `addSavedPlace`, `removeSavedPlace`, `getSavedPlaces`, `subscribeToSavedPlaces`, `addSavedTrip`, `removeSavedTrip`, `getSavedTrips`, `subscribeToSavedTrips`, `touchSavedTrip`, and `touchSavedPlace`.

- [ ] **Step 4: Verify service tests pass**

Run: `npm test -- savedTransitFirestoreService.test.js --runInBand`
Expected: PASS.

---

### Task 3: AuthContext integration

**Files:**
- Modify: `src/context/AuthContext.js`

- [ ] **Step 1: Extend state and listeners**

Add `savedPlaces` and `savedTrips` state, Firestore subscriptions for signed-in users, and AsyncStorage cache keys.

- [ ] **Step 2: Add actions**

Expose `addSavedPlace`, `removeSavedPlace`, `addSavedTrip`, `removeSavedTrip`, `touchSavedPlace`, and `touchSavedTrip` from `useAuth()`.

- [ ] **Step 3: Preserve existing behavior**

Do not change favorite stops, favorite routes, trip history, sign-in, or sign-out behavior except to add the new listeners/cache data.

- [ ] **Step 4: Run targeted tests**

Run: `npm test -- savedTransitFirestoreService.test.js savedTransitUtils.test.js --runInBand`
Expected: PASS.

---

### Task 4: Trip planner shortcuts and save-trip action

**Files:**
- Modify: `src/components/TripSearchHeader.js`
- Modify: `src/components/TripSearchHeader.web.js`
- Modify: `src/components/TripBottomSheet.js`
- Modify: `src/components/TripBottomSheet.web.js`
- Modify: `src/screens/HomeScreen.js`
- Modify: `src/screens/HomeScreen.web.js`

- [ ] **Step 1: Add shortcut props to headers**

Add `savedPlaces`, `savedTrips`, `onSelectSavedPlace`, and `onSelectSavedTrip`. Render compact chips under the search fields.

- [ ] **Step 2: Wire native and web HomeScreen**

Read `savedPlaces`, `savedTrips`, `addSavedTrip`, `touchSavedPlace`, and `touchSavedTrip` from auth. Selecting a place fills the destination unless destination is already filled and origin is empty. Selecting a trip fills both fields and re-runs search.

- [ ] **Step 3: Add Save trip action**

Pass `onSaveCurrentTrip` to `TripBottomSheet`. Save the current origin/destination as a saved trip using the first itinerary only for summary metadata, not as the source of truth.

- [ ] **Step 4: Verify app compiles through tests**

Run: `npm test -- savedTransitUtils.test.js --runInBand`
Expected: PASS.

---

### Task 5: My Transit and history actions

**Files:**
- Modify: `src/screens/FavoritesScreen.js`
- Modify: `src/screens/TripHistoryScreen.js`

- [ ] **Step 1: Expand Favorites screen**

Change visible title to `My Transit`. Add tabs for Places, Trips, Stops, and Routes. Keep existing stop/route remove behavior.

- [ ] **Step 2: Add place/trip rows**

Places show icon label, address, Use, and remove. Trips show name, origin/destination, Use, and remove.

- [ ] **Step 3: Add history actions**

History rows get Re-plan and Save trip actions. Re-plan navigates to the Map tab with a saved-trip-like payload. Save trip calls `addSavedTrip`.

- [ ] **Step 4: Run targeted tests**

Run: `npm test -- savedTransitUtils.test.js savedTransitFirestoreService.test.js --runInBand`
Expected: PASS.

---

### Task 6: Verification pass

**Files:**
- Review all modified files.

- [ ] **Step 1: Run targeted tests**

Run: `npm test -- savedTransitUtils.test.js savedTransitFirestoreService.test.js --runInBand`
Expected: PASS.

- [ ] **Step 2: Run broader app tests if practical**

Run: `npm test -- --runInBand`
Expected: PASS, or document unrelated failures if existing dirty-tree work causes failures.

- [ ] **Step 3: Check git diff**

Run: `git diff --stat`
Expected: only planned files changed by this feature, plus pre-existing unrelated dirty files remain untouched.
