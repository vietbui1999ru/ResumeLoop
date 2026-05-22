---
title: "AI Provider Configuration"
description: "How to configure each supported AI provider in ResumeLoop — API keys, models, Ollama setup, and security notes."
tags: [reference, settings, ai, ollama]
updated: 2026-05-11
---

# AI Provider Configuration

ResumeLoop supports six LLM providers. One provider is active at a time and is used for all AI operations: resume reasoning (`ai-reason` pipeline stage), cover letter generation, and Chat.

> **Note:** The Chat feature currently requires **Anthropic** to be set as the active provider. Other providers work for generation and cover letters but not for Chat.

Configure providers at **Settings → AI Provider**.

---

## Anthropic (Claude)

**Default model:** `claude-sonnet-4-6`

**API key location:** [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys)

**Key format:** Must start with `sk-ant-`

**Notes:** Required for the Chat feature. Claude Sonnet models offer the best quality for resume reasoning due to structured output support. Claude Haiku is faster and cheaper if quality trade-offs are acceptable. **Note:** The Chat feature uses a separate hardcoded model configuration independent of this setting.

---

## OpenAI (GPT)

**Default model:** `gpt-4o-mini`

**API key location:** [platform.openai.com/api-keys](https://platform.openai.com/api-keys)

**Key format:** Must start with `sk-` but not `sk-ant-` or `sk-or-`

**Notes:** `gpt-4o-mini` is cost-effective for reasoning tasks. Use `gpt-4o` for higher quality. Chat is not supported with OpenAI as the active provider.

---

## Google (Gemini)

**Default model:** `gemini-2.5-flash`

**API key location:** [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)

**Key format:** Must start with `AIza`

**Notes:** Gemini 2.5 Flash is the recommended default. Flash models balance speed and quality well for structured resume selection tasks.

---

## Groq (Llama / Mixtral)

**Default model:** `llama-3.3-70b-versatile`

**API key location:** [console.groq.com/keys](https://console.groq.com/keys)

**Key format:** Must start with `gsk_`

**Notes:** Groq inference is significantly faster than cloud providers due to custom LPU hardware. Llama 3.3 70B is capable for resume reasoning. Useful for high-volume batch generation where latency matters.

---

## OpenRouter (all providers)

**Default model:** `anthropic/claude-3-haiku`

**API key location:** [openrouter.ai/keys](https://openrouter.ai/keys)

**Key format:** Must start with `sk-or-`

**Notes:** OpenRouter routes to many upstream providers from a single key. You can specify any model available on OpenRouter using the `provider/model` format (e.g., `google/gemini-flash-1.5`, `meta-llama/llama-3.1-70b-instruct`). Useful for accessing models that are not directly available or for cost comparison across providers.

---

## Ollama (local)

**Default model:** `gemma4:e2b`

**API key:** None required

**Base URL default:** `http://localhost:11434/v1`

Ollama runs models locally on your machine. No API key is needed; instead you configure a base URL pointing to a running Ollama server.

### Installation and setup

1. Install Ollama from [ollama.com](https://ollama.com).

2. Start the server:

   ```
   ollama serve
   ```

   The server listens on port 11434 by default.

3. Pull a model:

   ```
   ollama pull gemma4:e2b
   ```

   Other models that work well for resume reasoning:
   - `llama3.2:3b` — smaller, faster, lower quality
   - `llama3.1:8b` — good balance of speed and quality
   - `mistral:7b` — capable for structured JSON output tasks
   - `gemma4:e2b` — default; solid reasoning performance

4. In ResumeLoop Settings, select **Ollama (local)** as the provider, enter the base URL, and click **Fetch models** to discover available models automatically.

### Supported base URLs

The base URL must point to a local or private-network address. The following are accepted:

| Address type | Example |
|---|---|
| Localhost | `http://localhost:11434/v1` |
| Loopback (127.x.x.x) | `http://127.0.0.1:11434/v1` |
| IPv6 loopback | `http://[::1]:11434/v1` |
| LAN IP (192.168.x.x) | `http://192.168.1.100:11434/v1` |
| Private range (10.x.x.x) | `http://10.0.0.5:11434/v1` |
| Private range (172.16–31.x.x) | `http://172.16.0.10:11434/v1` |
| Docker internal | `http://host.docker.internal:11434/v1` |

> Docker deployments: use `http://host.docker.internal:11434/v1` to reach Ollama running on the Docker host.

Public IPs and external hostnames are not allowed (see SSRF restrictions below).

### Model discovery

After entering a base URL, click **Fetch models** to query the Ollama server's `/api/tags` endpoint and populate a dropdown of installed models. The model field is updated to the first available model if the current value is not in the list.

### Recommended models for this app

Resume reasoning involves structured JSON output (the `resume_decision` tool call). Models that follow tool-call schemas reliably work better:

- **gemma4:e2b** — default; good structured output support
- **llama3.1:8b** — reliable tool use, good size/quality tradeoff
- **mistral:7b** — capable structured output, widely available

Smaller models (under 3B parameters) may produce malformed tool call responses and cause `ai-reason` stage failures.

---

## Security notes

### API key storage

Keys are encrypted at rest using AES-256 before being written to the database. The encryption key is derived from the `ENCRYPTION_KEY` environment variable.

After a key is saved, the API never returns the full key value. The Settings page displays only a key hint: the first 16 characters followed by `••••••••••••••••`.

### Live key verification

When you click **Test & Save**, the app makes a one-token request to the provider to verify the key is valid and the model name is correct. The key is only saved if the test succeeds. Error messages distinguish between authentication failures, model-not-found errors, and connection failures.

### Rate limiting

The settings endpoint (`POST /api/settings/ai`) is rate-limited to 10 attempts per IP per minute. Exceeding this returns HTTP 429.

### Key format validation

Keys are validated against provider-specific prefixes before being sent to the provider:

| Provider | Required prefix |
|---|---|
| Anthropic | `sk-ant-` |
| OpenAI | `sk-` (not `sk-ant-` or `sk-or-`) |
| Google | `AIza` |
| Groq | `gsk_` |
| OpenRouter | `sk-or-` |
| Ollama | (no key required) |

Keys shorter than 20 characters are also rejected regardless of prefix.

### SSRF protection for Ollama

The Ollama base URL is validated server-side before use. Only loopback addresses and RFC-1918 private ranges are permitted. The following cloud metadata endpoints are explicitly blocked:

- `169.254.169.254` (AWS EC2 / Azure IMDS)
- `169.254.170.2` (AWS ECS metadata)
- `100.100.100.200` (Alibaba Cloud metadata)
- `metadata.google.internal`
- `metadata.internal`

Any URL resolving to a public IP or external hostname is rejected with HTTP 400.
