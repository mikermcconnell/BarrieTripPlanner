# My Barrie Transit Detour Campaign Spec

## Purpose

Create a detour-first marketing campaign for **My Barrie Transit**.

The campaign should make one idea obvious:

> **Don't wait where the bus isn't going.**

This campaign should explain why a Barrie rider should download the app instead of relying only on a general map app or a general transit app.


## Confirmed Decisions

- Launcher name stays **MyBarrie**.
- Use the official Barrie Transit blue style.
- Use the existing app brand blues as the working palette:
  - primary blue: `#0C8CE5`
  - light blue: `#46B7FF`
  - dark blue: `#005EA8`
- No formal brand rules are available right now, so use the best practical app-store interpretation of the Barrie Transit style.
- Initial launch focus is the Android Play Store.
- The first-open onboarding should hook the rider immediately with the detour problem and the app's answer.

## Core Positioning

**Built for Barrie. Built for detours.**

My Barrie Transit is the local app for Barrie Transit riders. The main advantage is that it helps riders understand what is happening when service changes, especially planned and unplanned detours.

The campaign should focus on:

- live Barrie bus movement
- planned and unplanned detours
- skipped or affected stops
- likely detour paths
- route alerts
- regular rider tools such as favorites, stop search, and trip planning

## Primary Audience

The main audience is everyday Barrie Transit riders who want simple answers:

- Is my bus coming?
- Is my route on detour?
- Is my stop being skipped?
- Where is the bus actually going?
- Should I walk to a different stop?

Secondary audiences:

- occasional riders
- students
- downtown riders affected by construction, events, or closures
- riders who use the same stop or route every day

## Campaign Line

Primary line:

> **Don't wait where the bus isn't going.**

Supporting lines:

- **Built for Barrie. Built for detours.**
- **See detours before you walk to a skipped stop.**
- **Know when your route changes.**
- **Track live Barrie buses and route alerts in one place.**

Do not use absolute guarantees. The copy should not promise that a rider will always catch the bus or that the app will always know every detour perfectly.

## Visual Direction

Use the **Campaign Poster** direction as the main campaign style.

The main image should be bold, simple, and easy to understand in less than three seconds.

### Main Visual

The hero visual should show a simplified map with:

- a official Barrie Transit blue normal route line
- a red blocked or skipped route segment
- orange likely detour path
- red skipped stops
- live bus marker on the detour path
- clear My Barrie Transit branding

The visual should work in:

- Android Play Store feature graphic
- Android Play Store screenshots
- first-run onboarding
- social graphics
- posters or digital display graphics

### Visual Rules

Use consistent meanings:

| Element | Meaning |
|---|---|
| Blue line | Normal route |
| Red line | Skipped or blocked route segment |
| Orange line | Likely detour path |
| Red stop marker | Stop may be skipped or affected |
| Bus marker | Live bus location |
| Alert card | Route is currently on detour |

The visual should feel local and practical, not generic.

## Android Onboarding Direction

The existing onboarding should be reworked so the first impression is detour-first.

Recommended onboarding sequence:

1. **Don't wait where the bus isn't going.**  
   See detours before you walk to a skipped stop.

2. **See planned and unplanned detours.**  
   My Barrie Transit helps show when a route changes because of construction, events, closures, or live bus movement.

3. **Track live Barrie buses.**  
   See where buses are on the map and how they relate to your route.

4. **Save your regular stops and routes.**  
   Keep your everyday trips close so you can check them faster.

5. **Start riding with My Barrie Transit.**  
   Plan a trip, search stops, and follow service alerts built for Barrie riders.

### Onboarding Visuals

Each screen should use one strong visual, not a generic feature illustration.

Recommended visuals:

- Screen 1: campaign poster map with skipped stop and detour path
- Screen 2: alert card showing a route on detour
- Screen 3: live bus moving on the Barrie map
- Screen 4: favorite stop and route cards
- Screen 5: simple home screen preview with map, search, alerts, and favorites

## Android Launch Assets

Create the following assets for launch.

### Play Store Feature Graphic

Purpose: catch attention and explain the app in one glance.

Recommended copy:

- **Don't wait where the bus isn't going.**
- **My Barrie Transit**
- **Live buses, alerts, and detours built for Barrie riders.**

