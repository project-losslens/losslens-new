// CSV helpers for insurer/admin exports. Plain JS — Node-testable.

export function toCsv(rows, columns) {
  const escape = (value) => {
    const text = value == null ? '' : String(value)
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
  }
  const header = columns.map((c) => escape(c.label)).join(',')
  const body = rows.map((row) => columns.map((c) => escape(typeof c.value === 'function' ? c.value(row) : row[c.key])).join(','))
  return [header, ...body].join('\n')
}

export function downloadCsv(filename, csv) {
  if (typeof document === 'undefined' || typeof URL === 'undefined') return
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
