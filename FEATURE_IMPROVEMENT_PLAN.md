# Barrie Transit Trip Planner — Feature Improvement Plan (Revised)

## Context

The app has a strong technical foundation (RAPTOR routing, real-time GTFS-RT, turn-by-turn navigation, cross-platform parity) but lacks growth, retention, and engagement mechanics. Current score: **6.5/10**. This revised plan incorporates a critical simplification review — cutting over-engineered features, correcting effort estimates, and reordering by actual impact-to-effort ratio.

**Guiding principle:** Ship features that work in 1-2 days over features that promise more but take 2 weeks. Measure first, then invest.

---

## Phase 0: Fix Embarrassing Bugs (Day 1)
> Goal: Don't ship known bugs while building new features.
> Estimated effort: 0.5 day

### 0.1 Quick UX Fixes (REQUIRED)

**Items:**
- Fix copyright year "2025" → "2026" in `src/screens/ProfileScreen.js:155`
- Hide empty profile stats (0, 0, 0) — show "Start exploring!" prompt instead when user has no data
- Fix "Stops" toggle button — add visual active state (filled vs outline) so users can tell if stops are on
- Add "31 buses live" label to the LIVE badge for clarity (currently just "31 LIVE" with no context)
- Fix trip planner header persisting after tab switch (state cleanup on blur)

**Files to modify:**
- `src/screens/ProfileScreen.js` — copyright, empty state
- `src/screens/HomeScreen.js` / `.web.js` — stops toggle visual state, LIVE badge label
- `src/navigation/TabNavigator.js` — trip planner state cleanup on tab change

---

## Phase 1: Core Improvements (Days 2-8)
> Goal: Reduce churn, enable measurement, add the highest-impact quality-of-life feature.
> Estimated effort: 5-7 days | Impact: Score 6.5 → 7.5

### 1.1 Search History & Recent Trips (REQUIRED)
**Why:** Best effort-to-impact ratio in the plan. Every repeat trip starts from scratch. Daily commuters feel this friction most.

**Effort: 1-2 days**

**Implementation:**
- Create `src/hooks/useSearchHistory.js`:
  - Store last 10 searches per category (stops, routes, addresses) in AsyncStorage
  - `addToHistory(type, item)`, `getHistory(type)`, `clearHistory(type)`
  - Key: `@barrie_transit_search_history`
- Modify `SearchScreen.js` — show "Recent" section above results when search input is empty
- Modify `TripBottomSheet` / `.web.js` — show "Recent Trips" when planner is open with no input

**Files to create/modify:**
- `src/hooks/useSearchHistory.js` (new)
- `src/screens/SearchScreen.js` — add recent section
- `src/components/TripBottomSheet.js` / `.web.js` — add recent trips
- `src/components/TripSearchHeader.js` / `.web.js` — show recent destinations

**Patterns to reuse:**
- AsyncStorage pattern from `AuthContext.js:20-25`
- Trip history data structure from `AuthContext` `tripHistory` state

---

### 1.2 Onboarding Flow (REQUIRED)
**Why:** Users land on a map full of buses with zero guidance. Most churn in <60 seconds.

**Effort: 2-3 days**

**Implementation:**
- Create `src/screens/OnboardingScreen.js` — 4-screen swipeable walkthrough (single file, no `.web.js` variant needed — no platform-specific rendering for simple card swipes)
- Screens: (1) Live Bus Tracking, (2) Trip Planning, (3) Favorites & Alerts, (4) Turn-by-Turn Navigation
- Each screen: icon + headline + 1-line description (no custom illustrations — use existing app icons/emojis)
- Final screen: "Get Started" button + optional "Sign in to sync"
- First-launch detection via AsyncStorage key `@barrie_transit_onboarding_seen`
- Gate in `App.js`: check flag before rendering `TabNavigator`, show `OnboardingScreen` if first launch
- Add "Replay Tutorial" option in Settings screen

**Files to create/modify:**
- `src/screens/OnboardingScreen.js` (new — single file, works on both platforms)
- `App.js` — add onboarding gate at `App.js:132-152` before TabNavigator render
- `src/screens/SettingsScreen.js` — add "Replay Tutorial" menu item

**Patterns to reuse:**
- AsyncStorage pattern from `AuthContext.js:20-25`
- Navigation pattern from `App.js:100-115`

---

### 1.3 Event Analytics (REQUIRED)
**Why:** You can't improve what you can't measure. Currently zero insight into user behavior.

