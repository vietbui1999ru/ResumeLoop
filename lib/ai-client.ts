import 'server-only'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createOpenAI }    from '@ai-sdk/openai'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import type { LanguageModel } from 'ai'
import Anthropic from '@anthropic-ai/sdk'
import { getActiveConfig, getProviderConfig, type Provider } from './user-settings'

const NO_KEY_MSG = 'No AI provider configured. Go to Settings → AI to add an API key.'

// Returns a Vercel AI SDK model — use with generateText / streamText
export async function getModel(userId = 'default'): Promise<LanguageModel> {
  const cfg = await getActiveConfig(userId)
  if (!cfg) throw new Error(NO_KEY_MSG)
  return buildModel(cfg.provider, cfg.apiKey, cfg.model, cfg.baseUrl)
}

// Returns an Anthropic SDK client — used by the chat route until it migrates to streamText
export async function getAnthropicClient(userId = 'default'): Promise<Anthropic> {
  const cfg = await getProviderConfig(userId, 'anthropic')
  if (!cfg) throw new Error('No Anthropic API key configured. Go to Settings → AI → Anthropic.')
  return new Anthropic({ apiKey: cfg.apiKey })
}

// Check whether the active provider is Anthropic (chat route needs this guard)
export async function activeProviderIsAnthropic(userId = 'default'): Promise<boolean> {
  const cfg = await getActiveConfig(userId)
  return cfg?.provider === 'anthropic'
}

export function buildModel(
  provider: Provider,
  apiKey: string,
  model: string,
  baseUrl?: string,
): LanguageModel {
  switch (provider) {
    case 'anthropic':
      return createAnthropic({ apiKey })(model)
    case 'openai':
      return createOpenAI({ apiKey })(model)
    case 'google':
      return createGoogleGenerativeAI({ apiKey })(model)
    case 'groq':
      return createOpenAI({ apiKey, baseURL: 'https://api.groq.com/openai/v1' })(model)
    case 'openrouter':
      return createOpenAI({ apiKey, baseURL: 'https://openrouter.ai/api/v1' })(model)
    case 'ollama':
      return createOpenAI({ apiKey: 'ollama', baseURL: baseUrl ?? 'http://localhost:11434/v1' })(model)
    default:
      throw new Error(`Unknown provider: ${provider}`)
  }
}
