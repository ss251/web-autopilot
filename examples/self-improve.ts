/**
 * Self-improving loop (the "auto-research" harness).
 *
 * Give it an objective + a deterministic success check; it runs the agent,
 * verifies, reflects on failures to rewrite its own strategy, and repeats until
 * the task passes reliably. The evolved strategy is saved to `strategy.<name>.md`
 * — a durable skill you can reuse or hand back in as `initialStrategy`.
 *
 *   bun run examples/self-improve.ts     # or: npx tsx examples/self-improve.ts
 */
import { Autopilot, loadEnv, improve } from "../src/index.js";

const bot = new Autopilot(loadEnv());
await bot.init();

const result = await improve(
  bot,
  {
    name: "hn-open-comments",
    url: "https://news.ycombinator.com",
    goal: "open the comments/discussion page of the very first story on Hacker News",
    // Deterministic check: HN item (comments) pages live at /item?id=...
    verify: async (b) => String(b.page.url()).includes("item?id="),
  },
  {
    maxIterations: 4,
    passesToWin: 2,
    maxSteps: 8,
    strategyPath: "strategy.hn-open-comments.md",
  },
);

console.log(result.passed ? "✅ learned a reliable strategy" : "⚠️ did not converge");
console.log(`iterations: ${result.iterations}`);
console.log("---- evolved strategy ----");
console.log(result.strategy);

await bot.close();
