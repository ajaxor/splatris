#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import process from 'node:process';

const VERSION_FILE = new URL('../version.json', import.meta.url);
const PAGE_FILES = [
  { name: 'index.html', url: new URL('../index.html', import.meta.url) },
  { name: 'latest.html', url: new URL('../latest.html', import.meta.url) },
];
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

function updatePage(pageHtml, version, commit) {
  let updated = pageHtml.replace(
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

function verifyPage(pageName, pageHtml, version) {
  const expectedAssets = [
    `styles.css?v=${version}`,
    `shell.css?v=${version}`,
    `app.js?v=${version}`,
    `hotfix.js?v=${version}`,
    `game-role-patch.js?v=${version}`,
    `shell.js?v=${version}`,
  ];

  const missing = expectedAssets.filter(asset => !pageHtml.includes(asset));
  const escapedVersion = version.replaceAll('.', '\\.');
  const labelPattern = new RegExp(
    `Version\\s+${escapedVersion}\\s+·\\s+commit\\s+[0-9a-f]{5}`,
    'i',
  );

  if (missing.length > 0) fail(`${pageName} is missing release tags: ${missing.join(', ')}`);
  if (!labelPattern.test(pageHtml)) {
    fail(`${pageName} does not show Version ${version} with a five-character commit.`);
  }
}

async function readPages() {
  return Promise.all(
    PAGE_FILES.map(async page => ({
      ...page,
      html: await readFile(page.url, 'utf8'),
    })),
  );
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const manifest = JSON.parse(await readFile(VERSION_FILE, 'utf8'));
  const currentVersion = manifest.version;
  parseVersion(currentVersion);
  const pages = await readPages();

  if (options.check) {
    for (const page of pages) verifyPage(page.name, page.html, currentVersion);
    console.log(`Release metadata is consistent at ${currentVersion}.`);
    return;
  }

  if (!options.bump && !options.explicitVersion) {
    fail('Choose patch, minor, major, or an explicit X.Y.Z version.');
  }

  const nextVersion = options.explicitVersion ?? bumpVersion(currentVersion, options.bump);
  const commit = options.commit ?? currentCommit();
  const updatedPages = pages.map(page => ({
    ...page,
    updatedHtml: updatePage(page.html, nextVersion, commit),
  }));

  if (updatedPages.every(page => page.updatedHtml === page.html)) {
    fail('No release metadata was updated in the published pages.');
  }

  await writeFile(VERSION_FILE, `${JSON.stringify({ version: nextVersion }, null, 2)}\n`);
  for (const page of updatedPages) {
    await writeFile(page.url, page.updatedHtml);
    verifyPage(page.name, page.updatedHtml, nextVersion);
  }

  console.log(`Prepared Splatris ${nextVersion} · commit ${commit}`);
  console.log('Updated version.json, both published pages, visible build labels, and all local asset cache tags.');
}

main().catch(error => fail(error instanceof Error ? error.message : String(error)));
