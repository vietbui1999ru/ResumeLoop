import { randomUUID } from 'crypto'
import { getAdapter } from './db-adapter'

const DEMO_TTL_MS = 12 * 60 * 60 * 1000

// Generic redacted profile — no real personal data
const DEMO_PROFILE_DATA = JSON.stringify({
  candidate_profile: {
    narrative: 'M.S. CS candidate with a B.S. in Computer Science. Built production web services, contributed to open-source infrastructure tooling, and published ML research. Currently focused on full-stack engineering and AI-assisted developer tools.',
    self_assessment: {
      portrays_well: [
        'Full-stack production deployments (FastAPI/React, TypeScript/Next.js)',
        'AI/LLM integration — OpenAI API, LangChain, agent tooling',
        'Cloud infrastructure — Docker, Terraform, CI/CD pipelines',
        'Research credibility — IEEE publication, formal methods coursework',
      ],
      known_gaps: ['Limited enterprise Java/Spring experience', 'No published mobile app yet'],
      not_this: ['Do not pitch as PM or TPM', 'Do not claim C++ production expertise'],
    },
    target_posture: {
      primary_roles: ['Software Engineer (Full-Stack)', 'Backend / API Engineer', 'GenAI / AI Engineer'],
      secondary_roles: ['SRE / DevOps Engineer', 'Platform Engineer'],
      auth_urgency: 'Authorized to work in the US.',
      constraints: ['Remote-first preferred', 'No US Citizen / GC only roles'],
    },
  },
  _meta: {
    version: '2.3',
    updated: '2025-01-01',
    format: 'plain-text. Bullet formula: "Built A doing B using C, which produced D". Buzzwords front-loaded.',
    positioning: 'Software engineer with production deployments and research publications.',
    usage: 'Demo profile — generic data for demonstration purposes only.',
    bullet_rules: [
      'Max 116 chars WITH spaces — hard limit',
      'Lead with varied non-repeated action verbs',
      'IMPACT IS MANDATORY: every bullet must answer "so what?"',
    ],
    tagline_rules: [
      'AVOID generic "experienced in Tech1, Tech2" — use value-oriented format',
      'GOOD: "Backend Engineer building REST APIs in Python with cloud automation"',
    ],
  },
  contact: {
    name: 'Alex Chen',
    phone: '555-555-0100',
    location: 'San Francisco, CA',
    email: 'alex.chen@example.com',
    linkedin: 'linkedin.com/in/alexchen',
    portfolio: 'github.com/alexchen',
  },
  data: {
    work: [
      {
        id: 'startup',
        bullets: [
          'Built REST API platform in FastAPI serving 50k req/day, reducing p99 latency 40% via async query batching',
          'Automated CI/CD pipeline with GitHub Actions + Docker, cutting deploy time from 45 min to 8 min',
          'Designed PostgreSQL schema for multi-tenant SaaS product, onboarding 12 enterprise customers in Q2',
          'Shipped React dashboard with real-time WebSocket updates, increasing user engagement 28% per analytics',
          'Wrote integration test suite (pytest + Testcontainers) covering 87% of API surface, blocking 3 prod regressions',
        ],
      },
      {
        id: 'university',
        bullets: [
          'Published ML research on adversarial robustness of RL agents at IEEE KSE 2024 as 2nd author',
          'Implemented formal verification of security protocols in Coq, proving 14 invariants over state machines',
          'Mentored 40+ undergraduates in Data Structures and Algorithms, improving pass rate 18% over two semesters',
          'Built PyTorch DQN agent solving custom maze environments, achieving 94% success rate after 500k steps',
          'Contributed 8 merged PRs to open-source ML framework, adding gradient-checkpointing for memory efficiency',
        ],
      },
      {
        id: 'internship',
        bullets: [
          'Developed Go microservice for real-time event processing, handling 10k events/sec with <5ms p99 latency',
          'Migrated legacy Python 2 ETL pipeline to Python 3 + Airflow DAGs, eliminating 4 manual cron jobs',
          'Containerized 3 backend services with Docker Compose, enabling reproducible local dev for 8-person team',
          'Wrote Terraform modules for AWS ECS + RDS provisioning, reducing infra setup time from 2 days to 30 min',
        ],
      },
    ],
    projects: [
      {
        id: 'api_platform',
        name: 'API Platform',
        short_stack: 'FastAPI · React · PostgreSQL · Docker',
        url: 'github.com/alexchen/api-platform',
        date: 'Jan 2025',
        bullets: [
          'Built multi-tenant REST API with FastAPI, JWT auth, and role-based access control for 3 permission tiers',
          'Deployed on AWS ECS with Terraform IaC, achieving 99.9% uptime over 90-day production window',
          'Implemented React admin dashboard with Recharts analytics, giving PMs self-serve access to usage metrics',
        ],
      },
      {
        id: 'llm_assistant',
        name: 'LLM Code Assistant',
        short_stack: 'TypeScript · LangChain · Next.js · OpenAI',
        url: 'github.com/alexchen/llm-assistant',
        date: 'Nov 2024',
        bullets: [
          'Engineered RAG pipeline with LangChain + pgvector, reducing hallucination rate 62% on domain-specific queries',
          'Built streaming Next.js frontend with real-time token rendering, cutting perceived response latency by 1.8s',
          'Added tool-use layer allowing agent to query live APIs, enabling answers requiring up-to-date external data',
        ],
      },
      {
        id: 'infra_dashboard',
        name: 'Homelab Infra Dashboard',
        short_stack: 'Prometheus · Grafana · Terraform · Ansible',
        url: 'github.com/alexchen/homelab',
        date: 'Sep 2024',
        bullets: [
          'Provisioned 3-node Proxmox cluster with Terraform + Ansible, hosting 12 self-managed services at home',
          'Built Grafana alerting stack with 18 custom dashboards, catching 2 disk failures before data loss occurred',
          'Configured WireGuard VPN + VLAN segmentation, isolating IoT devices from primary network for security',
        ],
      },
      {
        id: 'mobile_app',
        name: 'iOS Fitness Tracker',
        short_stack: 'SwiftUI · SwiftData · HealthKit · async/await',
        url: 'github.com/alexchen/fitness-tracker',
        date: 'Aug 2024',
        bullets: [
          'Built SwiftUI fitness tracking app with HealthKit integration, syncing workouts across 3 Apple devices',
          'Implemented offline-first SwiftData persistence, keeping data available with zero network dependency',
          'Shipped Core ML model for rep counting via accelerometer data, achieving 91% accuracy on test set',
        ],
      },
    ],
    skills: [
      'Python · FastAPI · Go · TypeScript · Swift · Java',
      'React · Next.js · SwiftUI · Tailwind CSS · REST · GraphQL',
      'PostgreSQL · Redis · SQLite · pgvector · BigQuery',
      'Docker · Terraform · Ansible · AWS ECS · GitHub Actions · Prometheus',
      'PyTorch · LangChain · OpenAI API · Coq · Git · Linux',
    ],
  },
})

