# Platform Maps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add in-app platform maps for five major Barrie Transit hubs, showing only the selected hub page from Barrie's combined platform-map PDF.

**Architecture:** The app maps selected GTFS stop IDs/codes to a supported platform-map hub, shows a featured card in the stop sheet, and opens a full-screen modal. The API proxy owns PDF page extraction from Barrie's source PDF and returns a cached single-page PNG for a whitelisted hub ID.

**Tech Stack:** Expo SDK 54, React Native 0.81, React Native Web, Express API proxy, Jest, Supertest, `pdfjs-dist`, `@napi-rs/canvas`.

---

## File structure

### Create

- `src/config/platformMaps.js` — app-side hub metadata and stop-to-hub lookup.
- `src/services/platformMapService.js` — app-side URL builder for the platform map PNG endpoint and source PDF fallback URL.
- `src/components/PlatformMapCard.js` — featured card reused by native and web stop sheets.
- `src/components/PlatformMapViewerModal.js` — native full-screen modal with image loading, retry, fallback link, and zoom controls.
- `src/components/PlatformMapViewerModal.web.js` — web full-screen modal using the same props and browser-friendly image behavior.
- `src/__tests__/platformMaps.test.js` — unit tests for app stop-to-hub matching.
- `src/__tests__/platformMapService.test.js` — unit tests for platform map URL building.
- `src/__tests__/platformMapCard.test.js` — component tests for the featured card.
- `src/__tests__/PlatformMapViewerModal.test.js` — component tests for modal loading, retry, and fallback UI.
- `src/__tests__/StopBottomSheet.platformMaps.test.js` — component test for stop sheet card rendering.
- `api-proxy/config/platformMaps.js` — backend-owned hub metadata and source PDF URL.
- `api-proxy/services/platformMapImageService.js` — fetch, render, and cache single-page platform map PNGs.
- `api-proxy/routes/platformMapRoutes.js` — Express route for `GET /api/platform-maps/:hubId`.
- `api-proxy/__tests__/platformMapRoutes.test.js` — route tests.
- `api-proxy/__tests__/platformMapImageService.test.js` — service tests with injected renderer/fetcher.

### Modify

- `api-proxy/package.json` and `api-proxy/package-lock.json` — add PDF rendering dependencies.
- `api-proxy/createApp.js` — register platform map routes.
- `api-proxy/middleware/auth.js` — make `/api/platform-maps/:hubId` public because it serves fixed public city data and must be loadable by image components.
- `api-proxy/__tests__/auth.middleware.test.js` or `api-proxy/__tests__/index.routes.test.js` — prove the platform-map image route does not require auth while other routes still do.
- `src/components/StopBottomSheet.js` — render the featured platform-map card when provided.
- `src/components/StopBottomSheet.web.js` — render the same card in the web stop sheet.
- `src/screens/HomeScreen.js` — derive selected stop's platform map, open/close the modal, and pass card props to `StopBottomSheet`.
- `src/screens/HomeScreen.web.js` — same wiring for web.
- `README.md` and `docs/API-PROXY-OPERATIONS.md` — document rider feature and API endpoint.

---

## Task 1: Install backend PDF rendering dependencies

**Files:**
- Modify: `api-proxy/package.json`
- Modify: `api-proxy/package-lock.json`

- [ ] **Step 1: Install pinned API proxy dependencies**

Run:

```powershell
npm --prefix api-proxy install pdfjs-dist@5.7.284 @napi-rs/canvas@0.1.100
```

Expected:

- `api-proxy/package.json` includes `pdfjs-dist` and `@napi-rs/canvas` under `dependencies`.
- `api-proxy/package-lock.json` is updated.
- Root `package.json` is unchanged by this command.

- [ ] **Step 2: Verify dependency placement**

Run:

```powershell
node -e "const p=require('./api-proxy/package.json'); console.log(Boolean(p.dependencies['pdfjs-dist']), Boolean(p.dependencies['@napi-rs/canvas']))"
```

Expected output:

```text
true true
```

- [ ] **Step 3: Commit dependency changes**

Run:

```powershell
git add api-proxy/package.json api-proxy/package-lock.json
git commit -m "chore: add platform map rendering dependencies"
```

Expected: a commit containing only the API proxy dependency changes.

---

## Task 2: Add app-side platform map config

