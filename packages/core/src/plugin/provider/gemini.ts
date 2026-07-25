import type { IntegrationOAuthMethodRegistration } from "@opencode-ai/plugin/v2/effect/integration"
import { define } from "@opencode-ai/plugin/v2/effect/plugin"
import { createServer } from "node:http"
import { Deferred, Effect, Random } from "effect"
import type { Scope } from "effect"
import { Credential } from "../../credential"
import { InstallationVersion } from "../../installation/version"
import { Integration } from "../../integration"
import { OauthCallbackPage } from "../../oauth/page"
import type { PluginInternal } from "../internal"

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
const GEMINI_SCOPE = "https://www.googleapis.com/auth/generative-language"
const CALLBACK_PORT = 1460

type TokenResponse = {
  access_token: string
  refresh_token?: string
  expires_in?: number
}

const integrationID = Integration.ID.make("gemini")
const oauthMethodID = Integration.MethodID.make("gemini-oauth")

// Desktop OAuth 2.0 Client ID for the Gemini Developer API.
// Public by design — security is provided by PKCE + localhost redirect URI.
// To use OAuth, create an OAuth 2.0 Client ID (Desktop app type) in
// Google Cloud Console, add http://localhost:1460/auth/callback as
// redirect URI, then set GEMINI_OAUTH_CLIENT_ID or hardcode it below.
//
// For a production build, embed the client ID as a constant here so
// users only need to run /connect gemini with no env var setup.
const CLIENT_ID = process.env.GEMINI_OAUTH_CLIENT_ID ?? ""

const oauth: IntegrationOAuthMethodRegistration = {
  integrationID,
  method: {
    id: oauthMethodID,
    type: "oauth",
    label: "Google Account (AI Pro / AI Ultra)",
  },
  authorize: () =>
    Effect.gen(function* () {
      if (!CLIENT_ID) return yield* Effect.fail(new Error("GEMINI_OAUTH_CLIENT_ID is not set"))
      const state = crypto.randomUUID()
      const verifier = yield* generateVerifier()
      const challenge = yield* challengeFromVerifier(verifier)
      const code = yield* Deferred.make<string, Error>()
      const server = createServer((request, response) => {
        const url = new URL(request.url ?? "/", `http://localhost:${CALLBACK_PORT}`)
        if (url.pathname !== "/auth/callback") {
          response.writeHead(404).end("Not found")
          return
        }
        const error = url.searchParams.get("error_description") ?? url.searchParams.get("error")
        const value = url.searchParams.get("code")
        if (error) {
          response
            .writeHead(400, { "Content-Type": "text/html" })
            .end(OauthCallbackPage.error(error, { provider: "Gemini" }))
          Effect.runFork(Deferred.fail(code, new Error(error)))
          return
        }
        if (!value || url.searchParams.get("state") !== state) {
          const message = value ? "Invalid OAuth state" : "Missing authorization code"
          response
            .writeHead(400, { "Content-Type": "text/html" })
            .end(OauthCallbackPage.error(message, { provider: "Gemini" }))
          Effect.runFork(Deferred.fail(code, new Error(message)))
          return
        }
        response
          .writeHead(200, { "Content-Type": "text/html" })
          .end(OauthCallbackPage.success({ provider: "Gemini" }))
        Effect.runFork(Deferred.succeed(code, value))
      })
      yield* Effect.callback<void, Error>((resume) => {
        server.once("error", (error) => resume(Effect.fail(error)))
        server.listen(CALLBACK_PORT, "localhost", () => resume(Effect.void))
      })
      yield* Effect.addFinalizer(() => Effect.sync(() => server.close()))
      return {
        mode: "auto" as const,
        url: `${GOOGLE_AUTH_URL}?${new URLSearchParams({
          client_id: CLIENT_ID,
          redirect_uri: `http://localhost:${CALLBACK_PORT}/auth/callback`,
          response_type: "code",
          scope: GEMINI_SCOPE,
          access_type: "offline",
          state,
          code_challenge: challenge,
          code_challenge_method: "S256",
        })}`,
        instructions: "Complete authorization in your browser.",
        callback: Effect.gen(function* () {
          const authCode = yield* Deferred.await(code)
          const result = yield* request<TokenResponse>(GOOGLE_TOKEN_URL, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": `opencode/${InstallationVersion}` },
            body: new URLSearchParams({
              code: authCode,
              client_id: CLIENT_ID,
              redirect_uri: `http://localhost:${CALLBACK_PORT}/auth/callback`,
              grant_type: "authorization_code",
              code_verifier: verifier,
            }).toString(),
          })
          return Credential.OAuth.make({
            type: "oauth",
            methodID: oauthMethodID,
            refresh: result.refresh_token ?? "",
            access: result.access_token,
            expires: result.expires_in ? Date.now() + result.expires_in * 1000 : Date.now() + 3600_000,
          })
        }),
      }
    }),
  refresh: (value) =>
    Effect.gen(function* () {
      if (!CLIENT_ID) return yield* Effect.fail(new Error("GEMINI_OAUTH_CLIENT_ID is not set"))
      const result = yield* request<TokenResponse>(GOOGLE_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": `opencode/${InstallationVersion}` },
        body: new URLSearchParams({
          refresh_token: value.refresh,
          client_id: CLIENT_ID,
          grant_type: "refresh_token",
        }).toString(),
      })
      return Credential.OAuth.make({
        type: "oauth",
        methodID: oauthMethodID,
        refresh: value.refresh,
        access: result.access_token,
        expires: result.expires_in ? Date.now() + result.expires_in * 1000 : Date.now() + 3600_000,
        metadata: value.metadata,
      })
    }),
}

