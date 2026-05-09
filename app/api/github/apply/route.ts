import fs from 'fs'
import path from 'path'
import { NextResponse } from 'next/server'

const MASTER_PATH = path.join(process.cwd(), 'pipeline', 'master_resume_data.json')

interface ProjectInput {
  id: string
  name: string
  short_stack: string
  bullets: string[]
}

export async function POST(req: Request) {
  const { project } = await req.json() as { project?: ProjectInput }
  if (!project?.id || !project.bullets?.length) {
    return NextResponse.json({ error: 'project with id and bullets required' }, { status: 400 })
  }

  let master: { projects?: Array<{ id: string; [k: string]: unknown }>; [k: string]: unknown }
  try {
    master = JSON.parse(fs.readFileSync(MASTER_PATH, 'utf8'))
  } catch {
    return NextResponse.json({ error: 'Could not read master_resume_data.json' }, { status: 500 })
  }

  if (!Array.isArray(master.projects)) master.projects = []

  const existingIdx = master.projects.findIndex(p => p.id === project.id)
  const newEntry = { id: project.id, name: project.name, short_stack: project.short_stack, bullets: project.bullets }

  let replaced = false
  if (existingIdx >= 0) {
    master.projects[existingIdx] = newEntry
    replaced = true
  } else {
    master.projects.push(newEntry)
  }

  const tmp = MASTER_PATH + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(master, null, 2), 'utf8')
  fs.renameSync(tmp, MASTER_PATH)

  return NextResponse.json({ ok: true, replaced })
}