**Files:**
- Create: `src/config/platformMaps.js`
- Test: `src/__tests__/platformMaps.test.js`

- [ ] **Step 1: Write the failing app config tests**

Create `src/__tests__/platformMaps.test.js`:

```js
const {
  PLATFORM_MAP_SOURCE_URL,
  PLATFORM_MAPS,
  getPlatformMapForStop,
  getPlatformMapByHubId,
} = require('../config/platformMaps');

describe('platformMaps config', () => {
  test('defines the City of Barrie source PDF and five hub pages', () => {
    expect(PLATFORM_MAP_SOURCE_URL).toBe('https://www.barrie.ca/Transit-Platform-Maps.pdf');
    expect(PLATFORM_MAPS.map((map) => [map.id, map.pageNumber])).toEqual([
      ['allandale-terminal', 1],
      ['downtown-hub', 2],
      ['park-place-terminal', 3],
      ['barrie-south-go', 4],
      ['georgian-college', 5],
    ]);
  });

  test('matches Georgian College by stop code and id', () => {
    expect(getPlatformMapForStop({ id: '335', code: '335', name: 'Georgian College' })).toEqual(
      expect.objectContaining({ id: 'georgian-college', pageNumber: 5 })
    );
    expect(getPlatformMapForStop({ id: 329, code: 329, name: 'Georgian at Govenors' })).toEqual(
      expect.objectContaining({ id: 'georgian-college', pageNumber: 5 })
    );
  });

  test('matches Allandale platform stops to page 1', () => {
    expect(getPlatformMapForStop({ id: '9003', code: '9003' })).toEqual(
      expect.objectContaining({ id: 'allandale-terminal', pageNumber: 1 })
    );
    expect(getPlatformMapForStop({ id: '9013', code: '9013' })).toEqual(
      expect.objectContaining({ id: 'allandale-terminal', pageNumber: 1 })
    );
  });

  test('matches Downtown, Park Place, and Barrie South GO', () => {
    expect(getPlatformMapForStop({ id: '1', code: '1' })).toEqual(
      expect.objectContaining({ id: 'downtown-hub', pageNumber: 2 })
    );
    expect(getPlatformMapForStop({ id: '777', code: '777' })).toEqual(
      expect.objectContaining({ id: 'park-place-terminal', pageNumber: 3 })
    );
    expect(getPlatformMapForStop({ id: '725', code: '725' })).toEqual(
      expect.objectContaining({ id: 'barrie-south-go', pageNumber: 4 })
    );
  });

  test('returns null for unsupported stops and unknown hub IDs', () => {
    expect(getPlatformMapForStop({ id: '440', code: '440', name: 'Georgian Mall' })).toBeNull();
    expect(getPlatformMapForStop(null)).toBeNull();
    expect(getPlatformMapByHubId('unknown')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the new test and verify it fails**

Run:

```powershell
npm test -- --runTestsByPath src/__tests__/platformMaps.test.js
```

Expected: FAIL because `src/config/platformMaps.js` does not exist.

- [ ] **Step 3: Add the app platform map config**

Create `src/config/platformMaps.js`:

```js
export const PLATFORM_MAP_SOURCE_URL = 'https://www.barrie.ca/Transit-Platform-Maps.pdf';

export const PLATFORM_MAPS = [
  {
    id: 'allandale-terminal',
    displayName: 'Barrie Allandale Transit Terminal',
    shortName: 'Allandale Terminal',
    pageNumber: 1,
    stopCodes: ['9003', '9004', '9005', '9006', '9009', '9012', '9013'],
  },
  {
    id: 'downtown-hub',
    displayName: 'Downtown Hub',
    shortName: 'Downtown Hub',
    pageNumber: 2,
    stopCodes: ['1', '2', '10', '11'],
  },
  {
    id: 'park-place-terminal',
    displayName: 'Park Place Terminal',
    shortName: 'Park Place',
    pageNumber: 3,
    stopCodes: ['777'],
  },
  {
    id: 'barrie-south-go',
    displayName: 'Barrie South GO',
    shortName: 'Barrie South GO',
    pageNumber: 4,
    stopCodes: ['725'],
  },
  {
    id: 'georgian-college',
    displayName: 'Georgian College',
    shortName: 'Georgian College',
    pageNumber: 5,
    stopCodes: ['327', '328', '329', '330', '331', '335', '110'],
  },
];

