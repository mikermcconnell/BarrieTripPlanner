# Ask BTTP Transit Assistant Product Design

Date: 2026-05-04
Status: Approved for implementation planning

## Goal

Add a production-ready transit assistant that helps riders ask natural-language questions about Barrie Transit, BTTP app features, arrivals, trip options, alerts, detours, and platform information.

The assistant should feel like a transit expert, but it must not invent transit facts. It may explain and summarize live data, but all route, stop, arrival, detour, alert, and trip-plan facts must come from BTTP data sources or approved static knowledge.

## Recommendation

Build **Ask BTTP** as a grounded, tool-using assistant hosted behind `api-proxy`.

Use a cheap open-source model for answer writing, but make the backend responsible for facts:

- classify the rider question
- gather live or static context
- call the model with only relevant evidence
- validate the response shape
- return a concise answer with freshness and confidence

Recommended model stack:

- **Phase 1 chat model:** `Qwen/Qwen3-4B-Instruct-2507`
- **Phase 1 retrieval:** static keyword retrieval only
- **Phase 2 embedding model:** `Qwen/Qwen3-Embedding-0.6B`
- **Fallback model to test:** `microsoft/Phi-4-mini-instruct`

Use Qwen3 4B first because it has the best fit for Ask BTTP's constraints: small enough to run cheaply, Apache 2.0 licensed, strong instruction following, good tool/RAG fit, and compatible with OpenAI-style hosted or self-hosted inference. Treat it as the answer writer, not the source of truth. BTTP's backend must still provide all transit facts.

Do not use the model's full context window as a reason to send large GTFS payloads. Phase 1 should target compact 8K-32K context packets and short answers.

Recommended runtime defaults:

- `LOCAL_AI_MODEL=Qwen/Qwen3-4B-Instruct-2507`
- `TRANSIT_ASSISTANT_MAX_ANSWER_CHARS=900`
- `LOCAL_AI_TIMEOUT_MS=5000`
- `temperature=0.0-0.1`
- `max_tokens=500-700`

Model notes:

- `microsoft/Phi-4-mini-instruct` is a good backup to test, but not the first choice because small-model factual limits and function-call hallucination risk are especially important for transit trust.
- `google/gemma-3-4b-it` is capable, but its access/terms and multimodal strengths are less useful for Phase 1 than Qwen's Apache 2.0 text-first fit.
- `meta-llama/Llama-3.2-3B-Instruct` is viable but likely weaker for nuanced grounded answers.
- `mistralai/Mistral-Small-3.2-24B-Instruct-2506` is stronger, but too heavy and costly for the first production version.

References:

- https://huggingface.co/Qwen/Qwen3-4B-Instruct-2507
- https://huggingface.co/Qwen/Qwen3-Embedding-0.6B
- https://huggingface.co/microsoft/Phi-4-mini-instruct
- https://huggingface.co/google/gemma-3-4b-it
- https://huggingface.co/meta-llama/Llama-3.2-3B-Instruct
- https://huggingface.co/mistralai/Mistral-Small-3.2-24B-Instruct-2506

## Product Name

Working name: **Ask BTTP**

User-facing labels:

- Entry button: `Ask BTTP`
- Header: `Ask BTTP`
- Input placeholder: `Ask about routes, stops, arrivals, alerts, or detours`
- Empty-state helper: `Try “When is the next 8A?”, “Is Route 8 detoured?”, or “How do I get to Georgian College?”`

## Current App Fit

BTTP already has the data and app surface this assistant needs:

- static GTFS routes, stops, shapes, calendars, and trips
- GTFS real-time vehicle positions, trip updates, and service alerts
- local trip planning and walking enrichment
- active detours from Firestore and backend detour worker
- platform map endpoint in `api-proxy`
- Firebase auth and anonymous auth for protected public client routes
- existing optional local AI utilities in `api-proxy/lib/ai`
- web and native app surfaces that can call protected proxy routes

The new feature should extend `api-proxy`; it should not put model credentials or unrestricted LLM access in the Expo app.

## Target Users

Primary users:

- riders who do not know which screen to use
- riders confused by delays, alerts, detours, or transfers
- new riders learning Barrie Transit
- riders who need a plain-English explanation of trip results

Secondary users:

- power users who want faster route/stop answers
- support and operations testers checking data quality

## MVP Scope

Phase 1 should support questions about:

1. **Arrivals**
   - “When is the next bus at this stop?”
   - “When is the next 8A from Georgian College?”

2. **Routes and stops**
   - “Where does Route 8 go?”
   - “What stops are near Park Place?”

3. **Trip planning**
   - “How do I get from Park Place to RVH?”
   - “What is the easiest trip to downtown?”

4. **Alerts**
   - “Are there any alerts today?”
   - “What does this alert mean for Route 3?”

