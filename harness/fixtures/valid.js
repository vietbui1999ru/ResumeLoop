const {build, T, TL} = require('./buildv2');

build({
  file: 'Test_Role_VietBui',

  tagline: TL('Full-Stack SWE building distributed systems with Go and Python'),

  work: [
    {
      id: 'gitlab',
      bullets: [
        T('Contributed to GitLab CE in Ruby; shipped bug fixes reviewed and merged by senior platform engineers'),
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
        T('Diagnosed and resolved failures in distributed systems by tracing logs, isolating root causes, shipping fixes'),
        T('Wrote runbooks for 3 distributed simulation systems; reduced onboarding time and improved cross-team handoffs'),
      ],
    },
    {
      id: 'udayton',
      bullets: [
        T('Engineered Coq framework for Program Graph safety proofs; detected integer overflow and injection attacks'),
        T('Co-authored IEEE KSE 2024 paper on adversarial RL robustness; entropy-based detection at 97%+ accuracy'),
        T('Scripted Python and TypeScript tooling for data processing, automation, and multi-system state management'),
        T('Designed and executed test suites for research systems; analyzed failure modes and iterated on fixes'),
        T('Authored technical documentation for 3 systems; presented research to cross-functional teams of 100+'),
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

  skills: [
    'Languages: Python · Go · TypeScript · Ruby · Bash · SQL · Rust',
    'Backend: FastAPI · PostgreSQL · Redis · REST · gRPC · Docker · Kubernetes',
    'Systems: Linux · goroutines · channels · multithreaded design · IEEE 802.3',
    'DevOps: GitHub Actions · GitLab CI/CD · Terraform · Ansible · Prometheus · Grafana',
    'Tools: Git · Proxmox · Neovim · tmux · Obsidian · Claude Code',
  ],
});
