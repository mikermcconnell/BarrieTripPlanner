const http = require('http');

const LISTEN_PORT = 8083;
const TARGET_HOST = '127.0.0.1';
const TARGET_PORT = 8084;

function shouldNormalizeBundleRequest(pathname) {
  return pathname.includes('.bundle') || pathname.includes('/index.bundle');
}

function createUpstreamHeaders(req, pathname) {
  const headers = { ...req.headers };

  // Prefer plain JS bundle responses and disable gzip to avoid
  // transport/decompression issues seen on some emulator setups.
  if (shouldNormalizeBundleRequest(pathname)) {
    headers.accept = 'application/javascript, */*;q=0.8';
    headers['accept-encoding'] = 'identity';
  }

  headers.host = `${TARGET_HOST}:${TARGET_PORT}`;
  headers.connection = 'close';
  return headers;
}

function sanitizeDownstreamHeaders(upstreamHeaders, contentLength, pathname) {
  const hopByHop = new Set([
    'connection',
    'keep-alive',
    'proxy-authenticate',
    'proxy-authorization',
    'te',
    'trailer',
    'transfer-encoding',
    'upgrade',
  ]);

  const headers = {};
  for (const [key, value] of Object.entries(upstreamHeaders)) {
    if (!hopByHop.has(key.toLowerCase())) {
      headers[key] = value;
    }
  }

  if (shouldNormalizeBundleRequest(pathname)) {
    delete headers['content-encoding'];
  }

  headers['content-length'] = String(contentLength);
  headers.connection = 'close';
  return headers;
}

const server = http.createServer((req, res) => {
  const start = Date.now();
  const pathname = req.url || '/';
  const headers = createUpstreamHeaders(req, pathname);

  const upstream = http.request(
    {
      host: TARGET_HOST,
      port: TARGET_PORT,
      method: req.method,
      path: pathname,
      headers,
    },
    (upstreamRes) => {
      const chunks = [];
      let bytes = 0;

      upstreamRes.on('data', (chunk) => {
        chunks.push(chunk);
        bytes += chunk.length;
      });

      upstreamRes.on('end', () => {
        const body = Buffer.concat(chunks);
        const outHeaders = sanitizeDownstreamHeaders(upstreamRes.headers, body.length, pathname);
        res.writeHead(upstreamRes.statusCode || 500, outHeaders);
        res.end(body);
        console.log(
          `[${new Date().toISOString()}] ${req.method} ${pathname} -> ${upstreamRes.statusCode} ${bytes}b ${Date.now() - start}ms`
        );
      });
    }
  );

  upstream.on('error', (err) => {
    console.error(`[${new Date().toISOString()}] ${req.method} ${pathname} -> proxy_error ${err.message}`);
    if (!res.headersSent) {
      res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
    }
    res.end('proxy error');
  });

  req.pipe(upstream);
});

server.listen(LISTEN_PORT, '0.0.0.0', () => {
  console.log(`proxy_listening ${LISTEN_PORT} -> ${TARGET_PORT}`);
});
