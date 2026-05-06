const {build, T, TL} = require('./buildv2');

build({
  file: 'Test_Invalid_VietBui',

  // VIOLATION 1: tagline 80c (over 76)
  tagline: TL('Full-Stack Software Engineer building distributed systems with Go, Python, and Rust'),

  work: [
    {
      id: 'gitlab',
      bullets: [
        // VIOLATION 2: bullet 120c (over 116)
        T('Contributed to GitLab CE in Ruby; shipped bug fixes reviewed and merged by senior platform engineers on the core team'),
        T('Automated infrastructure provisioning with Ansible and Terraform for reproducible deployment workflows'),
        T('Configured GitLab CI/CD pipelines with lint, test, and deploy stages for automated quality gating'),
        T('Collaborated with senior engineers through code review cycles, iterating on Ruby implementations'),
        T('Built Git automation scripts for batch repository operations and CI/CD integration on open-source projects'),
      ],
    },
    {
      id: 'carboncopies',
      bullets: [
        T('Implemented async Python services for distributed simulation pipelines handling concurrent state transitions'),
        T('Deployed Docker and GitHub Actions CI/CD, cutting simulation release cycles from 2 hours to 30 minutes'),
        T('Developed monitoring tooling tracking 50+ system health metrics across distributed simulation clusters'),
        T('Diagnosed and resolved failures in distributed systems by tracing logs and isolating root causes'),
        T('Wrote runbooks for 3 distributed simulation systems; reduced onboarding time and improved handoffs'),
      ],
    },
    {
      id: 'udayton',
      bullets: [
        T('Engineered Coq framework for Program Graph safety proofs; detected integer overflow and injection attacks'),
        T('Co-authored IEEE KSE 2024 paper on adversarial RL robustness; entropy-based detection at 97%+ accuracy'),
        T('Scripted Python and TypeScript tooling for data processing, automation, and multi-system state management'),
        // VIOLATION 3: only 3 bullets for udayton instead of 5 (DOCX para count becomes ~41, not 44)
      ],
    },
  ],

  projects: [
    {
      id: 'zmk',
      bullets: [
        T('Shipped ZMK firmware on nRF52840 in C/Devicetree; implemented BLE HID keymaps with combos and layers'),
        T('Integrated GitHub Actions CI/CD pipeline for automated ZMK firmware builds across keyboard configurations'),
        T('Validated BLE HID descriptor compliance and keymap correctness across 40+ layout combinations'),
      ],
    },
    {
      id: 'jetson',
      bullets: [
        T('Built real-time object detection pipeline on NVIDIA Jetson using Python and CUDA-accelerated inference'),
        T('Optimized MIPI CSI-2 camera pipeline reducing frame capture latency by 40% through buffer tuning'),
        T('Deployed FastAPI inference server on Jetson with REST endpoints for real-time classification results'),
      ],
    },
    {
      id: 'homelab',
      bullets: [
        T('Provisioned Proxmox homelab with 6 LXC containers; automated config with Ansible playbooks and roles'),
        T('Deployed Prometheus and Grafana monitoring stack tracking CPU, memory, and disk across all containers'),
        T('Configured Nginx reverse proxy with TLS termination and DNS-based routing for 5 self-hosted services'),
      ],
    },
  ],

  // VIOLATION 4: only 4 skills rows (need 5)
  skills: [
    'Languages: Python · Go · TypeScript · Ruby · Bash · SQL',
    'Backend: FastAPI · PostgreSQL · Redis · REST · gRPC · Docker',
    'Systems: Linux · goroutines · channels · multithreaded design',
    'DevOps: GitHub Actions · GitLab CI/CD · Terraform · Ansible',
  ],
});
