export interface FitScore {
  role_track: string
  fit_pct: number
}

const TRACK_KEYWORDS: Record<string, string[]> = {
  'iOS':               ['swiftui', 'swift', 'swiftdata', 'xcode', 'ios', 'uikit', 'cocoa', 'core data', 'watchos', 'macos', 'apple platform', 'app store', 'combine', 'avfoundation'],
  'AI/LLM/Agents':    ['llm', 'agent', 'langchain', 'openai', 'claude', 'prompt', 'rag', 'vector', 'embedding', 'fine-tuning', 'ai engineer', 'gpt', 'mcp', 'retrieval'],
  'SRE/DevOps':       ['kubernetes', 'k8s', 'prometheus', 'grafana', 'terraform', 'ansible', 'ci/cd', 'sre', 'devops', 'observability', 'alertmanager', 'pagerduty', 'docker'],
  'Backend/API':      ['rest api', 'graphql', 'fastapi', 'flask', 'express', 'microservices', 'grpc', 'api design', 'backend', 'golang', 'go lang'],
  'Software Engineer':['software engineer', 'full stack', 'full-stack', 'web application', 'react', 'next.js', 'typescript', 'node.js'],
  'Data Engineer':    ['data pipeline', 'etl', 'bigquery', 'spark', 'dbt', 'airflow', 'data warehouse', 'snowflake', 'kafka'],
  'Data Analyst':     ['sql', 'tableau', 'power bi', 'analytics', 'data analysis', 'dashboard', 'metrics', 'kpi', 'looker', 'business intelligence'],
  'ML Engineer':      ['machine learning', 'pytorch', 'tensorflow', 'model training', 'neural network', 'cuda', 'mlops', 'model deployment', 'inference'],
  'Embedded/Systems': ['embedded', 'rtos', 'firmware', 'uart', 'spi', 'i2c', 'arm', 'cortex', 'fpga', 'bare metal', 'devicetree', 'ble'],
  'Network Engineer': ['networking', 'bgp', 'ospf', 'vlan', 'cisco', 'tcp/ip', 'routing', 'switching', 'firewall', 'ieee 802'],
  'Security':         ['security', 'penetration testing', 'soc', 'siem', 'vulnerability', 'compliance', 'owasp', 'zero trust', 'iam', 'cryptography'],
  'QA/Testing':       ['qa', 'quality assurance', 'test automation', 'selenium', 'pytest', 'jest', 'cypress', 'load testing', 'regression'],
  'IT/Helpdesk':      ['help desk', 'helpdesk', 'it support', 'desktop support', 'active directory', 'ticketing', 'hardware', 'troubleshoot'],
  'Cloud':            ['aws', 'azure', 'gcp', 'cloud architect', 'lambda', 'ec2', 's3', 'serverless', 'iac'],
  'Rust/Systems':     ['rust', 'tokio', 'systems programming', 'memory safety', 'ownership', 'borrow checker', 'low-level'],
  '.NET/C#':          ['c#', '.net', 'asp.net', 'blazor', 'entity framework', 'wpf', 'dotnet'],
}

const DENOMINATOR = 8 // 8 keyword matches → 100% fit

export function scoreJd(jdText: string): FitScore {
  const lower = jdText.toLowerCase()
  let bestTrack = 'Software Engineer'
  let bestCount = 0

  for (const [track, keywords] of Object.entries(TRACK_KEYWORDS)) {
    const count = keywords.filter(kw => lower.includes(kw)).length
    if (count > bestCount) { bestCount = count; bestTrack = track }
  }

  return {
    role_track: bestTrack,
    fit_pct: Math.min(100, Math.round((bestCount / DENOMINATOR) * 100)),
  }
}
