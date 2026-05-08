import path from 'path'

const ROOT = process.cwd()

export const PATHS = {
  pipeline: {
    masterData: path.join(ROOT, 'pipeline', 'master_resume_data.json'),
    builder:    path.join(ROOT, 'pipeline', 'buildv2.js'),
  },
  templates: {
    resume:      path.join(ROOT, 'templates', 'resume-template.docx'),
    coverLetter: path.join(ROOT, 'templates', 'cover-letter-template.docx'),
    resumeFixed: path.join(ROOT, 'templates', 'master_resume_fixed.docx'),
  },
  docs: {
    atsSystem:     path.join(ROOT, 'docs', 'reference', 'ats-optimized-resume-system.md'),
    atsGuidelines: path.join(ROOT, 'docs', 'reference', 'ats-optimization-guidelines.md'),
    claudeFull:    path.join(ROOT, 'docs', 'reference', 'CLAUDE-full.md'),
    spec:          path.join(ROOT, 'docs', 'reference', 'spec-job-match-resume-generator.md'),
  },
} as const
