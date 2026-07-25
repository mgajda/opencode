#!/usr/bin/env bash
set -euo pipefail

REPO="anomalyco/opencode"

echo "=== Issue 1/2: Native LLM blocks non-OpenAI providers ==="
gh issue create --repo "$REPO" --web \
  --title "Native LLM runtime hard-blocks Google/Gemini and other non-OpenAI providers" \
  --label bug \
  --body '## Description

The native LLM runtime at `packages/opencode/src/session/llm/native-runtime.ts` has a hardcoded provider allowlist that blocks Google, Amazon Bedrock, Azure, and OpenRouter from using the native LLM path, even though `native-request.ts` has working adapters for them.

```typescript
// native-runtime.ts:55 — the gate
if (providerID !== "openai" && providerID !== "anthropic" && !providerID.startsWith("opencode"))
  return { type: "unsupported", reason: "..." }
if (npm !== "@ai-sdk/openai" && npm !== "@ai-sdk/openai-compatible" && npm !== "@ai-sdk/anthropic")
  return { type: "unsupported", reason: "..." }
```

```typescript
// native-request.ts:165-177 — the adapter
if (model.api.npm === "@ai-sdk/google") return Google...     // works but gate blocks
if (model.api.npm === "@ai-sdk/amazon-bedrock") return AmazonBedrock...
if (model.api.npm === "@ai-sdk/azure") return Azure...
if (model.api.npm === "@openrouter/ai-sdk-provider") return OpenRouter...
```

## Impact
Users with `OPENCODE_EXPERIMENTAL_NATIVE_LLM=true` get silently degraded behaviour for these providers — fallback to AI SDK means different retry/streaming/tool-dispatch paths. The failure is invisible unless you inspect logs.

## Root cause
The allowlist in `statusWithFetch()` was written when only three providers had native adapters. New adapters were added to `native-request.ts` without updating the gate. The lists are duplicated and drift apart.

## Suggested fix
Export a `SUPPORTED_NPM_PACKAGES` set from `native-request.ts` and use it in the `statusWithFetch()` gate. One source of truth.'

echo
echo "=== Issue 2/2: Retry params too conservative ==="
gh issue create --repo "$REPO" --web \
  --title "LLM executor retry parameters too conservative for Gemini and other providers" \
  --label bug \
  --label perf \
  --body '## Description

The native LLM executor (`packages/llm/src/route/executor.ts`) uses:
- `MAX_RETRIES = 2` (3 attempts total)
- `BASE_DELAY_MS = 500` (0.5s initial backoff)
- `MAX_DELAY_MS = 10_000` (10s cap on Retry-After)

When the Gemini API rate-limits a request (HTTP 429), its `Retry-After` header often recommends 30-60s. With a 10s cap, the executor retries before the cooldown expires — wasting all retries.

Separately, the AI SDK path (`packages/opencode/src/session/llm.ts`) defaults to `maxRetries: input.retries ?? 0` — zero retries unless the caller explicitly sets a count.

## Impact
- Free-tier Gemini users see frequent 429 failures that would resolve with longer backoff
- All providers with tight rate limits (or aggressive Retry-After headers) are affected

## Suggested fix
- Increase `MAX_RETRIES` from 2 to 4
- Increase `MAX_DELAY_MS` from 10s to 60s (matches Gemini API recommendation)
- Default AI SDK retries to a non-zero value (e.g. 2) at the caller site rather than 0'

echo
echo "Done. Both issues opened in browser tabs for review."