const normalizeStopKey = (value) => {
  if (value === null || value === undefined) return '';
  return String(value).trim();
};

const PLATFORM_MAP_BY_ID = new Map(PLATFORM_MAPS.map((map) => [map.id, map]));
const PLATFORM_MAP_BY_STOP_CODE = new Map();

for (const platformMap of PLATFORM_MAPS) {
  for (const stopCode of platformMap.stopCodes) {
    PLATFORM_MAP_BY_STOP_CODE.set(normalizeStopKey(stopCode), platformMap);
  }
}

export const getPlatformMapByHubId = (hubId) => PLATFORM_MAP_BY_ID.get(normalizeStopKey(hubId)) || null;

export const getPlatformMapForStop = (stop) => {
  if (!stop) return null;
  const possibleKeys = [stop.code, stop.stopCode, stop.id, stop.stop_id].map(normalizeStopKey).filter(Boolean);
  for (const key of possibleKeys) {
    const platformMap = PLATFORM_MAP_BY_STOP_CODE.get(key);
    if (platformMap) return platformMap;
  }
  return null;
};
```

- [ ] **Step 4: Run the app config test and verify it passes**

Run:

```powershell
npm test -- --runTestsByPath src/__tests__/platformMaps.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit app config**

Run:

```powershell
git add src/config/platformMaps.js src/__tests__/platformMaps.test.js
git commit -m "feat: add platform map stop matching"
```

Expected: commit with the config and test only.

---

## Task 3: Add backend platform map config and image service

**Files:**
- Create: `api-proxy/config/platformMaps.js`
- Create: `api-proxy/services/platformMapImageService.js`
- Test: `api-proxy/__tests__/platformMapImageService.test.js`

- [ ] **Step 1: Write backend service tests**

Create `api-proxy/__tests__/platformMapImageService.test.js`:

```js
const { createPlatformMapImageService } = require('../services/platformMapImageService');

describe('platformMapImageService', () => {
  test('renders and caches a known hub page', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: async () => Buffer.from('pdf-bytes'),
    });
    const renderPageToPng = jest.fn().mockResolvedValue(Buffer.from('png-bytes'));
    const now = jest.fn().mockReturnValue(1000);
    const service = createPlatformMapImageService({ fetchImpl, renderPageToPng, now, cacheTtlMs: 60_000 });

    const first = await service.getPlatformMapImage('georgian-college');
    const second = await service.getPlatformMapImage('georgian-college');

    expect(first).toEqual(expect.objectContaining({
      status: 200,
      contentType: 'image/png',
      hubId: 'georgian-college',
      pageNumber: 5,
      fromCache: false,
    }));
    expect(first.body.toString()).toBe('png-bytes');
    expect(second.fromCache).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(renderPageToPng).toHaveBeenCalledWith(Buffer.from('pdf-bytes'), 5);
  });

  test('returns 404 for an unknown hub', async () => {
    const service = createPlatformMapImageService({
      fetchImpl: jest.fn(),
      renderPageToPng: jest.fn(),
    });

    const result = await service.getPlatformMapImage('not-real');

    expect(result).toEqual({
      status: 404,
      body: { error: 'Unknown platform map' },
    });
  });

  test('serves stale cache when source PDF fetch fails', async () => {
    const fetchImpl = jest.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, arrayBuffer: async () => Buffer.from('pdf-bytes') })
      .mockResolvedValueOnce({ ok: false, status: 503, arrayBuffer: async () => Buffer.alloc(0) });
    const renderPageToPng = jest.fn().mockResolvedValue(Buffer.from('cached-png'));
    let currentTime = 1000;
    const service = createPlatformMapImageService({
      fetchImpl,
      renderPageToPng,
      now: () => currentTime,
      cacheTtlMs: 10,
    });

    await service.getPlatformMapImage('downtown-hub');
    currentTime = 5000;
    const result = await service.getPlatformMapImage('downtown-hub');

    expect(result.status).toBe(200);
    expect(result.fromCache).toBe(true);
    expect(result.stale).toBe(true);
    expect(result.body.toString()).toBe('cached-png');
  });

  test('returns 502 when source PDF fetch fails and no cache exists', async () => {
    const service = createPlatformMapImageService({
      fetchImpl: jest.fn().mockResolvedValue({ ok: false, status: 503, arrayBuffer: async () => Buffer.alloc(0) }),
      renderPageToPng: jest.fn(),
    });

    const result = await service.getPlatformMapImage('park-place-terminal');

    expect(result.status).toBe(502);
    expect(result.body).toEqual({ error: 'Platform map source is unavailable' });
  });
});
```

