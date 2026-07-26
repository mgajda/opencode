# Gemini API Setup

## Authentication methods

### 1. API Key (free tier)

Get a key from [Google AI Studio](https://aistudio.google.com/apikey).
No credit card required.

opencode accepts the key via any of these env vars (checked in order):

```
GEMINI_API_KEY
GOOGLE_GENERATIVE_AI_API_KEY
GOOGLE_API_KEY
```

Or set it in `opencode.json`:

```json
{ "provider": { "gemini": { "options": { "apiKey": "AIza..." } } } }
```

Free tier rate limits: https://ai.google.dev/gemini-api/docs/rate-limits

### 2. API Key + Cloud billing (pay-as-you-go)

Enable billing on the Cloud project that owns the API key at
https://console.cloud.google.com/billing — no minimum spend, pay per token.

Higher tiers unlock at higher cumulative spending.
Pricing: https://ai.google.dev/gemini-api/docs/pricing

### 3. Higher rate limits: Cloud billing (recommended)

The Gemini Developer API at `generativelanguage.googleapis.com` does
not support OAuth — it only accepts API keys (`x-goog-api-key` header).
The only working path to higher rate limits is enabling Cloud billing on
the project that owns your API key.

**Google AI Plus/Pro/Ultra** subscriptions boost the Gemini app and AI
Studio web interface, but do not affect Gemini API key rate limits.

**`gcloud auth application-default login`** authenticates to Vertex AI,
not the Gemini Developer API.

## Retry behaviour

The native LLM path retries 4 times with exponential backoff (500ms base,
60s cap). The AI SDK path uses `maxRetries` from the caller (default 0,
prompts pass 2). Both respect the server's `Retry-After` header.

## Compliance notes

- From **June 19, 2026**, unrestricted standard keys are rejected. Keys
  must have explicit restrictions set in
  [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
  or [AI Studio](https://aistudio.google.com/apikey).
- By **September 2026**, standard `AIza`-prefixed keys are deprecated.
  New keys use the `AQ.` prefix ("auth keys") — they work identically
  when sent as the `x-goog-api-key` header.
- See the [API key migration guide](https://ai.google.dev/gemini-api/docs/api-key)
  for details.
- [Gemini API Additional Terms of Service](https://ai.google.dev/gemini-api/terms)
  apply. Creating multiple Cloud projects to circumvent per-project rate
  limits is considered abuse.
