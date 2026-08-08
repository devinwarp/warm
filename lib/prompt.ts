import { readFileSync } from "node:fs";

/**
 * The system prompt lives in markdown so Taha can paste it straight into
 * the ElevenLabs dashboard. Everything that needs it in code reads it from
 * there — one copy, no drift between what we test and what the agent runs.
 */
const PROMPT_PATH = new URL("../prompts/system-prompt.md", import.meta.url);

export function promptFile(): string {
  return readFileSync(PROMPT_PATH, "utf8");
}

/** The fenced block under "## System prompt" — exactly what gets pasted in. */
export function systemPromptTemplate(): string {
  const match = promptFile().match(/## System prompt\s*\n+```\n([\s\S]*?)\n```/);
  if (!match?.[1]) {
    throw new Error("no fenced system prompt block under '## System prompt'");
  }
  return match[1];
}

export function placeholders(text: string): string[] {
  return [...new Set([...text.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]!))];
}

/**
 * Throws on a placeholder with no value rather than substituting an empty
 * string — an unfilled variable reaching the agent is a silent failure that
 * only shows up as "{{hours}}" spoken aloud on stage.
 */
export function render(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, name: string) => {
    const value = vars[name];
    if (value === undefined) throw new Error(`no value supplied for {{${name}}}`);
    return value;
  });
}
