# Google Play Console — App Submission Guide

**App: MyBarrie Transit**
**Package: `com.barrietransit.planner`**
**Last Updated: July 29, 2026**

> Publisher: Mike McMike. This is an independently operated app. It is not affiliated with, endorsed by, or operated by the City of Barrie or Barrie Transit.

This document contains all the information needed to complete the Google Play Console listing for MyBarrie Transit.

---

## 1. Store Listing

### App Details

| Field | Value |
|-------|-------|
| **App name** | MyBarrie Transit |
| **Short description** (80 chars max) | Plan trips, track buses in real-time, and navigate Barrie Transit with ease. |
| **Category** | Maps & Navigation |
| **Tags** | Transit, Bus, Public Transportation, Trip Planner, Barrie |

The chosen public title is **MyBarrie Transit** and the existing package is `com.barrietransit.planner`. It is retained to preserve the Google Play testing and release history. Keep the independent-app disclaimer prominent in the full description and About screen to reduce impersonation risk. The package name cannot be changed for later updates after the first Play upload.

### Full Description (4000 chars max)

```
MyBarrie Transit is your all-in-one companion for navigating the Barrie Transit bus system in Barrie, Ontario, Canada.

PLAN YOUR TRIP
Enter your origin and destination to get step-by-step transit directions including walking segments, bus routes, transfer points, and estimated arrival times. The trip planner uses real Barrie Transit schedule data to give you accurate results.

REAL-TIME BUS TRACKING
See where every Barrie Transit bus is right now on the map. Live vehicle positions update automatically so you always know when your bus is arriving.

FIND NEARBY STOPS
Allow location access to instantly see the closest bus stops, with walking distance and upcoming departure times.

SAVE YOUR FAVORITES
Create an account to save your most-used stops and routes for quick one-tap access. Your favorites sync across devices.

SEARCH STOPS & ROUTES
Browse all Barrie Transit routes and stops. Search by stop number, stop name, route number, or street address.

SERVICE ALERTS & DETOURS
Stay informed about service disruptions, detours, and schedule changes with real-time alerts from Barrie Transit.

TURN-BY-TURN NAVIGATION
Get walking directions to your bus stop, see when to get off, and navigate transfers with step-by-step guidance.

WORKS OFFLINE
Transit schedules and stop information are cached on your device so you can plan trips even without an internet connection.

KEY FEATURES:
• Real-time bus tracking with live map
• Trip planning with walking + transit directions
• Nearby stops with distance and next departures
• Favorite stops and routes (with optional account)
• Service alerts and detour notifications
• Offline schedule access
• Dark-friendly map with clear route colors
• Accessibility information for stops

Built with publicly available Barrie Transit data. MyBarrie Transit is an independent app and is not affiliated with, endorsed by, or operated by the City of Barrie or Barrie Transit.
```

### Graphics

| Asset | Spec | File |
|-------|------|------|
| **App icon** | 512×512 PNG, 32-bit, no alpha | `assets/icon.png` (resize to 512×512 if needed) |
| **Feature graphic** | 1024×500 JPG or PNG | *To create — see section below* |
| **Phone screenshots** | Min 2, max 8. 16:9 or 9:16, min 320px, max 3840px | *To capture — see section below* |
| **Tablet screenshots** | Optional but recommended. 7" and 10" | *To capture if available* |

#### Screenshot Recommendations (capture these screens)
1. **Map view** with live bus positions and route polylines
2. **Nearby stops** with walking distances
3. **Trip planner** showing results with transfers
4. **Stop detail** sheet with upcoming departures
5. **Navigation** screen with step-by-step directions
6. **Favorites** with saved stops
7. **Search** screen showing stop/route/address results
8. **Service alerts** if any are active

