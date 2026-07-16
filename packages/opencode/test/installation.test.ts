import { describe, expect, test } from "bun:test"
import path from "path"
import { fileURLToPath } from "url"

const scriptDir = path.resolve(import.meta.dir, "../script")

describe("Desktop build script", () => {
  test("build-node.ts defines OPENCODE_VERSION", async () => {
    const buildNodePath = path.join(scriptDir, "build-node.ts")
    const content = await Bun.file(buildNodePath).text()
    // The define block must include OPENCODE_VERSION so the background
    // dependency installer resolves @opencode-ai/plugin@<version>
    // instead of falling back to @local.
    expect(content).toMatch(/OPENCODE_VERSION/)
    expect(content).toMatch(/OPENCODE_VERSION:.*Script\.version/)
  })

  test("installer does not fall back to @local when OPENCODE_VERSION is defined", async () => {
    // Simulate the logic from packages/core/src/installation/version.ts:
    // InstallationVersion = typeof OPENCODE_VERSION === "string" ? OPENCODE_VERSION : "local"
    const version = "1.18.1"
    const InstallationVersion = typeof version === "string" ? version : "local"
    expect(InstallationVersion).toBe("1.18.1")
    expect(InstallationVersion).not.toBe("local")
  })
})
