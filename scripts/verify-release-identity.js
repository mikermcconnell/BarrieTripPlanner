#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(projectRoot, relativePath), 'utf8'));
}

function parseVersion(version) {
  const match = String(version || '').trim().match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) throw new Error(`Invalid release version: ${version || 'missing'}`);
  return match.slice(1).map(Number);
}

function compareVersions(left, right) {
  const leftParts = parseVersion(left);
  const rightParts = parseVersion(right);
  for (let index = 0; index < leftParts.length; index += 1) {
    if (leftParts[index] !== rightParts[index]) return leftParts[index] - rightParts[index];
  }
  return 0;
}

function getReleaseIdentityErrors({ env = process.env } = {}) {
  const packageJson = readJson('package.json');
  const app = readJson('app.base.json').expo;
  const eas = readJson('eas.json');
  const release = readJson('release.json');
  const errors = [];

  const currentVersion = release.current?.version;
  const currentCode = release.current?.androidVersionCode;
  const previousVersion = release.previousProduction?.version;
  const previousCode = release.previousProduction?.androidVersionCode;

  let versionsAreValid = true;
  try {
    parseVersion(currentVersion);
    parseVersion(previousVersion);
  } catch (error) {
    versionsAreValid = false;
    errors.push(error.message);
  }

  if (packageJson.version !== currentVersion) {
    errors.push(`package.json version ${packageJson.version} does not match release.json ${currentVersion}`);
  }
  if (app.version !== currentVersion) {
    errors.push(`app.base.json version ${app.version} does not match release.json ${currentVersion}`);
  }
  if (app.android?.versionCode !== currentCode) {
    errors.push(`app.base.json versionCode ${app.android?.versionCode} does not match release.json ${currentCode}`);
  }
  if (!Number.isInteger(currentCode) || !Number.isInteger(previousCode)) {
    errors.push('Android version codes must be integers');
  } else if (currentCode <= previousCode) {
    errors.push(`Android versionCode ${currentCode} must be greater than production ${previousCode}`);
  }
  if (versionsAreValid && compareVersions(currentVersion, previousVersion) <= 0) {
    errors.push(`Release version ${currentVersion} must be greater than production ${previousVersion}`);
  }

  const overrideVersion = String(env.EXPO_PUBLIC_APP_VERSION || '').trim();
  if (overrideVersion && overrideVersion !== currentVersion) {
    errors.push(`EXPO_PUBLIC_APP_VERSION ${overrideVersion} disagrees with release version ${currentVersion}`);
  }

  if (eas.cli?.appVersionSource !== 'local') {
    errors.push('EAS appVersionSource must remain local so checked-in release metadata is authoritative');
  }
  if (eas.build?.production?.android?.buildType !== 'app-bundle') {
    errors.push('EAS production profile must create an Android app bundle');
  }
  if (eas.submit?.production?.android?.track !== 'production') {
    errors.push('EAS production submit profile must target the Google Play production track');
  }

  return errors;
}

function verifyReleaseIdentity(options) {
  const errors = getReleaseIdentityErrors(options);
  if (errors.length > 0) {
    throw new Error(errors.join('\n'));
  }

  const release = readJson('release.json');
  return release.current;
}

if (require.main === module) {
  try {
    const current = verifyReleaseIdentity();
    console.log(`Release identity verified: ${current.version} / Android ${current.androidVersionCode}`);
  } catch (error) {
    console.error(`Release identity verification failed:\n${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { compareVersions, getReleaseIdentityErrors, verifyReleaseIdentity };