- [ ] **Step 2: Run backend service test and verify it fails**

Run:

```powershell
npm --prefix api-proxy test -- platformMapImageService.test.js
```

Expected: FAIL because `api-proxy/services/platformMapImageService.js` does not exist.

- [ ] **Step 3: Add backend platform map config**

Create `api-proxy/config/platformMaps.js`:

```js
const PLATFORM_MAP_SOURCE_URL = 'https://www.barrie.ca/Transit-Platform-Maps.pdf';

const PLATFORM_MAPS = [
  { id: 'allandale-terminal', displayName: 'Barrie Allandale Transit Terminal', pageNumber: 1 },
  { id: 'downtown-hub', displayName: 'Downtown Hub', pageNumber: 2 },
  { id: 'park-place-terminal', displayName: 'Park Place Terminal', pageNumber: 3 },
  { id: 'barrie-south-go', displayName: 'Barrie South GO', pageNumber: 4 },
  { id: 'georgian-college', displayName: 'Georgian College', pageNumber: 5 },
];

const PLATFORM_MAP_BY_ID = new Map(PLATFORM_MAPS.map((map) => [map.id, map]));

function getPlatformMapByHubId(hubId) {
  if (!hubId) return null;
  return PLATFORM_MAP_BY_ID.get(String(hubId).trim()) || null;
}

module.exports = {
  PLATFORM_MAP_SOURCE_URL,
  PLATFORM_MAPS,
  getPlatformMapByHubId,
};
```

- [ ] **Step 4: Add backend image service**

Create `api-proxy/services/platformMapImageService.js` with injected `fetchImpl` and `renderPageToPng`, in-memory cache, stale-cache fallback, and `defaultRenderPageToPng` using `pdfjs-dist/legacy/build/pdf.mjs` plus `@napi-rs/canvas`.

The concrete exports and return shapes must match the tests in Step 1:

```js
module.exports = {
  createPlatformMapImageService,
  defaultRenderPageToPng,
};
```

The default renderer must:

```js
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
const { createCanvas } = require('@napi-rs/canvas');
```

It must call `pdf.getPage(pageNumber)` and return `canvas.toBuffer('image/png')`.

- [ ] **Step 5: Run backend service tests and verify they pass**

Run:

```powershell
npm --prefix api-proxy test -- platformMapImageService.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit backend service**

Run:

```powershell
git add api-proxy/config/platformMaps.js api-proxy/services/platformMapImageService.js api-proxy/__tests__/platformMapImageService.test.js
git commit -m "feat: add platform map image service"
```

Expected: commit with backend config, service, and tests.

---

## Task 4: Add platform map API route and auth exemption

**Files:**
- Create: `api-proxy/routes/platformMapRoutes.js`
- Modify: `api-proxy/createApp.js`
- Modify: `api-proxy/middleware/auth.js`
- Test: `api-proxy/__tests__/platformMapRoutes.test.js`
- Test: `api-proxy/__tests__/index.routes.test.js`

- [ ] **Step 1: Write route tests**

Create `api-proxy/__tests__/platformMapRoutes.test.js`:

```js
const express = require('express');
const request = require('supertest');
const { registerPlatformMapRoutes } = require('../routes/platformMapRoutes');

