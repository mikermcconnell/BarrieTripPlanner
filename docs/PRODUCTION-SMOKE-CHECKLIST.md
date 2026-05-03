# Production Smoke Checklist

Date:
Build:
Tester:

## Android release build

- [ ] App launches from a fresh install
- [ ] Main map renders
- [ ] Current location permission prompt is understandable
- [ ] Stop search returns believable Barrie stops
- [ ] Route search returns believable Barrie routes
- [ ] Stop arrivals render or show a clear unavailable state
- [ ] Trip planning returns at least one plausible trip
- [ ] Trip details open from a planned trip
- [ ] Navigation starts from a planned trip
- [ ] Google sign-in succeeds, or shows a specific setup error rather than a generic unexpected error
- [ ] Favorites add/remove works for a signed-in user
- [ ] Alerts screen loads with empty and populated states handled
- [ ] News screen loads
- [ ] Profile/settings/auth screens do not expose secrets or debug data

## Web build

- [ ] `npm run web:dev` loads the app
- [ ] Web map renders
- [ ] Stop search works through the proxy
- [ ] Trip planning works through the proxy
- [ ] Web Google sign-in succeeds if the web origin is allowed in Firebase Auth

## Backend

- [ ] `/api/health` returns `status: ok`
- [ ] `/api/health` reports `requireApiAuth: true`
- [ ] `/api/health` reports `requireFirebaseAuth: true`
- [ ] `/api/health` reports `allowSharedTokenAuth: false`
- [ ] Protected API route without auth returns `401`
- [ ] Authenticated geocoding request succeeds
- [ ] Detour rollout health reviewed

## Required external setup

- [ ] Firebase/Google Cloud has an Android OAuth client for `com.barrietransit.planner`
- [ ] Firebase/Google Cloud includes the release/app-signing SHA-1 fingerprint
- [ ] Updated `google-services.json` is present locally and as the EAS file secret
- [ ] Firebase Anonymous Authentication is enabled for non-signed-in proxy access
- [ ] Cloud Scheduler uses `x-scheduler-token`, not `x-api-token`

## Result

- [ ] Pass
- [ ] Fail

Notes:
