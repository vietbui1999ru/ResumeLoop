import SignUpForm from './SignUpForm'

export const dynamic = 'force-dynamic'

export default function SignUpPage() {
  const oauthProviders = [
    ...(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET ? ['github' as const] : []),
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET ? ['google' as const] : []),
  ]
  return <SignUpForm oauthProviders={oauthProviders} />
}