describe('platformMapRoutes', () => {
  test('returns a PNG image for a valid hub', async () => {
    const app = express();
    const getPlatformMapImage = jest.fn().mockResolvedValue({
      status: 200,
      body: Buffer.from('png-bytes'),
      contentType: 'image/png',
      hubId: 'georgian-college',
      pageNumber: 5,
      fromCache: false,
      stale: false,
    });

    registerPlatformMapRoutes(app, { platformMapImageService: { getPlatformMapImage } });

    const response = await request(app).get('/api/platform-maps/georgian-college');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/image\/png/);
    expect(response.headers['cache-control']).toContain('public');
    expect(response.headers['x-platform-map-hub']).toBe('georgian-college');
    expect(response.headers['x-platform-map-page']).toBe('5');
    expect(response.body.toString()).toBe('png-bytes');
    expect(getPlatformMapImage).toHaveBeenCalledWith('georgian-college');
  });

  test('returns 404 JSON for an unknown hub', async () => {
    const app = express();
    registerPlatformMapRoutes(app, {
      platformMapImageService: {
        getPlatformMapImage: jest.fn().mockResolvedValue({
          status: 404,
          body: { error: 'Unknown platform map' },
        }),
      },
    });

    const response = await request(app).get('/api/platform-maps/not-real');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Unknown platform map' });
  });
});
```

- [ ] **Step 2: Add auth exemption regression test**

In `api-proxy/__tests__/index.routes.test.js`, add a test that mocks `../services/platformMapImageService`, requests `/api/platform-maps/georgian-college` without `x-api-token`, and expects `200` plus `image/png`.

- [ ] **Step 3: Run route tests and verify they fail**

Run:

```powershell
npm --prefix api-proxy test -- platformMapRoutes.test.js index.routes.test.js
```

Expected: FAIL because `platformMapRoutes.js` is not registered and auth still blocks `/api/platform-maps/georgian-college`.

- [ ] **Step 4: Add platform map route**

Create `api-proxy/routes/platformMapRoutes.js`:

```js
const { createPlatformMapImageService } = require('../services/platformMapImageService');

function registerPlatformMapRoutes(app, {
  platformMapImageService = createPlatformMapImageService(),
} = {}) {
  app.get('/api/platform-maps/:hubId', async (req, res) => {
    const result = await platformMapImageService.getPlatformMapImage(req.params.hubId);

    if (result.contentType && Buffer.isBuffer(result.body)) {
      res.set('Content-Type', result.contentType);
      res.set('Cache-Control', result.stale ? 'public, max-age=300' : 'public, max-age=86400');
      res.set('X-Platform-Map-Hub', result.hubId);
      res.set('X-Platform-Map-Page', String(result.pageNumber));
      res.set('X-Platform-Map-Cache', result.fromCache ? 'hit' : 'miss');
      if (result.stale) res.set('X-Platform-Map-Stale', 'true');
      return res.status(result.status).send(result.body);
    }

    return res.status(result.status || 500).json(result.body || { error: 'Platform map unavailable' });
  });
}

module.exports = {
  registerPlatformMapRoutes,
};
```

- [ ] **Step 5: Register the route in `createApp.js`**

In `api-proxy/createApp.js`, add the import:

```js
const { registerPlatformMapRoutes } = require('./routes/platformMapRoutes');
```

After `registerAiRoutes(app);`, add:

```js
  registerPlatformMapRoutes(app);
```

- [ ] **Step 6: Make platform map image route public in auth middleware**

In `api-proxy/middleware/auth.js`, add this helper above `createAuthenticateApiRequest`:

```js
function isPublicApiPath(path) {
  return path === '/health' || path.startsWith('/platform-maps/');
}
```

Replace:

```js
    if (req.path === '/health') return next();
```

with:

```js
    if (isPublicApiPath(req.path)) return next();
