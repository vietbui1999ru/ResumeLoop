export const PIPELINE_TAGS = [
  { key: 'applied',      label: 'Applied',      dot: 'bg-amber-400',  pill: 'bg-amber-500/15 text-amber-400 border-amber-500/30'    },
  { key: 'phone-screen', label: 'Phone Screen',  dot: 'bg-indigo-400', pill: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30' },
  { key: 'interviewed',  label: 'Interviewed',   dot: 'bg-orange-400', pill: 'bg-orange-500/15 text-orange-400 border-orange-500/30' },
  { key: 'offer',        label: 'Offer',         dot: 'bg-green-400',  pill: 'bg-green-500/15 text-green-400 border-green-500/30'    },
  { key: 'rejected',     label: 'Rejected',      dot: 'bg-red-400',    pill: 'bg-red-500/15 text-red-400 border-red-500/30'          },
  { key: 'ghosted',      label: 'Ghosted',       dot: 'bg-zinc-500',   pill: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30'       },
] as const

export type PipelineTagKey = typeof PIPELINE_TAGS[number]['key']
export const PIPELINE_TAG_KEYS = PIPELINE_TAGS.map(t => t.key) as PipelineTagKey[]
