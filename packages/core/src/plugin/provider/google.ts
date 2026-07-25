import { Effect } from "effect"
import { define } from "../internal"

export const GooglePlugin = define({
  id: "google",
  effect: Effect.fn(function* (ctx) {
    yield* ctx.aisdk.sdk(
      Effect.fn(function* (evt) {
        if (evt.package !== "@ai-sdk/google") return
        if (!evt.options.apiKey) {
          const auth = tryGoogleAuth()
          if (auth) {
            const existing = evt.options.fetch
            evt.options.fetch = auth.wrap(existing)
          }
        }
        const mod = yield* Effect.promise(() => import("@ai-sdk/google"))
        evt.sdk = mod.createGoogleGenerativeAI(evt.options)
      }),
    )
  }),
})

type FetchFn = (input: Parameters<typeof fetch>[0], init?: RequestInit) => Promise<Response>

const tryGoogleAuth = () => {
  try {
    const { GoogleAuth } = require("google-auth-library") as typeof import("google-auth-library")
    const client = new GoogleAuth({
      scopes: ["https://www.googleapis.com/auth/generative-language"],
    })
    let cachedToken: { token: string; expiresAt: number } | undefined
    const getToken = async () => {
      const now = Date.now()
      if (!cachedToken || cachedToken.expiresAt <= now) {
        const token = await client.getAccessToken()
        if (!token) throw new Error("Failed to obtain Google OAuth access token")
        cachedToken = { token, expiresAt: now + 45_000 }
      }
      return cachedToken.token
    }
    return {
      wrap: (inner: FetchFn | undefined): FetchFn =>
        inner
          ? async (input, init) => {
              const headers = new Headers(init?.headers)
              headers.set("Authorization", `Bearer ${await getToken()}`)
              return inner(input, { ...init, headers })
            }
          : async (input, init) => {
              const headers = new Headers(init?.headers)
              headers.set("Authorization", `Bearer ${await getToken()}`)
              return fetch(input, { ...init, headers })
            },
    }
  } catch {
    return undefined
  }
}
