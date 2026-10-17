#!/usr/bin/env node
// Runs gitleaks for the pre-commit hook and `npm run secrets:scan`.
// Fails closed: if gitleaks is not installed, the commit is blocked instead of silently skipped.
//
// Usage:
//   node scripts/gitleaks.mjs staged   -> scan staged changes (pre-commit)
//   node scripts/gitleaks.mjs detect   -> scan the full git history
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MODES = {
  staged: ['git', '--pre-commit', '--staged', '--redact', '--no-banner', '--verbose'],
  detect: ['git', '--redact', '--no-banner', '--verbose'],
};

function findGitleaks() {
  const onPath = spawnSync('gitleaks', ['version'], { stdio: 'ignore', shell: false });
  if (onPath.status === 0) return 'gitleaks';

  // winget installs update PATH only for new shells; fall back to its package folder.
  const localAppData = process.env['LOCALAPPDATA'];
  if (localAppData) {
    const packagesDir = join(localAppData, 'Microsoft', 'WinGet', 'Packages');
    if (existsSync(packagesDir)) {
      for (const dir of readdirSync(packagesDir)) {
        if (!dir.startsWith('Gitleaks.Gitleaks')) continue;
        const exe = join(packagesDir, dir, 'gitleaks.exe');
        if (existsSync(exe)) return exe;
      }
    }
  }
  return null;
}

const mode = process.argv[2] ?? 'staged';
const args = MODES[mode];
if (!args) {
  console.error(`Unknown mode "${mode}". Use one of: ${Object.keys(MODES).join(', ')}`);
  process.exit(2);
}

const bin = findGitleaks();
if (!bin) {
  console.error(
    [
      'gitleaks is not installed, so the secret scan cannot run. Commit blocked.',
      'Install it, then retry:',
      '  Windows: winget install --id Gitleaks.Gitleaks -e',
      '  macOS:   brew install gitleaks',
      '  Linux:   https://github.com/gitleaks/gitleaks/releases',
    ].join('\n'),
  );
  process.exit(1);
}

const result = spawnSync(bin, args, { stdio: 'inherit' });
process.exit(result.status ?? 1);
