# MyBarrie Concierge Long-Term Premium Spec

Date: 2026-05-25
Status: Future roadmap concept — not current production launch scope

## Summary

MyBarrie Concierge is the long-term premium version of the app: an AI-first home experience for individual paid riders.

Direction locked:

- Premium users only get the AI-first home takeover.
- Free users keep the normal Map/Search/Profile app.
- Main home prompt: **“Where are you going?”**
- Concierge recommends the best trip, explains why, and asks the rider to confirm.
- AI uses only consented saved transit context:
  - saved trips
  - saved places
  - favorites
  - rider preferences
  - notification settings
- It does not use broader profile data or full travel history by default.
- This is future roadmap planning only, not production launch scope.

## Product Experience

- Premium home screen becomes **MyBarrie Concierge** instead of the standard map-first landing.
- Core home card:
  - “Where are you going?”
  - quick access to saved places and saved trips
  - proactive cards for monitored trips
  - current service issues that matter to the rider
- Concierge recommends:
  - best trip
  - when to leave
  - which stop to use
  - transfer instructions
  - platform or hub guidance where available
  - whether a delay, alert, or detour changes the plan
- Rider confirms before:
  - starting navigation
  - monitoring a trip
  - changing to an alternate trip
- AI follow-ups are contextual:
  - “Can I leave later?”
  - “Is there less walking?”
  - “Avoid transfers”
  - “Why this route?”
  - “What if this bus is late?”

## Key Future Changes

- Add premium entitlement support later, but do not choose pricing/payment system in this spec.
- Add a Concierge home mode for premium users.
- Keep existing Map, Search, Alerts, Favorites, Trip History, and Profile as supporting screens.
- Add a soft preview for free users outside the home takeover:
  - examples of what Concierge would monitor
  - locked premium cards
  - no disruptive upsell during core trip planning
- Backend remains the trust boundary:
  - AI never invents live transit facts
  - trip facts come from GTFS, GTFS-RT, alerts, detours, platform maps, and saved transit data
  - AI explains and guides; deterministic trip planning/ranking provides the factual recommendation base

## Test Scenarios

Future acceptance scenarios:

- Premium rider opens app and sees MyBarrie Concierge as the home experience.
- Free rider opens app and still sees the normal production app.
- Rider asks “Where are you going?” flow and gets a recommended trip.
- Recommendation explains why it was chosen.
- Rider can ask a follow-up without starting over.
- Concierge warns when live data is stale or unavailable.
- Concierge does not use profile data or trip history unless a future consent decision changes that.
- Rider must confirm before navigation or monitoring starts.
- Existing non-premium core app remains fully usable.

## Assumptions

- This is a long-term premium roadmap spec, not a near-term implementation plan.
- Production launch should stay focused on the current core app.
- “MyBarrie Concierge” is the product name.
- Premium payer is the individual rider.
- Premium value is proactive, personalized trip help — not generic chatbot access.
- The safest future implementation path is to build the AI-first experience on top of reliable saved trips, alerts, detours, notifications, and trip planning.
