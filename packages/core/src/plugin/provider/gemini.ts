import { define } from "@opencode-ai/plugin/v2/effect/plugin"
import { Effect } from "effect"
import type { Scope } from "effect"
import type { PluginInternal } from "../internal"

export const GeminiPlugin = define({
  id: "gemini",
  effect: Effect.fn(function* (ctx) {
    yield* ctx.aisdk.sdk(
      Effect.fn(function* (evt) {
        if (evt.package !== "@ai-sdk/google") return
        const mod = yield* Effect.promise(() => import("@ai-sdk/google"))
        evt.sdk = mod.createGoogleGenerativeAI(evt.options)
      }),
    )
  }),
} satisfies PluginInternal.Plugin<PluginInternal.Requirements | Scope.Scope>)
