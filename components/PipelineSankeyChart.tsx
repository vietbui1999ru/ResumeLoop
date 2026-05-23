'use client'
import { useRef, useState } from 'react'
import { Sankey, Tooltip, ResponsiveContainer, Layer, Rectangle } from 'recharts'
import { CHART_COLORS, SURFACE_COLORS, BORDER_COLORS, SEMANTIC_COLORS } from '@/lib/tokens'

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
  Scraped:        CHART_COLORS.scraped,
  'Visa Kill':    CHART_COLORS.visaKill,
  Proceed:        CHART_COLORS.proceed,
  Pending:        CHART_COLORS.pending,
  'Resume Built': CHART_COLORS.resumeBuilt,
  Other:          CHART_COLORS.other,
  Applied:        CHART_COLORS.applied,
  Interviewed:    CHART_COLORS.interviewed,
  'No Response':  CHART_COLORS.other,
  Rejected:       CHART_COLORS.rejected,
  Offer:          CHART_COLORS.offer,
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
  const color = NODE_COLORS[name] ?? CHART_COLORS.scraped
  const isRight = x + width > containerWidth * 0.65

  return (
    <Layer>
      <Rectangle x={x} y={y} width={width} height={height} fill={color} fillOpacity={0.9} radius={2} />
      <text
        x={isRight ? x - 6 : x + width + 6}
        y={y + height / 2}
        textAnchor={isRight ? 'end' : 'start'}
        fill="#d4d4d8"
        fontSize={13}
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
    <div style={{ background: SURFACE_COLORS.card, border: `1px solid ${BORDER_COLORS.default}`, borderRadius: 6, padding: '6px 10px', fontSize: 14, color: '#e4e4e7' }}>
      {d.source?.name} → {d.target?.name}
      <span style={{ marginLeft: 8, color: SEMANTIC_COLORS.accentLight, fontFamily: 'monospace' }}>{d.value}</span>
    </div>
  )
}

type ExportFormat = 'png' | 'jpg' | 'pdf'

async function exportCard(el: HTMLElement, format: ExportFormat) {
  const html2canvas = (await import('html2canvas')).default
  const canvas = await html2canvas(el, { backgroundColor: SURFACE_COLORS.card, scale: 2, useCORS: true })

  if (format === 'png') {
    const a = document.createElement('a')
    a.download = 'application-pipeline.png'
    a.href = canvas.toDataURL('image/png')
    a.click()
  } else if (format === 'jpg') {
    const a = document.createElement('a')
    a.download = 'application-pipeline.jpg'
    a.href = canvas.toDataURL('image/jpeg', 0.95)
    a.click()
  } else {
    const { jsPDF } = await import('jspdf')
    const w = canvas.width / 2
    const h = canvas.height / 2
    const pdf = new jsPDF({ orientation: w > h ? 'landscape' : 'portrait', unit: 'px', format: [w, h] })
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, w, h)
    pdf.save('application-pipeline.pdf')
  }
}

export function PipelineSankeyChart({ data }: { data: PipelineData }) {
  const sankeyData = buildSankeyData(data)
  const cardRef    = useRef<HTMLDivElement>(null)
  const [menuOpen, setMenuOpen]   = useState(false)
  const [exporting, setExporting] = useState(false)

  if (sankeyData.links.length === 0) return null

  const handleExport = async (format: ExportFormat) => {
    if (!cardRef.current) return
    setMenuOpen(false)
    setExporting(true)
    try {
      await exportCard(cardRef.current, format)
    } catch { /* ignore */ } finally {
      setExporting(false)
    }
  }

  return (
    <div ref={cardRef} className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-medium text-zinc-300">Application Pipeline</h2>

        <div className="relative">
          <button
            onClick={() => setMenuOpen(v => !v)}
            disabled={exporting}
            className="text-xs px-2.5 py-1 rounded border border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 transition-colors disabled:opacity-40"
          >
            {exporting ? 'Exporting…' : 'Export ▾'}
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 z-10 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl overflow-hidden min-w-[100px]">
              {(['png', 'jpg', 'pdf'] as ExportFormat[]).map(fmt => (
                <button
                  key={fmt}
                  onClick={() => void handleExport(fmt)}
                  className="w-full text-left text-xs px-3 py-2 text-zinc-300 hover:bg-zinc-700 uppercase tracking-wide font-mono"
                >
                  {fmt}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={280}>
        <Sankey
          data={sankeyData}
          node={<SankeyNode />}
          nodePadding={16}
          nodeWidth={14}
          margin={{ top: 8, right: 140, bottom: 8, left: 140 }}
          link={{ stroke: BORDER_COLORS.default, fill: BORDER_COLORS.default, fillOpacity: 0.5 }}
        >
          <Tooltip content={<SankeyTooltip />} />
        </Sankey>
      </ResponsiveContainer>

      <p className="text-xs text-zinc-400 mt-2">
        Tag jobs with{' '}
        <code className="text-amber-400">applied</code>{' · '}
        <code className="text-indigo-400">phone-screen</code>{' · '}
        <code className="text-orange-400">interviewed</code>{' · '}
        <code className="text-green-400">offer</code>{' · '}
        <code className="text-red-400">rejected</code>{' · '}
        <code className="text-zinc-500">ghosted</code>
        {' '}to fill downstream stages.
      </p>
    </div>
  )
}
