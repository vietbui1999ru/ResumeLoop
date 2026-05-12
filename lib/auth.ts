import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import GitHub from 'next-auth/providers/github'
import Google from 'next-auth/providers/google'
import bcrypt from 'bcryptjs'
import { randomUUID } from 'crypto'
import { getAdapter } from './db-adapter'
import { authConfig } from './auth.config'

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

// Pre-computed once at startup — ensures bcrypt.compare() takes the same time
// whether or not a user exists, preventing email enumeration via timing.
const DUMMY_HASH = bcrypt.hashSync('__timing_guard__', 10)

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user, account }) {
      if (account?.type !== 'oauth') return true

      const email = user.email?.toLowerCase()
      if (!email) return false

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
    GitHub({
      clientId:     process.env.GITHUB_CLIENT_ID     ?? '',
      clientSecret: process.env.GITHUB_CLIENT_SECRET ?? '',
    }),
    Google({
      clientId:     process.env.GOOGLE_CLIENT_ID     ?? '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    }),
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
        const row = await db.queryOne<{ id: string; email: string; password: string; is_demo: number }>(
          `SELECT id, email, password, is_demo FROM users WHERE email = ?`,
          [email],
        )

        // Always run bcrypt.compare to prevent timing-based email enumeration
        const ok = await bcrypt.compare(password, row?.password ?? DUMMY_HASH)
        if (!row || !ok) return null

        return { id: row.id, email: row.email, isDemo: row.is_demo === 1 }
      },
    }),
  ],
})
