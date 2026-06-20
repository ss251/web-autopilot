/**
 * A scheduled QA check built on the self-improving loop. Point it at a URL and
 * it verifies a critical path still works, evolving a reliable strategy and
 * saving it as an artifact. Wire it to cron via
 * `.github/workflows/scheduled-run.yml`, or run it locally:
 *
 *   QA_URL=https://your-app.example.com bun run examples/scheduled-qa.ts
 *
 * Customize `goal` + `verify` to assert the path you actually care about
 * (e.g. "add to cart and reach checkout" → verify the URL is /checkout).
 */
import { Autopilot, loadEnv, improve } from "../src/index.js";

const url = process.env.QA_URL || "https://news.ycombinator.com";

const bot = new Autopilot(loadEnv());
await bot.init();

const result = await improve(
  bot,
  {
    name: "qa-smoke",
    url,
    goal: "confirm the page loads and its primary navigation is usable",
    // Replace with a real assertion for your app's critical path:
    verify: async (b) => String(await b.page.title()).trim().length > 0,
  },
  { maxIterations: 3, passesToWin: 1, maxSteps: 6, strategyPath: "strategy.qa-smoke.md" },
);

console.log(result.passed ? `✅ QA passed for ${url}` : `❌ QA failed for ${url}`);
await bot.close();
if (!result.passed) process.exit(1);