5. **Detours**
   - “Is Route 8 detoured?”
   - “Why is my bus off the normal route?”

6. **Platform maps**
   - “Which platform do I use at Allandale?”
   - “Show me the Downtown Hub platform map.”

7. **App help**
   - “How do I save a favorite stop?”
   - “Where are alerts?”

Phase 1 should not support:

- fare disputes or policy commitments
- accessibility guarantees beyond approved static text
- emergency advice
- operator/internal planning analysis
- predictions not supported by live feeds
- open-ended general chat unrelated to Barrie Transit or the app

## User Experience

### Entry Points

Add a low-risk entry point first:

- Profile screen card: `Ask BTTP`
- Optional later map floating button once quality is proven

The first release should avoid a map floating button by default so the assistant does not compete with core map controls.

### Chat Screen

Create a dedicated chat screen with:

- short welcome copy
- suggested question chips
- message list
- text input
- send button
- loading state
- source/freshness line under assistant answers
- safe fallback state when AI is unavailable

Suggested chips:

- `Next bus near me`
- `Any active alerts?`
- `Any detours?`
- `Plan a trip`
- `How do favorites work?`

### Answer Shape

Each answer should be short and action-oriented.

Example:

> Route 8A is currently showing one active detour. The latest detour feed was updated about 2 minutes ago. Stops near the closed segment may be affected, so check the map before leaving.

Metadata shown below the answer:

> Sources: live detour feed, service alerts. Updated 2 min ago.

### Follow-Up Actions

Where practical, answers can include app actions:

- `Open stop`
- `Open route`
- `Plan this trip`
- `View alerts`
- `View platform map`

Phase 1 can return action metadata from the backend while the app implements only a small subset of actions.

## System Architecture

### High-Level Flow

1. User asks a question in the app.
2. App sends the question and optional context to `POST /api/transit-assistant/message`.
3. Backend validates auth, body size, and rate limits.
4. Backend classifies the question into a known transit intent.
5. Backend gathers relevant context using deterministic tools.
6. Backend calls the open-source chat model with a strict system prompt and context packet.
7. Backend validates the model response as JSON.
8. Backend returns the answer, sources, confidence, freshness, and optional actions.
9. App renders the answer and action chips.

### Backend Ownership

`api-proxy` should own:

- prompt construction
- model calls
- retrieval
- data fetching
- response validation
- abuse controls
- logging and metrics

The Expo app should own:

- chat UI
- sending user messages
- showing answer metadata
- routing action chips to existing screens

### Data Sources

The assistant can use:

- static GTFS data from existing GTFS loader/local app data patterns
- GTFS real-time trip updates
- GTFS real-time vehicle positions
- GTFS real-time service alerts
- active detours from Firestore/backend detour state
- platform map hub metadata
- approved app help content stored as local markdown/JSON knowledge documents
- current rider context sent by app, such as selected stop, route, map area, or current location if permission is already granted

The assistant must not use:

- raw private user profile data unless explicitly needed and consented
- saved places/home/work coordinates in prompts for Phase 1
- arbitrary web search
- internal detour debug evidence for normal rider answers

## Grounding and Safety Rules

Core rule:

> The assistant may explain transit facts, but it may not create transit facts.

Required model instructions:

- answer only about Barrie Transit, the BTTP app, or the rider’s provided trip context
- use only provided context for live transit facts
- say when live data is stale, missing, or unavailable
- do not claim exact arrival certainty
- do not fabricate stop IDs, route names, fares, policies, or detours
- keep answers concise
- include a clear next step when possible

Required backend validation:

- reject empty or very long messages
- reject unrelated prompts with a polite redirect
- require JSON response from the model
- cap output length
- validate source labels against known source types
- fallback to deterministic answer if the model fails

## Intent Model

Use a deterministic-first classifier before any expensive model call.

Initial intents:

- `arrival_question`
- `route_question`
- `stop_question`
- `trip_planning_question`
- `alert_question`
- `detour_question`
- `platform_question`
- `app_help_question`
- `out_of_scope`

The classifier can start as keyword/rule based. Add model-based classification later only if logs show meaningful gaps.

## Retrieval and Knowledge Base

Create a small approved knowledge base for static content:

- app help
- feature explanations
- platform map hub descriptions
- route/stop terminology
- rider-facing limits and disclaimers

Phase 1 can use simple keyword retrieval from JSON/markdown documents. Embeddings with `Qwen3-Embedding-0.6B` should be Phase 2 unless static retrieval quality is poor.

This keeps Phase 1 cheaper and easier to deploy.

## Cost and Scaling Strategy

Use layered cost controls:

1. deterministic answers for simple questions where no LLM is needed
2. small context packets, not full GTFS dumps
3. short max output length
4. low temperature
5. per-user and per-IP rate limits
6. short cache for repeated system-wide questions such as “any alerts?”
7. feature flag for rollout
8. fallback answer when AI runtime is unavailable

