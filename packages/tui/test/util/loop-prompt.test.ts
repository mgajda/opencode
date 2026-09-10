import { describe, expect, test } from "bun:test"
import { parseLoopPrompt } from "../../src/util/loop-prompt"

function buildLoopPrompt(goal: string) {
  const trimmed = goal.trim()
  return [
    "You are running in loop mode.",
    "",
    trimmed ? `Goal:\n${trimmed}` : "Perform proactive maintenance for the current session and project.",
    "",
    "Work autonomously until the goal is complete or you are blocked by the user, permissions, or an external dependency.",
    "Re-check relevant state before stopping so you do not miss new changes.",
    `End your final text response with exactly one control marker on its own line: <loop:continue> if another loop iteration should run, or <loop:stop> if the work is complete or blocked until the user or an external system changes state.`,
  ].join("\n")
}

describe("parseLoopPrompt", () => {
  test("returns undefined for non-loop text", () => {
    expect(parseLoopPrompt("Hello world")).toBeUndefined()
  })

  test("returns undefined for empty string", () => {
    expect(parseLoopPrompt("")).toBeUndefined()
  })

  test("returns undefined when text starts with loop header but has no Goal: line (empty goal)", () => {
    expect(parseLoopPrompt(buildLoopPrompt(""))).toBeUndefined()
  })

  test("parses a single-line goal", () => {
    const result = parseLoopPrompt(buildLoopPrompt("fix the bug"))
    expect(result).toEqual({
      goal: "fix the bug",
      instructions: [
        "Work autonomously until the goal is complete or you are blocked by the user, permissions, or an external dependency.",
        "Re-check relevant state before stopping so you do not miss new changes.",
        `End your final text response with exactly one control marker on its own line: <loop:continue> if another loop iteration should run, or <loop:stop> if the work is complete or blocked until the user or an external system changes state.`,
      ].join("\n"),
    })
  })

  test("parses a multi-line goal", () => {
    const goal = "fix the bug\nand refactor the tests"
    const result = parseLoopPrompt(buildLoopPrompt(goal))
    expect(result).not.toBeUndefined()
    expect(result!.goal).toBe(goal)
  })

  test("parses a goal with special characters", () => {
    const goal = "Fix issue #42: update <Component /> and `npm test`"
    const result = parseLoopPrompt(buildLoopPrompt(goal))
    expect(result).not.toBeUndefined()
    expect(result!.goal).toBe(goal)
  })

  test("trims whitespace from goal", () => {
    const result = parseLoopPrompt(buildLoopPrompt("  fix the bug  "))
    expect(result).not.toBeUndefined()
    expect(result!.goal).toBe("fix the bug")
  })

  test("preserves the full instructions text", () => {
    const result = parseLoopPrompt(buildLoopPrompt("do something"))
    expect(result).not.toBeUndefined()
    expect(result!.instructions).toContain("Work autonomously until the goal is complete")
    expect(result!.instructions).toContain("Re-check relevant state before stopping")
    expect(result!.instructions).toContain("<loop:continue>")
    expect(result!.instructions).toContain("<loop:stop>")
  })

  test("does not match text that partially resembles a loop prompt", () => {
    expect(parseLoopPrompt("You are running in something else.")).toBeUndefined()
    expect(parseLoopPrompt("Running in loop mode.")).toBeUndefined()
    expect(parseLoopPrompt("Goal:\nfix the bug")).toBeUndefined()
  })

  test("handles text with extra content after the loop prompt", () => {
    const loopText = buildLoopPrompt("fix the bug")
    const withExtra = loopText + "\n\nExtra content"
    const result = parseLoopPrompt(withExtra)
    expect(result).not.toBeUndefined()
    expect(result!.goal).toBe("fix the bug")
  })
})
