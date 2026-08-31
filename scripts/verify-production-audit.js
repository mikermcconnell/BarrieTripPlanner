const { spawnSync } = require('child_process');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const prefixIndex = process.argv.indexOf('--prefix');
const prefix = prefixIndex >= 0 ? process.argv[prefixIndex + 1] : null;
const npmArgs = prefix
  ? ['--prefix', prefix, 'audit', '--omit=dev', '--json']
  : ['audit', '--omit=dev', '--json'];
const command = process.platform === 'win32' ? process.env.ComSpec : 'npm';
const commandArgs = process.platform === 'win32'
  ? ['/d', '/s', '/c', 'npm.cmd', ...npmArgs]
  : npmArgs;
const result = spawnSync(command, commandArgs, {
  cwd: projectRoot,
  encoding: 'utf8',
  shell: false,
});

if (result.error) throw result.error;

let report;
try {
  report = JSON.parse(result.stdout);
} catch {
  process.stderr.write(result.stderr || result.stdout);
  throw new Error('npm audit did not return valid JSON');
}

const vulnerabilities = report.vulnerabilities || {};
const severityRank = { low: 1, moderate: 2, high: 3, critical: 4 };
const allowlist = prefix
  ? { advisories: {} }
  : require(path.join(projectRoot, 'release-audit-allowlist.json'));
const allowedSources = new Set(Object.keys(allowlist.advisories || {}).map(Number));
function collectAdvisorySources(name, visiting = new Set()) {
  if (visiting.has(name)) return new Set();
  const vulnerability = vulnerabilities[name];
  if (!vulnerability || vulnerability.via.length === 0) return new Set();
  const nextVisiting = new Set(visiting).add(name);
  const sources = new Set();
  for (const entry of vulnerability.via) {
    if (typeof entry === 'object') {
      sources.add(Number(entry.source));
    } else {
      for (const source of collectAdvisorySources(entry, nextVisiting)) sources.add(source);
    }
  }
  return sources;
}
function isAllowed(name) {
  const sources = collectAdvisorySources(name);
  return sources.size > 0 && [...sources].every((source) => allowedSources.has(source));
}
const allowedPackages = new Set(
  Object.keys(vulnerabilities).filter((name) => isAllowed(name)),
);

const blocking = Object.entries(vulnerabilities).filter(([name, vulnerability]) => (
  severityRank[vulnerability.severity] >= severityRank.high && !allowedPackages.has(name)
));

if (blocking.length > 0) {
  console.error('Unaccepted high or critical production dependency findings:');
  for (const [name, vulnerability] of blocking) {
    console.error(`- ${name}: ${vulnerability.severity}`);
  }
  process.exit(1);
}

const accepted = [...allowedPackages].filter(
  (name) => severityRank[vulnerabilities[name]?.severity] >= severityRank.high,
);
if (accepted.length > 0) {
  console.warn(`Accepted build-time advisory chain: ${accepted.join(', ')}`);
}
console.log(prefix
  ? `API proxy production audit passed (${prefix}).`
  : 'Root production audit passed with only documented build-time exceptions.');
