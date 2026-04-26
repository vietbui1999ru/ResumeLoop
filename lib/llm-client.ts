import OpenAI from 'openai'

let _client: OpenAI | null = null

export function getLlmClient(): OpenAI {
  if (!_client) {
    _client = new OpenAI({
      baseURL: process.env.LITELLM_URL ?? 'http://localhost:4000',
      apiKey: 'not-needed',
    })
  }
  return _client
}
