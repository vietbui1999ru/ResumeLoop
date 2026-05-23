import { spawn } from 'child_process'
import path from 'path'

const TO_PDF_SCRIPT = path.join(process.cwd(), 'harness', 'to-pdf.js')

export async function pdfConvert(docxPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('node', [TO_PDF_SCRIPT, docxPath, outputPath], { cwd: process.cwd() })
    const errChunks: string[] = []
    proc.stderr.on('data', (d: Buffer) => errChunks.push(d.toString()))
    proc.on('close', code => {
      if (code === 0) resolve()
      else reject(new Error(`to-pdf.js exited ${code}: ${errChunks.join('').trim()}`))
    })
    proc.on('error', reject)
  })
}
