---
title: "LLM executor retry parameters too conservative for Gemini and other providers"
labels: bug, perf
---

## Description

The native LLM executor at `packages/llm/src/route/executor.ts` uses:

```
MAX_RETRIES   = 2    (3 attempts total)
MAX_DELAY_MS  = 500  (0.5s base)
MAX_DELAY_MS  = 10_000 (10s cap)
```

When the Gemini API rate-limits a request (HTTP 429), its `Retry-After` header often recommends 30-60s of backoff. With a 10s cap, the executor retries before the cooldown expires — wasting all retries. The same issue affects any provider that sends longer `Retry-After` values.

Meanwhile the AI SDK path at `src/session/llm.ts` defaults to `maxRetries: input.retries ?? 0` — zero retries unless the caller explicitly sets a count.

## Impact

- Rate-limited requests fail after 2 premature retries (native) or immediately (AI SDK) when they could succeed with longer backoff
- Users on free-tier Gemini (tight rate limits) see frequent 429 failures

## Suggested fix

- Increase `MAX_RETRIES` from 2 to 4
- Increase `MAX_DELAY_MS` from 10s to 60s (the Gemini API's documented recommendation)
- Set a non-zero default for the AI SDK path retries