```

Add `isPublicApiPath` to `module.exports`.

- [ ] **Step 7: Run API proxy tests**

Run:

```powershell
npm --prefix api-proxy test -- platformMapRoutes.test.js index.routes.test.js auth.middleware.test.js
```

Expected: PASS.

- [ ] **Step 8: Commit API route**

Run:

```powershell
git add api-proxy/routes/platformMapRoutes.js api-proxy/createApp.js api-proxy/middleware/auth.js api-proxy/__tests__/platformMapRoutes.test.js api-proxy/__tests__/index.routes.test.js api-proxy/__tests__/auth.middleware.test.js
git commit -m "feat: add platform map image endpoint"
```

Expected: commit with API route, auth exemption, and tests.

---

## Task 5: Add app URL service and featured card

**Files:**
- Create: `src/services/platformMapService.js`
- Create: `src/components/PlatformMapCard.js`
- Test: `src/__tests__/platformMapService.test.js`
- Test: `src/__tests__/platformMapCard.test.js`

- [ ] **Step 1: Write service and card tests**

Create `src/__tests__/platformMapService.test.js` and `src/__tests__/platformMapCard.test.js`.

The service tests must verify:

```js
expect(buildPlatformMapImageUrl('georgian-college')).toBe(
  'https://proxy.example.test/api/platform-maps/georgian-college'
);
expect(buildPlatformMapImageUrl('')).toBe('');
expect(getPlatformMapSourceUrl()).toBe('https://www.barrie.ca/Transit-Platform-Maps.pdf');
```

The card tests must verify the rendered text:

```js
expect(texts).toContain('Platform map available');
expect(texts).toContain('Find your bus platform at Georgian College.');
expect(texts).toContain('Open platform map');
```

and pressing the card button calls:

```js
expect(onPress).toHaveBeenCalledWith({ id: 'georgian-college', displayName: 'Georgian College' });
```

- [ ] **Step 2: Run tests and verify they fail**

Run:

```powershell
npm test -- --runTestsByPath src/__tests__/platformMapService.test.js src/__tests__/platformMapCard.test.js
```

Expected: FAIL because service and card files do not exist.

- [ ] **Step 3: Add platform map service**

Create `src/services/platformMapService.js`:

```js
import runtimeConfig from '../config/runtimeConfig';
import { PLATFORM_MAP_SOURCE_URL } from '../config/platformMaps';

const trimTrailingSlash = (value) => String(value || '').replace(/\/+$/, '');

export const buildPlatformMapImageUrl = (hubId) => {
  if (!hubId) return '';
  const apiBaseUrl = trimTrailingSlash(runtimeConfig.proxy.apiBaseUrl);
  if (!apiBaseUrl) return '';
  return `${apiBaseUrl}/api/platform-maps/${encodeURIComponent(hubId)}`;
};

export const getPlatformMapSourceUrl = () => PLATFORM_MAP_SOURCE_URL;
```

- [ ] **Step 4: Add featured card component**

Create `src/components/PlatformMapCard.js` as a focused component with props `{ platformMap, onPress }`. It must return `null` without a platform map, render title `Platform map available`, render body `Find your bus platform at ${platformMap.displayName}.`, and call `onPress(platformMap)` from a `TouchableOpacity` whose accessibility label is `Open platform map for ${platformMap.displayName}`.

- [ ] **Step 5: Run service and card tests**

Run:

```powershell
npm test -- --runTestsByPath src/__tests__/platformMapService.test.js src/__tests__/platformMapCard.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit service and card**

Run:

```powershell
git add src/services/platformMapService.js src/components/PlatformMapCard.js src/__tests__/platformMapService.test.js src/__tests__/platformMapCard.test.js
git commit -m "feat: add platform map card"
```

Expected: commit with app service, card, and tests.

---

## Task 6: Add full-screen platform map viewer modal

**Files:**
- Create: `src/components/PlatformMapViewerModal.js`
- Create: `src/components/PlatformMapViewerModal.web.js`
- Test: `src/__tests__/PlatformMapViewerModal.test.js`

- [ ] **Step 1: Write modal component tests**

Create `src/__tests__/PlatformMapViewerModal.test.js`. It must mock `react-native`, mock `../services/platformMapService`, and verify:

```js
expect(texts).toContain('Georgian College');
expect(image.props.source.uri).toBe('https://proxy.example.test/api/platform-maps/georgian-college');
expect(image.props.accessibilityLabel).toBe('Platform map for Georgian College');
```

It must also press the button with accessibility label `Close platform map` and expect `onClose` to have been called once. A third test must call `Image` `onError()` and expect these strings:

```js
expect(texts).toContain('Platform map could not be loaded.');
expect(texts).toContain('Retry');
expect(texts).toContain('Open source PDF');
```

- [ ] **Step 2: Run modal test and verify it fails**

Run:

```powershell
npm test -- --runTestsByPath src/__tests__/PlatformMapViewerModal.test.js
```

Expected: FAIL because `PlatformMapViewerModal.js` does not exist.

- [ ] **Step 3: Add native modal component**

Create `src/components/PlatformMapViewerModal.js`. It must:

