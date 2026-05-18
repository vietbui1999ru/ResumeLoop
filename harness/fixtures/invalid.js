const {build, T, TL} = require('./buildv2');

build({
  file: 'Test_Invalid_Generic',

  // VIOLATION 1: tagline 83c (limit: 76)
  tagline: TL('Full-Stack Software Engineer building distributed systems with Go, Python, and Rust'),

  work: [
    {
      id: 'startup',
      title: 'Software Engineer',
      company: 'Acme Startup',
      location: 'San Francisco, CA (Remote)',
      dates: 'Jan 2024 – Present',
      bullets: [
        // VIOLATION 2: bullet 117c (limit: 116)
        T('Built LLM-powered doc processing pipeline using LangChain + OpenAI API, cutting manual review time by seventy percent'),
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
      ],
    },
    {
      id: 'internship',
      title: 'Software Engineering Intern',
      company: 'Tech Corp',
      location: 'Chicago, IL',
      dates: 'May 2022 – Aug 2022',
      bullets: [
        // VIOLATION 3: only 1 bullet per job — avgWork=1, paraCount=34 < minPara=37
        T('Migrated legacy Python 2 ETL pipeline to Python 3 + Airflow DAGs, eliminating 4 manual cron jobs'),
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

  // VIOLATION 4: empty skills array (need 1–8)
  skills: [],
});
