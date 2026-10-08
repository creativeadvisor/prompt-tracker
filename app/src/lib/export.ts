// Client-side CSV download.
// Excel-friendly: BOM for UTF-8, CRLF rows, RFC-4180 quoting.
//
// Cells that begin with = + - @ or a tab/CR are prefixed with an apostrophe
// so a spreadsheet treats them as text: answer text and judge summaries
// come from the web and from a model, and a cell like `=HYPERLINK(...)`
// would otherwise execute when the file is opened (CSV formula injection).

const neutralise = (v: string) => (/^[=+\-@\t\r]/.test(v) ? `'${v}` : v)
const esc = (raw: string) => {
  const v = neutralise(raw)
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}

export function downloadCsv(
  filename: string,
  header: string[],
  rows: string[][],
) {
  const csv = [header, ...rows]
    .map((r) => r.map(esc).join(','))
    .join('\r\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
