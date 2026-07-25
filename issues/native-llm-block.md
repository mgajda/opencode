---
title: "Native LLM runtime hard-blocks Google/Gemini and other non-OpenAI providers"
labels: bug, core
---

## Description

The native LLM runtime at `packages/opencode/src/session/llm/native-runtime.ts` has a hardcoded provider allowlist that blocks Google and other providers from using the native LLM path, even though `native-request.ts` has adapters for them.

## Impact

Users who enable `OPENCODE_EXPERIMENTAL_NATIVE_LLM=true` cannot use Google/Gemini, Amazon Bedrock, Azure, or OpenRouter through the native path. The two lists (`statusWithFetch` gate and `model()` adapter) are duplicated and drift apart.

## Root cause

The allowlist in `statusWithFetch()` was written when only three providers existed. Provider adapters were added to `native-request.ts` but the gate was never updated.

## Suggested fix

Replace the hardcoded provider/npm lists in `statusWithFetch()` with a `SUPPORTED_NPM_PACKAGES` set exported from `native-request.ts` so the gate derives truth from the same source as the adapter.
