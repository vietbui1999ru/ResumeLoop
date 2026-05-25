/**
 * Validates an Ollama base_url for SSRF safety.
 * Only loopback and RFC-1918 private-network addresses are allowed.
 * Returns the URL string if valid, null if rejected.
 */

import { OLLAMA_DEFAULT_PORT } from './config'

const BLOCKED_HOSTS = new Set([
  '169.254.169.254',        // AWS EC2 / Azure IMDS
  '169.254.170.2',          // AWS ECS task metadata
  '100.100.100.200',        // Alibaba Cloud metadata
  'metadata.google.internal',
  'metadata.internal',
])

// Ollama's default port. Only this port (or no explicit port) is allowed.
const ALLOWED_PORT = OLLAMA_DEFAULT_PORT

export function validateOllamaUrl(raw: string): string | null {
  if (!raw || raw.length > 200) return null
  let u: URL
  try { u = new URL(raw) } catch { return null }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null

  // WHATWG URL spec wraps IPv6 hostnames in brackets — strip them for pattern matching
  let host = u.hostname.toLowerCase()
  if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1)

  // Block IPv6 link-local and IPv4-mapped bypass vectors
  if (/^fe80:/i.test(host) || /^::ffff:/i.test(host)) return null

  if (BLOCKED_HOSTS.has(host)) return null
  if (host.includes('169.254.') || host.includes('100.100.')) return null

  // Allow only loopback + RFC-1918 private ranges
  const isLoopback = host === 'localhost' || /^127\./.test(host) || /^::1$/.test(host)

  if (!isLoopback) {
    // Non-loopback must specify port 11434 explicitly — prevents VPC port scanning.
    // WHATWG URL normalizes default-scheme ports (80, 443) to ''; require explicit 11434.
    if (u.port !== ALLOWED_PORT) return null
  }

  if (isLoopback)                                             return raw
  if (/^192\.168\./.test(host))                               return raw  // 192.168.0.0/16
  if (/^10\./.test(host))                                     return raw  // 10.0.0.0/8
  if (/^172\.(1[6-9]|2[0-9]|3[01])\./.test(host))           return raw  // 172.16.0.0/12

  return null  // reject all other hosts (public IPs, external hostnames)
}
