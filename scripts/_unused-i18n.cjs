// Throwaway: find i18n keys defined but never referenced via t('...')/t("...").
const fs = require('fs')
const path = require('path')
const en = fs.readFileSync('src/i18n/en.js', 'utf8')
const keys = [...en.matchAll(/^\s*'([^']+)':/gm)].map((m) => m[1])

const files = []
;(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) walk(p)
    else if (/\.(jsx?|js)$/.test(e.name) && !e.name.endsWith('en.js') && !e.name.endsWith('sw.js')) files.push(p)
  }
})('src')
const corpus = files.map((f) => fs.readFileSync(f, 'utf8')).join('\n')

// dynamic keys like t(`diary.mood.${m}`) — collect literal prefixes
const dynPrefixes = [...corpus.matchAll(/t\(`([^`$]+)\$\{/g)].map((m) => m[1])

const unused = keys.filter((k) => {
  if (corpus.includes(`'${k}'`) || corpus.includes(`"${k}"`) || corpus.includes(`\`${k}\``)) return false
  // covered by a dynamic prefix?
  return !dynPrefixes.some((p) => k.startsWith(p))
})
console.log(`total keys: ${keys.length}, unused: ${unused.length}`)
console.log(unused.join('\n'))