// 10 demo jobs seeded for every ephemeral demo user
const DEMO_JOBS = [
  {
    company:    'KeyBank',
    role_title: 'DevOps Engineer I',
    role_track: 'SRE / DevOps Engineer',
    fit_pct:    42,
    visa_status:'kill',
    action:     '0-Saved',
    tags:       JSON.stringify(['jobs', 'visa-kill']),
    raw_content:'DevOps Engineer I — KeyBank. Hybrid Brooklyn OH. Harness.io, GitLab CI/CD, Kubernetes, GCP. Requires US citizenship. Not eligible for employment visa sponsorship for non-US citizens.',
  },
  {
    company:    'Profound',
    role_title: 'Software Engineer, New Grad',
    role_track: 'Software Engineer / Full-Stack',
    fit_pct:    78,
    visa_status:null,
    action:     '0-Saved',
    tags:       JSON.stringify(['jobs', 'un-resume']),
    raw_content:'Software Engineer, New Grad — Profound, San Francisco (on-site). Build full-stack AI-driven applications. React, TypeScript, Node.js, scalable databases and APIs. $140k–$170k. Startup, fast-moving.',
  },
  {
    company:    'U.S. Bank',
    role_title: 'Entry-Level AI/ML Software Engineer',
    role_track: 'ML Engineer',
    fit_pct:    65,
    visa_status:null,
    action:     '0-Saved',
    tags:       JSON.stringify(['jobs', 'un-resume']),
    raw_content:'Entry-Level AI/ML Software Engineer — U.S. Bank, Hopkins MN. Design and deploy ML models for financial use cases. Python, TensorFlow/PyTorch, cloud platforms, data pipelines.',
  },
  {
    company:    'Euna Solutions',
    role_title: 'Associate AI Developer',
    role_track: 'GenAI / AI Engineer',
    fit_pct:    72,
    visa_status:null,
    action:     '1-Applied',
    tags:       JSON.stringify(['jobs', 'resume-ed']),
    raw_content:'Associate AI Developer — Euna Solutions. Proof-of-concept AI development, prompt engineering, LLM tooling. Python, LangChain, OpenAI API. Remote-friendly.',
  },
  {
    company:    'Open Orion',
    role_title: 'Backend Engineer',
    role_track: 'Backend / API Engineer',
    fit_pct:    81,
    visa_status:null,
    action:     '1-Applied',
    tags:       JSON.stringify(['jobs', 'resume-ed']),
    raw_content:'Backend Engineer — Open Orion Inc. Build scalable APIs and cloud infrastructure for AI and simulation tools. Python, FastAPI, Node.js, GraphQL, PostgreSQL, AWS, Terraform, Docker.',
  },
  {
    company:    'Wefunder',
    role_title: 'Full Stack Product Engineer',
    role_track: 'Software Engineer / Full-Stack',
    fit_pct:    88,
    visa_status:null,
    action:     '1-Applied',
    tags:       JSON.stringify(['jobs', 'resume-ed']),
    raw_content:'Full Stack Product Engineer — Wefunder, San Francisco. Rails + React. 70%+ AI-generated code. Build matching engines, ledgers, deal rooms. $160k–$250k + equity. Visa sponsorship available.',
  },
  {
    company:    'Coinbase',
    role_title: 'Software Engineer, Remote',
    role_track: 'Backend / API Engineer',
    fit_pct:    74,
    visa_status:null,
    action:     '1-Applied',
    tags:       JSON.stringify(['jobs', 'resume-ed']),
    raw_content:'Software Engineer — Coinbase, Remote USA. Build secure crypto trading infrastructure. Go, Python, distributed systems, microservices, AWS. Competitive comp + equity.',
  },
  {
    company:    'Crusoe Energy',
    role_title: 'Junior Infrastructure Engineer, Lab',
    role_track: 'SRE / DevOps Engineer',
    fit_pct:    69,
    visa_status:null,
    action:     '4-Offer',
    tags:       JSON.stringify(['jobs', 'resume-ed']),
    raw_content:'Junior Infrastructure Engineer — Crusoe Energy. Deploy and manage GPU fleet for AI workloads. NVIDIA A100/H200/GB200, Ubuntu, InfiniBand, hardware diagnostics. $112k–$132k + RSUs.',
  },
  {
    company:    'TherapyNotes',
    role_title: 'Software Developer',
    role_track: 'Software Engineer / Full-Stack',
    fit_pct:    70,
    visa_status:null,
    action:     '3-Interview',
    tags:       JSON.stringify(['jobs', 'resume-ed']),
    raw_content:'Software Developer — TherapyNotes, Horsham PA (Remote). Build and maintain EHR SaaS platform. C#/.NET, React, PostgreSQL, Azure. Mid-level, collaborative team.',
  },
  {
    company:    'BizFlow',
    role_title: 'Associate Software Engineer (Full-Stack)',
    role_track: 'Software Engineer / Full-Stack',
    fit_pct:    76,
    visa_status:null,
    action:     '5-Rejected',
    tags:       JSON.stringify(['jobs', 'resume-ed']),
    raw_content:'Associate Software Engineer (Full-Stack) — BizFlow, Falls Church VA. Client-facing workflow automation platform. Java, React, PostgreSQL, REST APIs, Agile. Entry-level, hybrid.',
  },
]

