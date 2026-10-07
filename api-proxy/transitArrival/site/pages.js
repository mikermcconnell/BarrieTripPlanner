'use strict';

// Public pages required for ChatGPT app directory review: product site,
// support, privacy policy, and terms. Served from the app's own domain.
// Keep the privacy policy in step with what the server actually does.

const { APP_NAME, APP_TAGLINE, OPERATOR, AGENCIES } = require('../config');

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

const agencyNames = AGENCIES.map((a) => a.name);
const joinWith = (items, word) => (items.length <= 1 ? items.join('')
  : `${items.slice(0, -1).join(', ')}${items.length > 2 ? ',' : ''} ${word} ${items[items.length - 1]}`);
const listText = (items) => joinWith(items, 'and');
const orText = (items) => joinWith(items, 'or');
const coverageList = () => `<ul>${AGENCIES.map((a) => `<li><strong>${esc(a.name)}</strong>: ${esc(a.region)}</li>`).join('')}</ul>`;
const attributionList = () => `<ul>${AGENCIES.map((a) => `<li>${esc(a.attribution)} <a href="${esc(a.licence.url)}">${esc(a.licence.name)}</a></li>`).join('')}</ul>`;

function layout(title, body) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<link rel="icon" href="/logo.svg" type="image/svg+xml">
<style>
  :root { color-scheme: light dark; --fg:#111827; --muted:#6b7280; --bg:#ffffff; --line:#e5e7eb; --accent:#b45309; }
  @media (prefers-color-scheme: dark) { :root { --fg:#f3f4f6; --muted:#9ca3af; --bg:#111827; --line:#374151; --accent:#f59e0b; } }
  body { margin:0; font:16px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; color:var(--fg); background:var(--bg); }
  main { max-width:760px; margin:0 auto; padding:24px 20px 48px; }
  header.top { display:flex; align-items:center; gap:12px; max-width:760px; margin:0 auto; padding:16px 20px 0; }
  header.top img { width:36px; height:36px; }
  header.top a { color:inherit; text-decoration:none; font-weight:600; }
  nav { margin-left:auto; display:flex; gap:16px; font-size:14px; }
  nav a { color:var(--muted); text-decoration:none; }
  nav a:hover { color:var(--fg); }
  h1 { font-size:30px; line-height:1.2; margin:24px 0 8px; }
  h2 { font-size:20px; margin:32px 0 8px; }
  a { color:var(--accent); }
  .muted { color:var(--muted); }
  .shot { width:100%; max-width:420px; border:1px solid var(--line); border-radius:14px; display:block; margin:24px 0; }
  code { background:rgba(127,127,127,.15); padding:1px 5px; border-radius:4px; }
  footer { border-top:1px solid var(--line); margin-top:40px; padding-top:16px; font-size:13px; color:var(--muted); }
  li { margin:4px 0; }
</style>
</head>
<body>
<header class="top">
  <a href="/"><img src="/logo.svg" alt=""></a>
  <a href="/">${esc(APP_NAME)}</a>
  <nav><a href="/support">Support</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a></nav>
</header>
<main>
${body}
<footer>
  ${esc(APP_NAME)} is an independent project operated by ${esc(OPERATOR.name)}. It is not affiliated with, endorsed by,
  or sponsored by ${esc(orText([...agencyNames, 'OpenAI']))}, or any municipality they serve. Map data &copy; OpenStreetMap contributors &copy; CARTO.
</footer>
</main>
</body>
</html>`;
}

const home = () => layout(`${APP_NAME}: ${APP_TAGLINE}`, `
<h1>${esc(APP_NAME)}</h1>
<p class="muted">${esc(APP_TAGLINE)}.</p>
<p>Ask ChatGPT <em>"When's the next bus at Georgian Mall?"</em> or <em>"Where's the route 8 bus?"</em>
and ${esc(APP_NAME)} shows a live map of the buses with how many minutes until each one arrives.
It covers these transit agencies:</p>
${coverageList()}
<img class="shot" src="/screenshot-map.png" alt="A live map of buses near Georgian Mall with arrival times in minutes">
<h2>What it does</h2>
<ul>
  <li><strong>Live map:</strong> every bus heading your way, its route, and its next stop.</li>
  <li><strong>Arrival minutes:</strong> real-time predictions when the bus is tracked, and the timetable when it isn't.
  Each time is labelled as live or scheduled.</li>
  <li><strong>Plain-language stops:</strong> use a stop name, an intersection, a landmark, or the stop number on the sign.</li>
  <li><strong>Keeps itself current:</strong> the map refreshes while it's on screen.</li>
</ul>
<h2>How to use it</h2>
<ol>
  <li>In ChatGPT, open the Apps directory and add <strong>${esc(APP_NAME)}</strong>.</li>
  <li>Ask about a stop or a route, for example "next bus at Downtown Hub in Barrie" or "where is the Viva Blue".</li>
</ol>
<p class="muted">No account, no sign-in, and no location access needed.</p>
`);

const support = () => layout(`Support · ${APP_NAME}`, `
<h1>Support</h1>
<p>Questions, a wrong arrival time, or a stop that won't come up? Email
<a href="mailto:${esc(OPERATOR.email)}">${esc(OPERATOR.email)}</a>. Include the stop or route and roughly when you asked,
and we'll look into it.</p>
<h2>Common questions</h2>
<p><strong>Which areas are covered?</strong></p>
${coverageList()}
<p>More are on the way.</p>
<p><strong>What's the difference between "live" and "scheduled" times?</strong> Live times come from the bus's real-time
prediction. Scheduled times come from the published timetable and are used when a bus isn't being tracked yet, for example
before it starts its trip, or if the real-time feed is temporarily unavailable.</p>
<p><strong>The map shows no buses.</strong> Service may have ended for the day. ${esc(APP_NAME)} will tell you when the
next trip is scheduled.</p>
<p><strong>A stop name matches several places.</strong> Pick the right one on the map, or use the stop number printed on
the stop sign.</p>
<p><strong>Are times guaranteed?</strong> No. They're estimates based on data published by the transit agency and can be
affected by traffic, detours, and data delays. Allow extra time when it matters.</p>
<p><strong>Service alerts and fares:</strong> for official information, contact the transit agency directly. ${esc(APP_NAME)}
is not operated by any transit agency.</p>
`);

const privacy = () => layout(`Privacy Policy · ${APP_NAME}`, `
<h1>Privacy Policy</h1>
<p class="muted">Last updated ${esc(OPERATOR.policiesUpdated)}</p>
<p>${esc(APP_NAME)} ("we") is operated by ${esc(OPERATOR.name)}. This policy explains what information is handled when you
use ${esc(APP_NAME)} in ChatGPT or visit this website. In short: we don't have accounts, we don't ask for your location,
and we don't keep a record of what you ask.</p>

<h2>Information we process</h2>
<ul>
  <li><strong>Your transit question.</strong> When ChatGPT uses ${esc(APP_NAME)}, it sends us the stop, route, or direction
  you asked about (for example "Georgian Mall"). We use it only to look up and return arrival information, and we don't
  store it.</li>
  <li><strong>Technical request data.</strong> Like any web service, our servers receive your request's IP address
  (usually an OpenAI server address when the request comes through ChatGPT), the time, and the page or endpoint requested.
  We hold IP addresses in memory for up to one minute to prevent abuse (rate limiting). Our hosting provider may keep
  standard request logs for security and operations, under its own retention practices.</li>
  <li><strong>Error reports.</strong> If something fails, we log technical error details to fix the problem. These don't
  include your identity.</li>
</ul>
<p>We do not collect your name, email, precise location, contacts, payment details, or any account information.
We don't use cookies, advertising, analytics trackers, or profiling.</p>

<h2>Who receives information</h2>
<ul>
  <li><strong>OpenAI</strong> runs ChatGPT and passes your request to us. Your conversation with ChatGPT is governed by
  OpenAI's own privacy policy.</li>
  <li><strong>CARTO</strong> provides the map images. When the map is shown, your device loads map tiles directly from
  CARTO's servers, which receive standard request data such as your IP address and the map area being viewed. See CARTO's
  privacy policy.</li>
  <li><strong>Our hosting provider</strong> (Railway) runs our servers and processes request data on our behalf.</li>
</ul>
<p>We don't sell or share personal information for advertising. Transit data comes from the public feeds of the
agencies we cover (${esc(listText(agencyNames))}); we send them nothing about you.</p>

<h2>Retention</h2>
<p>Transit questions are not stored. Rate-limiting data is discarded within one minute. Error logs and hosting request logs
are kept only as long as needed for operations and security, typically no more than 30 days.</p>

<h2>Children</h2>
<p>${esc(APP_NAME)} is a general-audience service and isn't directed at children under 13.</p>

<h2>Your choices and rights</h2>
<p>You can stop using ${esc(APP_NAME)} at any time by removing it from ChatGPT. Since we don't keep personal information
linked to you, there is usually nothing to access or delete. If you have a privacy question or request under applicable law
(including Canada's PIPEDA), contact <a href="mailto:${esc(OPERATOR.email)}">${esc(OPERATOR.email)}</a>.</p>

<h2>Changes</h2>
<p>If this policy changes, we'll update this page and the date above.</p>
`);

const terms = () => layout(`Terms of Service · ${APP_NAME}`, `
<h1>Terms of Service</h1>
<p class="muted">Last updated ${esc(OPERATOR.policiesUpdated)}</p>
<p>These terms govern your use of ${esc(APP_NAME)}, operated by ${esc(OPERATOR.name)}. By using ${esc(APP_NAME)} you agree
to them.</p>

<h2>The service</h2>
<p>${esc(APP_NAME)} shows transit vehicle locations and estimated arrival times inside ChatGPT, for the transit
agencies listed on our home page. It's provided free of charge.</p>

<h2>Estimates only</h2>
<p>Arrival times, vehicle positions, and schedules are estimates based on data published by the transit agency. They may be
late, early, incomplete, or wrong, and buses may be detoured or cancelled without notice. Don't rely on ${esc(APP_NAME)}
where timing is critical, and check official sources for service alerts.</p>

<h2>Not affiliated</h2>
<p>${esc(APP_NAME)} is independent. It is not affiliated with, endorsed by, or sponsored by
${esc(orText([...agencyNames, 'OpenAI']))}, or any municipality they serve. Transit data is used under each agency's open data
licence, and agencies provide that data "as is" and may change or withdraw it at any time:</p>
${attributionList()}

<h2>Acceptable use</h2>
<p>Don't misuse the service: no attempts to disrupt it, overload it, scrape it at scale, or access it other than through
ChatGPT or this website.</p>

<h2>No warranty and limitation of liability</h2>
<p>${esc(APP_NAME)} is provided "as is" and "as available", without warranties of any kind. To the fullest extent
permitted by law, ${esc(OPERATOR.name)} is not liable for any indirect, incidental, or consequential damages, or for any
loss arising from reliance on arrival times or other information, including missed trips or connections.</p>

<h2>Changes and availability</h2>
<p>We may change, suspend, or discontinue the service, or update these terms, at any time. Continued use after a change
means you accept the updated terms.</p>

<h2>Governing law</h2>
<p>These terms are governed by the laws of ${esc(OPERATOR.jurisdiction)}.</p>

<h2>Contact</h2>
<p><a href="mailto:${esc(OPERATOR.email)}">${esc(OPERATOR.email)}</a></p>
`);

module.exports = { pages: { '/': home, '/support': support, '/privacy': privacy, '/terms': terms } };
