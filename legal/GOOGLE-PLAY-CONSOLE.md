# Google Play Console — App Submission Guide

**App: My Barrie Transit**
**Package: `com.barrietransit.planner`**
**Last Updated: February 14, 2026**

This document contains all the information needed to complete the Google Play Console listing for My Barrie Transit.

---

## 1. Store Listing

### App Details

| Field | Value |
|-------|-------|
| **App name** | My Barrie Transit |
| **Short description** (80 chars max) | Plan trips, track buses in real-time, and navigate Barrie Transit with ease. |
| **Category** | Maps & Navigation |
| **Tags** | Transit, Bus, Public Transportation, Trip Planner, Barrie |

### Full Description (4000 chars max)

```
My Barrie Transit is your all-in-one companion for navigating the Barrie Transit bus system in Barrie, Ontario, Canada.

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

Built with official Barrie Transit GTFS data. This is an independent app and is not officially affiliated with the City of Barrie or Barrie Transit.
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
- "My Barrie Transit" text
- Tagline: "Real-time bus tracking & trip planning"
- Barrie Transit blue (#1a73e8) background

---

## 2. App Content (Policy and Programs)

### Privacy Policy

| Field | Value |
|-------|-------|
| **Privacy policy URL** | *Host `legal/privacy-policy.md` as HTML and enter the URL* |

**Hosting options:**
1. **GitHub Pages** — Enable Pages on your repo, point to `/docs` folder, copy privacy policy there as `index.html`
2. **Firebase Hosting** — Deploy a simple HTML version
3. **Any static host** — Netlify, Vercel, etc.

The privacy policy file is at: `legal/privacy-policy.md`

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
| Is this a government app? | **No** — Independent app, not officially affiliated with the City of Barrie |

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
**Yes** (in-app account deletion in Settings screen)

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
| **Crash logs** | Yes | Yes (Sentry) | App stability & bug fixing | No (automatic) |
| **Diagnostics** | Yes | Yes (Sentry) | App stability & bug fixing | No (automatic) |

- Crash data sent to Sentry for error tracking
- Includes stack traces, device type, OS version
- No PII is intentionally included in crash reports

#### Device Identifiers

| Data type | Collected | Shared | Purpose | Optional |
|-----------|-----------|--------|---------|----------|
| **Device or other IDs** | Yes | Yes (Expo) | Push notification delivery | Yes — permission-gated |

- Expo push notification token stored in Firebase
- Shared with Expo's push notification service for delivery only

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
| **Minimum Android version** | Android 6.0 (API 23) — Expo default |
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

## 6. Pre-Launch Checklist

- [ ] **Privacy policy hosted** at a public URL and entered in Play Console
- [ ] **Store listing** completed (title, descriptions, screenshots, feature graphic)
- [ ] **Content rating** questionnaire completed
- [ ] **Data safety** section filled out per Section 3 above
- [ ] **Target audience** set to 13+
- [ ] **App category** set to Maps & Navigation
- [ ] **App signing** enrolled in Google Play App Signing
- [ ] **AAB uploaded** to Internal Testing track
- [ ] **Internal testing** verified on physical device
- [ ] **Contact email** set (for Play Store listing — use support@barrietransit.app or your personal email)
- [ ] **App icon** verified at 512×512 in Play Console
- [ ] **Feature graphic** uploaded (1024×500)
- [ ] **Minimum 2 phone screenshots** uploaded
- [ ] **Closed testing** run with 5+ testers for 2+ weeks (recommended before production)
- [ ] **Disclaimer** added: "Not officially affiliated with the City of Barrie or Barrie Transit"

---

## 7. Contact Information

| Field | Value |
|-------|-------|
| **Developer name** | *Your name or business name* |
| **Contact email** | support@barrietransit.app *(or your preferred email)* |
| **Contact phone** | *Optional — can be omitted* |
| **Website** | *Optional — your GitHub Pages URL or project site* |

---

## 8. Common Rejection Reasons to Avoid

| Issue | How We Address It |
|-------|-------------------|
| Missing privacy policy | Hosted at public URL, linked in Play Console and in-app Settings |
| Location permission without clear need | Permission prompt explains purpose; app works without it |
| Misleading "official" branding | Disclaimer states app is independent, not affiliated with City of Barrie |
| Broken functionality | Offline caching ensures core features work without network |
| No data deletion mechanism | Account deletion available in Settings screen |
| Excessive permissions | Only 3 permissions, all justified (location, notifications) |

---

## Quick Reference: Fields to Fill In

These are the values you'll need to type/paste into Google Play Console forms:

1. **Privacy Policy URL** → host `legal/privacy-policy.md` and enter the URL
2. **App name** → `My Barrie Transit`
3. **Short description** → `Plan trips, track buses in real-time, and navigate Barrie Transit with ease.`
4. **Full description** → See Section 1
5. **Category** → Maps & Navigation
6. **Contact email** → `support@barrietransit.app`
7. **Content rating** → Complete IARC questionnaire (all "No" → Everyone)
8. **Data safety** → Follow Section 3 exactly
9. **Target audience** → 13+ / Not designed for children
