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

### 3. OAuth with Google account (AI Pro / AI Ultra subscription)

The Gemini plugin implements OAuth 2.0 with the scope
`https://www.googleapis.com/auth/generative-language` using PKCE
(no client secret needed).

To use OAuth:

1. Create an **OAuth 2.0 Client ID (Desktop app type)** in
   [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
   (APIs & Services → Credentials → Create Credentials → OAuth client ID)
2. Add `http://localhost:1460/auth/callback` as an authorized redirect URI
3. Set `GEMINI_OAUTH_CLIENT_ID` env var (or hardcode it in the plugin source
   for a zero-config production build)
4. Run **/connect gemini** in opencode — a browser opens for authorization

The flow uses PKCE with a local redirect server on port 1460. Tokens are
stored and automatically refreshed. No client secret is required.

**With AI Pro ($19.99/mo)**: 1,500 req/day via OAuth
**With AI Ultra ($99.99/mo)**: 2,000 req/day via OAuth
Plans: https://one.google.com/about/google-ai-plans/

**Google AI Plus ($4.99/mo)** does NOT increase API limits — it only boosts
the Gemini app and AI Studio web interface.

**`gcloud auth application-default login` does NOT work** for the Developer
API — it authenticates to Vertex AI / Enterprise Agent Platform
(`cloud-platform` scope), not to the Gemini Developer API.

## Summary

| Method | Daily limit | RPM | Cost |
|--------|-------------|-----|------|
| API key (free) | 250 | 5-15 | Free |
| API key (Tier 1) | 1K-1.5K | 150-300 | Pay per token |
| OAuth (AI Pro) | 1,500 | — | $19.99/mo |
| OAuth (AI Ultra) | 2,000 | — | $99.99/mo |

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
