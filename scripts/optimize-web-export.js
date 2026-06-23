const fs = require('node:fs');
const path = require('node:path');

const outputDir = path.resolve(process.argv[2] || 'dist');
const indexPath = path.join(outputDir, 'index.html');
const marker = 'bttp-deferred-web-runtime';

if (!fs.existsSync(indexPath)) {
  throw new Error(`Missing web export index.html: ${indexPath}`);
}

const html = fs.readFileSync(indexPath, 'utf8');

if (html.includes(marker)) {
  process.exit(0);
}

const scriptPattern = /<script\b(?=[^>]*\bsrc="([^"]+)")(?=[^>]*\bdefer\b)[^>]*><\/script>/g;
const scriptSources = [];
let match;

while ((match = scriptPattern.exec(html))) {
  scriptSources.push(match[1]);
}

if (scriptSources.length === 0) {
  throw new Error(`No deferred Expo web scripts found in ${indexPath}`);
}

const loader = `<script id="${marker}">
(function () {
  var sources = ${JSON.stringify(scriptSources)};
  function loadNext(index) {
    if (index >= sources.length) return;
    var script = document.createElement('script');
    script.src = sources[index];
    script.async = false;
    script.onload = function () { loadNext(index + 1); };
    script.onerror = function () { loadNext(index + 1); };
    document.body.appendChild(script);
  }
  function start() { setTimeout(function () { loadNext(0); }, 0); }
  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });
})();
</script>`;

if (!html.includes('</body>')) {
  throw new Error(`Missing </body> in ${indexPath}`);
}

const optimized = html
  .replace(scriptPattern, '')
  .replace('</body>', `${loader}</body>`);

fs.writeFileSync(indexPath, optimized);
console.log(`Optimized ${path.relative(process.cwd(), indexPath)} for deferred web runtime startup.`);
