import { complete, MODEL as DEFAULT_MODEL } from "../lib/llm.ts";
import { factsheetToVariables } from "../lib/factsheet.ts";
import { render, systemPromptTemplate } from "../lib/prompt.ts";
import { BUSINESSES, CASES, type Case } from "./cases.ts";
import { grade } from "./grade.ts";

/**
 * Runs the sixteen questions from PRD §14 against the real system prompt with
 * the real Fact Sheet variables substituted, and grades every reply.
 *
 * What this proves: the prompt refuses when it should and answers from the
 * sheet when it can. What it does not prove: latency, interruption, or the
 * voice pipeline — those are verified by hand at T+120. This tests the part of
 * the agent that can hallucinate, which is the part worth automating.
 *
 * Not in CI: it costs money and needs a key. Person 2 runs it at T+120 (after
 * the live tool lands) and again before feature freeze at T+170.
 *
 *   ANTHROPIC_API_KEY=... npm run eval
 */

// The agent's own model is configured in ElevenLabs and may not be Claude, so
// this is an approximation of its judgment, not a replay of it. Low effort is
// the closest match to a latency-tuned voice model.
const MODEL = process.env.EVAL_MODEL ?? "claude-opus-5";

const client = new Anthropic();
const template = systemPromptTemplate();

async function ask(testCase: Case): Promise<string> {
  const sheet = BUSINESSES[testCase.business];
  if (!sheet) throw new Error(`${testCase.id}: unknown business "${testCase.business}"`);

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    output_config: { effort: "low" },
    system: render(template, factsheetToVariables(sheet)),
    messages: [{ role: "user", content: testCase.question }],
  });

  return response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n");
}

const results = await Promise.all(
  CASES.map(async (testCase) => {
    try {
      const reply = await ask(testCase);
      return { testCase, reply, failures: grade(testCase, reply) };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { testCase, reply: "", failures: [`request failed: ${message}`] };
    }
  }),
);

let failed = 0;
for (const { testCase, reply, failures } of results) {
  if (failures.length === 0) {
    console.log(`PASS  ${testCase.id}`);
    continue;
  }
  failed++;
  console.log(`FAIL  ${testCase.id}  (${testCase.expect})`);
  console.log(`      Q: ${testCase.question}`);
  console.log(`      A: ${reply.replace(/\n/g, " ") || "(no reply)"}`);
  for (const reason of failures) console.log(`      - ${reason}`);
}

console.log(`\n${CASES.length - failed}/${CASES.length} passed on ${MODEL}`);
process.exit(failed === 0 ? 0 : 1);