Recommended visual:

- official Barrie Transit blue poster-style background
- simplified detour map
- bus marker on the detour path
- red skipped stop markers

### Play Store Screenshots

Recommended screenshot set:

1. **Don't wait where the bus isn't going**  
   Detour hero screen.

2. **See planned and unplanned detours**  
   Alert strip, route overlay, skipped stops.

3. **Track live Barrie buses**  
   Main map with live buses.

4. **Find your stop faster**  
   Stop search and arrival information.

5. **Plan your trip across Barrie**  
   Trip planning and navigation.

6. **Save your regular rides**  
   Favorites and regular stops/routes.

7. **Stay informed**  
   Alerts, news, surveys, and settings.

### Short Demo Video or GIF

Recommended story:

1. Rider opens My Barrie Transit.
2. Route alert shows a detour.
3. Map shows skipped segment and likely detour path.
4. Rider taps for details.
5. Rider sees affected stops and live bus movement.

Keep it short: 10 to 20 seconds.

## Public Copy Guidelines

Use plain rider language.

Good copy:

- **See detours before you walk to a skipped stop.**
- **Know when your route changes.**
- **Live Barrie bus locations on the map.**
- **Built for Barrie Transit riders.**
- **Save your regular stops and routes.**

Avoid:

- absolute guarantees
- vague claims like "best app" without evidence
- internal project names or short forms
- technical wording such as GTFS, Firestore, worker, or feed polling
- implying the app replaces official service notices

## Trust Language

The detour feature should be marketed strongly, but with clear wording.

Use:

- **likely detour path**
- **stops may be skipped**
- **route is currently on detour**
- **detected from live bus movement**
- **planned and unplanned detours**

Fallback language when no detours are active:

- **No active detours right now.**
- **We'll show detours here when they affect your route.**
- **Save your regular routes to check alerts faster.**

## Play Store Listing Draft

### Short Description

Live Barrie buses, route alerts, and detours built for Barrie Transit riders.

### Full Description

My Barrie Transit helps Barrie riders see what is happening before they leave for the stop.

Track live buses, search stops, plan trips, save regular routes, and see service alerts in one place.

The key feature is detour awareness. When a route changes, My Barrie Transit can show affected routes, skipped stops, and likely detour paths so riders are not left waiting where the bus is not going.

Built for Barrie Transit riders.

### Feature Bullets

- Track live Barrie buses on the map
- See planned and unplanned detours
- Check which stops may be skipped
- Search stops and routes
- Plan trips across Barrie
- Save regular stops and routes
- View service alerts and transit updates

## Launch Readiness Requirements

Before using detours as the public hero feature, confirm:

- auto-detour feature flag is enabled for the intended build
- production-like build shows the detour alert strip correctly
- map overlay renders skipped route segment and likely detour path correctly
- affected-stop accuracy has been checked for route variants and both travel directions
- fallback state works when no detours are active
- copy says "likely detour path" where accuracy needs rider context

## Success Metrics

Track whether the campaign helps riders understand and use the app.

Recommended metrics:

- Play Store page conversion rate
- onboarding completion rate
- first stop or route search
- first favorite saved
- route alert or detour detail views
- 7-day retention
- active users during detour events

## Decisions Needed From Mike

The following decisions are still needed before final asset production:

- Confirm launcher name: keep **MyBarrie**, or change to another short public name.
- Confirm tone: bold public campaign, official Barrie Transit style, or a mix of both.
- Confirm brand constraints if this will use City or Barrie Transit branding.
- Confirm launch channels: Play Store only, or Play Store plus social, posters, web, and digital displays.

## Recommended Default Decisions

If no further direction is provided, use these defaults:

- Launcher name remains **MyBarrie**.
- Campaign tone uses the official Barrie Transit style: bold enough to hook riders immediately, but still public-service appropriate.
- Visual style uses the official Barrie Transit blue campaign poster direction, anchored by the existing app blue (`#0C8CE5`) and lighter blue (`#46B7FF`) unless final brand files provide a different exact value.
- First production target is Android Play Store assets and a stronger first-open onboarding scene.
- Social/poster/web graphics are treated as follow-up assets using the same campaign system.

