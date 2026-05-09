import { useState, useEffect } from 'react'

export interface JobOutput {
  id: string
  docx_path: string | null
  pdf_path: string | null
  tagline: string | null
  reasoning: string | null
  built_at: string
}

export function useJobOutput(jobId: string) {
  const [output, setOutput] = useState<JobOutput | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/jobs/${jobId}/output`)
      .then(r => r.ok ? r.json() : null)
      .then(setOutput)
      .finally(() => setLoading(false))
  }, [jobId])

  return { output, loading }
}
