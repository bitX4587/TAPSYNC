#!/usr/bin/env node
/**
 * security-audit.mjs — Dependency vulnerability audit for the TapSync monorepo.
 *
 * Runs `pnpm audit` across the workspace, parses the JSON output, and reports
 * any high or critical severity vulnerabilities in production dependencies.
 *
 * Exit codes:
 *   0  — no high/critical vulnerabilities found
 *   1  — one or more high/critical vulnerabilities found (or pnpm audit failed)
 *
 * Usage:
 *   node scripts/security-audit.mjs
 *   node scripts/security-audit.mjs --json   # emit raw JSON report
 */

import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const reportDir = resolve(repoRoot, 'reports');
const emitJson = process.argv.includes('--json');

// ---------------------------------------------------------------------------
// Run pnpm audit
// ---------------------------------------------------------------------------

let auditJson;

try {
  // --json produces machine-readable output. We allow a non-zero exit code
  // because pnpm audit returns 1 when vulnerabilities are found, and we want
  // to parse the output rather than crash.
  const raw = execSync('pnpm audit --json', {
    cwd: repoRoot,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: 120_000,
    maxBuffer: 50 * 1024 * 1024,
  });
  auditJson = JSON.parse(raw);
} catch (error) {
  // pnpm audit exits 1 when vulnerabilities exist; capture stdout anyway
  const stdout = error.stdout ?? '';
  const stderr = error.stderr ?? '';
  if (stdout) {
    try {
      auditJson = JSON.parse(stdout);
    } catch {
      console.error('Failed to parse pnpm audit output.');
      console.error(stderr || error.message);
      process.exit(1);
    }
  } else {
    console.error('pnpm audit failed to run:');
    console.error(stderr || error.message);
    process.exit(1);
  }
}

if (emitJson) {
  console.log(JSON.stringify(auditJson, null, 2));
}

// ---------------------------------------------------------------------------
// Parse and filter
// ---------------------------------------------------------------------------

const advisories = auditJson?.advisories ?? auditJson?.vulnerabilities ?? {};
const advisoryList = Array.isArray(advisories)
  ? advisories
  : Object.values(advisories);

// Severity levels we care about
const CRITICAL_LEVELS = ['critical', 'high'];
const ALL_LEVELS = ['critical', 'high', 'moderate', 'low', 'info'];

const findings = [];
const allVulns = [];

for (const adv of advisoryList) {
  // pnpm audit JSON format varies by version; normalise the severity field
  const severity = (adv.severity || adv.severity_level || 'low').toLowerCase();
  const name = adv.name || adv.module_name || adv.package_name || 'unknown';
  const title = adv.title || adv.advisory_title || adv.vulnerable_versions || name;
  const url = adv.url || adv.resolved_path || adv.advisory_url || '';
  const range = adv.range || adv.vulnerable_range || adv.patched_versions || '';

  allVulns.push({ severity, name, title, url, range });

  if (CRITICAL_LEVELS.includes(severity)) {
    findings.push({ severity, name, title, url, range });
  }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

console.log('\n========================================');
console.log('  TapSync Dependency Security Audit');
console.log('========================================\n');

if (allVulns.length === 0) {
  console.log('✓ No known vulnerabilities found across the workspace.\n');
} else {
  console.log(`Total advisories found: ${allVulns.length}\n`);

  // Print summary by severity
  for (const level of ALL_LEVELS) {
    const count = allVulns.filter((v) => v.severity === level).length;
    if (count > 0) {
      console.log(`  ${level.toUpperCase()}: ${count}`);
    }
  }
  console.log('');

  // Print high/critical details
  if (findings.length > 0) {
    console.log('── High / Critical vulnerabilities ──\n');
    for (const f of findings) {
      console.log(`  [${f.severity.toUpperCase()}] ${f.name}`);
      console.log(`    ${f.title}`);
      if (f.range) console.log(`    Affected: ${f.range}`);
      if (f.url) console.log(`    URL: ${f.url}`);
      console.log('');
    }
  } else {
    console.log('✓ No high or critical severity vulnerabilities found.\n');
  }
}

// Write a report file
try {
  mkdirSync(reportDir, { recursive: true });
  const reportPath = resolve(reportDir, 'security-audit.json');
  const report = {
    timestamp: new Date().toISOString(),
    totalAdvisories: allVulns.length,
    criticalHighCount: findings.length,
    findings,
    allVulnerabilities: allVulns,
  };
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`Report written to: ${reportPath}\n`);
} catch (err) {
  console.error(`Warning: could not write report file: ${err.message}`);
}

// ---------------------------------------------------------------------------
// Exit code
// ---------------------------------------------------------------------------

if (findings.length > 0) {
  console.log(`✗ ${findings.length} high/critical vulnerability(ies) found.`);
  process.exit(1);
} else {
  console.log('✓ Dependency audit passed — no high/critical vulnerabilities.');
  process.exit(0);
}
