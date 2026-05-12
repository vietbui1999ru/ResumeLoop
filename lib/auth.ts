import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
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

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
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
        if (!row) return null

        const ok = await bcrypt.compare(password, row.password)
        if (!ok) return null

        return { id: row.id, email: row.email, isDemo: row.is_demo === 1 }
      },
    }),
  ],
})
