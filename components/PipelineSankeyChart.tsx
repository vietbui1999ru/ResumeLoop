'use client'
import { Sankey, Tooltip, ResponsiveContainer, Layer, Rectangle } from 'recharts'

export interface PipelineData {
  scraped: number
  visa_kill: number
  pending: number
  resume_built: number
  applied: number
  interviewed: number
  rejected: number
  offer: number
}

const NODE_COLORS: Record<string, string> = {
  Scraped:        '#6366f1',
  'Visa Kill':    '#f43f5e',
  Proceed:        '#818cf8',
  Pending:        '#71717a',
  'Resume Built': '#3b82f6',
  Other:          '#52525b',
  Applied:        '#06b6d4',
  Interviewed:    '#a855f7',
  'No Response':  '#52525b',
  Rejected:       '#ef4444',
  Offer:          '#22c55e',
}

function buildSankeyData(p: PipelineData) {
  const proceed = p.scraped - p.visa_kill
  const untracked = Math.max(0, proceed - p.pending - p.resume_built)
  const no_response = p.applied > 0
    ? Math.max(0, p.applied - p.interviewed - p.rejected)
    : 0

  const nodes: { name: string }[] = []
  const links: { source: number; target: number; value: number }[] = []

  const add = (name: string) => { nodes.push({ name }); return nodes.length - 1 }
  const link = (s: number, t: number, v: number) => { if (v > 0) links.push({ source: s, target: t, value: v }) }

  const nScraped  = add('Scraped')
  const nVisaKill = add('Visa Kill')
  const nProceed  = add('Proceed')
  const nPending  = add('Pending')
  const nBuilt    = add('Resume Built')

  link(nScraped, nVisaKill, p.visa_kill)
  link(nScraped, nProceed, proceed)
  link(nProceed, nPending, p.pending)
  link(nProceed, nBuilt, p.resume_built)

  if (untracked > 0) {
    const nOther = add('Other')
    link(nProceed, nOther, untracked)
  }

  if (p.applied > 0) {
    const nApplied = add('Applied')
    link(nBuilt, nApplied, p.applied)

    if (p.interviewed > 0) {
      const nInterviewed = add('Interviewed')
      link(nApplied, nInterviewed, p.interviewed)

      if (p.offer > 0) {
        const nOffer = add('Offer')
        link(nInterviewed, nOffer, p.offer)
      }
      if (p.rejected > 0) {
        const nRejected = add('Rejected')
        link(nInterviewed, nRejected, p.rejected)
      }
    }
    if (no_response > 0) {
      const nNoResp = add('No Response')
      link(nApplied, nNoResp, no_response)
    }
  }

  return { nodes, links }
}

function SankeyNode(props: {
  x?: number; y?: number; width?: number; height?: number
  payload?: { name?: string; value?: number }
  containerWidth?: number
}) {
  const { x = 0, y = 0, width = 0, height = 0, payload, containerWidth = 600 } = props
  const name = payload?.name ?? ''
  const value = payload?.value ?? 0
  const color = NODE_COLORS[name] ?? '#6366f1'
  const isRight = x + width > containerWidth * 0.65

  return (
    <Layer>
      <Rectangle x={x} y={y} width={width} height={height} fill={color} fillOpacity={0.9} radius={2} />
      <text
        x={isRight ? x - 6 : x + width + 6}
        y={y + height / 2}
        textAnchor={isRight ? 'end' : 'start'}
        fill="#d4d4d8"
        fontSize={11}
        dominantBaseline="middle"
      >
        {name} ({value})
      </text>
    </Layer>
  )
}

function SankeyTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload?: { source?: { name?: string }; target?: { name?: string }; value?: number } }> }) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  if (!d) return null
  return (
    <div style={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 6, padding: '6px 10px', fontSize: 12, color: '#e4e4e7' }}>
      {d.source?.name} → {d.target?.name}
      <span style={{ marginLeft: 8, color: '#818cf8', fontFamily: 'monospace' }}>{d.value}</span>
    </div>
  )
}

export function PipelineSankeyChart({ data }: { data: PipelineData }) {
  const sankeyData = buildSankeyData(data)
  if (sankeyData.links.length === 0) return null

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      <h2 className="text-sm font-medium text-zinc-300 mb-4">Application Pipeline</h2>
      <ResponsiveContainer width="100%" height={280}>
        <Sankey
          data={sankeyData}
          node={<SankeyNode />}
          nodePadding={16}
          nodeWidth={14}
          margin={{ top: 8, right: 140, bottom: 8, left: 140 }}
          link={{ stroke: '#3f3f46', fill: '#3f3f46', fillOpacity: 0.5 }}
        >
          <Tooltip content={<SankeyTooltip />} />
        </Sankey>
      </ResponsiveContainer>
      <p className="text-xs text-zinc-600 mt-2">
        Tag jobs with <code className="text-zinc-500">applied</code> · <code className="text-zinc-500">interviewed</code> · <code className="text-zinc-500">rejected</code> · <code className="text-zinc-500">offer</code> to fill downstream stages.
      </p>
    </div>
  )
}
