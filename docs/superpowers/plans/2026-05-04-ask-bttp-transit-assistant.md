# Ask BTTP Transit Assistant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Phase 1 Ask BTTP grounded transit assistant without allowing the model to invent transit facts.

**Architecture:** Add a protected assistant endpoint to `api-proxy`, keep live-data gathering and prompt construction server-side, and add a dedicated React Native chat screen reached from Profile. The app sends a short user message and safe screen context; the backend classifies intent, gathers deterministic context, calls the configured OpenAI-compatible local/hosted model, validates JSON, and returns a concise answer with source and freshness metadata.

**Tech Stack:** Expo SDK 54, React Native, Firebase Auth/anonymous auth, Express API proxy, Jest, Supertest, OpenAI-compatible local AI client, GTFS/GTFS-RT data sources, Firestore detour feed.

---

## Reference Documents

- Product design: `docs/superpowers/specs/2026-05-04-ask-bttp-transit-assistant-design.md`
- Repo entrypoint: `AGENTS.md`
- App setup and scripts: `README.md`
- Backend deployment/auth: `docs/API-PROXY-OPERATIONS.md`
- Detour behavior if touching detour context: `docs/AUTO-DETOUR-DETECTION.md`
- Testing: `docs/TESTING.md`

---

## File Map

### Backend

- Create `api-proxy/transitAssistant/assistantConfig.js`: feature flags, model limits, stale-data thresholds, and safe defaults.
- Create `api-proxy/transitAssistant/assistantClassifier.js`: deterministic intent classifier.
- Create `api-proxy/transitAssistant/assistantKnowledge.js`: static help and platform knowledge retrieval.
- Create `api-proxy/transitAssistant/assistantContext.js`: context packet builder for supported intents.
- Create `api-proxy/transitAssistant/assistantPrompt.js`: strict system/user prompt builder.
- Create `api-proxy/transitAssistant/assistantResponse.js`: JSON parsing, validation, sanitizing, and fallback shaping.
- Create `api-proxy/transitAssistant/assistantService.js`: orchestration for classify, gather, generate, validate, and fallback.
- Create `api-proxy/routes/transitAssistantRoutes.js`: `POST /api/transit-assistant/message`.
- Modify `api-proxy/createApp.js`: register transit assistant routes.
- Modify `api-proxy/routes/healthRoutes.js`: expose safe assistant feature status.
- Modify `docs/API-PROXY-OPERATIONS.md`: document production env vars and operational checks.
- Add backend tests under `api-proxy/__tests__/`.

### Static Assistant Knowledge

- Create `api-proxy/transitAssistant/knowledge/app-help.json`: approved BTTP help snippets.
- Create `api-proxy/transitAssistant/knowledge/platform-hubs.json`: hub names, aliases, and safe platform-map action IDs.

### App

- Create `src/services/transitAssistantService.js`: calls backend assistant endpoint with auth headers.
- Create `src/screens/TransitAssistantScreen.js`: dedicated chat UI.
- Modify `src/navigation/TabNavigator.js`: add `TransitAssistant` screen to Profile stack.
- Modify `src/screens/ProfileScreen.js`: add Ask BTTP entry card.
- Modify `src/config/constants.js`: add assistant enablement flag and backend path constants if needed.
- Add app tests under `src/__tests__/`.

---

## Data Contracts

### Client Request

```json
{
  "message": "Is Route 8 detoured?",
  "context": {
    "screen": "Profile",
    "selectedRouteId": "8A",
    "selectedStopId": null,
    "nearbyStopIds": []
  }
}
```

Rules:

- `message` is required, trimmed, 1 to 500 characters.
- `context` is optional.
- Phase 1 context may include current screen, selected route ID, selected stop ID, and coarse nearby stop IDs.
- Phase 1 context must not include saved place addresses, exact user coordinates, email, profile data, or trip history.

### Backend Response

