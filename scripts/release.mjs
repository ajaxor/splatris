#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import process from 'node:process';

const VERSION_FILE = new URL('../version.json', import.meta.url);
const INDEX_FILE = new URL('../index.html', import.meta.url);
const VALID_BUMPS = new Set(['patch', 'minor', 'major']);

function fail(message) {
  console.error(`Release error: ${message}`);
  process.exit(1);
}

function parseVersion(value) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(value);
  if (!match) fail(`Invalid semantic version: ${value}`);
  return match.slice(1).map(Number);
}

function bumpVersion(current, bump) {
  const [major, minor, patch] = parseVersion(current);
  if (bump === 'major') return `${major + 1}.0.0`;
  if (bump === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

function currentCommit() {
  try {
    return execFileSync('git', ['rev-parse', '--short=5', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    fail('Could not read the current Git commit. Pass --commit abcde explicitly.');
  }
}

function parseArguments(args) {
  const options = {
    bump: null,
    explicitVersion: null,
    commit: null,
    check: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];

    if (VALID_BUMPS.has(argument)) {
      if (options.bump || options.explicitVersion) fail('Specify only one version or bump type.');
      options.bump = argument;
      continue;
    }

    if (/^\d+\.\d+\.\d+$/.test(argument)) {
      if (options.bump || options.explicitVersion) fail('Specify only one version or bump type.');
      options.explicitVersion = argument;
      continue;
    }

    if (argument === '--commit') {
      options.commit = args[index + 1];
      index += 1;
      if (!/^[0-9a-f]{5,40}$/i.test(options.commit ?? '')) {
        fail('--commit must be followed by a Git hash.');
      }
      options.commit = options.commit.slice(0, 5);
      continue;
    }

    if (argument === '--check') {
      options.check = true;
      continue;
    }

    fail(`Unknown argument: ${argument}`);
  }

  return options;
}

function updateIndex(indexHtml, version, commit) {
  let updated = indexHtml.replace(
    /(["'](?:styles|shell)\.css\?v=)[^"']+/g,
    (_match, prefix) => `${prefix}${version}`,
  );

  updated = updated.replace(
    /(["'](?:app|hotfix|game-role-patch|shell)\.js\?v=)[^"']+/g,
    (_match, prefix) => `${prefix}${version}`,
  );

  updated = updated.replace(
    /Version\s+\d+\.\d+\.\d+(?:\s+·\s+commit\s+[0-9a-f]+)?/gi,
    `Version ${version} · commit ${commit}`,
  );

  return updated;
}

function verifyIndex(indexHtml, version) {
  const expectedAssets = [
    `styles.css?v=${version}`,
    `shell.css?v=${version}`,
    `app.js?v=${version}`,
    `hotfix.js?v=${version}`,
    `game-role-patch.js?v=${version}`,
    `shell.js?v=${version}`,
  ];

  const missing = expectedAssets.filter(asset => !indexHtml.includes(asset));
  const escapedVersion = version.replaceAll('.', '\\.');
  const labelPattern = new RegExp(
    `Version\\s+${escapedVersion}\\s+·\\s+commit\\s+[0-9a-f]{5}`,
    'i',
  );

  if (missing.length > 0) fail(`index.html is missing release tags: ${missing.join(', ')}`);
  if (!labelPattern.test(indexHtml)) fail(`index.html does not show Version ${version} with a five-character commit.`);
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const manifest = JSON.parse(await readFile(VERSION_FILE, 'utf8'));
  const currentVersion = manifest.version;
  parseVersion(currentVersion);

  if (options.check) {
    const indexHtml = await readFile(INDEX_FILE, 'utf8');
    verifyIndex(indexHtml, currentVersion);
    console.log(`Release metadata is consistent at ${currentVersion}.`);
    return;
  }

  if (!options.bump && !options.explicitVersion) {
    fail('Choose patch, minor, major, or an explicit X.Y.Z version.');
  }

  const nextVersion = options.explicitVersion ?? bumpVersion(currentVersion, options.bump);
  const commit = options.commit ?? currentCommit();
  const indexHtml = await readFile(INDEX_FILE, 'utf8');
  const updatedIndex = updateIndex(indexHtml, nextVersion, commit);

  if (updatedIndex === indexHtml) fail('No release metadata was updated in index.html.');

  await writeFile(VERSION_FILE, `${JSON.stringify({ version: nextVersion }, null, 2)}\n`);
  await writeFile(INDEX_FILE, updatedIndex);
  verifyIndex(updatedIndex, nextVersion);

  console.log(`Prepared Splatris ${nextVersion} · commit ${commit}`);
  console.log('Updated version.json, the visible build label, and all local asset cache tags.');
}

main().catch(error => fail(error instanceof Error ? error.message : String(error)));