export async function seedDemoUser(userId: string): Promise<void> {
  const db = await getAdapter()

  // Lazy cleanup — delete demo users whose 12h window has expired
  const cutoff = new Date(Date.now() - DEMO_TTL_MS).toISOString()
  const expired = await db.query<{ id: string }>(
    `SELECT id FROM users WHERE is_demo = 1 AND created_at < ?`,
    [cutoff],
  )
  for (const u of expired) {
    await db.run(`DELETE FROM outreach_items             WHERE user_id = ?`, [u.id])
    await db.run(`DELETE FROM chat_messages              WHERE user_id = ?`, [u.id])
    await db.run(`DELETE FROM jd_outputs                 WHERE user_id = ?`, [u.id])
    await db.run(`DELETE FROM jd_metrics                 WHERE user_id = ?`, [u.id])
    await db.run(`DELETE FROM jd_jobs                    WHERE user_id = ?`, [u.id])
    await db.run(`DELETE FROM resume_sessions            WHERE user_id = ?`, [u.id])
    await db.run(`DELETE FROM resume_profiles            WHERE user_id = ?`, [u.id])
    await db.run(`DELETE FROM user_settings              WHERE user_id = ?`, [u.id])
    await db.run(`DELETE FROM ai_usage_log               WHERE user_id = ?`, [u.id])
    await db.run(`DELETE FROM password_reset_tokens      WHERE user_id = ?`, [u.id])
    await db.run(`DELETE FROM email_verification_tokens  WHERE user_id = ?`, [u.id])
    await db.run(`DELETE FROM oauth_accounts             WHERE user_id = ?`, [u.id])
    await db.run(`DELETE FROM users                      WHERE id      = ?`, [u.id])
  }

  // Seed profile
  const profileId = randomUUID()
  await db.run(
    `INSERT INTO resume_profiles (id, user_id, name, data, is_active) VALUES (?, ?, ?, ?, 1)`,
    [profileId, userId, 'Demo Profile — Alex Chen', DEMO_PROFILE_DATA],
  )

  for (const job of DEMO_JOBS) {
    const jobId = randomUUID()
    await db.run(
      `INSERT INTO jd_jobs
         (id, file_path, company, role_title, tags, visa_status, role_track, fit_pct,
          raw_content, action, user_id, scanned_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [
        jobId,
        `demo/${job.company.toLowerCase().replace(/\s+/g, '-')}.md`,
        job.company,
        job.role_title,
        job.tags,
        job.visa_status ?? null,
        job.role_track,
        job.fit_pct,
        job.raw_content,
        job.action,
        userId,
      ],
    )
  }
}
