// Builds the plugin ZIP for platform.openai.com/plugins ("Upload new or existing plugin").
// Spec: https://developers.openai.com/plugins/deploy/submission
//   node transitArrival/submission/build-plugin-zip.js --demo-url <unlisted video URL>
// Bump VERSION for every upload; each upload is its own package version and review.
const fs = require('fs');
const os = require('os');
const path = require('path');
const JSZip = require('jszip');

const NAME = 'transit-arrival';
const VERSION = '1.0.0';
const SITE = 'https://transit-arrival-production.up.railway.app';
const HERE = __dirname;

const demoArg = process.argv.indexOf('--demo-url');
const demoUrl = demoArg > -1 ? process.argv[demoArg + 1] : '';

const submissionMd = fs.readFileSync(path.join(HERE, 'SUBMISSION.md'), 'utf8').replace(/\r\n/g, '\n');
const longDescription = submissionMd
  .split('## Long description')[1]
  .split('\n## ')[0]
  .split('\n')
  .filter((l) => l.startsWith('>'))
  .map((l) => l.replace(/^> ?/, ''))
  .join('\n')
  .trim();

const positive = [
  {
    description: 'Next arrivals at a named stop in Barrie',
    prompt: "When's the next bus at Georgian Mall?",
    tools_triggered: 'get_transit_status',
    expected_behavior: 'Map with the Georgian Mall stops, route lines and bus markers, plus up to 5 Barrie Transit arrivals with route, destination and minutes, each labelled live or scheduled. Outside service hours it gives the next scheduled trip instead.',
  },
  {
    description: "Where a route's buses are right now",
    prompt: 'Where is the route 8 bus in Barrie right now?',
    tools_triggered: 'get_transit_status',
    expected_behavior: 'Map showing every Barrie Transit 8A and 8B bus with its route line. Each row shows the next stop and minutes to it.',
  },
  {
    description: 'Second agency inferred from the stop name',
    prompt: 'Next bus at Richmond Hill Centre',
    tools_triggered: 'get_transit_status',
    expected_behavior: "York Region Transit arrivals across the terminal's platforms, including Viva routes, with the map centred on the terminal.",
  },
  {
    description: 'Toronto streetcar at an intersection',
    prompt: "When's the next 504 King streetcar at King and Spadina?",
    tools_triggered: 'get_transit_status',
    expected_behavior: 'TTC arrivals at King St West at Spadina Ave for the 504A and 504B, with live minutes and the streetcars shown on the map.',
  },
  {
    description: 'GO Transit train at a station',
    prompt: "When's the next GO train at Barrie South GO?",
    tools_triggered: 'get_transit_status',
    expected_behavior: 'GO Transit departures from Barrie South GO on the Barrie line, labelled live or scheduled, with the station on the map.',
  },
];

const negative = [
  {
    description: 'City the app does not cover',
    prompt: "When's the next OC Transpo bus at Rideau Centre in Ottawa?",
    expected_behavior: "Transit Arrival is not used, or it says Ottawa isn't covered. No Ottawa times are invented.",
  },
  {
    description: 'Not a transit question',
    prompt: "What's the weather in Barrie today?",
    expected_behavior: 'Transit Arrival is not called.',
  },
  {
    description: 'Purchase or account action',
    prompt: 'Buy me a Barrie Transit bus pass.',
    expected_behavior: 'Transit Arrival is not called. It has no purchase or account tools.',
  },
];

const defaultPrompt = [
  "Where's my bus? I'm at Richmond Hill Centre",
  "When's the next train at Union Station?",
  'Is the 504 King streetcar running late?',
];

const assets = {
  logo: 'logo-1024.png',
  composerIcon: 'icon-composer-512.png',
  screenshots: ['screenshot-stop.png', 'screenshot-route.png', 'screenshot-choose-stop-dark.png'],
};

const review = { test_cases: { positive, negative }, commerce: false };
if (demoUrl) review.demo_recording_url = demoUrl;

const manifest = {
  $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
  name: NAME,
  version: VERSION,
  description: 'Live arrival times and a vehicle map for public transit, starting with 10 agencies in Ontario, Canada.',
  author: { name: 'Michael McConnell', url: SITE },
  homepage: SITE,
  keywords: ['transit', 'bus', 'arrival times', 'Ontario', 'TTC', 'GO Transit'],
  extensions: {
    'com.openai': {
      interface: {
        displayName: 'Transit Arrival',
        shortDescription: 'Live transit times and map',
        longDescription,
        developerName: 'Michael McConnell',
        category: 'Travel',
        capabilities: [
          'Show live arrival minutes at a stop, by name, intersection or stop number',
          'Show where a route\'s vehicles are on a live map',
          'Find stops and list routes for each covered agency',
        ],
        websiteURL: `${SITE}/`,
        supportURL: `${SITE}/support`,
        privacyPolicyURL: `${SITE}/privacy`,
        termsOfServiceURL: `${SITE}/terms`,
        defaultPrompt,
        logo: `./assets/${assets.logo}`,
        composerIcon: `./assets/${assets.composerIcon}`,
        screenshots: assets.screenshots.map((f) => `./assets/${f}`),
      },
      review,
      publication: {
        countries: ['CA'],
        release_notes: submissionMd.split('## Release notes')[1].split('\n## ')[0].split('\n').slice(1).join(' ').replace(/\s+/g, ' ').trim(),
      },
    },
  },
};

const mcp = {
  $schema: 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json',
  mcpServers: { [NAME]: { type: 'streamable-http', url: `${SITE}/mcp` } },
};

const problems = [];
const ui = manifest.extensions['com.openai'].interface;
for (const [field, limit] of [['displayName', 30], ['shortDescription', 30], ['longDescription', 4000], ['developerName', 80]]) {
  if (!ui[field] || ui[field].length > limit) problems.push(`${field} is ${ui[field].length} chars (limit ${limit})`);
}
if (positive.length !== 5 || negative.length !== 3) problems.push('need exactly 5 positive and 3 negative test cases');
if (defaultPrompt.some((p) => p.length > 128)) problems.push('a defaultPrompt is over 128 chars');
if (!demoUrl) problems.push('no --demo-url given (required before Submit for review)');

(async () => {
  const zip = new JSZip();
  zip.file('plugin.json', `${JSON.stringify(manifest, null, 2)}\n`);
  zip.file('mcp.json', `${JSON.stringify(mcp, null, 2)}\n`);
  for (const f of [assets.logo, assets.composerIcon, ...assets.screenshots]) {
    zip.file(`assets/${f}`, fs.readFileSync(path.join(HERE, f)));
  }
  const out = path.join(os.homedir(), 'Downloads', `${NAME}-plugin-${VERSION}.zip`);
  fs.writeFileSync(out, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
  console.log('wrote', out);
  for (const p of problems) console.log('WARNING:', p);
})();
