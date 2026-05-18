import { randomUUID } from 'crypto'
import { getAdapter } from './db-adapter'
import { parseJd } from './jd-parser'
import { scoreJd } from './fit-scorer'

const DEMO_TTL_MS = 12 * 60 * 60 * 1000

// Generic redacted profile — no real personal data.
// Schema matches pipeline/master_resume_data.json:
//   experience[].bullets = Record<variant, string[]> (genai/systems/fullstack/sre)
//   projects[].bullets   = string[]
//   skills               = Record<variant, string> (one comma-dot string per variant)
const DEMO_PROFILE_DATA = JSON.stringify({
  candidate_profile: {
    narrative: 'M.S. CS candidate with production experience in full-stack web services, open-source infrastructure tooling, and ML research. Currently focused on full-stack engineering and AI-assisted developer tools.',
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
    format: 'Bullet formula: "Built A doing B using C, which produced D". Impact mandatory.',
    usage: 'Demo profile — generic data for demonstration purposes only.',
    bullet_rules: [
      'Max 116 chars WITH spaces — hard limit',
      'Lead with varied non-repeated action verbs',
      'IMPACT IS MANDATORY: every bullet must answer "so what?"',
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
  experience: [
    {
      id: 'startup',
      title: 'Software Engineer',
      company: 'Acme Startup',
      location: 'San Francisco, CA (Remote)',
      dates: 'Jan 2024 – Present',
      bullets: {
        genai: [
          'Built LLM-powered document processing pipeline using LangChain + OpenAI API, cutting manual review time 70%',
          'Automated CI/CD pipeline with GitHub Actions + Docker, reducing deploy time from 45 min to 8 min',
          'Designed PostgreSQL schema for multi-tenant SaaS product, onboarding 12 enterprise customers in Q2',
          'Shipped React dashboard with real-time WebSocket updates, increasing user engagement 28% per analytics',
          'Wrote integration test suite (pytest + Testcontainers) covering 87% of API surface, blocking 3 prod regressions',
        ],
        systems: [
          'Built REST API platform in FastAPI serving 50k req/day, reducing p99 latency 40% via async query batching',
          'Automated CI/CD pipeline with GitHub Actions + Docker, reducing deploy time from 45 min to 8 min',
          'Designed PostgreSQL schema for multi-tenant SaaS product, onboarding 12 enterprise customers in Q2',
          'Shipped Go event bus handling 10k events/sec with <5ms p99 latency using goroutines and channel pipelines',
          'Wrote integration test suite (pytest + Testcontainers) covering 87% of API surface, blocking 3 prod regressions',
        ],
        fullstack: [
          'Built REST API platform in FastAPI serving 50k req/day, reducing p99 latency 40% via async query batching',
          'Automated CI/CD pipeline with GitHub Actions + Docker, reducing deploy time from 45 min to 8 min',
          'Designed PostgreSQL schema for multi-tenant SaaS product, onboarding 12 enterprise customers in Q2',
          'Shipped React dashboard with real-time WebSocket updates, increasing user engagement 28% per analytics',
          'Wrote integration test suite (pytest + Testcontainers) covering 87% of API surface, blocking 3 prod regressions',
        ],
        sre: [
          'Automated CI/CD pipeline with GitHub Actions + Docker, reducing deploy time from 45 min to 8 min',
          'Deployed services on AWS ECS with Terraform IaC, achieving 99.9% uptime over a 90-day production window',
          'Configured Prometheus + Grafana alerting stack, catching 2 latency regressions before they reached customers',
          'Shipped Go event bus handling 10k events/sec with <5ms p99 latency using goroutines and channel pipelines',
          'Wrote integration test suite (pytest + Testcontainers) covering 87% of API surface, blocking 3 prod regressions',
        ],
      },
    },
    {
      id: 'university',
      title: 'Research Assistant / Teaching Assistant',
      company: 'State University',
      location: 'Dayton, OH',
      dates: 'Aug 2022 – Dec 2023',
      bullets: {
        genai: [
          'Published ML research on adversarial robustness of RL agents at IEEE KSE 2024 as 2nd author',
          'Built PyTorch DQN agent solving custom maze environments, achieving 94% success rate after 500k steps',
          'Implemented data preprocessing pipeline in Python + NumPy, reducing training set noise by 31%',
          'Mentored 40+ undergraduates in Data Structures, improving pass rate 18% over two semesters',
          'Contributed 8 merged PRs to open-source ML framework, adding gradient-checkpointing for memory efficiency',
        ],
        systems: [
          'Implemented formal verification of security protocols in Coq, proving 14 invariants over state machines',
          'Built Go CLI tooling for batch experiment runs, cutting researcher setup time from 2 hours to 10 minutes',
          'Developed CUDA kernel for parallelized matrix ops, reducing training wall-time 3× on NVIDIA A100',
          'Mentored 40+ undergraduates in Data Structures, improving pass rate 18% over two semesters',
          'Contributed 8 merged PRs to open-source ML framework, adding gradient-checkpointing for memory efficiency',
        ],
        fullstack: [
          'Published ML research on adversarial robustness of RL agents at IEEE KSE 2024 as 2nd author',
          'Built PyTorch DQN agent solving custom maze environments, achieving 94% success rate after 500k steps',
          'Implemented data preprocessing pipeline in Python + NumPy, reducing training set noise by 31%',
          'Mentored 40+ undergraduates in Data Structures, improving pass rate 18% over two semesters',
          'Contributed 8 merged PRs to open-source ML framework, adding gradient-checkpointing for memory efficiency',
        ],
        sre: [
          'Built Go CLI tooling for batch experiment runs, cutting researcher setup time from 2 hours to 10 minutes',
          'Developed CUDA kernel for parallelized matrix ops, reducing training wall-time 3× on NVIDIA A100',
          'Contributed 8 merged PRs to open-source ML framework, adding gradient-checkpointing for memory efficiency',
          'Implemented formal verification of security protocols in Coq, proving 14 invariants over state machines',
          'Mentored 40+ undergraduates in Data Structures, improving pass rate 18% over two semesters',
        ],
      },
    },
    {
      id: 'internship',
      title: 'Software Engineering Intern',
      company: 'Tech Corp',
      location: 'Chicago, IL',
      dates: 'May 2022 – Aug 2022',
      bullets: {
        genai: [
          'Migrated legacy Python 2 ETL pipeline to Python 3 + Airflow DAGs, eliminating 4 manual cron jobs',
          'Containerized 3 backend services with Docker Compose, enabling reproducible local dev for 8-person team',
          'Built internal Python SDK wrapping OpenAI API with retry logic, adopted by 3 product teams in 2 weeks',
          'Wrote Terraform modules for AWS ECS + RDS provisioning, reducing infra setup time from 2 days to 30 min',
        ],
        systems: [
          'Developed Go microservice for real-time event processing, handling 10k events/sec with <5ms p99 latency',
          'Migrated legacy Python 2 ETL pipeline to Python 3 + Airflow DAGs, eliminating 4 manual cron jobs',
          'Containerized 3 backend services with Docker Compose, enabling reproducible local dev for 8-person team',
          'Wrote Terraform modules for AWS ECS + RDS provisioning, reducing infra setup time from 2 days to 30 min',
        ],
        fullstack: [
          'Migrated legacy Python 2 ETL pipeline to Python 3 + Airflow DAGs, eliminating 4 manual cron jobs',
          'Containerized 3 backend services with Docker Compose, enabling reproducible local dev for 8-person team',
          'Built internal React component library, reducing front-end duplication across 5 internal dashboards',
          'Wrote Terraform modules for AWS ECS + RDS provisioning, reducing infra setup time from 2 days to 30 min',
        ],
        sre: [
          'Developed Go microservice for real-time event processing, handling 10k events/sec with <5ms p99 latency',
          'Containerized 3 backend services with Docker Compose, enabling reproducible local dev for 8-person team',
          'Wrote Terraform modules for AWS ECS + RDS provisioning, reducing infra setup time from 2 days to 30 min',
          'Configured Prometheus alerting for 3 services, cutting mean time to detection from 15 min to under 2 min',
        ],
      },
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
  skills: {
    genai: 'Python · FastAPI · TypeScript · LangChain · OpenAI API · React · Next.js · PostgreSQL · Docker · GitHub Actions',
    systems: 'Go · Python · TypeScript · Docker · Terraform · Ansible · AWS ECS · Prometheus · Grafana · PostgreSQL · Linux',
    fullstack: 'TypeScript · React · Next.js · Python · FastAPI · PostgreSQL · Redis · Docker · GitHub Actions · Tailwind CSS',
    sre: 'Go · Docker · Terraform · Ansible · Prometheus · Grafana · AWS ECS · GitHub Actions · Python · Linux · k8s',
  },
}, null, 2)

// 10 demo jobs in real Obsidian JD markdown format.
// parseJd + scoreJd derive all DB fields from these at seed time.
const DEMO_JOB_MARKDOWNS: Array<{ filePath: string; content: string }> = [
  {
    filePath: 'demo/keybank-devops-engineer-i.md',
    content: `---
created: 2025-01-15
title: DevOps Engineer I
Company: KeyBank
Action: 0-Saved
source: https://keybank.wd5.myworkdayjobs.com/en-US/Key_External_Site
description: Entry-level DevOps role at KeyBank managing CI/CD and containerized infrastructure
published: 2025-01-10
tags:
  - jobs
  - visa-kill
outreach: []
notes: ""
---

## Location
Brooklyn, OH — Hybrid (3 days on-site)

## Employment Type
Full-time

## About KeyBank
KeyBank is one of the nation's largest bank-based financial services companies, providing investment management, retail and commercial banking, consumer finance, and investment banking products and services to individuals and businesses.

## Responsibilities
- Build and maintain CI/CD pipelines using Harness.io and GitLab for application delivery
- Manage containerized workloads on Kubernetes and Docker environments across cloud and on-prem
- Support provisioning and configuration of infrastructure on GCP
- Partner with development teams to improve DevOps practices and release reliability
- Document runbooks and incident response procedures

## Requirements
- 1–3 years of experience in infrastructure or platform engineering
- Hands-on experience with Kubernetes, Docker, and CI/CD tooling
- Familiarity with GitLab and GCP preferred
- Strong Linux administration skills
- Must be a US citizen or green card holder — KeyBank does not provide employment visa sponsorship for non-US citizens

## Compensation
$75,000–$95,000 + bonus + benefits
`,
  },
  {
    filePath: 'demo/profound-software-engineer-new-grad.md',
    content: `---
created: 2025-01-20
title: Software Engineer, New Grad
Company: Profound
Action: 0-Saved
source: https://jobs.ashbyhq.com/profound
description: Full-stack new grad role at an early-stage AI startup
published: 2025-01-18
tags:
  - jobs
  - un-resume
outreach: []
notes: ""
---

## Location
San Francisco, CA — On-site

## Employment Type
Full-time

## About Profound
Profound is an early-stage AI startup building next-generation tools for knowledge workers. Small team, fast-moving, high ownership. We use AI to accelerate everything.

## Responsibilities
- Build full-stack web applications using React, TypeScript, and Node.js
- Design and ship product features end-to-end, from database schema to frontend component
- Collaborate on REST API design, backend services, and data modeling
- Write clean, well-tested code and contribute to code review culture

## Requirements
- CS degree or equivalent, graduating 2024–2025
- Proficiency in React, TypeScript, and full-stack web development
- Experience with Next.js, PostgreSQL, and REST APIs a plus
- Eagerness to own features and ship quickly with a small team

## Compensation
$140,000–$170,000 + equity

## Equal Opportunity Employer
Profound is an equal opportunity employer and considers all candidates authorized to work in the United States.
`,
  },
  {
    filePath: 'demo/us-bank-entry-level-ai-ml.md',
    content: `---
created: 2025-01-18
title: Entry-Level AI/ML Software Engineer
Company: U.S. Bank
Action: 0-Saved
source: https://careers.usbank.com/
description: Entry-level AI/ML role building and deploying ML models for financial use cases
published: 2025-01-15
tags:
  - jobs
  - un-resume
outreach: []
notes: ""
---

## Location
Hopkins, MN — Hybrid (2 days on-site)

## Employment Type
Full-time

## About U.S. Bank
U.S. Bank is the fifth-largest commercial bank in the United States, with over $680B in assets. We're making significant investments in machine learning and AI for fraud detection, credit risk, and personalization.

## Responsibilities
- Design and build machine learning models for fraud detection, credit risk assessment, and customer recommendations
- Write Python scripts for data preprocessing, feature engineering, and model evaluation
- Implement model training pipelines and collaborate on integrations with production systems
- Work with data scientists and ML engineers on model accuracy and validation
- Maintain documentation and contribute to team knowledge sharing

## Requirements
- B.S./M.S. in Computer Science, Statistics, or related field (2024–2025 grad)
- Proficiency in Python and at least one ML framework — PyTorch or TensorFlow
- Understanding of neural network architectures and model training workflows
- Experience with cloud platforms (AWS, GCP, or Azure) a plus
- Strong analytical skills and attention to data quality

## Compensation
$85,000–$110,000 + bonus and full benefits

## Equal Opportunity Employer
U.S. Bank is an equal opportunity employer and considers candidates authorized to work in the United States.
`,
  },
  {
    filePath: 'demo/euna-solutions-associate-ai-developer.md',
    content: `---
created: 2025-01-22
title: Associate AI Developer
Company: Euna Solutions
Action: 1-Applied
source: https://www.eunasolutions.com/careers
description: AI developer role building LLM features and RAG pipelines for govtech SaaS
published: 2025-01-20
tags:
  - jobs
  - resume-ed
outreach: []
notes: ""
---

## Location
Remote — US or Canada

## Employment Type
Full-time

## About Euna Solutions
Euna Solutions provides cloud-based procurement, budget, and grant management software for government agencies. We're expanding our AI capabilities and looking for engineers to build LLM-powered features across our product suite.

## Responsibilities
- Prototype and develop AI features using LLMs and prompt engineering best practices
- Build workflows with LangChain and OpenAI API for document analysis and summarization
- Implement RAG pipelines for document search, using embedding models for semantic retrieval
- Evaluate and iterate on prompt designs to improve accuracy and reliability of AI features
- Collaborate with product and backend teams to integrate AI capabilities into existing modules

## Requirements
- 1–2 years of experience with Python and LLM tooling
- Hands-on experience with LangChain, OpenAI API, or comparable frameworks
- Familiarity with prompt engineering and RAG pipeline design
- Understanding of embedding models and their role in semantic search
- Strong communication skills for cross-functional collaboration

## Compensation
$90,000–$115,000 + equity

## Equal Opportunity Employer
Euna Solutions is an equal opportunity employer and encourages applications from all qualified candidates.
`,
  },
  {
    filePath: 'demo/open-orion-backend-engineer.md',
    content: `---
created: 2025-01-25
title: Backend Engineer
Company: Open Orion
Action: 1-Applied
source: https://openorion.io/careers
description: Backend engineering role building scalable APIs and microservices for AI simulation platforms
published: 2025-01-22
tags:
  - jobs
  - resume-ed
outreach: []
notes: ""
---

## Location
Remote — United States

## Employment Type
Full-time

## About Open Orion
Open Orion Inc. builds backend infrastructure for AI simulation and robotics platforms. We're a small, fully distributed team focused on high-throughput backend systems.

## Responsibilities
- Design and implement REST APIs and GraphQL services using FastAPI and Python
- Build backend microservices for data ingestion, processing, and storage at scale
- Optimize API design for high-throughput workloads, including gRPC integrations between services
- Provision and maintain cloud infrastructure on AWS using Terraform and Docker
- Participate in on-call rotations and incident response for backend services

## Requirements
- 2+ years of backend engineering experience
- Proficiency in FastAPI, Flask, or similar Python frameworks
- Strong understanding of REST API design, microservices architecture, and backend systems
- Experience with gRPC, GraphQL, and API design patterns preferred
- Familiarity with PostgreSQL, Docker, and AWS deployment

## Compensation
$120,000–$155,000 + equity

## Equal Opportunity Employer
Open Orion is an equal opportunity employer and considers all candidates authorized to work in the US.
`,
  },
  {
    filePath: 'demo/wefunder-full-stack-product-engineer.md',
    content: `---
created: 2025-01-28
title: Full Stack Product Engineer
Company: Wefunder
Action: 1-Applied
source: https://wefunder.com/jobs
description: Full-stack engineer building product features on the largest equity crowdfunding platform
published: 2025-01-25
tags:
  - jobs
  - resume-ed
outreach: []
notes: ""
---

## Location
San Francisco, CA — On-site preferred, remote considered

## Employment Type
Full-time

## About Wefunder
Wefunder is the largest equity crowdfunding platform in the US, helping startups raise capital from their communities. We move fast, build in public, and ship 70%+ AI-generated code. Small team, big impact.

## Responsibilities
- Build full-stack web application features end-to-end: database schema, backend services, and React frontend
- Design and implement RESTful APIs and backend logic in Ruby on Rails and TypeScript
- Ship product features including matching engines, investment ledgers, and deal room workflows used by thousands of investors
- Write React and TypeScript components with a focus on clean UX, accessibility, and performance
- Collaborate directly with founders on product direction and full stack ownership decisions

## Requirements
- Experience with full-stack development using React, TypeScript, Node.js, or Ruby on Rails
- Comfort with full stack ownership: web application architecture, database modeling, and API development
- Familiarity with Next.js, PostgreSQL, or modern frontend frameworks preferred
- Ability to work at software engineer level: ship features, review code, debug production issues
- Visa sponsorship available for exceptional candidates

## Compensation
$160,000–$250,000 + significant equity
`,
  },
  {
    filePath: 'demo/coinbase-software-engineer-remote.md',
    content: `---
created: 2025-02-01
title: Software Engineer, Remote
Company: Coinbase
Action: 1-Applied
source: https://www.coinbase.com/careers
description: Backend engineering role building crypto trading infrastructure at Coinbase
published: 2025-01-28
tags:
  - jobs
  - resume-ed
outreach: []
notes: ""
---

## Location
Remote — United States

## Employment Type
Full-time

## About Coinbase
Coinbase is the leading US crypto exchange, serving 110M+ verified users. Our engineering teams build the backend infrastructure that moves billions of dollars in cryptocurrency daily.

## Responsibilities
- Build and maintain scalable backend microservices for crypto trading, custody, and settlement
- Design and implement REST APIs and backend systems using Go (Golang) and Python
- Work on distributed systems with strict latency and reliability requirements
- Contribute to API design and service architecture across backend teams
- Write tests and participate in on-call rotations for critical trading infrastructure

## Requirements
- 2+ years of backend engineering experience
- Proficiency in Go lang, Python, or similar strongly-typed backend languages
- Solid understanding of microservices, distributed systems, and REST API design
- Experience with gRPC, PostgreSQL, or AWS a plus

## Compensation
$147,600–$173,700 + equity + benefits

## Equal Opportunity Employer
Coinbase is committed to diversity and equal opportunity in employment.
`,
  },
  {
    filePath: 'demo/crusoe-energy-junior-infrastructure-engineer.md',
    content: `---
created: 2025-02-05
title: Junior Infrastructure Engineer, Lab
Company: Crusoe Energy
Action: 4-Offer
source: https://www.crusoeenergy.com/careers
description: Hands-on GPU infrastructure role deploying and maintaining AI compute clusters
published: 2025-02-01
tags:
  - jobs
  - resume-ed
outreach: []
notes: ""
---

## Location
Denver, CO — On-site

## Employment Type
Full-time

## About Crusoe Energy
Crusoe Energy deploys AI compute infrastructure powered by otherwise-stranded natural gas, reducing emissions while providing affordable GPU capacity for ML training workloads.

## Responsibilities
- Deploy, configure, and maintain GPU servers (NVIDIA A100, H200, GB200) for AI training workloads
- Manage containerized infrastructure using Docker and Kubernetes for workload orchestration
- Set up and maintain observability with Prometheus and Grafana dashboards for fleet health
- Write Terraform modules for automated provisioning and maintain CI/CD pipelines for infrastructure changes
- Perform hardware diagnostics, rack-and-stack operations, and network configuration for new deployments

## Requirements
- 1+ years of experience in infrastructure, lab ops, or DevOps engineering
- Hands-on experience with Docker, Kubernetes, Linux server administration
- Familiarity with Prometheus, Grafana, Terraform, and CI/CD tooling
- Interest in GPU compute, high-performance networking, and AI workload optimization

## Compensation
$112,000–$132,000 + RSUs + benefits

## Equal Opportunity Employer
Crusoe Energy is an equal opportunity employer.
`,
  },
  {
    filePath: 'demo/therapynotes-software-developer.md',
    content: `---
created: 2025-02-08
title: Software Developer
Company: TherapyNotes
Action: 3-Interview
source: https://www.therapynotes.com/careers
description: Full-stack developer role on a leading behavioral health EHR built in C# and React
published: 2025-02-04
tags:
  - jobs
  - resume-ed
outreach: []
notes: ""
---

## Location
Horsham, PA — Remote-friendly (occasional on-site)

## Employment Type
Full-time

## About TherapyNotes
TherapyNotes is the leading EHR and practice management software for behavioral health providers, serving 100,000+ clinicians. Our platform is built on ASP.NET Core (C#) with a React frontend.

## Responsibilities
- Develop and maintain features for the TherapyNotes EHR platform built on ASP.NET Core (dotnet) and C#
- Build and optimize REST APIs and backend services using .NET and C#
- Work on React and TypeScript frontend components integrated with the Entity Framework data layer
- Write unit and integration tests using xUnit and maintain code quality across a large codebase
- Collaborate with QA, product, and design on new feature development

## Requirements
- 2+ years of software development experience
- Proficiency in C# and .NET — ASP.NET Core strongly preferred
- Experience with Entity Framework, PostgreSQL or SQL Server, and REST API design
- React, TypeScript, or JavaScript frontend experience a plus

## Compensation
$90,000–$120,000 + benefits

## Equal Opportunity Employer
TherapyNotes is an equal opportunity employer and considers all candidates authorized to work in the US.
`,
  },
  {
    filePath: 'demo/bizflow-associate-software-engineer.md',
    content: `---
created: 2025-02-10
title: Associate Software Engineer (Full-Stack)
Company: BizFlow
Action: 5-Rejected
source: https://www.bizflow.com/careers
description: Entry-level full-stack role building workflow automation software for federal agencies
published: 2025-02-07
tags:
  - jobs
  - resume-ed
outreach: []
notes: ""
---

## Location
Falls Church, VA — Hybrid (3 days on-site)

## Employment Type
Full-time

## About BizFlow
BizFlow provides business process management (BPM) and workflow automation software to federal agencies and commercial clients. Our platform automates complex approval workflows and document routing at scale.

## Responsibilities
- Build and maintain full-stack web application features using React and TypeScript on the frontend
- Design and implement REST APIs and backend services in Java (Spring Boot) or Node.js
- Write SQL queries and manage relational database schemas in PostgreSQL
- Work with cross-functional teams on client-facing workflow automation features
- Participate in Agile ceremonies and contribute to sprint planning and code reviews

## Requirements
- 0–2 years of full-stack development experience (new grads welcome)
- Proficiency with React, TypeScript, and full stack web application development
- Backend experience with Java, Spring Boot, or Node.js
- Understanding of REST API design and relational databases

## Compensation
$75,000–$95,000 + benefits

## Equal Opportunity Employer
BizFlow is an equal opportunity employer.
`,
  },
]

async function deleteDemoUser(userId: string, db: Awaited<ReturnType<typeof getAdapter>>): Promise<void> {
  await db.run(`DELETE FROM outreach_items WHERE user_id = ?`, [userId])
  await db.run(`DELETE FROM chat_messages  WHERE user_id = ?`, [userId])
  // Delete outputs both by user_id AND by job_id — pre-multi-user DBs may have
  // user_id='default' on outputs that FK-reference jobs owned by this user.
  await db.run(`DELETE FROM jd_outputs WHERE job_id IN (SELECT id FROM jd_jobs WHERE user_id = ?)`, [userId])
  await db.run(`DELETE FROM jd_outputs WHERE user_id = ?`, [userId])
  await db.run(`DELETE FROM jd_metrics WHERE user_id = ?`, [userId])
  await db.run(`DELETE FROM jd_jobs    WHERE user_id = ?`, [userId])
  await db.run(`DELETE FROM resume_sessions            WHERE user_id = ?`, [userId])
  await db.run(`DELETE FROM resume_profiles            WHERE user_id = ?`, [userId])
  await db.run(`DELETE FROM user_settings              WHERE user_id = ?`, [userId])
  await db.run(`DELETE FROM ai_usage_log               WHERE user_id = ?`, [userId])
  await db.run(`DELETE FROM password_reset_tokens      WHERE user_id = ?`, [userId])
  await db.run(`DELETE FROM email_verification_tokens  WHERE user_id = ?`, [userId])
  await db.run(`DELETE FROM oauth_accounts             WHERE user_id = ?`, [userId])
  await db.run(`DELETE FROM users                      WHERE id      = ?`, [userId])
}

export async function cleanupExpiredDemoUsers(): Promise<{ purged: number }> {
  const db     = await getAdapter()
  const cutoff = new Date(Date.now() - DEMO_TTL_MS).toISOString()
  // Exclude the permanent static seed user ('demo-user') — it should never be purged.
  const expired = await db.query<{ id: string }>(
    `SELECT id FROM users WHERE is_demo = 1 AND id != 'demo-user' AND created_at < ?`,
    [cutoff],
  )
  for (const u of expired) await deleteDemoUser(u.id, db)
  return { purged: expired.length }
}

export async function seedDemoUser(userId: string): Promise<void> {
  const db = await getAdapter()

  // Lazy cleanup as a safety net — the cron route is the primary cleanup path
  await cleanupExpiredDemoUsers()

  // Seed profile
  const profileId = randomUUID()
  await db.run(
    `INSERT INTO resume_profiles (id, user_id, name, data, is_active) VALUES (?, ?, ?, ?, 1)`,
    [profileId, userId, 'Demo Profile — Alex Chen', DEMO_PROFILE_DATA],
  )

  // Default resume session — needed so /api/chat works without generating a resume first
  const defaultSessionId = `default:${userId}`
  await db.run(
    `INSERT OR IGNORE INTO resume_sessions (id, name, data, user_id) VALUES (?, ?, ?, ?)`,
    [defaultSessionId, 'Default', DEMO_PROFILE_DATA, userId],
  )

  const outputJobIds: Record<string, string> = {}
  for (const { filePath, content } of DEMO_JOB_MARKDOWNS) {
    const parsed = parseJd(filePath, content)
    const scored = scoreJd(parsed.raw_content)
    const jobId  = randomUUID()

    await db.run(
      `INSERT INTO jd_jobs
         (id, file_path, company, role_title, tags, visa_status, role_track, fit_pct,
          raw_content, action, clipped_at, apply_url, hidden, user_id, scanned_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, CURRENT_TIMESTAMP)`,
      [
        jobId,
        parsed.file_path,
        parsed.company,
        parsed.role_title,
        parsed.tags,
        parsed.visa_status || null,
        scored.role_track,
        scored.fit_pct,
        parsed.raw_content,
        parsed.action,
        parsed.clipped_at,
        parsed.apply_url,
        userId,
      ],
    )

    if (['Wefunder', 'Coinbase', 'Crusoe Energy'].includes(parsed.company)) {
      outputJobIds[parsed.company] = jobId
    }
  }

  // ── Fake outputs, cases, and outreach ──────────────────────────────────────

  if (outputJobIds['Wefunder']) {
    const jobId = outputJobIds['Wefunder']
    await db.run(
      `INSERT INTO jd_outputs
         (id, job_id, session_id, docx_path, pdf_path, variant, tagline,
          projects_used, work_ids_used, reasoning, cover_letter, user_id, built_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [
        randomUUID(), jobId, defaultSessionId,
        's3:demo/AlexChen_Wefunder_Resume.docx',
        's3:demo/AlexChen_Wefunder_Resume.pdf',
        'genai',
        'Full-Stack Engineer building product-first features with React and Python',
        JSON.stringify(['api_platform', 'llm_assistant', 'infra_dashboard']),
        JSON.stringify(['startup', 'university', 'internship']),
        `## Track\nGenAI / AI Engineer — strong keyword overlap on LLMs, agent tooling, and FastAPI.\n\n## Work Experience\nSelected genai variant across all three roles to emphasize Python, AI integration, and product delivery. Startup bullets highlight LLM pipeline work; Internship covers full-stack velocity.\n\n## Projects\nAPI Platform (FastAPI + React data product), LLM Code Assistant (LangChain + OpenAI agent pipeline), Homelab Infra Dashboard (self-managed infra with Prometheus/Grafana). Together they demonstrate end-to-end AI product delivery.\n\n## Tagline\n"Full-Stack Engineer building product-first features with React and Python" — scoped to Wefunder's stack signal (React, Python, data-driven product).\n\n## Skills\nLeading with Python · FastAPI · LangChain, followed by React · TypeScript · PostgreSQL, then Docker · GitHub Actions · AWS to match the infra signals in the JD.`,
        `Dear Wefunder Hiring Team,\n\nI'm excited to apply for the Full-Stack Engineer role at Wefunder. Your mission of democratizing startup investment aligns closely with my interest in building products that expand access to capital markets.\n\nIn my current role at Acme Startup, I built an LLM-powered analytics pipeline in Python and FastAPI that reduced reporting latency by 60% and served 200+ daily active investors. I also led a React dashboard migration that improved page load by 40%. These projects gave me direct experience with the data-intensive, product-first development culture I see in Wefunder's engineering blog.\n\nI'd love to bring this experience to Wefunder's platform team. Happy to discuss how my background fits your roadmap.\n\nBest,\nAlex Chen`,
        userId,
      ],
    )
    await db.run(
      `UPDATE jd_jobs SET application_case = ? WHERE id = ? AND user_id = ?`,
      [
        `## Company Overview\nWefunder is the leading equity crowdfunding platform, enabling retail investors to back early-stage startups. Raised $75M Series B in 2023. Engineering team of ~20, known for rapid product iteration.\n\n## Role Fit\n**Strengths**: FastAPI/React stack matches exactly. Prior LLM pipeline work maps to their data-science feature roadmap. Full-stack delivery cadence (2-week sprints) aligns with demonstrated velocity.\n**Watch-outs**: No prior fintech compliance experience — highlight audit-trail work in API Platform.\n\n## Outreach Angle\nReference their recent "Founder Stories" blog post series — shows genuine product empathy. Mention the API Platform case study as a concrete signal of product-first thinking.`,
        jobId, userId,
      ],
    )
    await db.run(
      `INSERT INTO outreach_items
         (id, job_id, user_id, kind, raw_markdown, role, notes,
          linkedin_draft, email_draft, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        randomUUID(), jobId, userId, 'person',
        `# Priya Sharma\n**Title**: Engineering Manager, Platform\n**Company**: Wefunder\n**LinkedIn**: linkedin.com/in/priyasharma-wefunder\n**Email**: priya@wefunder.com\n\nLeads the platform team. Previously at Stripe (Payments Infra). Posts regularly about API design and data quality.`,
        'Engineering Manager',
        'Spoke at a16z fintech summit 2024. Mentioned hiring senior full-stack in Q1.',
        `Hi Priya, I came across your talk at the a16z fintech summit and your post on idempotency in payment APIs — really thoughtful take. I'm applying for the Full-Stack Engineer role at Wefunder and would love to hear how the platform team thinks about API design at your scale. Would a 15-min chat work this week?`,
        `Subject: Full-Stack Engineer Application — Alex Chen\n\nHi Priya,\n\nI'm applying for the Full-Stack Engineer role at Wefunder. Your recent a16z talk on payment API design resonated with a challenge I solved at Acme Startup — rebuilding our webhook retry system to be fully idempotent.\n\nI've attached my resume and would love to chat about how my FastAPI + React background maps to your platform roadmap.\n\nBest,\nAlex Chen | alex.chen@example.com`,
        'not_contacted',
      ],
    )
  }

  if (outputJobIds['Coinbase']) {
    const jobId = outputJobIds['Coinbase']
    await db.run(
      `INSERT INTO outreach_items
         (id, job_id, user_id, kind, raw_markdown, role, notes,
          linkedin_draft, email_draft, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        randomUUID(), jobId, userId, 'person',
        `# Marcus Webb\n**Title**: Staff Engineer, Exchange Infrastructure\n**Company**: Coinbase\n**LinkedIn**: linkedin.com/in/marcuswebb\n**Email**: marcus@coinbase.com\n\nLeads the exchange matching engine team. Previously at Jane Street (HFT infra). Posts about distributed systems reliability and Go concurrency patterns.`,
        'Staff Engineer',
        'Author of Coinbase engineering blog post on Go goroutine leak detection.',
        `Hi Marcus, your post on goroutine leak detection in Go was exactly what I needed this week — bookmarked it immediately. I'm applying for the Backend Engineer role on your team and would love to hear how you approach latency tradeoffs in the matching engine. Would a quick call work?`,
        `Subject: Backend Engineer Application — Alex Chen\n\nHi Marcus,\n\nI'm applying for the Backend Engineer role on your Exchange Infrastructure team. Your recent post on goroutine leak detection resonated — I dealt with similar concurrency debugging building the API Platform's Go event bus handling 10k events/sec.\n\nI'd love to discuss how my distributed systems background maps to the matching engine challenges at Coinbase's scale.\n\nBest,\nAlex Chen | alex.chen@example.com`,
        'not_contacted',
      ],
    )
    await db.run(
      `INSERT INTO jd_outputs
         (id, job_id, session_id, docx_path, pdf_path, variant, tagline,
          projects_used, work_ids_used, reasoning, cover_letter, user_id, built_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [
        randomUUID(), jobId, defaultSessionId,
        's3:demo/AlexChen_Coinbase_Resume.docx',
        's3:demo/AlexChen_Coinbase_Resume.pdf',
        'systems',
        'Backend Engineer building distributed ledger services with Go and PostgreSQL',
        JSON.stringify(['infra_dashboard', 'api_platform', 'llm_assistant']),
        JSON.stringify(['startup', 'university', 'internship']),
        `## Track\nBackend / API Engineer (systems variant) — Coinbase JD emphasizes Go, distributed systems, and financial data integrity.\n\n## Work Experience\nSystems variant surfaces Go experience, concurrency patterns, and infrastructure ownership. Internship bullets highlight SLA ownership and incident response cadence.\n\n## Projects\nHomelab Infra Dashboard (Prometheus + k8s self-hosted cluster), API Platform (Go event bus, financial data integrity), LLM Code Assistant (real-time streaming API). Maps cleanly to Coinbase's backend scale story.\n\n## Tagline\nPositioned on distributed systems + financial data — the two pillars Coinbase engineering cares about most.\n\n## Skills\nGo · Python · PostgreSQL lead; Docker · Kubernetes · Terraform in second row to signal cloud-native maturity.`,
        `Dear Coinbase Engineering Team,\n\nI'm writing to express my interest in the Backend Engineer role on the Exchange Infrastructure team. Coinbase's commitment to building financial infrastructure for the open economy aligns with my background in high-reliability distributed systems.\n\nMy most relevant project is the API Platform — a Go event bus handling 10k events/sec with <5ms p99 latency using goroutines and channels. I also operate a 3-node Proxmox homelab running Kubernetes, Prometheus, and Grafana, which gave me practical experience with the observability patterns your SRE team uses at scale.\n\nI'd welcome the opportunity to discuss how my systems background fits Coinbase's infrastructure roadmap.\n\nBest regards,\nAlex Chen`,
        userId,
      ],
    )
    await db.run(
      `UPDATE jd_jobs SET application_case = ? WHERE id = ? AND user_id = ?`,
      [
        `## Company Overview\nCoinbase is the leading US crypto exchange (~$200B+ annual volume). Engineering org of ~1,000. Backend team owns the exchange matching engine, custody APIs, and financial reporting pipeline.\n\n## Role Fit\n**Strengths**: Go experience in Startup role (10k events/sec event bus); financial data integrity demonstrated in API Platform. Homelab infra maps to their k8s-heavy backend.\n**Watch-outs**: No prior crypto/blockchain domain experience — frame as "financial systems" angle instead.\n\n## Outreach Angle\nCoinbase engineers blog heavily on reliability and incident culture. Reference a specific post — shows genuine engineering curiosity beyond the crypto hype.`,
        jobId, userId,
      ],
    )
  }

  if (outputJobIds['Crusoe Energy']) {
    const jobId = outputJobIds['Crusoe Energy']
    await db.run(
      `INSERT INTO outreach_items
         (id, job_id, user_id, kind, raw_markdown, role, notes,
          linkedin_draft, email_draft, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        randomUUID(), jobId, userId, 'person',
        `# Anya Petrova\n**Title**: ML Platform Lead\n**Company**: Crusoe Energy\n**LinkedIn**: linkedin.com/in/anyapetrova-crusoe\n**Email**: anya@crusoe.ai\n\nOwns the GPU cluster orchestration and MLOps tooling. Previously at Lambda Labs. Speaks at ML infrastructure conferences.`,
        'ML Platform Lead',
        'Co-authored Crusoe whitepaper on flare gas → GPU compute pipeline.',
        `Hi Anya, I read the Crusoe whitepaper on flare gas utilization for GPU compute — the infrastructure architecture section was fascinating. I'm applying for the ML Engineer role and would love to hear how your team manages memory bandwidth constraints at cluster scale. Quick chat this week?`,
        `Subject: ML Engineer Application — Alex Chen\n\nHi Anya,\n\nI'm applying for the ML Engineer role at Crusoe. Your work on sustainable GPU infrastructure genuinely excites me — I built a Core ML rep-counting model for my iOS Fitness Tracker that runs fully on-device, which gave me hands-on experience with the memory bandwidth constraints of real-time inference.\n\nI'd love to discuss how that experience maps to Crusoe's cluster orchestration challenges.\n\nBest,\nAlex Chen | alex.chen@example.com`,
        'not_contacted',
      ],
    )
    await db.run(
      `INSERT INTO jd_outputs
         (id, job_id, session_id, docx_path, pdf_path, variant, tagline,
          projects_used, work_ids_used, reasoning, cover_letter, user_id, built_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [
        randomUUID(), jobId, defaultSessionId,
        's3:demo/AlexChen_Crusoe_Resume.docx',
        's3:demo/AlexChen_Crusoe_Resume.pdf',
        'genai',
        'ML Engineer deploying GPU-accelerated workloads on cloud infrastructure',
        JSON.stringify(['mobile_app', 'llm_assistant', 'api_platform']),
        JSON.stringify(['startup', 'university', 'internship']),
        `## Track\nML Engineer — Crusoe builds climate-friendly cloud GPU infrastructure for AI training.\n\n## Work Experience\nGenAI variant emphasizes Python, PyTorch experience. University research bullets highlight ML training pipelines and model evaluation.\n\n## Projects\niOS Fitness Tracker (Core ML on-device inference, accelerometer model), LLM Code Assistant (PyTorch-adjacent: embedding models, RAG pipeline), API Platform (data pipeline, model serving). Demonstrates end-to-end ML from training to deployment.\n\n## Tagline\n"ML Engineer deploying GPU-accelerated workloads" — maps to Crusoe's core value proposition of sustainable GPU compute.\n\n## Skills\nPython · PyTorch · CUDA lead; FastAPI · Docker · GitHub Actions second row; Prometheus · Grafana for MLOps observability.`,
        `Dear Crusoe Energy Team,\n\nI'm applying for the ML Engineer role at Crusoe. Your mission of repurposing stranded energy for sustainable compute resonates deeply — I've followed your work on flare gas utilization since your Series B announcement.\n\nMy most relevant project is the iOS Fitness Tracker: I trained a Core ML model for rep counting from accelerometer data, which required me to reason about memory bandwidth and on-device inference tradeoffs directly. The University research role adds PyTorch DQN training and CUDA kernel work on NVIDIA hardware.\n\nI'd love to discuss how my ML background aligns with Crusoe's compute platform roadmap.\n\nBest,\nAlex Chen`,
        userId,
      ],
    )
    await db.run(
      `UPDATE jd_jobs SET application_case = ? WHERE id = ? AND user_id = ?`,
      [
        `## Company Overview\nCrusoe Energy repurposes otherwise-wasted energy (flare gas, excess renewable) to power GPU compute clusters for AI training. Series C ($500M), 200+ employees. Engineering team owns the cluster orchestration, GPU scheduling, and customer-facing MLOps tooling.\n\n## Role Fit\n**Strengths**: PyTorch + Core ML hands-on experience; Homelab Infra Dashboard k8s background maps to cluster ops; on-device inference experience is differentiating.\n**Watch-outs**: No prior cloud provider experience at scale — emphasize adaptability and infra-from-scratch mindset.\n\n## Outreach Angle\nCrusoe's CTO posts on sustainable AI infrastructure. Reference the flare gas → compute whitepaper — shows you understand the business thesis, not just the tech stack.`,
        jobId, userId,
      ],
    )
  }
}