#### Feature Graphic
Create a 1024×500 image with:
- App icon/logo
- "MyBarrie Transit" text
- Tagline: "Real-time bus tracking & trip planning"
- Barrie Transit blue (#1a73e8) background

---

## 2. App Content (Policy and Programs)

### Privacy Policy

| Field | Value |
|-------|-------|
| **Privacy policy URL** | `https://barrie-transit-trip-plan-cc84e.web.app/privacy-policy.html` |
| **Account deletion URL** | `https://barrie-transit-trip-plan-cc84e.web.app/account-deletion.html` |

These pages are staged in `legal-public/` and identify Mike McMike with `mybarrietransit@outlook.com` as the independent operator and app contact. Obtain appropriate legal review, deploy with Firebase Hosting, and verify both public URLs before submitting the app.

### App Access

| Question | Answer |
|----------|--------|
| Does your app require login? | **No** — The app is fully functional without an account. Account creation is optional for syncing favorites. |
| Provide test credentials? | Not required (no login gate) |

### Ads

| Question | Answer |
|----------|--------|
| Does your app contain ads? | **No** |

### Content Rating (IARC Questionnaire)

| Question | Answer |
|----------|--------|
| Does the app contain violence? | No |
| Does the app contain sexual content? | No |
| Does the app contain profanity? | No |
| Does the app allow user interaction/communication? | No |
| Does the app share user location with other users? | No |
| Does the app allow purchases? | No |
| Does the app contain gambling? | No |
| Does the app contain controlled substances? | No |

**Expected rating: Rated for Everyone / PEGI 3 / USK 0**

### Target Audience

| Question | Answer |
|----------|--------|
| Target age group | 13+ (general audience, not targeting children) |
| Is the app designed for children? | **No** |
| Does the app appeal to children? | No — it's a transit navigation tool |

### News App

| Question | Answer |
|----------|--------|
| Is this a news app? | **No** |

### COVID-19 Contact Tracing / Health App

| Question | Answer |
|----------|--------|
| Is this a COVID-19 app? | **No** |
| Is this a health app? | **No** |

### Government App

| Question | Answer |
|----------|--------|
| Is this a government app? | **No** — independently operated and not affiliated with, endorsed by, or operated by the City of Barrie or Barrie Transit. |

### Financial Features

| Question | Answer |
|----------|--------|
| Does the app provide financial services? | **No** |

---

## 3. Data Safety Section

This is the most critical section. Google requires you to declare all data types collected and shared.

### Does your app collect or share user data?
**Yes**

### Is all collected data encrypted in transit?
**Yes** (all connections use HTTPS)

### Do you provide a way for users to request data deletion?
**Yes** (in-app deletion under Profile → Account, plus the public account-deletion page)

### Data Types

#### Location

| Data type | Collected | Shared | Purpose | Optional |
|-----------|-----------|--------|---------|----------|
| **Approximate location** | Yes | No | App functionality (nearby stops) | Yes — permission-gated |
| **Precise location** | Yes | Yes (LocationIQ) | App functionality (walking directions, nearby stops) | Yes — permission-gated |

- Precise location is shared with LocationIQ **only** to calculate walking directions
- Location is processed ephemerally (not stored on any server)
- User can deny location permission and still use the app

#### Personal Info

| Data type | Collected | Shared | Purpose | Optional |
|-----------|-----------|--------|---------|----------|
| **Email address** | Yes | No | Account management | Yes — account is optional |
| **Name** | Yes | No | Account management (display name) | Yes |

- Email and name are stored in Firebase (Google Cloud) for authentication only
- Not shared with any third parties beyond Firebase

#### App Activity

| Data type | Collected | Shared | Purpose | Optional |
|-----------|-----------|--------|---------|----------|
| **In-app search history** | Yes | No | App functionality (recent searches) | No (auto-collected when searching) |
| **Other user-generated content** | Yes | No | App functionality (favorites, trip history) | Yes |

- Search history stored locally on device only (AsyncStorage)
- Favorites/trip history stored in Firebase if user has account, otherwise local only

#### App Info and Performance

| Data type | Collected | Shared | Purpose | Optional |
|-----------|-----------|--------|---------|----------|
| **Crash logs** | No for the current Android release | No | N/A | N/A |
| **Diagnostics** | No for the current Android release | No | N/A | N/A |

- The app contains optional Sentry integration, but the production DSN is not configured. No Android crash reports are sent to Sentry in the current release.
- If Sentry is enabled later, update the privacy policy and Play Data Safety answers before that release.

#### Device Identifiers

| Data type | Collected | Shared | Purpose | Optional |
|-----------|-----------|--------|---------|----------|
| **Device or other IDs** | Yes | Yes (Expo) | Push notification delivery | Yes — permission-gated |

- Expo push notification token stored in Firebase
- Shared with Expo's push notification service for delivery only

#### User-Generated Content and Service Operations

| Data type | Collected | Shared | Purpose | Optional |
|-----------|-----------|--------|---------|----------|
| **Other user-generated content (app feedback)** | Yes | No for the current release | App functionality, developer communications, diagnostics | Yes — submitted by the user |
| **App interactions / technical context** | No for the current Android release | No | N/A | N/A |

- Feedback includes the selected category, message, app version, platform, source screen, timestamps, and a pseudonymous rate-limit/retry identifier. The feedback record does not include the rider's email address.
- Feedback is scheduled for deletion after no more than 365 days; pseudonymous rate-limit records after no more than 30 days.
- Resend email alerts are not configured in the current production backend, so feedback is not currently shared with Resend. If alerts are enabled later, update Data Safety before that release.
- Firebase Analytics currently runs on web only. Native Android analytics calls are no-ops.
- Recheck the final production environment immediately before submission; Sentry or Resend configuration changes require matching Data Safety updates.

### Data NOT Collected
- Financial info (no payments)
- Health/fitness data
- Messages/SMS
- Photos/videos
- Audio
- Files/documents
- Calendar
- Contacts
- Web browsing history
- Advertising ID (no ads)

---

## 4. Store Settings

### App Pricing

| Field | Value |
|-------|-------|
| **Price** | Free |
| **In-app purchases** | None |
| **Subscriptions** | None |

### Countries / Regions

| Field | Value |
|-------|-------|
| **Distribution** | Canada only (recommended) or All countries |

*Note: The app is only useful in Barrie, Ontario, but there's no harm in wider distribution.*

### Device Compatibility

| Field | Value |
|-------|-------|
| **Minimum Android version** | Android 7.0 (API 24) — Expo SDK 54 default |
| **Supported architectures** | arm64-v8a, armeabi-v7a, x86, x86_64 |
| **Tablet support** | Yes (responsive layout) |

---

## 5. Release Setup

### App Signing

| Field | Value |
|-------|-------|
| **App signing by Google Play** | Recommended — let Google manage the signing key |
| **Upload key** | Generated by EAS Build (`eas build`) |

### Release Tracks

| Track | Recommended Use |
|-------|----------------|
| **Internal testing** | First upload — test with a small group |
| **Closed testing** | Beta testers, friends, transit riders |
| **Open testing** | Public beta before production launch |
| **Production** | Full public release |

**Recommended launch path:** Internal → Closed (2-4 weeks) → Production

### Build Command

```bash
# Generate Android AAB for upload
eas build --platform android --profile production

# Or for APK (testing only)
eas build --platform android --profile preview
```

---

## 6. Production Access Closed-Test Gate

Google Play requires a closed test with at least 12 testers opted in continuously for 14 days before a new personal developer account can apply for production access. Meeting that minimum only unlocks the application; it does not guarantee approval. Google may require more testing when it considers tester engagement or the production-readiness evidence insufficient.

Official guidance: [App testing requirements for new personal developer accounts](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en)

### July 26, 2026 Review Result

- Google reviewed the production-access application on Sunday, July 26, 2026 at 10:02 p.m. and required more testing.
- Play Console started a new 14-day qualification period from the review date. The same opted-in testers can continue; 12 new testers are not required.
- Keep at least 12 testers continuously opted in. Do not have them leave and rejoin, because interrupted days do not count as continuous testing.
- The earliest expected completion is August 9, 2026 after 10:02 p.m. Reapply only after Play Console marks the requirement complete; waiting until August 10 is safer if its counter updates slowly.
- The generic notice did not identify one exact failed factor. Treat insufficient meaningful tester engagement or insufficiently specific application answers as the likely issue to correct.

### Evidence Required Before Reapplying

- [ ] Keep at least 12 testers continuously opted in for the entire new 14-day period; retain extra testers as a buffer where possible.
- [ ] Confirm testers installed the closed-test release and meaningfully exercised core flows: map, arrivals, stop/route search, trip planning, navigation, alerts, favourites, and settings.
- [ ] Collect written tester feedback and record the dates, features tested, issues found, and number of active testers.
- [ ] Record fixes or improvements made in response to the feedback and publish updates to the same closed-testing track when needed.
- [ ] Keep the closed-testing release active and do not delete or replace the testing track or tester group.
- [ ] Confirm Play Console shows 12 or more testers opted in continuously for 14 days before applying again.
- [ ] In the next application, answer with concrete numbers and examples: testing dates, tester count, usage performed, feedback received, issues found, and resulting changes.

---

## 7. Pre-Launch Checklist

- [ ] **Privacy policy hosted** at a public URL and entered in Play Console
- [ ] **Store listing** completed (title, descriptions, screenshots, feature graphic)
- [ ] **Content rating** questionnaire completed
- [ ] **Data safety** section filled out per Section 3 above
- [ ] **Target audience** set to 13+
- [ ] **App category** set to Maps & Navigation
- [ ] **App signing** enrolled in Google Play App Signing
- [ ] **AAB uploaded** to Internal Testing track
- [ ] **Internal testing** verified on physical device
- [ ] **App contact email** set to `mybarrietransit@outlook.com`
- [ ] **App icon** verified at 512×512 in Play Console
- [ ] **Feature graphic** uploaded (1024×500)
- [ ] **Minimum 2 phone screenshots** uploaded
- [ ] **Closed testing** completed with 12+ continuously opted-in and meaningfully engaged testers for at least 14 days; evidence recorded as described above
- [ ] **Independent-app disclaimer** included in the full listing and in-app About screen

---

## 8. Contact Information

| Field | Value |
|-------|-------|
| **Developer name** | Mike McMike |
| **App contact email** | `mybarrietransit@outlook.com` |
| **Contact phone** | *Optional — can be omitted* |
| **Website** | *Optional — your GitHub Pages URL or project site* |
| **Barrie Transit service contact** | `ServiceBarrie@barrie.ca` — for fares, schedules, service, and other transit questions; not the app contact |

---

## 9. Common Rejection Reasons to Avoid

| Issue | How We Address It |
|-------|-------------------|
| Missing privacy policy | Hosted at public URL, linked in Play Console and in-app Settings |
| Location permission without clear need | Permission prompt explains purpose; app works without it |
| Misleading official identity | Clearly state that the app is independent and is not affiliated with, endorsed by, or operated by the City of Barrie or Barrie Transit |
| Broken functionality | Offline caching ensures core features work without network |
| No data deletion mechanism | Account deletion available in Settings screen |
| Excessive permissions | Only 3 permissions, all justified (location, notifications) |

---

## Quick Reference: Fields to Fill In

These are the values you'll need to type/paste into Google Play Console forms:

1. **Privacy Policy URL** → `https://barrie-transit-trip-plan-cc84e.web.app/privacy-policy.html`
2. **App name** → `MyBarrie Transit`
3. **Short description** → `Plan trips, track buses in real-time, and navigate Barrie Transit with ease.`
4. **Full description** → See Section 1
5. **Category** → Maps & Navigation
6. **App contact email** → `mybarrietransit@outlook.com`
7. **Content rating** → Complete IARC questionnaire (all "No" → Everyone)
8. **Data safety** → Follow Section 3 exactly
9. **Target audience** → 13+ / Not designed for children