```json
{
  "ok": true,
  "answer": "Route 8A is currently showing one active detour. Check the map before leaving because stops near the affected segment may be missed.",
  "intent": "detour_question",
  "confidence": "medium",
  "sources": [
    {
      "type": "active_detours",
      "label": "Live detour feed",
      "freshnessSeconds": 95
    }
  ],
  "actions": [
    {
      "type": "open_alerts",
      "label": "View alerts"
    }
  ],
  "model": "Qwen/Qwen3-4B-Instruct-2507",
  "usedFallback": false
}
```

Error/fallback response:

```json
{
  "ok": false,
  "answer": "Ask BTTP is unavailable right now. Core trip planning, arrivals, and alerts still work.",
  "intent": "unknown",
  "confidence": "low",
  "sources": [],
  "actions": [],
  "usedFallback": true,
  "errorCode": "ASSISTANT_UNAVAILABLE"
}
```

Allowed intents:

- `arrival_question`
- `route_question`
- `stop_question`
- `trip_planning_question`
- `alert_question`
- `detour_question`
- `platform_question`
- `app_help_question`
- `out_of_scope`
- `unknown`

Allowed source types:

- `static_gtfs`
- `gtfs_realtime_trip_updates`
- `gtfs_realtime_vehicle_positions`
- `gtfs_realtime_alerts`
- `active_detours`
- `platform_maps`
- `app_help`
- `user_context`

Allowed action types:

- `open_alerts`
- `open_platform_map`
- `open_route`
- `open_stop`
- `plan_trip`

---

## Task 1: Backend assistant config and classifier

**Files:**

- Create: `api-proxy/transitAssistant/assistantConfig.js`
- Create: `api-proxy/transitAssistant/assistantClassifier.js`
- Test: `api-proxy/__tests__/transitAssistantClassifier.test.js`

- [ ] **Step 1: Write classifier tests**

Create tests that verify:

- “When is the next bus at stop 123?” returns `arrival_question`.
- “Is Route 8 detoured?” returns `detour_question`.
- “Any alerts today?” returns `alert_question`.
- “How do I get from Park Place to RVH?” returns `trip_planning_question`.
- “Which platform at Allandale?” returns `platform_question`.
- “How do I save a favourite?” returns `app_help_question`.
- “Write me a poem” returns `out_of_scope`.

Run:

```bash
cd api-proxy
npm test -- transitAssistantClassifier.test.js --runInBand
```

Expected: FAIL because the files do not exist.

- [ ] **Step 2: Implement assistant config**

Add config values:

- `enabled`: `TRANSIT_ASSISTANT_ENABLED === 'true'`
- `maxMessageChars`: default `500`, min `50`, max `2000`
- `maxContextItems`: default `12`, min `1`, max `30`
- `maxAnswerChars`: default `900`, min `200`, max `2000`
- `staleRealtimeSeconds`: default `180`
- `modelMaxTokens`: default `700`
- `temperature`: default `0.1`

- [ ] **Step 3: Implement classifier**

Use deterministic keyword and pattern matching. Prefer specific intents over broad app help:

1. detour
2. alert
3. platform
4. arrival
5. trip planning
6. route
7. stop
8. app help
9. out of scope

Return:

```json
{
  "intent": "detour_question",
  "confidence": "medium",
  "matchedTerms": ["detour"]
}
```

- [ ] **Step 4: Verify classifier tests pass**

Run:

```bash
cd api-proxy
npm test -- transitAssistantClassifier.test.js --runInBand
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api-proxy/transitAssistant/assistantConfig.js api-proxy/transitAssistant/assistantClassifier.js api-proxy/__tests__/transitAssistantClassifier.test.js
git commit -m "feat(api): add transit assistant intent classifier"
```

---

## Task 2: Static assistant knowledge

**Files:**

- Create: `api-proxy/transitAssistant/knowledge/app-help.json`
- Create: `api-proxy/transitAssistant/knowledge/platform-hubs.json`
- Create: `api-proxy/transitAssistant/assistantKnowledge.js`
- Test: `api-proxy/__tests__/transitAssistantKnowledge.test.js`

