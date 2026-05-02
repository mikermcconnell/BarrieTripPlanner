const { createCanvas } = require('@napi-rs/canvas');
const {
  PLATFORM_MAP_SOURCE_URL,
  getPlatformMapByHubId,
} = require('../config/platformMaps');

const DEFAULT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const RENDER_SCALE = 2;

async function defaultRenderPageToPng(pdfBuffer, pageNumber) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(pdfBuffer),
    disableFontFace: true,
    isEvalSupported: false,
    useSystemFonts: true,
  });
  const pdf = await loadingTask.promise;
  try {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: RENDER_SCALE });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const canvasContext = canvas.getContext('2d');

    await page.render({ canvasContext, viewport }).promise;
    return canvas.toBuffer('image/png');
  } finally {
    await pdf.destroy();
  }
}

function createPlatformMapImageService({
  fetchImpl = global.fetch,
  renderPageToPng = defaultRenderPageToPng,
  now = Date.now,
  cacheTtlMs = DEFAULT_CACHE_TTL_MS,
} = {}) {
  const cache = new Map();

  async function fetchSourcePdf() {
    if (typeof fetchImpl !== 'function') {
      throw new Error('Fetch is not available');
    }

    const response = await fetchImpl(PLATFORM_MAP_SOURCE_URL, {
      headers: { 'User-Agent': 'BarrieTransitProxy/1.0' },
    });
    if (!response.ok) {
      const error = new Error(`Platform map source returned ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return Buffer.from(await response.arrayBuffer());
  }

  async function getPlatformMapImage(hubId) {
    const platformMap = getPlatformMapByHubId(hubId);
    if (!platformMap) {
      return { status: 404, body: { error: 'Unknown platform map' } };
    }

    const cacheKey = `${platformMap.id}:${platformMap.pageNumber}:${PLATFORM_MAP_SOURCE_URL}`;
    const cached = cache.get(cacheKey);
    if (cached && now() - cached.createdAt <= cacheTtlMs) {
      return { ...cached.response, fromCache: true };
    }

    try {
      const pdfBuffer = await fetchSourcePdf();
      const pngBuffer = await renderPageToPng(pdfBuffer, platformMap.pageNumber);
      const response = {
        status: 200,
        body: pngBuffer,
        contentType: 'image/png',
        hubId: platformMap.id,
        displayName: platformMap.displayName,
        pageNumber: platformMap.pageNumber,
        sourceUrl: PLATFORM_MAP_SOURCE_URL,
        fromCache: false,
        stale: false,
      };
      cache.set(cacheKey, { createdAt: now(), response });
      return response;
    } catch (error) {
      if (cached) {
        return { ...cached.response, fromCache: true, stale: true };
      }
      if (error.status) {
        return { status: 502, body: { error: 'Platform map source is unavailable' } };
      }
      return { status: 500, body: { error: 'Platform map could not be rendered' } };
    }
  }

  return { getPlatformMapImage };
}

module.exports = {
  createPlatformMapImageService,
  defaultRenderPageToPng,
};
