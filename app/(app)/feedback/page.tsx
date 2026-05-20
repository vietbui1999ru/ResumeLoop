import { GiscusWidget } from '@/components/GiscusWidget'

export default function FeedbackPage() {
  return (
    <div data-testid="feedback-page" className="max-w-2xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">Feedback</h1>
        <p className="text-sm text-text-secondary mt-1">
          Leave a comment, report a bug, or request a feature. Comments are powered by GitHub
          Discussions — a GitHub account is required to post.
        </p>
      </div>

      <GiscusWidget />
    </div>
  )
}
