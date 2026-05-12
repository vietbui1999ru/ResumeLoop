import { useState, useEffect } from 'react'

export interface JobOutput {
  id: string
  docx_path: string | null
  pdf_path: string | null
  tagline: string | null
  reasoning: string | null
  cover_letter: string | null
  variant: string | null
  projects_used: string | null
  work_ids_used: string | null
  built_at: string
}

export function useJobOutput(jobId: string) {
  const [output, setOutput] = useState<JobOutput | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    setLoading(true)
    fetch(`/api/jobs/${jobId}/output`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (alive) setOutput(data) })
      .catch(() => { if (alive) setOutput(null) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [jobId])

  return { output, loading }
}
