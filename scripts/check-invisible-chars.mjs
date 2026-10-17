#!/usr/bin/env node
// Fails if source files contain invisible or bidirectional-control characters.
// These can hide code from reviewers ("Trojan Source", CVE-2021-42574). Write such characters
// as escape sequences in source instead (backslash, 'u', then the 4 hex digits), never raw.
//
// Usage:
//   node scripts/check-invisible-chars.mjs            -> check all tracked text files
//   node scripts/check-invisible-chars.mjs a.ts b.md  -> check the given files (lint-staged)
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const TEXT_FILE = /\.(ts|tsx|js|mjs|cjs|json|md|ya?ml|toml|rules)$/;

// Code point ranges that are invisible or reorder text. Tab, LF and CR are allowed.
const FORBIDDEN = [
  [0x00, 0x08],
  [0x0b, 0x0c],
  [0x0e, 0x1f],
  [0x7f, 0x9f], // DEL and C1 controls
  [0x200b, 0x200f], // zero-width space/joiners, LRM/RLM
  [0x202a, 0x202e], // bidi embeddings and overrides
  [0x2060, 0x2064], // word joiner, invisible operators
  [0x2066, 0x2069], // bidi isolates
  [0xfeff, 0xfeff], // zero-width no-break space / BOM
];

function isForbidden(cp) {
  return FORBIDDEN.some(([lo, hi]) => cp >= lo && cp <= hi);
}

const files =
  process.argv.length > 2
    ? process.argv.slice(2)
    : execFileSync('git', ['ls-files', '-co', '--exclude-standard'], { encoding: 'utf8' })
        .split('\n')
        .filter(Boolean);

let problems = 0;
for (const file of files.filter((f) => TEXT_FILE.test(f))) {
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    continue; // deleted or unreadable: nothing to check
  }
  const lines = text.split('\n');
  lines.forEach((line, index) => {
    for (const ch of line) {
      const cp = ch.codePointAt(0) ?? 0;
      if (cp === 0x0d) continue; // CR from CRLF files
      if (isForbidden(cp)) {
        problems += 1;
        const hex = cp.toString(16).toUpperCase().padStart(4, '0');
        console.error(`${file}:${String(index + 1)}: invisible character U+${hex}`);
      }
    }
  });
}

if (problems > 0) {
  console.error(
    `\n${String(problems)} invisible character(s) found. Use escape sequences instead.`,
  );
  process.exit(1);
}
