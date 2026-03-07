# API Proxy Operations

Date: 2026-03-07
Status: Current
Owner: Codex

## Purpose

`api-proxy/` is an independently deployable backend service for:

- LocationIQ proxy routes
- walking directions proxying
- detour worker / detour publishing
- survey administration and survey digest endpoints

It should not rely on the app package or Expo runtime to build or deploy.

## Deployment Boundary

`api-proxy` is a standalone Node service:

- entrypoint: `api-proxy/index.js`
- runtime: Node 22
- install from `api-proxy/package.json`
- no `file:..` dependency on the root app package

## Auth Model

### Public

- `GET /api/health`

### Protected client routes

Protected `/api/*` routes require `REQUIRE_API_AUTH=true`.

Production expectation:

- `REQUIRE_FIREBASE_AUTH=true`
- `ALLOW_SHARED_TOKEN_AUTH=false`

Non-production fallback:

- shared token auth may be enabled with `ALLOW_SHARED_TOKEN_AUTH=true`
- configure `API_PROXY_TOKEN` or `API_PROXY_TOKENS`

### Admin-only routes

These are not public rider endpoints:

- survey admin routes use the same `/api` auth boundary as other protected routes
- in production, survey admin access is expected to come from Firebase Bearer auth
- detour debug may use `DETOUR_DEBUG_API_KEY` only outside production

## Required Environment

### Core proxy

- `LOCATIONIQ_API_KEY`
- `ALLOWED_ORIGINS`
- `REQUIRE_API_AUTH=true`

### Production auth hardening

- `REQUIRE_FIREBASE_AUTH=true`
- `ALLOW_SHARED_TOKEN_AUTH=false`
- `FIREBASE_SERVICE_ACCOUNT_JSON` or `GOOGLE_APPLICATION_CREDENTIALS`

### Detour worker

- `DETOUR_WORKER_ENABLED=true`
- `DETOUR_HISTORY_ENABLED=true`
- `DETOUR_HISTORY_RETENTION_DAYS=30`
- Firebase Admin credentials

### Optional admin flows

- `DETOUR_DEBUG_API_KEY`
- `DETOUR_PROXY_KEY`

## Health Checks

Primary endpoint:

- `GET /api/health`

The health response now includes:

- service identity
- auth mode flags
- shared-token availability
- feature/config booleans for LocationIQ, detour worker, history, detour debug posture, survey admin posture, and Firebase Admin credentials

Operational detour endpoints:

- `GET /api/detour-status`
- `GET /api/detour-rollout-health`
- `GET /api/detour-logs?limit=100`

## Scheduled / Triggered Jobs

There is no internal scheduler in `api-proxy`.

Operational tasks are expected to be driven externally:

- detour worker runs continuously when `DETOUR_WORKER_ENABLED=true`
- survey digest is triggered by `POST /api/survey/send-digest`
- any recurring digest or refresh flow should be run by platform cron/scheduler, not hidden process-local timers

## Deployment Checklist

1. `cd api-proxy && npm install`
2. set `LOCATIONIQ_API_KEY`
3. set Firebase Admin credentials if detour worker or Firebase auth is enabled
4. set `ALLOWED_ORIGINS`
5. enforce production auth:
   - `REQUIRE_FIREBASE_AUTH=true`
   - `ALLOW_SHARED_TOKEN_AUTH=false`
6. verify:
   - `GET /api/health`
   - `GET /api/detour-status`
   - `GET /api/detour-rollout-health`

## Rollback Notes

If deployment fails:

- disable `DETOUR_WORKER_ENABLED`
- keep `/api/health` available for smoke checks
- verify Firebase Admin credentials before re-enabling protected worker features
