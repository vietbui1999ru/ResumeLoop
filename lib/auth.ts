import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import GitHub from 'next-auth/providers/github'
import Google from 'next-auth/providers/google'
import { randomUUID } from 'crypto'
import { getAdapter } from './db-adapter'
import { authConfig } from './auth.config'
import { validateCredentials, type UserRow } from './auth-credentials'
import { seedDemoUser } from './demo-seed'

declare module 'next-auth' {
  interface Session {
    user: { id: string; email: string; isDemo: boolean }
  }
  interface User {
    id: string
    email: string
    isDemo: boolean
  }
}


export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user, account, profile }) {
      if (account?.type !== 'oauth') return true

      const email = user.email?.toLowerCase()
      if (!email) return false

      // Reject OAuth accounts where the provider explicitly marks email as unverified.
      // GitHub always provides verified emails; Google exposes email_verified.
      const emailVerified = (profile as Record<string, unknown> | undefined)?.email_verified
      if (emailVerified === false) return false

      const db = await getAdapter()

      // Check for existing OAuth account link
      const existing = await db.queryOne<{ user_id: string }>(
        `SELECT user_id FROM oauth_accounts WHERE provider = ? AND provider_account_id = ?`,
        [account.provider, account.providerAccountId],
      )
      if (existing) {
        user.id = existing.user_id
        return true
      }

      // Look up user by email (may already exist via credentials or another provider)
      let dbUser = await db.queryOne<{ id: string; is_demo: number }>(
        `SELECT id, is_demo FROM users WHERE email = ?`,
        [email],
      )
      if (!dbUser) {
        const newId = randomUUID()
        await db.run(
          `INSERT INTO users (id, email, password, email_verified) VALUES (?, ?, ?, 1)`,
          [newId, email, '', 1],
        )
        dbUser = { id: newId, is_demo: 0 }
        // Seed onboarding data so new users see a populated dashboard immediately.
        // Fire-and-forget — a seed failure must not block sign-in.
        seedDemoUser(newId).catch(() => {})
      }

      // Record the OAuth account → user mapping
      await db.run(
        `INSERT INTO oauth_accounts (id, user_id, provider, provider_account_id) VALUES (?, ?, ?, ?)`,
        [randomUUID(), dbUser.id, account.provider, account.providerAccountId],
      )

      user.id = dbUser.id
      ;(user as { isDemo?: boolean }).isDemo = dbUser.is_demo === 1
      return true
    },
  },
  providers: [
    ...(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET
      ? [GitHub({ clientId: process.env.GITHUB_CLIENT_ID, clientSecret: process.env.GITHUB_CLIENT_SECRET })]
      : []),
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [Google({ clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET })]
      : []),
    Credentials({
      credentials: {
        email:    { label: 'Email',    type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const email    = (credentials?.email    as string | undefined)?.trim().toLowerCase()
        const password = (credentials?.password as string | undefined) ?? ''
        if (!email || !password) return null

        const db = await getAdapter()
        const row = await db.queryOne<UserRow>(
          `SELECT id, email, password, is_demo, email_verified, deleted_at FROM users WHERE email = ?`,
          [email],
        )

        return validateCredentials(email, password, row)
      },
    }),
  ],
})
