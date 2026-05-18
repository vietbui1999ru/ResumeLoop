// Standalone script: node to-pdf.js <docxPath> <pdfPath>
// Primary:  LibreOffice headless (faithful DOCX → PDF, preserves fonts/layout)
// Fallback: mammoth + puppeteer (HTML rendering, lower fidelity)
const { execFileSync, spawnSync } = require('child_process')
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

// LibreOffice always writes <stem>.pdf into --outdir; rename to desired pdfPath.
function tryLibreOffice(docxPath, pdfPath) {
  if (!hasBin('libreoffice')) return false

  const outDir = path.dirname(pdfPath)
  const stem   = path.basename(docxPath, '.docx')
  const loOut  = path.join(outDir, `${stem}.pdf`)

  const result = spawnSync('libreoffice', [
    '--headless',
    '--convert-to', 'pdf',
    '--outdir', outDir,
    docxPath,
  ], { timeout: 15_000, stdio: 'pipe' })

  if (result.status !== 0) {
    console.error('libreoffice exited', result.status, result.stderr?.toString())
    return false
  }

  if (!fs.existsSync(loOut)) {
    console.error('libreoffice ran but PDF not found at', loOut)
    return false
  }

  // Rename to the caller-specified pdfPath if they differ
  if (loOut !== pdfPath) fs.renameSync(loOut, pdfPath)
  return true
}

;(async () => {
  // --- Primary: LibreOffice ---
  if (tryLibreOffice(docxPath, pdfPath)) {
    console.log('PDF written (LibreOffice):', pdfPath)
    return
  }

  // --- Fallback: mammoth → puppeteer ---
  console.warn('LibreOffice unavailable, falling back to mammoth+puppeteer')
  const mammoth   = require('mammoth')
  const puppeteer = require('puppeteer')

  const { value: html } = await mammoth.convertToHtml({ path: docxPath })

  const execPath = process.env.PUPPETEER_EXECUTABLE_PATH
  const browser  = await puppeteer.launch({
    headless: 'new',
    ...(execPath ? { executablePath: execPath } : {}),
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })
  const page = await browser.newPage()
  await page.setContent(
    `<html><body style="font-family:sans-serif;margin:40px">${html}</body></html>`,
    { waitUntil: 'networkidle0' },
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
