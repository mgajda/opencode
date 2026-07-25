# Gemini API Setup

## Authentication methods

### 1. API Key (free tier)

Get a key from [Google AI Studio](https://aistudio.google.com/apikey).
No credit card required.

opencode accepts the key via any of these env vars (checked in order):

```
GOOGLE_API_KEY
GOOGLE_GENERATIVE_AI_API_KEY
GEMINI_API_KEY
```

Or set it in `opencode.json`:

```json
{ "provider": { "google": { "options": { "apiKey": "AIza..." } } } }
```

**Free tier limits**: 250 req/day, 5-15 RPM, 250K TPM.
Docs: https://ai.google.dev/gemini-api/docs/rate-limits

### 2. API Key + Cloud billing (pay-as-you-go, Tier 1)

Enable billing on the Cloud project that owns the API key at
https://console.cloud.google.com/billing — no minimum spend, pay per token.

**Tier 1 limits**: 1K-1.5K req/day, 150-300 RPM, 1-2M TPM.
Pricing: https://ai.google.dev/gemini-api/docs/pricing

Higher tiers (2/3) unlock at $250/$1K cumulative spend.

### 3. OAuth with Google account (AI Pro / AI Ultra subscription)

The code supports OAuth via Application Default Credentials (ADC):

```bash
gcloud auth application-default login
```

The `google-auth-library` reads credentials from:
- `GOOGLE_APPLICATION_CREDENTIALS` env var (service account key path)
- `gcloud` default credentials
- GCE metadata server

**With AI Pro ($19.99/mo)**: 1,500 req/day via OAuth
**With AI Ultra ($99.99/mo)**: 2,000 req/day via OAuth
Plans: https://one.google.com/about/google-ai-plans/

**Google AI Plus ($4.99/mo)** does NOT increase API limits — it only boosts
the Gemini app and AI Studio web interface.

## Summary

| Method | Daily limit | RPM | Cost |
|--------|-------------|-----|------|
| API key (free) | 250 | 5-15 | Free |
| API key (Tier 1) | 1K-1.5K | 150-300 | Pay per token |
| OAuth + AI Pro | 1,500 | — | $19.99/mo |
| OAuth + AI Ultra | 2,000 | — | $99.99/mo |

## Retry behaviour

The native LLM path retries 4 times with exponential backoff (500ms base,
60s cap). The AI SDK path uses `maxRetries` from the caller (default 0,
prompts pass 2). Both respect the server's `Retry-After` header.
