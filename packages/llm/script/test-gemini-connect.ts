import { Effect, Layer } from "effect"
import { FetchHttpClient } from "effect/unstable/http"
import { LLM, LLMClient } from "../src"
import { Google } from "../src/providers"
import { RequestExecutor } from "../src/route"

const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY
if (!apiKey) {
  console.error("Set GOOGLE_GENERATIVE_AI_API_KEY (or GOOGLE_API_KEY / GEMINI_API_KEY)")
  process.exit(1)
}

async function listModels() {
  const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=100", {
    headers: { "x-goog-api-key": apiKey },
  })
  if (!res.ok) {
    const text = await res.text()
    console.error("List models failed:", res.status, text)
    return
  }
  const data = await res.json() as { models?: Array<{ name: string; displayName: string; supportedGenerationMethods: string[] }> }
  for (const m of data.models ?? []) {
    if (m.supportedGenerationMethods?.includes("generateContent")) {
      console.log(m.name)
    }
  }
}

await listModels()

const model = Google.configure({ apiKey }).model("gemini-2.5-pro")

const request = LLM.request({
  model,
  system: "You are a concise assistant.",
  prompt: "Say hello in one word.",
  generation: { maxTokens: 10, temperature: 0 },
})

const program = Effect.gen(function* () {
  const response = yield* LLMClient.generate(request)
  console.log("Success! Response:", response.text)
  console.log("Usage:", JSON.stringify(response.usage))
})

const layer = LLMClient.layer.pipe(
  Layer.provide(RequestExecutor.layer),
  Layer.provide(FetchHttpClient.layer),
)

Effect.runPromise(Effect.provide(program, layer)).then(() => process.exit(0)).catch((err) => {
  console.error("Failed:", err instanceof Error ? err.message : String(err))
  process.exit(1)
})