- [ ] **Step 1: Write retrieval tests**

Verify:

- “favorites” retrieves an app-help item about saving stops and routes.
- “alerts” retrieves an app-help item about Alerts.
- “Allandale” retrieves the `allandale-terminal` platform hub.
- Unknown query returns an empty array rather than throwing.

Run:

```bash
cd api-proxy
npm test -- transitAssistantKnowledge.test.js --runInBand
```

Expected: FAIL because the retrieval files do not exist.

- [ ] **Step 2: Add app help knowledge**

Create approved snippets for:

- viewing arrivals from a stop
- searching routes and stops
- planning a trip
- reading service alerts
- viewing detours on the map
- saving favorite stops and routes
- finding transit news
- using platform maps

Each item should include:

```json
{
  "id": "favorites-overview",
  "title": "Favorites",
  "keywords": ["favorite", "favourite", "save", "stop", "route"],
  "body": "You can save important stops and routes from the app so they are easier to find later. Sign in to sync them across devices.",
  "sourceType": "app_help"
}
```

- [ ] **Step 3: Add platform hub knowledge**

Create hub records for:

- `allandale-terminal`
- `downtown-hub`
- `park-place-terminal`
- `barrie-south-go`
- `georgian-college`

Each item should include hub ID, display name, aliases, and action metadata for `open_platform_map`.

- [ ] **Step 4: Implement keyword retrieval**

Return up to `maxItems` matches ranked by keyword overlap, exact hub alias match, then title match.

- [ ] **Step 5: Verify knowledge tests pass**

Run:

```bash
cd api-proxy
npm test -- transitAssistantKnowledge.test.js --runInBand
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add api-proxy/transitAssistant/knowledge/app-help.json api-proxy/transitAssistant/knowledge/platform-hubs.json api-proxy/transitAssistant/assistantKnowledge.js api-proxy/__tests__/transitAssistantKnowledge.test.js
git commit -m "feat(api): add transit assistant knowledge base"
```

---

## Task 3: Backend response validation and fallback shaping

**Files:**

- Create: `api-proxy/transitAssistant/assistantResponse.js`
- Test: `api-proxy/__tests__/transitAssistantResponse.test.js`

- [ ] **Step 1: Write response tests**

Verify:

- valid model JSON is accepted and trimmed.
- answers longer than max length are truncated safely.
- invalid source types are removed.
- invalid action types are removed.
- malformed JSON returns a fallback response.
- out-of-scope fallback uses the approved redirect copy.

Run:

```bash
cd api-proxy
npm test -- transitAssistantResponse.test.js --runInBand
```

Expected: FAIL because response validation does not exist.

- [ ] **Step 2: Implement response helpers**

Export:

- `parseAssistantJson(text)`
- `sanitizeAssistantResponse(value, options)`
- `buildAssistantFallback({ intent, errorCode, reason })`
- `buildOutOfScopeResponse()`

Approved out-of-scope answer:

```text
I can help with Barrie Transit, trip planning, arrivals, alerts, detours, and BTTP app questions.
```

Approved unavailable answer:

```text
Ask BTTP is unavailable right now. Core trip planning, arrivals, and alerts still work.
```

- [ ] **Step 3: Verify response tests pass**

Run:

```bash
cd api-proxy
npm test -- transitAssistantResponse.test.js --runInBand
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add api-proxy/transitAssistant/assistantResponse.js api-proxy/__tests__/transitAssistantResponse.test.js
git commit -m "feat(api): validate transit assistant responses"
```

---

## Task 4: Prompt builder

**Files:**

- Create: `api-proxy/transitAssistant/assistantPrompt.js`
- Test: `api-proxy/__tests__/transitAssistantPrompt.test.js`

- [ ] **Step 1: Write prompt tests**

Verify the prompt:

