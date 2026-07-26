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
// Gemini Developer API does not support OAuth — API key only.
// The peruserquota scope is not usable from public clients.
// OAuth integration method kept for future use if Google opens the
// endpoint to OAuth, or for internal proxy endpoints like Gemini
// CLI's cloudcode-pa.googleapis.com (not publicly available).
// See gemini-setup.md for details.
const GEMINI_SCOPE = "https://www.googleapis.com/auth/generative-language.peruserquota"
const CALLBACK_PORT = 1460

type TokenResponse = {
  access_token: string
  refresh_token?: string
  expires_in?: number
}

const integrationID = Integration.ID.make("gemini")
const oauthMethodID = Integration.MethodID.make("gemini-oauth")

// OAuth 2.0 Client ID for the Gemini Developer API.
// Security is provided by PKCE + localhost redirect, not secrecy.
// Resolved in priority: GEMINI_OAUTH_CLIENT_ID → GEMINI_CLIENT_ID_WEB → GEMINI_CLIENT_ID
const CLIENT_ID = (() => {
  const e = typeof process !== "undefined" ? process.env : {}
  return e.GEMINI_OAUTH_CLIENT_ID ?? e.GEMINI_CLIENT_ID_WEB ?? e.GEMINI_CLIENT_ID ?? ""
})()

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
        const error = url.searchParams.get("error") ?? url.searchParams.get("error_description")
        const value = url.searchParams.get("code")
        if (error) {
          response.writeHead(400, { "Content-Type": "text/html" }).end(OauthCallbackPage.error(error, { provider: "Gemini" }))
          Effect.runFork(Deferred.fail(code, new Error(error)))
          return
        }
        if (!value || url.searchParams.get("state") !== state) {
          const msg = value ? "Invalid OAuth state" : "Missing authorization code"
          response.writeHead(400, { "Content-Type": "text/html" }).end(OauthCallbackPage.error(msg, { provider: "Gemini" }))
          Effect.runFork(Deferred.fail(code, new Error(msg)))
          return
        }
        response.writeHead(200, { "Content-Type": "text/html" }).end(OauthCallbackPage.success({ provider: "Gemini" }))
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
          redirect_uri: `http://localhost:${CALLBACK_PORT}`,
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
          const secret = yield* resolveClientSecret()
          const body = new URLSearchParams({
            code: authCode,
            client_id: CLIENT_ID,
            redirect_uri: `http://localhost:${CALLBACK_PORT}`,
            grant_type: "authorization_code",
            code_verifier: verifier,
          })
          if (secret) body.set("client_secret", secret)
          const result = yield* request<TokenResponse>(GOOGLE_TOKEN_URL, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": `opencode/${InstallationVersion}` },
            body: body.toString(),
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
      const secret = yield* resolveClientSecret()
      const body = new URLSearchParams({
        refresh_token: value.refresh,
        client_id: CLIENT_ID,
        grant_type: "refresh_token",
      })
      if (secret) body.set("client_secret", secret)
      const result = yield* request<TokenResponse>(GOOGLE_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": `opencode/${InstallationVersion}` },
        body: body.toString(),
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
        const mod = yield* Effect.promise(() => import("@ai-sdk/google"))
        evt.sdk = mod.createGoogleGenerativeAI(evt.options)
      }),
    )
  }),
} satisfies PluginInternal.Plugin<PluginInternal.Requirements | Scope.Scope>)
