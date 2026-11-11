

// Throwaway dead-file check (not committed).
const fs = require('fs')
const path = require('path')
const files = []
;(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) walk(p)
    else if (/\.(jsx?|css)$/.test(e.name)) files.push(p)
  }
})('src')

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const unused = []
for (const f of files) {
  if (f === 'src/main.jsx' || f === 'src/App.jsx') continue
  const rel = path.relative('src', f).replace(/\\/g, '/').replace(/\.(jsx?|css)$/, '')
  const base = path.basename(rel)
  const dir = path.dirname(rel)
  let refs = 0
  for (const g of files) {
    if (g === f) continue
    const c = fs.readFileSync(g, 'utf8')
    // match imports referencing this file by basename or relative path
    const patterns = [
      new RegExp(`from ['"][^'"]*${esc(base)}(\\.jsx?)?['"]`),
      new RegExp(`import\\(['"][^'"]*${esc(base)}(\\.jsx?)?['"]\\)`),
      new RegExp(`import ['"][^'"]*${esc(base)}(\\.jsx?)?['"]`),
    ]
    for (const re of patterns) {
      const m = c.match(new RegExp(re.source, 'g'))
      if (m) refs += m.length
    }
  }
  if (refs === 0) unused.push(`${f}  (dir:${dir})`)
}
console.log(unused.join('\n') || 'none')
