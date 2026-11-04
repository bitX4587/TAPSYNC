#!/usr/bin/env node
/**
 * secret-scan.mjs — Secret handling audit for the TapSync monorepo.
 *
 * Checks:
 *  1. Scans all tracked source files for hardcoded secrets (API keys,
 *     passwords, tokens, private keys).
 *  2. Verifies .env.example files use placeholder values, not real secrets.
 *  3. Verifies .gitignore excludes .env, .env.local, .env.production.
 *  4. Checks that no .env files (other than .env.example) are tracked by git.
 *
 * Exit codes:
 *   0  — no issues found
 *   1  — potential secrets or configuration issues detected
 *
 * Usage:
 *   node scripts/secret-scan.mjs
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, dirname, relative } from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

let issues = [];
let warnings = [];

// ---------------------------------------------------------------------------
// 1. Regex patterns for common secret formats
// ---------------------------------------------------------------------------

const SECRET_PATTERNS = [
  {
    name: 'AWS Access Key ID',
    pattern: /AKIA[0-9A-Z]{16}/,
    severity: 'critical',
  },
  {
    name: 'AWS Secret Access Key',
    pattern: /aws_secret_access_key\s*=\s*['"][A-Za-z0-9/+=]{40}['"]/i,
    severity: 'critical',
  },
  {
    name: 'Google API Key',
    pattern: /AIza[0-9A-Za-z\-_]{35}/,
    severity: 'critical',
  },
  {
    name: 'Private key block',
    pattern: /-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/,
    severity: 'critical',
  },
  {
    name: 'Stripe Secret Key',
    pattern: /sk_(live|test)_[0-9a-zA-Z]{24,}/,
    severity: 'critical',
  },
  {
    name: 'GitHub Personal Access Token',
    pattern: /ghp_[0-9A-Za-z]{36}/,
    severity: 'critical',
  },
  {
    name: 'Generic high-entropy secret assignment',
    // Matches assignments like SECRET = "something-long-and-secret-looking"
    // Excludes placeholder values (change-me, your-, xxx, example, test)
    pattern: /(?:secret|password|token|api_key|apikey|private_key)\s*[:=]\s*['"](?!(?:change-me|your-|xxx+|placeholder|example|test-|<|REPLACE|todo))[A-Za-z0-9+/=_-]{20,}['"]/i,
    severity: 'high',
  },
  {
    name: 'Hardcoded password in connection string',
    pattern: /mongodb(?:\+srv)?:\/\/[^:]+:([^@]{8,})@/i,
    severity: 'high',
  },
];

// Directories and file patterns to skip
const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', 'coverage',
  '.pnpm-store', '.turbo', '.expo', 'reports',
]);
const SKIP_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.svg',
  '.woff', '.woff2', '.ttf', '.eot', '.pdf', '.zip', '.lock',
]);
const SCAN_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.json', '.yml', '.yaml',
  '.env', '.sh', '.xml', '.gradle', '.plist', '.config',
]);

// Skip test fixture files — they intentionally contain fake tokens/secrets
const SKIP_FILE_PATTERNS = [
  /\.spec\.(ts|js)$/,
  /\.test\.(ts|js|tsx|jsx)$/,
  /\.e2e\.(ts|js)$/,
  /__tests__\//,
  /\/test\//,
  /\/tests\//,
];

// ---------------------------------------------------------------------------
// 2. Walk the file tree
// ---------------------------------------------------------------------------

function walkDir(dir, results = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return results;
  }

  for (const entry of entries) {
    // Skip hidden directories like .git but allow .env.example
    if (entry.startsWith('.') && !entry.startsWith('.env')) {
      if (entry === '.env.example' || entry === '.env.local.example') {
        // Process these
      } else if (SKIP_DIRS.has(entry) || entry.startsWith('.')) {
        continue;
      }
    }
    if (SKIP_DIRS.has(entry)) continue;

    const fullPath = join(dir, entry);
    let stat;
    try {
      stat = statSync(fullPath);
    } catch {
      continue;
    }

    if (stat.isDirectory()) {
      walkDir(fullPath, results);
    } else if (stat.isFile()) {
      const ext = entry.substring(entry.lastIndexOf('.'));
      const isEnvFile = entry.startsWith('.env');
      if (SCAN_EXTENSIONS.has(ext) || isEnvFile || entry === '.env.example') {
        // Skip .env.example from the secret scan — it's checked separately
        if (entry === '.env.example') {
          results.push({ path: fullPath, isEnvExample: true });
        } else if (!SKIP_EXTENSIONS.has(ext) || isEnvFile) {
          results.push({ path: fullPath, isEnvExample: false });
        }
      }
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// 3. Scan a file for secret patterns
// ---------------------------------------------------------------------------

function scanFile(filePath) {
  // Skip test fixture files — they intentionally contain fake tokens/secrets
  const relativePath = relative(repoRoot, filePath).replace(/\\/g, '/');
  if (SKIP_FILE_PATTERNS.some((p) => p.test(relativePath))) {
    return [];
  }

  let content;
  try {
    content = readFileSync(filePath, 'utf-8');
  } catch {
    return [];
  }

  const findings = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip comments (basic heuristic)
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('#') && !trimmed.includes('=')) {
      continue;
    }

    for (const { name, pattern, severity } of SECRET_PATTERNS) {
      const match = line.match(pattern);
      if (match) {
        // Avoid flagging the pattern definitions in this very file
        if (filePath.endsWith('secret-scan.mjs') && pattern.source.includes('AKIA')) {
          continue;
        }
        findings.push({
          file: relative(repoRoot, filePath),
          line: i + 1,
          name,
          severity,
          snippet: line.trim().substring(0, 120),
        });
      }
    }
  }

  return findings;
}

// ---------------------------------------------------------------------------
// 4. Check .env.example files for placeholder values
// ---------------------------------------------------------------------------

function checkEnvExample(filePath) {
  let content;
  try {
    content = readFileSync(filePath, 'utf-8');
  } catch {
    return;
  }

  const lines = content.split('\n');
  const secretKeys = [
    'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'REVALIDATION_SECRET',
    'STORAGE_SECRET', 'GOOGLE_CLIENT_ID', 'STORAGE_KEY_ID',
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('#')) continue;

    for (const key of secretKeys) {
      if (line.startsWith(key + '=')) {
        const value = line.substring(key.length + 1).trim();
        // Empty values are OK (e.g. GOOGLE_CLIENT_ID=)
        if (value === '') continue;
        // Placeholders like "change-me-..." are acceptable
        if (/^(change-me|your-|xxx|placeholder|example|test-|<|REPLACE)/i.test(value)) {
          continue;
        }
        // If the value looks like a real secret (long, high entropy), flag it
        if (value.length >= 16 && /^[A-Za-z0-9+/=_-]+$/.test(value)) {
          warnings.push(
            `${relative(repoRoot, filePath)}:${i + 1} — ${key} may contain a real value instead of a placeholder`
          );
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 5. Check .gitignore
// ---------------------------------------------------------------------------

function checkGitignore() {
  const gitignorePath = join(repoRoot, '.gitignore');
  if (!existsSync(gitignorePath)) {
    issues.push('.gitignore not found at repository root');
    return;
  }

  const content = readFileSync(gitignorePath, 'utf-8');
  const required = ['.env', '.env.local', '.env.production'];

  for (const pattern of required) {
    // .gitignore uses .env.* which covers .env.local and .env.production,
    // but also check for explicit entries
    const hasPattern =
      content.includes(pattern) ||
      content.includes('.env.*') ||
      content.includes('.env*');
    if (!hasPattern) {
      warnings.push(`.gitignore does not explicitly exclude "${pattern}"`);
    }
  }

  // Verify .env.example is NOT ignored (it should be committed)
  if (content.includes('!.env.example')) {
    // Good — .env.example is explicitly un-ignored
  }
}

// ---------------------------------------------------------------------------
// 6. Check for tracked .env files (excluding .env.example)
// ---------------------------------------------------------------------------

function checkTrackedEnvFiles() {
  try {
    const output = execSync('git ls-files', {
      cwd: repoRoot,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const trackedFiles = output.trim().split('\n');
    const envFiles = trackedFiles.filter(
      (f) => f.includes('.env') && !f.endsWith('.env.example')
    );

    for (const f of envFiles) {
      issues.push(`Tracked env file should not be committed: ${f}`);
    }
  } catch {
    warnings.push('Could not run git ls-files — skipping tracked .env file check');
  }
}

// ---------------------------------------------------------------------------
// Run all checks
// ---------------------------------------------------------------------------

console.log('\n========================================');
console.log('  TapSync Secret Handling Audit');
console.log('========================================\n');

// Scan source files
console.log('Scanning source files for hardcoded secrets...');
const files = walkDir(repoRoot);
let secretFindings = [];

for (const file of files) {
  if (file.isEnvExample) {
    checkEnvExample(file.path);
  } else {
    secretFindings.push(...scanFile(file.path));
  }
}

// Deduplicate
const seen = new Set();
secretFindings = secretFindings.filter((f) => {
  const key = `${f.file}:${f.line}:${f.name}`;
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
});

// Check gitignore
checkGitignore();

// Check tracked env files
checkTrackedEnvFiles();

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

if (secretFindings.length > 0) {
  console.log('\n── Potential secrets found ──\n');
  for (const f of secretFindings) {
    const label = f.severity === 'critical' ? 'CRITICAL' : 'HIGH';
    console.log(`  [${label}] ${f.name}`);
    console.log(`    ${f.file}:${f.line}`);
    console.log(`    ${f.snippet}`);
    console.log('');
  }
  issues.push(...secretFindings.map((f) => `${f.severity}: ${f.name} in ${f.file}:${f.line}`));
} else {
  console.log('✓ No hardcoded secrets found in source files.');
}

console.log('');

if (warnings.length > 0) {
  console.log('── Warnings ──\n');
  for (const w of warnings) {
    console.log(`  ⚠ ${w}`);
  }
  console.log('');
}

// Write report
try {
  const { mkdirSync, writeFileSync } = await import('node:fs');
  mkdirSync(join(repoRoot, 'reports'), { recursive: true });
  const report = {
    timestamp: new Date().toISOString(),
    issues,
    warnings,
    filesScanned: files.length,
  };
  writeFileSync(
    join(repoRoot, 'reports', 'secret-scan.json'),
    JSON.stringify(report, null, 2)
  );
  console.log(`Report written to: reports/secret-scan.json\n`);
} catch (err) {
  console.error(`Warning: could not write report file: ${err.message}`);
}

// ---------------------------------------------------------------------------
// Exit code
// ---------------------------------------------------------------------------

const criticalIssues = issues.filter((i) => i.startsWith('critical'));
const highIssues = issues.filter((i) => i.startsWith('high'));

if (criticalIssues.length > 0 || highIssues.length > 0) {
  console.log(`✗ ${issues.length} issue(s) found (${criticalIssues.length} critical, ${highIssues.length} high).`);
  process.exit(1);
} else {
  console.log('✓ Secret handling audit passed.');
  process.exit(0);
}
