'use strict';

// Builds every agency's feed database and writes them, gzipped, with a manifest,
// for the transit-feeds GitHub Actions workflow to publish as release assets.
// The server then downloads finished files (see prebuiltUrl in feedStore.js),
// so large feeds like the TTC never spike its memory.
//
// Usage: node transitArrival/buildFeeds.js --out <dir> [--previous <dir>] [agencyId ...]

const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const { pipeline } = require('stream/promises');
const { SCHEMA_VERSION, buildAgencyDb, servesToday } = require('./feedStore');
const { AGENCIES } = require('./config');

const FETCH_TIMEOUT_MS = 5 * 60 * 1000;

function parseArgs(argv) {
  const args = { out: null, previous: null, ids: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out') args.out = argv[++i];
    else if (argv[i] === '--previous') args.previous = argv[++i];
    else args.ids.push(argv[i]);
  }
  if (!args.out) throw new Error('--out is required');
  return args;
}

const sha256 = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');
const fileSha256 = (file) => sha256(fs.readFileSync(file));

async function download(url) {
  let lastError;
  for (const delay of [0, 5000, 15000]) {
    if (delay) await new Promise((r) => setTimeout(r, delay));
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

const gzip = (from, to) => pipeline(fs.createReadStream(from), zlib.createGzip({ level: 9 }), fs.createWriteStream(to));
const gunzip = (from, to) => pipeline(fs.createReadStream(from), zlib.createGunzip(), fs.createWriteStream(to));

function readPrevious(dir) {
  if (!dir) return null;
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
    return manifest.schemaVersion === SCHEMA_VERSION ? manifest : null;
  } catch {
    return null;
  }
}

function notice(agencies) {
  return [
    '# Transit Arrival feed databases',
    '',
    'SQLite databases derived from each agency\'s published GTFS, built nightly for the Transit Arrival app.',
    'Data is provided "as is" by each agency under the licence below, may be out of date, and isn\'t endorsed by them.',
    '',
    ...agencies.map((a) => `- **${a.name}**: ${a.attribution} Licence: ${a.licence.name} (${a.licence.url})`),
    '',
  ].join('\n');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const agencies = args.ids.length ? AGENCIES.filter((a) => args.ids.includes(a.id)) : AGENCIES;
  const previous = readPrevious(args.previous);
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'transit-feeds-'));
  fs.mkdirSync(args.out, { recursive: true });

  const manifest = { schemaVersion: SCHEMA_VERSION, generatedAt: new Date().toISOString(), agencies: {} };
  const failures = [];
  const carryOver = (id) => {
    const entry = previous?.agencies?.[id];
    const file = entry && path.join(args.previous, entry.file);
    if (!entry || !fs.existsSync(file)) return false;
    fs.copyFileSync(file, path.join(args.out, entry.file));
    manifest.agencies[id] = entry;
    return true;
  };

  for (const agency of agencies) {
    const started = Date.now();
    try {
      const zip = await download(agency.staticUrl);
      const sourceSha256 = sha256(zip);
      if (previous?.agencies?.[agency.id]?.sourceSha256 === sourceSha256 && carryOver(agency.id)) {
        console.log(`${agency.id}: unchanged`);
        continue;
      }

      const db = path.join(work, `${agency.id}.sqlite`);
      const counts = await buildAgencyDb(zip, db);

      // Some agencies publish next season's timetable early; keep serving the current one until it starts.
      const prevEntry = previous?.agencies?.[agency.id];
      if (prevEntry && !servesToday(db, agency.timeZone, Date.now())) {
        const prevDb = path.join(work, `${agency.id}.previous.sqlite`);
        await gunzip(path.join(args.previous, prevEntry.file), prevDb);
        if (servesToday(prevDb, agency.timeZone, Date.now()) && carryOver(agency.id)) {
          console.log(`${agency.id}: new timetable doesn't start yet; keeping the previous build`);
          continue;
        }
      }

      const file = `${agency.id}.sqlite.gz`;
      await gzip(db, path.join(args.out, file));
      manifest.agencies[agency.id] = {
        file,
        sha256: fileSha256(path.join(args.out, file)),
        sourceSha256,
        builtAt: new Date().toISOString(),
        bytes: fs.statSync(path.join(args.out, file)).size,
        counts,
      };
      console.log(`${agency.id}: built in ${Math.round((Date.now() - started) / 1000)}s`, counts);
    } catch (err) {
      failures.push(agency.id);
      const kept = carryOver(agency.id);
      console.error(`${agency.id}: FAILED (${err.message})${kept ? '; kept the previous build' : ''}`);
    }
  }

  fs.writeFileSync(path.join(args.out, 'manifest.json'), JSON.stringify(manifest, null, 2));
  fs.writeFileSync(path.join(args.out, 'NOTICE.md'), notice(agencies));
  fs.rmSync(work, { recursive: true, force: true });
  if (failures.length) {
    console.error(`Failed: ${failures.join(', ')}`);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
