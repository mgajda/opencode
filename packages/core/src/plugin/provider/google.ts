import { Effect } from "effect"
import { define } from "../internal"

const googleOAuthFetch = (): typeof globalThis.fetch | undefined => {
  try {
    const { GoogleAuth } = require("google-auth-library") as typeof import("google-auth-library")
    const auth = new GoogleAuth({
      scopes: ["https://www.googleapis.com/auth/generative-language"],
    })
    let cachedToken: { token: string; expiresAt: number } | undefined

    return async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const now = Date.now()
      if (!cachedToken || cachedToken.expiresAt <= now) {
        const token = await auth.getAccessToken()
        if (!token) throw new Error("Failed to obtain Google OAuth access token")
        cachedToken = { token, expiresAt: now + 45_000 }
      }
      const headers = new Headers(init?.headers)
      headers.set("Authorization", `Bearer ${cachedToken.token}`)
      return fetch(input, { ...init, headers })
    }
  } catch {
    return undefined
  }
}

export const GooglePlugin = define({
  id: "google",
  effect: Effect.fn(function* (ctx) {
    yield* ctx.aisdk.sdk(
      Effect.fn(function* (evt) {
        if (evt.package !== "@ai-sdk/google") return
        if (!evt.options.apiKey) {
          const oauthFetch = googleOAuthFetch()
          if (oauthFetch) {
            const existing = evt.options.fetch
            evt.options.fetch = async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
              const wrappedInit = await oauthFetch(input, init)
              if (existing) return existing(input, wrappedInit)
              return wrappedInit
            }
          }
        }
        const mod = yield* Effect.promise(() => import("@ai-sdk/google"))
        evt.sdk = mod.createGoogleGenerativeAI(evt.options)
      }),
    )
  }),
})