- accept `{ visible, platformMap, onClose }`
- render `Modal` with full-screen presentation
- build image URL with `buildPlatformMapImageUrl(platformMap?.id)`
- render `Image` with `accessibilityLabel={`Platform map for ${platformMap.displayName}`}`
- show `ActivityIndicator` while loading
- set error state from `Image.onError`
- render `Retry` and `Open source PDF` in error state
- expose zoom controls with labels `Zoom out platform map` and `Zoom in platform map`
- use `Linking.openURL(getPlatformMapSourceUrl())` for source PDF fallback
- return `null` when `platformMap` is null

- [ ] **Step 4: Add web modal component**

Create `src/components/PlatformMapViewerModal.web.js` with the same props, same rendered labels, same image URL builder, and web-friendly centered dialog styling.

- [ ] **Step 5: Run modal test**

Run:

```powershell
npm test -- --runTestsByPath src/__tests__/PlatformMapViewerModal.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit modal**

Run:

```powershell
git add src/components/PlatformMapViewerModal.js src/components/PlatformMapViewerModal.web.js src/__tests__/PlatformMapViewerModal.test.js
git commit -m "feat: add platform map viewer modal"
```

Expected: commit with modal components and test.

---

## Task 7: Wire platform maps into stop sheets and Home screens

**Files:**
- Modify: `src/components/StopBottomSheet.js`
- Modify: `src/components/StopBottomSheet.web.js`
- Modify: `src/screens/HomeScreen.js`
- Modify: `src/screens/HomeScreen.web.js`
- Test: `src/__tests__/StopBottomSheet.platformMaps.test.js`

- [ ] **Step 1: Write stop sheet card test**

Create `src/__tests__/StopBottomSheet.platformMaps.test.js`. It must mount `StopBottomSheet` with:

```js
platformMap={{ id: 'georgian-college', displayName: 'Georgian College' }}
onOpenPlatformMap={onOpenPlatformMap}
```

It must find the `TouchableOpacity` with:

```js
node.props.accessibilityLabel === 'Open platform map for Georgian College'
```

After pressing it, assert:

```js
expect(onOpenPlatformMap).toHaveBeenCalledWith(platformMap);
```

- [ ] **Step 2: Run stop sheet test and verify it fails**

Run:

```powershell
npm test -- --runTestsByPath src/__tests__/StopBottomSheet.platformMaps.test.js
```

Expected: FAIL because `StopBottomSheet` does not accept or render platform map props.

- [ ] **Step 3: Update native stop sheet**

In `src/components/StopBottomSheet.js`, import `PlatformMapCard`, add props `platformMap` and `onOpenPlatformMap`, and render:

```js
      <PlatformMapCard platformMap={platformMap} onPress={onOpenPlatformMap} />
```

Place it after the directions buttons and before `BottomSheetScrollView`.

- [ ] **Step 4: Update web stop sheet**

In `src/components/StopBottomSheet.web.js`, import `PlatformMapCard`, add props `platformMap` and `onOpenPlatformMap`, and render:

```js
        <PlatformMapCard platformMap={platformMap} onPress={onOpenPlatformMap} />
```

Place it after the actions row and before the arrivals header.

- [ ] **Step 5: Wire native Home screen**

In `src/screens/HomeScreen.js`, import:

```js
import PlatformMapViewerModal from '../components/PlatformMapViewerModal';
import { getPlatformMapForStop } from '../config/platformMaps';
```

Add state:

```js
const [activePlatformMap, setActivePlatformMap] = useState(null);
```

Add memo and callbacks:

```js
const selectedStopPlatformMap = useMemo(
  () => getPlatformMapForStop(selectedStop),
  [selectedStop]
);

const handleOpenPlatformMap = useCallback((platformMap) => {
  setActivePlatformMap(platformMap);
  trackEvent('platform_map_opened', {
    hub_id: platformMap.id,
    hub_name: platformMap.displayName,
    page_number: platformMap.pageNumber,
  });
}, []);

const handleClosePlatformMap = useCallback(() => {
  setActivePlatformMap(null);
}, []);
```

Add props to `StopBottomSheet`:

```js
platformMap={selectedStopPlatformMap}
onOpenPlatformMap={handleOpenPlatformMap}
```

Render the modal:

```js
<PlatformMapViewerModal
  visible={Boolean(activePlatformMap)}
  platformMap={activePlatformMap}
  onClose={handleClosePlatformMap}