**Effort: 1-2 days**

**Implementation:**
- Create `src/services/analyticsService.js` — thin wrapper around **existing Firebase web SDK** (`firebase/analytics` — already in `package.json` as `firebase@12.8.0`)
  - **Do NOT add `@react-native-firebase/analytics`** — mixing Firebase SDKs would require build config changes
  - Initialize via `getAnalytics()` from existing Firebase app in `src/config/firebase.js`
  - Key events: `trip_planned`, `navigation_started`, `navigation_completed`, `favorite_added`, `route_viewed`, `stop_viewed`, `search_performed`, `onboarding_completed`
  - User properties: `has_account`, `favorite_count`
- Add `trackEvent()` calls at key touchpoints
- Fire-and-forget — never block UI on tracking calls

**Files to create/modify:**
- `src/services/analyticsService.js` (new)
- `src/config/firebase.js` — initialize analytics module
- `src/hooks/useTripPlanner.js` — track `trip_planned`
- `src/screens/NavigationScreen.js` — track `navigation_started/completed`
- `src/context/AuthContext.js` — track `favorite_added`
- `src/screens/SearchScreen.js` — track `search_performed`
- `src/screens/HomeScreen.js` / `.web.js` — track `route_viewed`, `stop_viewed`

**Patterns to reuse:**
- Firebase config from `src/config/firebase.js`
- Logger pattern from `src/utils/logger.js`

---

### 1.4 Favorite Stop Quick View (REQUIRED)
**Why:** Users want "when does my next bus leave?" answered instantly. Replaces the over-engineered "My Commute" ML detection.

**Effort: 1 day**

**What changed from original plan:** The original "My Commute Smart Card" proposed pattern detection from trip history, but trip history only stores search data (not completed trips), has a 20-item cap, and uses lat/lon coordinates that vary each search. Instead, this simpler version uses the user's favorited stops — data that's reliable and already exists.

**Implementation:**
- Create `src/components/FavoriteStopCard.js` — small card showing next 2 departures from the user's top favorited stop
  - Uses existing `useStopArrivals` hook for real-time data
  - Shows: stop name, route badge, "Leaves in X min", delay indicator
  - Tap → navigates to stop on map with bottom sheet open
  - Only appears if user has at least 1 favorited stop
  - Works for both authenticated (Firestore) and guest (AsyncStorage) users
- Add to both `HomeScreen.js` and `HomeScreen.web.js` above map controls

**Files to create/modify:**
- `src/components/FavoriteStopCard.js` (new)
- `src/components/FavoriteStopCard.web.js` (new — different positioning on web)
- `src/screens/HomeScreen.js` — add card overlay
- `src/screens/HomeScreen.web.js` — add card overlay

**Patterns to reuse:**
- `useStopArrivals` hook for real-time departure data
- `AuthContext` favorites for stop selection
- `DelayBadge` component for status display

---

## Phase 2: Accessibility & Growth (Days 9-18)
> Goal: Meet legal requirements. Add organic growth channel.
> Estimated effort: 7-11 days | Impact: Score 7.5 → 8.5

### 2.1 Accessibility Audit & Fixes (REQUIRED — AODA Legal Requirement)
**Why:** Ontario's AODA requires accessible public-facing digital services. Transit serves disproportionately high disability ridership. No `accessibilityLabel` props exist on any custom components currently.

**Effort: 5-8 days** (originally estimated 3-5 — underestimated)

**Implementation:**
- Audit all interactive components for VoiceOver/TalkBack compatibility
- Add `accessibilityLabel`, `accessibilityHint`, `accessibilityRole` to all interactive elements
- For `.web.js` files: verify `react-native-web` properly translates to ARIA attributes; add `aria-label` directly if needed
- Add `accessibilityLiveRegion="polite"` for real-time updates (arrival times, delays)
- Implement `reduceMotion` check for pulse animations (`useMapPulseAnimation` hook)
- Address existing "High Contrast" placeholder at `SettingsScreen.js:195` (currently says "Coming Soon")
- Test with VoiceOver (iOS) and TalkBack (Android)