- includes the grounding rule.
- includes only the supplied context packet.
- requires JSON output.
- says to warn about missing or stale live data.
- does not include raw private user profile fields.

Run:

```bash
cd api-proxy
npm test -- transitAssistantPrompt.test.js --runInBand
```

Expected: FAIL because the prompt builder does not exist.

- [ ] **Step 2: Implement prompt builder**

Export `buildAssistantMessages({ message, intent, contextPacket, maxAnswerChars })`.

System rules must include:

```text
You are Ask BTTP, a Barrie Transit assistant inside the BTTP app. Use only the provided context for live transit facts. Do not invent routes, stops, times, detours, alerts, fares, or policies. If context is missing or stale, say that clearly. Keep the answer concise and practical. Return only valid JSON.
```

The required model JSON shape:

```json
{
  "answer": "short rider-facing answer",
  "confidence": "low|medium|high",
  "sources": [],
  "actions": []
}
```

- [ ] **Step 3: Verify prompt tests pass**

Run:

```bash
cd api-proxy
npm test -- transitAssistantPrompt.test.js --runInBand
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add api-proxy/transitAssistant/assistantPrompt.js api-proxy/__tests__/transitAssistantPrompt.test.js
git commit -m "feat(api): add transit assistant prompt builder"
```

---

## Task 5: Context packet builder

**Files:**

- Create: `api-proxy/transitAssistant/assistantContext.js`
- Test: `api-proxy/__tests__/transitAssistantContext.test.js`

- [ ] **Step 1: Write context tests**

Use mocked providers to verify:

- detour intent returns active detour summaries and source metadata.
- alert intent returns active alert summaries and freshness metadata.
- platform intent returns matching hub knowledge and `open_platform_map` action.
- app-help intent returns approved static snippets.
- out-of-scope intent returns an empty context packet.
- unsafe user context fields are dropped.

Run:

```bash
cd api-proxy
npm test -- transitAssistantContext.test.js --runInBand
```

Expected: FAIL because the context builder does not exist.

- [ ] **Step 2: Implement safe user context normalization**

Accept only:

- `screen`
- `selectedRouteId`
- `selectedStopId`
- `nearbyStopIds`

Drop all other fields.

- [ ] **Step 3: Implement intent-specific context gathering**

Use dependency injection so tests can provide mock providers.

The context packet should include:

```json
{
  "intent": "detour_question",
  "userContext": {
    "screen": "Profile",
    "selectedRouteId": "8A"
  },
  "facts": [
    {
      "type": "active_detours",
      "summary": "Route 8A has one active detour with medium confidence.",
      "freshnessSeconds": 95
    }
  ],
  "sources": [
    {
      "type": "active_detours",
      "label": "Live detour feed",
      "freshnessSeconds": 95
    }
  ],
  "suggestedActions": []
}
```

- [ ] **Step 4: Keep Phase 1 data gathering conservative**

For Phase 1, use existing backend-accessible sources and static knowledge. If a live source is not yet available server-side for a given intent, return a clear missing-source fact instead of adding broad new GTFS parsing in this task.

- [ ] **Step 5: Verify context tests pass**

Run:

```bash
cd api-proxy
npm test -- transitAssistantContext.test.js --runInBand
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add api-proxy/transitAssistant/assistantContext.js api-proxy/__tests__/transitAssistantContext.test.js
git commit -m "feat(api): build grounded transit assistant context"
```

---

## Task 6: Assistant service orchestration

**Files:**

- Create: `api-proxy/transitAssistant/assistantService.js`
- Test: `api-proxy/__tests__/transitAssistantService.test.js`

- [ ] **Step 1: Write service tests**

Verify:

- disabled assistant returns unavailable fallback without calling model.
- out-of-scope question returns redirect without calling model.
- supported question classifies, builds context, calls model, validates response, and includes backend sources.
- model timeout or invalid JSON returns fallback.
- model response cannot override backend intent.

Run:

```bash
cd api-proxy
npm test -- transitAssistantService.test.js --runInBand
```

