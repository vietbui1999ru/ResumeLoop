export function isCloud(): boolean {
  return process.env.APP_MODE === 'cloud'
}
