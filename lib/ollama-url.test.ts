import { describe, it, expect } from 'vitest'
import { validateOllamaUrl } from './ollama-url'

describe('validateOllamaUrl — SSRF guard', () => {
  // ── Allowed: loopback ─────────────────────────────────────────────────────
  it('allows localhost', () => {
    expect(validateOllamaUrl('http://localhost:11434/v1')).toBe('http://localhost:11434/v1')
  })

  it('allows 127.0.0.1', () => {
    expect(validateOllamaUrl('http://127.0.0.1:11434')).toBe('http://127.0.0.1:11434')
  })

  it('allows IPv6 loopback ::1', () => {
    expect(validateOllamaUrl('http://[::1]:11434')).toBe('http://[::1]:11434')
  })

  // ── Allowed: RFC-1918 private ranges ─────────────────────────────────────
  it('allows 192.168.x.x', () => {
    expect(validateOllamaUrl('http://192.168.1.100:11434')).toBeTruthy()
  })

  it('allows 10.x.x.x', () => {
    expect(validateOllamaUrl('http://10.0.0.5:11434')).toBeTruthy()
  })

  it('allows 172.16–31.x.x', () => {
    expect(validateOllamaUrl('http://172.16.0.1:11434')).toBeTruthy()
    expect(validateOllamaUrl('http://172.31.255.255:11434')).toBeTruthy()
  })

  it('rejects 172.15.x (not in RFC-1918 range)', () => {
    expect(validateOllamaUrl('http://172.15.0.1:11434')).toBeNull()
  })

  // ── Blocked: cloud metadata ───────────────────────────────────────────────
  it('rejects AWS IMDS 169.254.169.254', () => {
    expect(validateOllamaUrl('http://169.254.169.254')).toBeNull()
  })

  it('rejects ECS task metadata 169.254.170.2', () => {
    expect(validateOllamaUrl('http://169.254.170.2')).toBeNull()
  })

  it('rejects metadata.google.internal', () => {
    expect(validateOllamaUrl('http://metadata.google.internal')).toBeNull()
  })

  it('rejects Alibaba Cloud 100.100.100.200', () => {
    expect(validateOllamaUrl('http://100.100.100.200')).toBeNull()
  })

  // ── Blocked: public IPs and hostnames ─────────────────────────────────────
  it('rejects public IP 8.8.8.8', () => {
    expect(validateOllamaUrl('http://8.8.8.8:11434')).toBeNull()
  })

  it('rejects public hostname example.com', () => {
    expect(validateOllamaUrl('http://example.com:11434')).toBeNull()
  })

  // ── Blocked: IPv6 bypass vectors ─────────────────────────────────────────
  it('rejects IPv6 link-local fe80::', () => {
    expect(validateOllamaUrl('http://[fe80::1]:11434')).toBeNull()
  })

  it('rejects IPv4-mapped IPv6 ::ffff:', () => {
    expect(validateOllamaUrl('http://[::ffff:169.254.169.254]:11434')).toBeNull()
  })

  // ── Input validation ──────────────────────────────────────────────────────
  it('rejects non-HTTP protocol', () => {
    expect(validateOllamaUrl('ftp://localhost:11434')).toBeNull()
  })

  it('rejects empty string', () => {
    expect(validateOllamaUrl('')).toBeNull()
  })

  it('rejects malformed URL', () => {
    expect(validateOllamaUrl('not-a-url')).toBeNull()
  })

  it('rejects URLs over 200 chars', () => {
    expect(validateOllamaUrl('http://localhost/' + 'a'.repeat(200))).toBeNull()
  })

  // ── Port restriction ──────────────────────────────────────────────────────
  it('allows port 11434', () => {
    expect(validateOllamaUrl('http://localhost:11434/v1')).toBeTruthy()
  })

  it('allows no explicit port for loopback (loopback has no VPC scanning risk)', () => {
    expect(validateOllamaUrl('http://localhost/v1')).toBeTruthy()
  })

  it('rejects non-loopback with no port — implicit port 80 is not Ollama', () => {
    expect(validateOllamaUrl('http://192.168.1.5/v1')).toBeNull()
  })

  it('rejects non-Ollama port 8080 — prevents VPC port scanning', () => {
    expect(validateOllamaUrl('http://10.0.0.5:8080')).toBeNull()
  })

  it('rejects port 80', () => {
    expect(validateOllamaUrl('http://192.168.1.5:80')).toBeNull()
  })

  it('rejects port 6379 (Redis)', () => {
    expect(validateOllamaUrl('http://10.0.0.1:6379')).toBeNull()
  })
})
