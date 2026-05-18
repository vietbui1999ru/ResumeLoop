import SignInForm from './SignInForm'

export const dynamic = 'force-dynamic'

export default function SignInPage() {
  const isCloud = process.env.APP_MODE === 'cloud'
  const oauthProviders = [
    ...(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET ? ['github' as const] : []),
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET ? ['google' as const] : []),
  ]
  return <SignInForm showDemoHint={!isCloud} oauthProviders={oauthProviders} />
}
