#!/usr/bin/env node
// Check the JS bundle size for the public profile page (/c/[publicId]).
// Reads the Next.js build manifests after `next build`, sums the gzipped JS
// transfer size that the browser downloads for the route, and compares it
// against a threshold. Exits 1 if the bundle exceeds the threshold.
//
// Usage:
//   node scripts/check-bundle-size.js
//
// Env:
//   BUNDLE_SIZE_THRESHOLD_KB  Override the threshold in KiB (default 150)
//   NEXT_BUILD_DIR             Override the .next build directory (default .next)
//
// The script accounts for:
//   - App Router page chunks from app-build-manifest.json (/c/[publicId]/page)
//   - Shared root chunks (rootMainFiles) those pages depend on
//   - Polyfill files from build-manifest.json
//
// Gzipped size is used because that is the transfer size Lighthouse reports
// via `resource-summary:script:size`, matching the 150 KB assertion threshold.

'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// --- Configuration ----------------------------------------------------------

const THRESHOLD_KB = Number(process.env.BUNDLE_SIZE_THRESHOLD_KB) || 150;
const THRESHOLD_BYTES = Math.round(THRESHOLD_KB * 1024);

// Route whose bundle we are measuring.
const ROUTE_KEY = '/c/[publicId]/page';

// --- Helpers ----------------------------------------------------------------

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function fileExists(filePath) {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}

// Return the gzipped byte length of a buffer, matching what a production server
// (with gzip/brotli compression) would transfer over the wire.
function gzipSize(buffer) {
  return zlib.gzipSync(buffer, { level: 9 }).length;
}

// --- Main -------------------------------------------------------------------

function main() {
  const webRoot = path.resolve(__dirname, '..');
  const buildDir = process.env.NEXT_BUILD_DIR
    ? path.resolve(webRoot, process.env.NEXT_BUILD_DIR)
    : path.join(webRoot, '.next');

  const buildManifestPath = path.join(buildDir, 'build-manifest.json');
  const appBuildManifestPath = path.join(buildDir, 'app-build-manifest.json');

  if (!fileExists(appBuildManifestPath)) {
    console.error(
      `✖ Could not find app-build-manifest.json at ${appBuildManifestPath}.\n` +
        '  Run `pnpm --filter @tapsync/web build` first.'
    );
    process.exit(1);
  }

  const appManifest = readJson(appBuildManifestPath);
  const pages = (appManifest && appManifest.pages) || {};

  // Resolve the chunk list for the public profile route.
  let pageChunks = pages[ROUTE_KEY];
  if (!pageChunks && pages['/c/%5BpublicId%5D/page']) {
    // Some Next.js versions URL-encode the bracket segment.
    pageChunks = pages['/c/%5BpublicId%5D/page'];
  }

  if (!pageChunks) {
    console.error(
      `✖ Route ${ROUTE_KEY} not found in app-build-manifest.json.\n` +
        `  Available routes:\n` +
        Object.keys(pages)
          .map((k) => `    - ${k}`)
          .join('\n')
    );
    process.exit(1);
  }

  // Also include polyfill files (loaded for every page) from build-manifest.json.
  let polyfillFiles = [];
  if (fileExists(buildManifestPath)) {
    const buildManifest = readJson(buildManifestPath);
    polyfillFiles = buildManifest.polyfillFiles || [];
  }

  // Deduplicate chunk paths (root chunks may repeat across manifests).
  const uniqueChunks = [...new Set([...pageChunks, ...polyfillFiles])];

  let totalRaw = 0;
  let totalGzipped = 0;
  const report = [];

  for (const relPath of uniqueChunks) {
    // Only count JavaScript assets.
    if (!relPath.endsWith('.js')) continue;

    const absPath = path.join(buildDir, relPath);
    if (!fileExists(absPath)) {
      console.warn(`  ! Missing chunk (skipped): ${relPath}`);
      continue;
    }

    const raw = fs.readFileSync(absPath);
    const gzipped = gzipSize(raw);
    totalRaw += raw.length;
    totalGzipped += gzipped;
    report.push({ relPath, raw: raw.length, gzipped });
  }

  // Sort largest-first for readability.
  report.sort((a, b) => b.gzipped - a.gzipped);

  console.log('');
  console.log('Public profile page JS bundle report (/c/[publicId])');
  console.log('=====================================================');
  console.log('');
  console.log('Per-chunk breakdown (gzipped transfer size):');
  console.log('');
  for (const r of report) {
    console.log(
      `  ${formatBytes(r.gzipped).padStart(10)}  (raw ${formatBytes(r.raw).padStart(10)})  ${r.relPath}`
    );
  }
  console.log('');
  console.log(`Total JS chunks     : ${report.length}`);
  console.log(`Total raw size      : ${formatBytes(totalRaw)}`);
  console.log(`Total gzipped size  : ${formatBytes(totalGzipped)}`);
  console.log(`Threshold           : ${formatBytes(THRESHOLD_BYTES)} (${THRESHOLD_KB} KiB)`);
  console.log('');

  if (totalGzipped > THRESHOLD_BYTES) {
    const over = totalGzipped - THRESHOLD_BYTES;
    console.log(
      `✖ FAIL: gzipped JS bundle (${formatBytes(totalGzipped)}) exceeds threshold ` +
        `by ${formatBytes(over)}.`
    );
    console.log('  Consider code-splitting the route or removing heavy client deps.');
    process.exit(1);
  }

  const headroom = THRESHOLD_BYTES - totalGzipped;
  console.log(
    `✓ PASS: gzipped JS bundle (${formatBytes(totalGzipped)}) is within the ` +
      `${formatBytes(THRESHOLD_BYTES)} threshold (${formatBytes(headroom)} headroom).`
  );
  process.exit(0);
}

main();
