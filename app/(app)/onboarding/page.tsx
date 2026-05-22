'use client'
import { useState }        from 'react'
import { useRouter }       from 'next/navigation'
import { SourceBoard }     from '@/components/onboarding/SourceBoard'
import { ProfileReview }   from '@/components/onboarding/ProfileReview'
import type { MergeResult, SparseProfile } from '@/lib/ingest/types'

type Step = 'sources' | 'review'

export default function OnboardingPage() {
  const router = useRouter()
  const [step,        setStep]   = useState<Step>('sources')
  const [mergeResult, setMerge]  = useState<MergeResult | null>(null)
  const [saving,      setSaving] = useState(false)
  const [saveErr,     setSaveErr] = useState<string | null>(null)

  const handleMergeComplete = (result: MergeResult) => {
    setMerge(result); setStep('review')
  }

  const handleAccept = async (profile: SparseProfile) => {
    setSaving(true); setSaveErr(null)
    try {
      const res = await fetch('/api/profiles', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ name: 'My Profile', data: JSON.stringify(profile) }),
      })
      if (!res.ok) {
        const d = await res.json() as { error?: string }
        throw new Error(d.error ?? 'Failed to save profile')
      }
      const { id } = await res.json() as { id: string }

      // Fire-and-forget: generate candidate_profile from the newly saved profile
      void fetch('/api/profile/candidate-profile', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ profileId: id }),
      }).catch(() => { /* non-critical */ })

      router.replace('/config')
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : String(e))
      setSaving(false)
    }
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-2xl mx-auto px-4 py-12 space-y-8">
        <div>
          <h1 className="text-2xl font-semibold">Set up your profile</h1>
          <p className="mt-1 text-sm text-zinc-400">
            {step === 'sources'
              ? 'Add sources — a URL, GitHub, or any text. We extract the info and build your profile.'
              : 'Review the extracted profile. Edit anything inline, then accept.'}
          </p>
        </div>
        {saveErr && <p className="text-sm text-red-400">{saveErr}</p>}
        {step === 'sources' && <SourceBoard onMergeComplete={handleMergeComplete} />}
        {step === 'review' && mergeResult && (
          <ProfileReview
            profile={mergeResult.profile}
            conflicts={mergeResult.conflicts}
            onAccept={handleAccept}
            onBack={() => setStep('sources')}
            saving={saving}
          />
        )}
      </div>
    </main>
  )
}
