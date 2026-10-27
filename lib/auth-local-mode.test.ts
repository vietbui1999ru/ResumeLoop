import { describe, it, expect, vi, beforeEach } from 'vitest'

// vi.mock factories are hoisted above imports — anything they reference must
// go through vi.hoisted() or vitest throws "Cannot access before initialization".
const { mockNextAuthAuth } = vi.hoisted(() => ({ mockNextAuthAuth: vi.fn() }))

vi.mock('next-auth', () => ({
  default: vi.fn(() => ({
    handlers: {},
    auth: mockNextAuthAuth,
    signIn: vi.fn(),
    signOut: vi.fn(),
  })),
}))

vi.mock('./app-mode', () => ({ isAuthRequired: vi.fn() }))

describe('auth() local-mode wrapper', () => {
  beforeEach(() => {
    vi.resetModules()
    mockNextAuthAuth.mockReset()
    mockNextAuthAuth.mockResolvedValue({
      user: { id: 'real-user-id', email: 'real@example.com', isDemo: false },
      expires: '2030-01-01T00:00:00.000Z',
    })
  })

  it('returns a synthetic default session when auth is not required, without calling NextAuth', async () => {
    const { isAuthRequired } = await import('./app-mode')
    vi.mocked(isAuthRequired).mockReturnValue(false)

    const { auth } = await import('./auth')
    const session = await auth()

    expect(session?.user.id).toBe('default')
    expect(session?.user.isDemo).toBe(false)
    expect(mockNextAuthAuth).not.toHaveBeenCalled()
  })

  it('delegates to real NextAuth when isAuthRequired() is true', async () => {
    const { isAuthRequired } = await import('./app-mode')
    vi.mocked(isAuthRequired).mockReturnValue(true)

    const { auth } = await import('./auth')
    const session = await auth()

    expect(mockNextAuthAuth).toHaveBeenCalledTimes(1)
    expect(session?.user.id).toBe('real-user-id')
  })
})
