const {build, T, TL} = require('./buildv2');

build({
  file: 'Test_Role_Generic',

  tagline: TL('Full-Stack SWE building distributed systems with Go and Python'),

  work: [
    {
      id: 'startup',
      title: 'Software Engineer',
      company: 'Acme Startup',
      location: 'San Francisco, CA (Remote)',
      dates: 'Jan 2024 – Present',
      bullets: [
        T('Built LLM-powered doc pipeline using LangChain + OpenAI, cutting manual review time 70%'),
        T('Automated CI/CD with GitHub Actions + Docker, reducing deploy time from 45 min to 8 min'),
        T('Designed PostgreSQL schema for multi-tenant SaaS product, onboarding 12 enterprise customers'),
        T('Shipped React dashboard with real-time WebSocket updates, increasing user engagement 28%'),
        T('Wrote integration test suite (pytest + Testcontainers) covering 87% of API surface'),
      ],
    },
    {
      id: 'university',
      title: 'Research Assistant / Teaching Assistant',
      company: 'State University',
      location: 'Dayton, OH',
      dates: 'Aug 2022 – Dec 2023',
      bullets: [
        T('Published ML research on adversarial robustness of RL agents at IEEE KSE 2024 as 2nd author'),
        T('Built PyTorch DQN agent solving custom maze environments, achieving 94% success rate'),
        T('Implemented data preprocessing pipeline in Python + NumPy, reducing training noise 31%'),
        T('Mentored 40+ undergraduates in Data Structures, improving pass rate 18% over two semesters'),
        T('Contributed 8 merged PRs to open-source ML framework, adding gradient-checkpointing'),
      ],
    },
    {
      id: 'internship',
      title: 'Software Engineering Intern',
      company: 'Tech Corp',
      location: 'Chicago, IL',
      dates: 'May 2022 – Aug 2022',
      bullets: [
        T('Migrated legacy Python 2 ETL pipeline to Python 3 + Airflow DAGs, eliminating 4 manual cron jobs'),
        T('Containerized 3 backend services with Docker Compose, enabling reproducible local dev for 8-person team'),
        T('Built internal Python SDK wrapping OpenAI API with retry logic, adopted by 3 product teams'),
        T('Wrote Terraform modules for AWS ECS + RDS provisioning, reducing infra setup time from 2 days to 30 min'),
        T('Developed Go microservice for real-time event processing, handling 10k events/sec with <5ms p99'),
      ],
    },
  ],

  projects: [
    {
      id: 'api_platform',
      name: 'API Platform',
      url: 'github.com/example-user/api-platform',
      stack: 'FastAPI · React · PostgreSQL · Docker',
      date: 'Jan 2025',
      bullets: [
        T('Built multi-tenant REST API with FastAPI, JWT auth, and role-based access control for 3 permission tiers'),
        T('Deployed on AWS ECS with Terraform IaC, achieving 99.9% uptime over 90-day production window'),
        T('Implemented React admin dashboard with Recharts analytics for self-serve PM usage metrics'),
      ],
    },
    {
      id: 'llm_assistant',
      name: 'LLM Code Assistant',
      url: 'github.com/example-user/llm-assistant',
      stack: 'TypeScript · LangChain · Next.js · OpenAI',
      date: 'Nov 2024',
      bullets: [
        T('Engineered RAG pipeline with LangChain + pgvector, reducing hallucination rate 62% on queries'),
        T('Built streaming Next.js frontend with real-time token rendering, cutting perceived latency 1.8s'),
        T('Added tool-use layer allowing agent to query live APIs for up-to-date external data answers'),
      ],
    },
    {
      id: 'infra_dashboard',
      name: 'Homelab Infra Dashboard',
      url: 'github.com/example-user/homelab',
      stack: 'Prometheus · Grafana · Terraform · Ansible',
      date: 'Sep 2024',
      bullets: [
        T('Provisioned 3-node Proxmox cluster with Terraform + Ansible, hosting 12 self-managed services'),
        T('Built Grafana alerting stack with 18 custom dashboards, catching 2 disk failures before data loss'),
        T('Configured WireGuard VPN + VLAN segmentation, isolating IoT devices from primary network'),
      ],
    },
  ],

  skills: [
    'Languages: Python · Go · TypeScript · Ruby · Bash · SQL · Rust',
    'Backend: FastAPI · PostgreSQL · Redis · REST · gRPC · Docker · Kubernetes',
    'Systems: Linux · goroutines · channels · multithreaded design · IEEE 802.3',
    'DevOps: GitHub Actions · GitLab CI/CD · Terraform · Ansible · Prometheus · Grafana',
    'Tools: Git · Proxmox · Neovim · tmux · Obsidian · Claude Code',
  ],
});