**Key components to audit (24+ files across both platforms):**
- `src/components/BusMarker.js` / `.web.js` — "Route 8A bus heading north"
- `src/components/StopMarker.js` / `.web.js` — "Bus stop: Cheltenham Road, Stop 401"
- `src/components/StopBottomSheet.js` / `.web.js` — arrival times, action buttons
- `src/components/TripBottomSheet.js` / `.web.js` — trip results, action buttons
- `src/components/TripResultCard.js` — itinerary summaries
- `src/components/TripStep.js` — step-by-step directions
- `src/components/DelayBadge.js` — delay status
- `src/screens/HomeScreen.js` / `.web.js` — route filters, stops toggle, action bar
- `src/screens/SearchScreen.js` — search results list
- `src/screens/NavigationScreen.js` — navigation instructions
- `src/navigation/TabNavigator.js` — tab bar icons

---

### 2.2 Share Stop (REQUIRED)
**Why:** "Meet me at this stop at 3:15" is the natural sharing moment for transit. Organic growth loop.

**Effort: 1 day** (originally scoped 3 deep link schemes — cut to just stops for v1)

**What changed:** Original plan proposed `stop/{id}`, `route/{id}`, and `trip?from=...&to=...` deep links plus web URLs for a domain that doesn't exist. For v1, only stop sharing matters.

**Implementation:**
- Add `expo-sharing` dependency
- Create `src/utils/shareUtils.js` with `shareStop(stop)`:
  - Generates: "Cheltenham Road (Stop #401) - Barrie Transit" with `barrie-transit://stop/401` deep link
- Add linking config to `NavigationContainer` in `App.js` for `stop/{stopId}` route
- Add share button to `StopBottomSheet.js` / `.web.js` (icon button in header row)
- Deep link handler: navigate to MapMain with `selectedStopId` param

**Files to create/modify:**
- `src/utils/shareUtils.js` (new)
- `App.js` — add linking configuration
- `src/components/StopBottomSheet.js` / `.web.js` — add share button
- `package.json` — add `expo-sharing`

**Patterns to reuse:**
- Deep link handling from `App.js:95-116`
- External linking from `src/utils/hotspotLinks.js:14-34`

---

### 2.3 In-App Review Prompt (OPTIONAL)
**Why:** Low effort, meaningful store ranking impact. Trigger after positive moments.

**Effort: 0.5 day**

**Implementation:**
- Add `expo-store-review` dependency
- Trigger after 3rd completed navigation (not first — let users form an opinion)
- Track `@barrie_transit_review_requested` in AsyncStorage; respect 90-day cooldown
- Web: skip (no store review on web)

**Files to create/modify:**
- `src/services/reviewService.js` (new)
- `src/screens/NavigationScreen.js` — trigger after navigation completion
- `package.json` — add `expo-store-review`

---

## Phase 3: Polish & Authentication (Days 19-25)
> Goal: Remove friction, improve perceived quality.
> Estimated effort: 4-6 days | Impact: Score 8.5 → 9.0

### 3.1 Apple & Google Native Sign-In (OPTIONAL)
**Why:** Email/password converts ~15% of users. Social sign-in converts ~45%.

**Effort: 1-2 days**

**Implementation:**
- Add `expo-apple-authentication` for iOS
- Configure Google Sign-In for native (currently web-only in `authService.js`)
- Add sign-in buttons to `SignInScreen.js` with platform checks
- Firebase auth already supports both providers

**Files to create/modify:**
- `src/screens/SignInScreen.js` — add Apple/Google buttons
- `src/services/authService.js` — add native Google & Apple auth methods
- `app.json` — add Apple auth plugin
- `package.json` — add `expo-apple-authentication`

---

### 3.2 Dark Mode (OPTIONAL — Deferred from Phase 1)
**Why:** Nice-to-have polish, not a launch blocker. Municipal transit app users will not uninstall over light theme.

**Effort: 8-12 days** (originally estimated 2-3 — severely underestimated)

**Reality check:** 1,089 occurrences of `COLORS.` across 59 files. 53 files with `StyleSheet.create`. This is not a weekend project.

**Recommended approach (incremental, not big-bang):**
1. Create `src/context/ThemeContext.js` with `useThemeColors()` hook (0.5 day)
2. Create `COLORS_DARK` palette in `theme.js` (0.5 day)
3. Migrate screens incrementally — start with most-used screens (HomeScreen, SearchScreen, ProfileScreen), then work outward over multiple sessions
4. Add dark map tiles (Stadia Dark for Leaflet, dark style for MapLibre)
5. Add theme picker to Settings (System/Light/Dark)