/>
```

- [ ] **Step 6: Wire web Home screen**

Apply the same imports, state, memo, callbacks, `StopBottomSheet` props, and `PlatformMapViewerModal` JSX to `src/screens/HomeScreen.web.js`.

- [ ] **Step 7: Run stop sheet and map-selection tests**

Run:

```powershell
npm test -- --runTestsByPath src/__tests__/StopBottomSheet.platformMaps.test.js src/__tests__/mapSelection.test.js
```

Expected: PASS.

- [ ] **Step 8: Commit app wiring**

Run:

```powershell
git add src/components/StopBottomSheet.js src/components/StopBottomSheet.web.js src/screens/HomeScreen.js src/screens/HomeScreen.web.js src/__tests__/StopBottomSheet.platformMaps.test.js
git commit -m "feat: show platform maps from stop details"
```

Expected: commit with stop sheet and Home screen wiring.

---

## Task 8: Verify end-to-end behavior and update docs

**Files:**
- Modify: `docs/API-PROXY-OPERATIONS.md`
- Modify: `README.md`

- [ ] **Step 1: Update API proxy docs**

In `docs/API-PROXY-OPERATIONS.md`, add:

```md
### Platform map endpoint

`GET /api/platform-maps/:hubId` returns a cached single-page PNG rendered from Barrie's public platform map PDF.

Supported hub IDs:

- `allandale-terminal`
- `downtown-hub`
- `park-place-terminal`
- `barrie-south-go`
- `georgian-college`

The endpoint is public because it serves fixed public City of Barrie content and must be loadable by app image components. It does not accept arbitrary source URLs or page numbers.
```

- [ ] **Step 2: Update README product surface**

In `README.md`, under `Features`, add:

```md
- Platform maps for major transit hubs from the City of Barrie source PDF
```

- [ ] **Step 3: Run focused automated verification**

Run:

```powershell
npm test -- --runTestsByPath src/__tests__/platformMaps.test.js src/__tests__/platformMapService.test.js src/__tests__/platformMapCard.test.js src/__tests__/PlatformMapViewerModal.test.js src/__tests__/StopBottomSheet.platformMaps.test.js
npm --prefix api-proxy test -- platformMapImageService.test.js platformMapRoutes.test.js index.routes.test.js auth.middleware.test.js
```

Expected: all listed tests pass.

- [ ] **Step 4: Run full automated verification**

Run:

```powershell
npm run test:all
```

Expected: app and API proxy test suites pass.

- [ ] **Step 5: Manually smoke test web flow**

Run:

```powershell
npm run web:dev
```

Open the local web app and verify:

1. Search for `Georgian College`.
2. Select stop `335` or another Georgian College platform stop.
3. Confirm the stop sheet shows `Platform map available`.
4. Tap `Open platform map`.
5. Confirm the modal opens and shows only Georgian College page 5.
6. Close the modal.
7. Select a regular stop such as `Georgian Mall` and confirm no platform map card appears.

Expected: all seven checks pass.

- [ ] **Step 6: Manually smoke test Android flow**

Run:

```powershell
npm run android:dev
```

In the emulator:

1. Search for `Georgian College`.
2. Select stop `335` or another Georgian College platform stop.
3. Confirm the stop sheet shows `Platform map available`.
4. Tap `Open platform map`.
5. Confirm the modal opens and shows only Georgian College page 5.
6. Use zoom controls and pan the image.
7. Close the modal.
8. Select a regular stop and confirm no platform map card appears.

Expected: all eight checks pass. If Metro reports a stale dependency resolution error, run `npm run android:dev:clear`, then `npm run android:dev:launch`.

- [ ] **Step 7: Commit docs**

Run:

```powershell
git add README.md docs/API-PROXY-OPERATIONS.md
git commit -m "docs: document platform map endpoint"
```

Expected: commit with docs only.

---

## Final release checklist

- [ ] `git status --short` shows only intentional files.
- [ ] `npm run test:all` passes.
- [ ] Web smoke test passes for Georgian College and one unsupported stop.
- [ ] Android smoke test passes for Georgian College and one unsupported stop.
- [ ] API endpoint `GET /api/platform-maps/georgian-college` returns `image/png` locally.
- [ ] API endpoint `GET /api/platform-maps/not-real` returns `404` JSON.
- [ ] The implementation did not add arbitrary URL or arbitrary page-number proxying.