Expected: FAIL because the service does not exist.

- [ ] **Step 2: Implement orchestration**

Export `createTransitAssistantService(dependencies)` with method `answerMessage({ message, context, auth })`.

Dependencies should default to:

- `buildAssistantConfig`
- `classifyTransitAssistantMessage`
- `buildAssistantContext`
- `buildAssistantMessages`
- `runJsonTask` from `api-proxy/lib/ai/runJsonTask.js`
- `sanitizeAssistantResponse`
- `buildAssistantFallback`

- [ ] **Step 3: Enforce response metadata**

The final response must use:

- backend classifier intent
- backend source list merged with sanitized model sources
- backend suggested actions merged with sanitized model actions
- model name only if available from `runJsonTask`
- `usedFallback: true` when model is skipped, fails, or returns invalid data

- [ ] **Step 4: Verify service tests pass**

Run:

```bash
cd api-proxy
npm test -- transitAssistantService.test.js --runInBand
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api-proxy/transitAssistant/assistantService.js api-proxy/__tests__/transitAssistantService.test.js
git commit -m "feat(api): orchestrate transit assistant answers"
```

---

## Task 7: Assistant API route and health status

**Files:**

- Create: `api-proxy/routes/transitAssistantRoutes.js`
- Modify: `api-proxy/createApp.js`
- Modify: `api-proxy/routes/healthRoutes.js`
- Test: `api-proxy/__tests__/transitAssistantRoutes.test.js`
- Test: update `api-proxy/__tests__/index.routes.test.js` if health shape is asserted there.

- [ ] **Step 1: Write route tests**

Verify:

- `POST /api/transit-assistant/message` rejects missing message with 400.
- it rejects messages over configured max length with 400.
- it uses existing `/api` auth middleware.
- it returns assistant service response for valid messages.
- `/api/health` includes safe assistant feature status.

Run:

```bash
cd api-proxy
npm test -- transitAssistantRoutes.test.js --runInBand
```

Expected: FAIL because the route is not registered.

- [ ] **Step 2: Implement route registration**

Route body validation:

- require JSON body
- require string `message`
- trim whitespace
- reject empty message
- reject message longer than config max
- normalize optional context object

- [ ] **Step 3: Register route in `createApp.js`**

Add `registerTransitAssistantRoutes(app)` after `registerAiRoutes(app)` so the route remains inside existing `/api` auth and rate limiting.

- [ ] **Step 4: Update health route**

Add safe fields:

```json
{
  "transitAssistantEnabled": true,
  "transitAssistantConfigured": true
}
```

`configured` should be true only when the assistant is enabled and local AI is configured.

- [ ] **Step 5: Verify route tests pass**

Run:

```bash
cd api-proxy
npm test -- transitAssistantRoutes.test.js --runInBand
```

Expected: PASS.

- [ ] **Step 6: Run API proxy tests**

Run:

```bash
cd api-proxy
npm test
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add api-proxy/routes/transitAssistantRoutes.js api-proxy/createApp.js api-proxy/routes/healthRoutes.js api-proxy/__tests__/transitAssistantRoutes.test.js api-proxy/__tests__/index.routes.test.js
git commit -m "feat(api): expose transit assistant endpoint"
```

---

## Task 8: App assistant service

**Files:**

- Create: `src/services/transitAssistantService.js`
- Test: `src/__tests__/transitAssistantService.test.js`

- [ ] **Step 1: Write service tests**

Mock `fetch`, `LOCATIONIQ_CONFIG.PROXY_URL`, and `getApiProxyRequestOptions`. Verify:

- service posts to `${PROXY_URL}/api/transit-assistant/message`.
- auth headers are included.
- message and safe context are sent.
- non-OK backend responses throw a friendly service error.
- missing proxy URL throws `ASSISTANT_PROXY_UNCONFIGURED`.

Run:

```bash
npm test -- transitAssistantService.test.js --runInBand
```

Expected: FAIL because the service does not exist.

