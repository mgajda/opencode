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

**Free tier limits**: 250 req/day, 5-15 RPM, 250K TPM.
Docs: https://ai.google.dev/gemini-api/docs/rate-limits

### 2. API Key + Cloud billing (pay-as-you-go, Tier 1)

Enable billing on the Cloud project that owns the API key at
https://console.cloud.google.com/billing — no minimum spend, pay per token.

**Tier 1 limits**: 1K-1.5K req/day, 150-300 RPM, 1-2M TPM.
Pricing: https://ai.google.dev/gemini-api/docs/pricing

Higher tiers (2/3) unlock at $250/$1K cumulative spend.

### 3. Higher rate limits: Cloud billing (recommended)

The Gemini Developer API at `generativelanguage.googleapis.com` does
not support OAuth — it only accepts API keys (`x-goog-api-key` header).
The `peruserquota` scope is not usable from public clients.

The Gemini CLI itself uses a **separate private endpoint**
(`cloudcode-pa.googleapis.com`) for its OAuth path, which is not
publicly available.

The only working path to higher rate limits:

1. **Enable Cloud billing** on the Google Cloud project that owns
   your API key at https://console.cloud.google.com/billing
2. No minimum spend — pay per token consumed
3. Rate limits go from 250 req/day / 5-15 RPM → **1K-1.5K req/day
   / 150-300 RPM**

**Google AI Plus ($4.99/mo)** does NOT increase API limits — it only boosts
the Gemini app and AI Studio web interface.

**`gcloud auth application-default login` does NOT work** — it authenticates
to Vertex AI / Enterprise Agent Platform (`cloud-platform` scope), not to the
Gemini Developer API.
(`cloud-platform` scope), not to the Gemini Developer API.

## Summary

| Method | Daily limit | RPM | Cost |
|--------|-------------|-----|------|
| API key (free) | 250 | 5-15 | Free |
| API key (Tier 1) | 1K-1.5K | 150-300 | Pay per token |

## Provider name

This provider is called **gemini** (not "google"). Use it in opencode.json:
```json
{ "provider": { "gemini": { "options": { "apiKey": "AIza..." } } } }
```

The provider ID is `gemini`. The `/connect gemini` command in opencode
starts the OAuth flow.

## Retry behaviour

The native LLM path retries 4 times with exponential backoff (500ms base,
60s cap). The AI SDK path uses `maxRetries` from the caller (default 0,
prompts pass 2). Both respect the server's `Retry-After` header.

## Compliance notes

### June 2026: unrestricted standard keys are rejected

From **June 19, 2026**, the Gemini API rejects unrestricted standard keys.
Any API key used with opencode must have explicit restrictions set in
[Google Cloud Console](https://console.cloud.google.com/apis/credentials)
or [AI Studio](https://aistudio.google.com/apikey):
- API restriction: restrict to "Gemini API" only
- Or IP/HTTP-referrer restriction for added safety

### September 2026: standard keys deprecated

Standard `AIza`-prefixed keys stop working. Keys created in AI Studio
after this date use the `AQ.` prefix ("auth keys"). They work identically
when sent as the `x-goog-api-key` header — our code handles both prefixes
without changes.

See https://ai.google.dev/gemini-api/docs/api-key for the official migration
guide.

### Terms of Service

The Gemini API is governed by the
[Gemini API Additional Terms of Service](https://ai.google.dev/gemini-api/terms).
Key points relevant to this client:
- `x-goog-api-key` header and `Authorization: Bearer` are both permitted
  authentication methods — our implementation uses both correctly.
- Free-tier prompts and responses may be used by Google to improve products.
  Upgrading to any paid tier (Tier 1 billing or AI Pro/Ultra subscription)
  opts out of data sharing for API usage.
- Creating multiple Cloud projects to circumvent per-project rate limits is
  considered abuse.
- The API is intended for professional/business development use.
