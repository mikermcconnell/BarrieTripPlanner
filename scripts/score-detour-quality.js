#!/usr/bin/env node

const path = require('path');
const {
  scoreDetourQualityCorpus,
  writeDetourQualityReport,
} = require('./detourQualityCorpus');

function parseArgs(argv) {
  const args = {
    manifest: 'docs/detour-ground-truth/quality-corpus.json',
    output: null,
    syntheticOnly: false,
  };
  for (let index = 2; index < argv.length; index += 1) {
    if (argv[index] === '--manifest') {
      args.manifest = argv[index + 1];
      index += 1;
    } else if (argv[index] === '--output') {
      args.output = argv[index + 1];
      index += 1;
    } else if (argv[index] === '--synthetic-only') {
      args.syntheticOnly = true;
    } else if (argv[index] === '--help' || argv[index] === '-h') {
      args.help = true;
    }
  }
  return args;
}

function printHelp() {
  console.log(`Score the deterministic auto-detour quality corpus.

Usage:
  node scripts/score-detour-quality.js
  node scripts/score-detour-quality.js --manifest <path> --output <report.json>
  node scripts/score-detour-quality.js --synthetic-only
`);
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help) return printHelp();
  const report = scoreDetourQualityCorpus(path.resolve(args.manifest));
  if (args.output) writeDetourQualityReport(report, args.output);
  const output = args.syntheticOnly ? report.syntheticLab : report;
  console.log(JSON.stringify(output, null, 2));
  if (args.syntheticOnly ? output.passRate !== 1 : !report.pass) process.exitCode = 1;
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { main, parseArgs };