- [ ] **Step 2: Implement app service**

Export:

- `TransitAssistantError`
- `sendTransitAssistantMessage({ message, context })`
- `buildTransitAssistantContext(rawContext)`

Keep only safe context fields:

- `screen`
- `selectedRouteId`
- `selectedStopId`
- `nearbyStopIds`

Use existing `getApiProxyRequestOptions` from `src/services/proxyAuth.js`.

- [ ] **Step 3: Verify service tests pass**

Run:

```bash
npm test -- transitAssistantService.test.js --runInBand
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/services/transitAssistantService.js src/__tests__/transitAssistantService.test.js
git commit -m "feat(app): add transit assistant API service"
```

---

## Task 9: Chat screen UI

**Files:**

- Create: `src/screens/TransitAssistantScreen.js`
- Test: `src/__tests__/TransitAssistantScreen.test.js`

- [ ] **Step 1: Write screen tests**

Verify:

- welcome copy renders.
- suggested chips render.
- typing and pressing send calls `sendTransitAssistantMessage`.
- loading state disables send.
- successful response appears with source metadata.
- fallback response appears when service throws.
- out-of-scope response is shown as normal assistant text.

Run:

```bash
npm test -- TransitAssistantScreen.test.js --runInBand
```

Expected: FAIL because the screen does not exist.

- [ ] **Step 2: Implement screen structure**

Use existing theme constants from `src/config/theme.js`.

Required UI elements:

- header title `Ask BTTP`
- intro copy
- suggested question chips
- scrollable message list
- text input
- send button
- source/freshness text below assistant answers
- safe empty/error states

Suggested chips:

- `Any active alerts?`
- `Any detours?`
- `How do I plan a trip?`
- `How do favorites work?`

- [ ] **Step 3: Add basic action chip rendering**

Render returned actions as chips. In this task, support only:

- `open_alerts`: navigate to Map stack Alerts screen
- `open_platform_map`: show text chip and keep navigation inactive if no existing screen accepts hub ID cleanly

Unsupported action types should not render.

- [ ] **Step 4: Verify screen tests pass**

Run:

```bash
npm test -- TransitAssistantScreen.test.js --runInBand
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/screens/TransitAssistantScreen.js src/__tests__/TransitAssistantScreen.test.js
git commit -m "feat(app): add Ask BTTP chat screen"
```

---

## Task 10: Navigation and Profile entry point

**Files:**

- Modify: `src/navigation/TabNavigator.js`
- Modify: `src/screens/ProfileScreen.js`
- Test: update or create `src/__tests__/ProfileScreen.test.js` if profile screen tests exist; otherwise create `src/__tests__/TransitAssistantNavigation.test.js`.

- [ ] **Step 1: Write navigation/profile tests**

Verify:

- Profile renders an `Ask BTTP` entry.
- pressing it navigates to `TransitAssistant`.
- Profile stack registers the screen.

Run:

```bash
npm test -- TransitAssistantNavigation.test.js --runInBand
```

Expected: FAIL until navigation is wired.

- [ ] **Step 2: Register screen**

Import `TransitAssistantScreen` in `src/navigation/TabNavigator.js` and add it to `ProfileStack` with header hidden.

- [ ] **Step 3: Add Profile entry card**

Add a card near other support/help/account actions:

- title: `Ask BTTP`
- subtitle: `Ask about routes, stops, arrivals, alerts, and detours`
- icon: use existing `Icon` component with a safe available icon name
- `onPress`: `navigation.navigate('TransitAssistant')`

- [ ] **Step 4: Verify navigation/profile tests pass**

Run:

```bash
npm test -- TransitAssistantNavigation.test.js --runInBand
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/navigation/TabNavigator.js src/screens/ProfileScreen.js src/__tests__/TransitAssistantNavigation.test.js
git commit -m "feat(app): add Ask BTTP profile entry"
```

---

## Task 11: Environment, operations, and documentation

**Files:**

