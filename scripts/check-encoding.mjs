#!/usr/bin/env node
// Fails when source files contain mojibake sequences (e.g. "â€", "Ã", "Â ")
// or empty icon spans (left over from stripped emoji).
// Run as part of `npm test`. Excludes site-gate files.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SCAN_DIRS = ['src', 'api', 'lib']
const EXCLUDE = /(^|[/\\])(middleware\.js|gate\.[^/\\]+|gate\.[^/\\]*\.test\.[^/\\]+)$/i
const SOURCE_EXT = /\.(jsx?|tsx?|mjs|cjs|css|html)$/

const MOJIBAKE = /â€|â"|âœ|â†|Ã.|Â.|⠝/
// Empty <span> that was clearly an icon placeholder: decorative (aria-hidden)
// or sized via an inline fontSize, with no className driving real content
// (e.g. .spinner/.dot are legitimate empty spans).
const EMPTY_ICON_SPAN = /<span\b(?![^>]*className)[^>]*(?:aria-hidden="true"|style=\{\{[^}]*fontSize)[^>]*>\s*<\/span>/g

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules' || entry.startsWith('.')) continue
      yield* walk(full)
    } else if (SOURCE_EXT.test(entry)) {
      yield full
    }
  }
}

const problems = []

for (const dir of SCAN_DIRS) {
  const abs = join(ROOT, dir)
  let files
  try {
    files = [...walk(abs)]
  } catch {
    continue
  }
  for (const file of files) {
    const rel = relative(ROOT, file)
    if (EXCLUDE.test(rel)) continue
    const text = readFileSync(file, 'utf8')
    const lines = text.split('\n')
    lines.forEach((line, i) => {
      if (MOJIBAKE.test(line)) {
        problems.push(`${rel}:${i + 1}: mojibake sequence: ${line.trim().slice(0, 120)}`)
      }
      for (const _ of line.matchAll(EMPTY_ICON_SPAN)) {
        problems.push(`${rel}:${i + 1}: empty icon span: ${line.trim().slice(0, 120)}`)
      }
    })
  }
}

if (problems.length > 0) {
  console.error('check-encoding failed:\n' + problems.join('\n'))
  process.exit(1)
}
console.log('check-encoding: clean')
