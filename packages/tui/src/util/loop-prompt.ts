const LOOP_HEADER = "You are running in loop mode."
const GOAL_HEADER = "Goal:\n"

export function parseLoopPrompt(text: string): { goal: string; instructions: string } | undefined {
  if (!text.startsWith(LOOP_HEADER)) return undefined
  const goalMatch = text.match(/\n\nGoal:\n(.+?)(?:\n\n|\n$)/s)
  if (!goalMatch) return undefined
  const goal = goalMatch[1].trim()
  const afterGoal = text.slice(goalMatch.index! + goalMatch[0].length).trim()
  return { goal, instructions: afterGoal }
}
