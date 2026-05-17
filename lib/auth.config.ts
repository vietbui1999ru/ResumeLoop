import type { NextAuthConfig } from 'next-auth'

// Edge-safe auth config — no DB imports, no native modules.
// Used by middleware.ts (Edge Runtime).
// The full auth.ts adds the Credentials provider on top of this.

export const authConfig: NextAuthConfig = {
  pages: {
    signIn: '/auth/signin',
  },
  trustHost: true,
  session: { strategy: 'jwt', maxAge: 15 * 60 },
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id     = user.id
        token.isDemo = (user as { isDemo: boolean }).isDemo
      }
      return token
    },
    session({ session, token }) {
      session.user.id     = token.id as string
      session.user.isDemo = token.isDemo as boolean
      return session
    },
  },
  providers: [], // Credentials provider added in auth.ts (Node.js only)
}