**Performance note:** Wrapping the entire app in another context provider that triggers re-renders on theme change could cause issues with the large map component trees. Use `useMemo` for the theme value and consider splitting static colors (don't re-render) from dynamic theme colors.

**Files to create/modify:**
- `src/config/theme.js` — add `COLORS_DARK`, `getTheme(isDark)`
- `src/context/ThemeContext.js` (new)
- `App.js` — wrap with `ThemeProvider`
- `src/screens/SettingsScreen.js` — theme picker
- `app.json` — `userInterfaceStyle` to "automatic"
- All 53+ screen/component files (incremental migration)

---

## Phase 4: Advanced Engagement (Future — Post-Launch)
> Only pursue after analytics data confirms user demand.
> These features are NOT in the shipping plan.

### 4.1 Proactive "Your Bus is Late" Notifications (OPTIONAL)
- Requires `expo-task-manager` for background tasks
- Depends on Phase 1.4 (Favorite Stop) data for knowing which routes to monitor
- User opt-in via Settings
- **Prerequisite:** Analytics data showing users actually engage with delay information

### 4.2 Home Screen Widget (OPTIONAL)
- Requires native iOS (Swift/WidgetKit) and Android (Kotlin/AppWidgets) code
- Cannot be done in JavaScript alone
- **Prerequisite:** 1K+ active users justifying the native development investment

### 4.3 CO2 Savings & Trip Stats (CUT)
- Removed from plan. No evidence this drives retention for municipal transit apps. Vanity metric.

---

## Implementation Priority Summary

| # | Feature | Phase | Classification | Realistic Effort | Impact |
|---|---------|-------|---------------|-----------------|--------|
| 1 | Quick UX fixes (copyright, empty stats, toggle) | 0 | **REQUIRED** | 0.5 day | Removes embarrassing bugs |
| 2 | Search History & Recent Trips | 1 | **REQUIRED** | 1-2 days | Best effort-to-impact ratio |
| 3 | Onboarding Flow | 1 | **REQUIRED** | 2-3 days | Reduces first-session churn |
| 4 | Event Analytics (existing Firebase SDK) | 1 | **REQUIRED** | 1-2 days | Enables data-driven iteration |
| 5 | Favorite Stop Quick View | 1 | **REQUIRED** | 1 day | Instant daily value |
| 6 | Accessibility Audit | 2 | **REQUIRED** | 5-8 days | AODA legal + 15-20% more users |
| 7 | Share Stop | 2 | **REQUIRED** | 1 day | Organic growth loop |
| 8 | In-App Review Prompt | 2 | Optional | 0.5 day | Store ranking improvement |
| 9 | Native Social Sign-In | 3 | Optional | 1-2 days | 3x auth conversion |
| 10 | Dark Mode (incremental) | 3 | Optional | 8-12 days | Polish / user preference |

**Required features total: 12-18 days (Phases 0-2)**
**Full plan including optional: 22-32 days (Phases 0-3)**

---

## Verification Plan

After each phase:
1. Run `npm run web:dev` and verify all new features work in browser
2. Run `npm test` to ensure no regressions
3. Test on Android emulator via `npx expo start` for native-specific features
4. For onboarding: clear AsyncStorage key and relaunch to verify first-launch gate
5. For accessibility: enable VoiceOver/TalkBack and navigate full app flow
6. For share: test deep links open correctly on both platforms
7. Commit after each completed phase

**Testing gap to address:** Only 5 test files exist in `src/__tests__/`. Each new hook/utility should include basic test coverage.

---

## Architecture Notes

**Key patterns to follow:**
- All new hooks go in `src/hooks/` — imported by both `.js` and `.web.js` screen files
- Only rendering code differs between platforms — do NOT create `.web.js` for non-rendering code
- Use existing `STORAGE_KEYS` pattern from `AuthContext.js` for new AsyncStorage keys
- Use existing Firebase web SDK (`firebase/analytics`) — do NOT introduce `@react-native-firebase`
- Analytics events are fire-and-forget — never block UI on tracking calls
- New context providers wrap inside existing `AuthProvider > TransitProvider` chain in `App.js`

**Dependencies between features:**
- Analytics (1.3) should ship before or with Onboarding (1.2) to track `onboarding_completed`
- Favorite Stop Quick View (1.4) depends on user having favorites — works with existing favorites system
- Share Stop (2.2) depends on linking config which can be added independently
- Dark Mode (3.2) has no dependencies but affects every other feature's styling
