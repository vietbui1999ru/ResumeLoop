// Auth pages don't use the app shell (no sidebar, no providers)
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
