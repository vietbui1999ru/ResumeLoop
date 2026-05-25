import { FIT_THRESHOLDS } from '@/lib/tokens'

export const ACTION_COLORS: Record<string, string> = {
  '0-Saved':        'text-text-secondary',
  '1-Applied':      'text-amber-400',
  '2-Phone Screen': 'text-indigo-400',
  '3-Interview':    'text-orange-400',
  '4-Offer':        'text-green-400',
  '5-Rejected':     'text-red-400',
  '6-Ghosted':      'text-text-muted',
}

export function clipColor(iso: string | null): string {
  if (!iso) return 'text-text-secondary'
  const days = (Date.now() - new Date(iso).getTime()) / 86_400_000
  if (days <= 3) return 'text-green-400'
  if (days <= 7) return 'text-amber-400'
  return 'text-text-muted'
}

export function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
}

export function FitBadge({ pct }: { pct: number }) {
  if (pct >= FIT_THRESHOLDS.green) return (
    <span className="rounded-full px-2 py-0.5 text-xs font-medium bg-green-500/10 text-green-400">{pct}%</span>
  )
  if (pct >= FIT_THRESHOLDS.amber) return (
    <span className="rounded-full px-2 py-0.5 text-xs font-medium bg-amber-500/10 text-amber-400">{pct}%</span>
  )
  return (
    <span className="rounded-full px-2 py-0.5 text-xs font-medium bg-surface-raised text-text-muted">{pct}%</span>
  )
}