function request<A>(url: string, init: RequestInit) {
  return Effect.tryPromise({
    try: async (signal) => {
      const response = await fetch(url, { ...init, signal })
      if (!response.ok) throw new Error(`Token request failed: ${response.status}`)
      return response.json() as Promise<A>
    },
    catch: (cause) => cause,
  })
}

type FetchFn = (input: Parameters<typeof fetch>[0], init?: RequestInit) => Promise<Response>

const tryOAuthWrap = (): ((inner?: FetchFn) => FetchFn) | undefined => {
  if (!CLIENT_ID) return undefined

  const authPath = (() => {
    const home = typeof process !== "undefined" ? process.env.HOME ?? process.env.USERPROFILE : undefined
    if (!home) return undefined
    const dataDir = process.env.XDG_DATA_HOME ?? `${home}/.local/share`
    return `${dataDir}/opencode/auth.json`
  })()

  let accessToken = ""
  let expiresAt = 0
  let refreshToken = ""
  let refreshing: Promise<string> | null = null

  const loadTokens = async () => {
    if (!authPath) return
    try {
      const fs = require("node:fs") as typeof import("node:fs")
      const content = fs.readFileSync(authPath, "utf-8")
      const data = JSON.parse(content) as Record<string, { type: string; access: string; refresh: string; expires: number }>
      const entry = data["gemini"] ?? data["google"]
      if (entry?.type === "oauth") {
        accessToken = entry.access
        refreshToken = entry.refresh ?? ""
        expiresAt = entry.expires ?? 0
      }
    } catch {}
  }

  const doRefresh = async (): Promise<string> => {
    const res = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: CLIENT_ID,
        grant_type: "refresh_token",
      }).toString(),
    })
    if (!res.ok) throw new Error(`Token refresh failed: ${res.status}`)
    const data = (await res.json()) as { access_token: string; expires_in?: number }
    accessToken = data.access_token
    expiresAt = data.expires_in ? Date.now() + data.expires_in * 1000 : Date.now() + 3600_000
    return accessToken
  }

  const getToken = async (): Promise<string> => {
    if (accessToken && Date.now() < expiresAt - 60_000) return accessToken
    if (refreshing) return refreshing
    if (!refreshToken) await loadTokens()
    if (!refreshToken) throw new Error("No OAuth refresh token found. Run /connect gemini first.")
    refreshing = doRefresh().finally(() => { refreshing = null })
    return refreshing
  }

  return (inner?: FetchFn) =>
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
        }
}

const generateVerifier = () =>
  Effect.gen(function* () {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~"
    let result = ""
    for (let i = 0; i < 43; i++) {
      const index = yield* Random.nextIntBetween(0, chars.length - 1)
      result += chars[index]
    }
    return result
  })

const challengeFromVerifier = (verifier: string) =>
  Effect.tryPromise({
    try: async () => {
      const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))
      return btoa(String.fromCharCode(...new Uint8Array(hash)))
        .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
    },
    catch: () => new Error("Failed to generate PKCE challenge"),
  })

export const GeminiPlugin = define({
  id: "gemini",
  effect: Effect.fn(function* (ctx) {
    yield* ctx.integration.transform((draft) => {
      draft.method.update(oauth)
    })
    yield* ctx.aisdk.sdk(
      Effect.fn(function* (evt) {
        if (evt.package !== "@ai-sdk/google") return
        if (!evt.options.apiKey) {
          const wrap = tryOAuthWrap()
          if (wrap) evt.options.fetch = wrap(evt.options.fetch)
        }
        const mod = yield* Effect.promise(() => import("@ai-sdk/google"))
        evt.sdk = mod.createGoogleGenerativeAI(evt.options)
      }),
    )
  }),
} satisfies PluginInternal.Plugin<PluginInternal.Requirements | Scope.Scope>)
