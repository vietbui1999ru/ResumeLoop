// Standalone script: node to-pdf.js <docxPath> <pdfPath>
const mammoth   = require('mammoth')
const puppeteer = require('puppeteer')
const fs        = require('fs')

const [, , docxPath, pdfPath] = process.argv

if (!docxPath || !pdfPath) {
  console.error('Usage: node to-pdf.js <docxPath> <pdfPath>')
  process.exit(1)
}

;(async () => {
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
  console.log('PDF written:', pdfPath)
})().catch(err => { console.error(err.message); process.exit(1) })
