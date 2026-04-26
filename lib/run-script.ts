import { spawn } from 'child_process'

export interface RunResult {
  stdout: string
  stderr: string
  code: number
}

export function runNodeScript(scriptPath: string, cwd: string): Promise<RunResult> {
  return new Promise(resolve => {
    const stdout: string[] = []
    const stderr: string[] = []
    const proc = spawn('node', [scriptPath], { cwd })
    proc.stdout.on('data', (d: Buffer) => stdout.push(d.toString()))
    proc.stderr.on('data', (d: Buffer) => stderr.push(d.toString()))
    proc.on('close', code => {
      resolve({ stdout: stdout.join(''), stderr: stderr.join(''), code: code ?? 1 })
    })
  })
}

export function checkNodeSyntax(filePath: string): Promise<RunResult> {
  return new Promise(resolve => {
    const stderr: string[] = []
    const proc = spawn('node', ['--check', filePath])
    proc.stderr.on('data', (d: Buffer) => stderr.push(d.toString()))
    proc.on('close', code => {
      resolve({ stdout: '', stderr: stderr.join(''), code: code ?? 1 })
    })
  })
}