Production hosting options:

- start with an OpenAI-compatible hosted inference endpoint for Qwen
- keep the API shape compatible with local/vLLM/SGLang/TGI-style serving
- do not require GPU hosting in the first app deployment if usage is uncertain

## Privacy

Do not send sensitive data to the model by default.

Phase 1 request context may include:

- current screen
- selected route ID
- selected stop ID
- coarse nearby stop IDs if the app already has location permission

Phase 1 should not include:

- saved home/work addresses
- exact saved place coordinates
- email, name, phone, or profile fields
- full trip history

Logging rules:

- log intent, latency, success/failure, source types, and model name
- do not log full user prompts in production unless a separate privacy decision enables redacted sampling
- never log exact location coordinates from chat context

## Error Handling

If AI is disabled:

- return a clear unavailable response from the backend
- app shows: `Ask BTTP is unavailable right now. Core trip planning, arrivals, and alerts still work.`

If live data is stale:

- answer with the stale-data warning
- avoid precise claims

If the user asks out-of-scope questions:

- respond: `I can help with Barrie Transit, trip planning, arrivals, alerts, detours, and BTTP app questions.`

If the model returns invalid JSON:

- retry once with a stricter repair prompt or return deterministic fallback

If backend data fetch fails:

- include which source failed when safe: `I could not reach live arrivals right now.`

## Analytics and Operations

Track non-sensitive events:

- `assistant_opened`
- `assistant_question_sent`
- `assistant_answer_received`
- `assistant_action_tapped`
- `assistant_fallback_shown`

Backend operational metrics:

- request count
- intent mix
- model latency
- total latency
- timeout count
- invalid model response count
- fallback count
- average context size
- rate-limit count

Add `/api/ai-status` details only for safe operational metadata. Do not expose model provider secrets or prompt contents.

## Testing Strategy

### Backend

- classifier unit tests
- context builder unit tests for each intent
- model response validator tests
- route tests for auth, validation, success, fallback, and rate-limit behavior
- no-model fallback tests

### App

- chat service tests
- chat screen render tests
- send/loading/error tests
- action chip tests
- accessibility labels for input, send button, and messages

### Manual Smoke Tests

- web with `npm run web:dev`
- Android with `npm run android:dev` or fast relaunch if Metro is already running
- ask alert, detour, arrival, trip-planning, app-help, and out-of-scope questions
- disable local AI and confirm fallback

## Release Plan

### Phase 1: Grounded MVP

- backend endpoint
- deterministic intent classifier
- context gathering for alerts, detours, routes/stops, trip planning, platform maps, and app help
- strict JSON model response
- Profile entry point and dedicated chat screen
- basic actions for opening Alerts and Platform Map references
- feature flag off by default until tested

### Phase 2: Better Retrieval and Personal Context

- embedding-backed app help retrieval
- better route/stop disambiguation
- optional use of selected map state
- optional “near me” questions using coarse nearby stop context

### Phase 3: Proactive Transit Expert

- explain saved trip disruptions
- summarize commute impact
- answer “why is this trip different today?”
- route/service health summaries

## Acceptance Criteria for Phase 1

- A rider can open Ask BTTP from Profile.
- A rider can ask supported transit questions and receive concise answers.
- Live facts are grounded in backend-provided context.
- The assistant refuses or redirects unrelated questions.
- The assistant clearly warns when live data is unavailable or stale.
- Model credentials and provider URLs are never exposed in the Expo app.
- Backend tests cover classifier, context builder, response validation, and endpoint behavior.
- App tests cover chat UI, service calls, loading, errors, and basic actions.
- The feature can be disabled by environment flag without breaking the app.
- Existing trip planning, map, arrivals, alerts, favorites, and detour behavior continue to work.

## Product Decisions

1. Start with a dedicated Profile-screen entry point, not a map floating button.
2. Use `api-proxy` as the only model boundary.
3. Start with deterministic/rule-based intent classification.
4. Start with static keyword retrieval, not embeddings, unless quality is poor.
5. Use `Qwen/Qwen3-4B-Instruct-2507` as the Phase 1 chat model.
6. Do not fine-tune for Phase 1.
7. Do not send saved places, full trip history, or personal profile data to the model in Phase 1.
8. Keep answers short and source-labeled.
9. Use static keyword retrieval in Phase 1; add `Qwen/Qwen3-Embedding-0.6B` only if retrieval quality requires it.

## Open Questions Deferred Until Build

These are implementation choices, not blockers for planning:

- exact hosted inference provider
- final rate-limit numbers after expected traffic is known
- final visual placement if Profile entry underperforms
- whether embeddings are needed before public rollout