- Modify: `.env.example`
- Modify: `docs/API-PROXY-OPERATIONS.md`
- Modify: `README.md` if app setup needs a short mention.
- Test: no new test file unless config validation tests require updates.

- [ ] **Step 1: Document environment variables**

Add:

```text
TRANSIT_ASSISTANT_ENABLED=false
TRANSIT_ASSISTANT_MAX_MESSAGE_CHARS=500
TRANSIT_ASSISTANT_MAX_ANSWER_CHARS=900
TRANSIT_ASSISTANT_STALE_REALTIME_SECONDS=180
LOCAL_AI_ENABLED=false
LOCAL_AI_BASE_URL=
LOCAL_AI_MODEL=Qwen/Qwen3-4B-Instruct-2507
LOCAL_AI_TIMEOUT_MS=5000
```

- [ ] **Step 2: Update operations doc**

Document:

- assistant endpoint path
- auth requirements
- health fields
- model configuration
- rate-limit expectations
- privacy logging rules
- fallback behavior
- recommended first model

- [ ] **Step 3: Verify docs reference current commands**

Confirm docs still point to:

```bash
npm run web:dev
npm run android:dev
npm run test:all
```

- [ ] **Step 4: Commit**

```bash
git add .env.example docs/API-PROXY-OPERATIONS.md README.md
git commit -m "docs: document transit assistant operations"
```

---

## Task 12: Full verification and rollout gate

**Files:**

- No planned source files.
- Update docs only if verification reveals an inaccurate command or release note.

- [ ] **Step 1: Run app tests**

```bash
npm test
```

Expected: PASS.

- [ ] **Step 2: Run API proxy tests**

```bash
cd api-proxy
npm test
```

Expected: PASS.

- [ ] **Step 3: Run combined verification**

```bash
npm run test:all
```

Expected: PASS.

- [ ] **Step 4: Run web smoke test**

Start web with proxy:

```bash
npm run web:dev
```

Manual checks:

- app opens
- Profile shows Ask BTTP
- Ask BTTP screen opens
- disabled assistant shows safe unavailable copy
- existing Map, Search, Alerts, and Profile screens still open

- [ ] **Step 5: Run Android smoke test if native behavior changed**

Use the repo-preferred path:

```bash
npm run android:dev
```

If Metro is already running, use:

```bash
npm run android:dev:launch
```

Manual checks:

- Profile shows Ask BTTP
- keyboard input works
- sending disabled-state question does not crash
- bottom tab navigation still works

- [ ] **Step 6: Rollout decision**

Keep `TRANSIT_ASSISTANT_ENABLED=false` until:

- backend tests pass
- app tests pass
- web smoke passes
- Android smoke passes
- production model endpoint is selected
- privacy logging setting is confirmed

- [ ] **Step 7: Final commit if verification docs changed**

```bash
git add docs/API-PROXY-OPERATIONS.md README.md .env.example
git commit -m "docs: finalize transit assistant rollout notes"
```

---

## Implementation Notes

- Do not add fine-tuning in Phase 1.
- Do not send saved places, exact coordinates, email, display name, or trip history to the model in Phase 1.
- Do not expose `LOCAL_AI_BASE_URL`, API keys, or shared tokens through Expo public environment variables.
- Keep `TRANSIT_ASSISTANT_ENABLED=false` by default.
- Prefer deterministic fallback over model retries when rider-facing live data is missing.
- Keep the first UI entry in Profile. Add a map floating button only after the assistant has reliable answer quality.

---

## Plan Self-Review

- Spec coverage: The plan covers backend grounding, model use, app UI, privacy, feature flags, testing, docs, and rollout gates from the product design.
- Scope control: The plan implements Phase 1 only. Embedding retrieval, fine-tuning, proactive commute help, and map floating entry are excluded from this implementation.
- Type consistency: Intent, source, action, request, and response names match the product design contracts.
- Safety check: The plan keeps model calls server-side and keeps sensitive user data out of model prompts.
