import SignInForm from './SignInForm'

export default function SignInPage() {
  const isCloud = process.env.APP_MODE === 'cloud'
  return <SignInForm showDemoHint={!isCloud} />
}
