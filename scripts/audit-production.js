#!/usr/bin/env node

const { spawnSync } = require('node:child_process');
const path = require('node:path');

const HIGH_SEVERITIES = new Set(['high', 'critical']);
const ROOT_ALLOWED_ADVISORIES = new Map([
  [1138808, 'image-size is build-time Metro tooling and has no patched release'],
  [1138809, 'image-size is build-time Metro tooling and has no patched release'],
]);

function collectAdvisoryIds(name, vulnerabilities, seen = new Set()) {
  if (seen.has(name)) {
    return new Set();
  }

  const vulnerability = vulnerabilities[name];
  if (!vulnerability) {
    return new Set();
  }

  const nextSeen = new Set(seen).add(name);
  const advisoryIds = new Set();

  for (const via of vulnerability.via || []) {
    if (typeof via === 'string') {
      for (const id of collectAdvisoryIds(via, vulnerabilities, nextSeen)) {
        advisoryIds.add(id);
      }
    } else if (HIGH_SEVERITIES.has(via?.severity) && Number.isInteger(via?.source)) {
      advisoryIds.add(via.source);
    }
  }

  return advisoryIds;
}

function evaluateAuditReport(report, allowedAdvisories = new Map()) {
  const vulnerabilities = report?.vulnerabilities || {};
  const failures = [];
  const allowed = [];

  for (const [name, vulnerability] of Object.entries(vulnerabilities)) {
    if (!HIGH_SEVERITIES.has(vulnerability.severity)) {
      continue;
    }

    const advisoryIds = [...collectAdvisoryIds(name, vulnerabilities)];
    const isAllowed = advisoryIds.length > 0 && advisoryIds.every((id) => allowedAdvisories.has(id));
    const finding = { name, severity: vulnerability.severity, advisoryIds };

    if (isAllowed) {
      allowed.push(finding);
    } else {
      failures.push(finding);
    }
  }

  return { failures, allowed };
}

function runAudit(targetDirectory) {
  const repoRoot = path.resolve(__dirname, '..');
  const auditDirectory = path.resolve(repoRoot, targetDirectory || '.');
  const isRootAudit = auditDirectory === repoRoot;
  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = spawnSync(npmCommand, ['audit', '--omit=dev', '--json'], {
    cwd: auditDirectory,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
    shell: process.platform === 'win32',
  });

  if (!result.stdout) {
    throw new Error(result.error?.message || result.stderr || 'npm audit produced no JSON output');
  }

  const report = JSON.parse(result.stdout);
  const evaluation = evaluateAuditReport(report, isRootAudit ? ROOT_ALLOWED_ADVISORIES : new Map());

  for (const finding of evaluation.allowed) {
    const reasons = finding.advisoryIds.map((id) => `${id}: ${ROOT_ALLOWED_ADVISORIES.get(id)}`);
    console.warn(`Allowed ${finding.severity} audit finding in ${finding.name} (${reasons.join('; ')})`);
  }

  if (evaluation.failures.length > 0) {
    for (const finding of evaluation.failures) {
      console.error(
        `Unapproved ${finding.severity} audit finding in ${finding.name}` +
        (finding.advisoryIds.length ? ` (advisories: ${finding.advisoryIds.join(', ')})` : '')
      );
    }
    return 1;
  }

  console.log(`Production dependency audit passed for ${path.relative(repoRoot, auditDirectory) || '.'}.`);
  return 0;
}

if (require.main === module) {
  try {
    process.exitCode = runAudit(process.argv[2] || '.');
  } catch (error) {
    console.error(`Production dependency audit failed: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = {
  collectAdvisoryIds,
  evaluateAuditReport,
};
