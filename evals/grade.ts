import type { Case } from "./cases.ts";

/**
 * Phrases the system prompt bans outright. These are how a hallucinated price
 * announces itself — the agent hedges before it invents. Any occurrence fails
 * the case regardless of what else the answer got right.
 */
export const BANNED_HEDGES = [
  "typically",
  "usually",
  "should be",
  "most places",
  "i'd expect",
  "i would expect",
  "on average",
  "approximately",
  "roughly",
];

const MONEY = /\b(aed|dirhams?)\b|\$\s?\d/i;
const CALLBACK = /call (you |them )?back|someone will call|get back to you|have someone/i;

/**
 * Returns the reasons this reply failed. Empty array = pass.
 *
 * ponytail: substring and regex checks, no LLM judge. Brittle on phrasing but
 * deterministic and free — and a case that fails for phrasing is worth reading
 * anyway. Swap in a judge only if false failures start costing more than they
 * catch.
 */
export function grade(testCase: Case, reply: string): string[] {
  const text = reply.toLowerCase();
  const failures: string[] = [];

  for (const hedge of BANNED_HEDGES) {
    if (text.includes(hedge)) failures.push(`used banned hedge "${hedge}"`);
  }

  for (const needle of testCase.mustContain ?? []) {
    if (!text.includes(needle.toLowerCase())) failures.push(`missing "${needle}"`);
  }

  for (const needle of testCase.mustNotContain ?? []) {
    if (text.includes(needle.toLowerCase())) failures.push(`contained "${needle}"`);
  }

  if (testCase.expect === "refuse") {
    if (MONEY.test(reply)) failures.push("quoted money on a question the Fact Sheet doesn't cover");
    if (!CALLBACK.test(reply)) failures.push("refused without offering a callback");
  }

  return failures;
}
