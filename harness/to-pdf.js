// Standalone script: node to-pdf.js <docxPath> <pdfPath>
// Primary: pandoc + xelatex (faithful DOCX formatting)
// Fallback: mammoth + puppeteer (HTML rendering, lower fidelity)
const { execFileSync } = require('child_process')
const path = require('path')
const fs   = require('fs')

const [, , docxPath, pdfPath] = process.argv

if (!docxPath || !pdfPath) {
  console.error('Usage: node to-pdf.js <docxPath> <pdfPath>')
  process.exit(1)
}

function hasBin(name) {
  try { execFileSync('which', [name], { stdio: 'pipe' }); return true } catch { return false }
}

;(async () => {
  if (hasBin('pandoc') && hasBin('xelatex')) {
    try {
      execFileSync('pandoc', [
        docxPath,
        '-o', pdfPath,
        '--pdf-engine=xelatex',
        '-V', 'geometry:margin=0.5in',
        '-V', 'fontsize=10pt',
      ], { stdio: 'pipe' })
      if (fs.existsSync(pdfPath)) {
        console.log('PDF written:', pdfPath)
        return
      }
    } catch (e) {
      console.error('pandoc failed, falling back:', e.message)
    }
  }

  // Fallback: mammoth → puppeteer
  const mammoth   = require('mammoth')
  const puppeteer = require('puppeteer')

  const { value: html } = await mammoth.convertToHtml({ path: docxPath })
  const browser = await puppeteer.launch({ headless: 'new' })
  const page    = await browser.newPage()
  await page.setContent(
    `<html><body style="font-family:sans-serif;margin:40px">${html}</body></html>`,
    { waitUntil: 'networkidle0' }
  )
  await page.pdf({
    path: pdfPath,
    format: 'Letter',
    printBackground: true,
    margin: { top: '0.5in', bottom: '0.5in', left: '0.5in', right: '0.5in' },
  })
  await browser.close()
  console.log('PDF written (fallback):', pdfPath)
})().catch(err => { console.error(err.message); process.exit(1) })
