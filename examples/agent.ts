/**
 * Autonomous agent: hand it a goal, it plans and executes the multi-step flow
 * itself (Stagehand's `agent` primitive) instead of you scripting each act().
 *
 *   bun run examples/agent.ts     # or: npx tsx examples/agent.ts
 */
import { Autopilot, loadEnv } from "../src/index.js";

const bot = new Autopilot(loadEnv());
await bot.init();

await bot.goto("https://news.ycombinator.com");
const result = await bot.agent("find the highest-ranked story about AI and open its comments page", {
  maxSteps: 8,
});

console.log(result.success ? "✅ done" : "⚠️ incomplete", "—", result.message);
console.log("steps taken:", result.actions?.length ?? 0);
console.log("landed on:", bot.page.url());

await bot.close();
