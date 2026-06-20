/**
 * The hello-world: connect a cloud browser, drive it with intent, screenshot.
 *
 *   bun run examples/navigate.ts        # or: npx tsx examples/navigate.ts
 */
import { Autopilot, loadEnv } from "../src/index.js";

const env = loadEnv();

const bot = new Autopilot({
  browserbaseApiKey: env.browserbaseApiKey,
  browserbaseProjectId: env.browserbaseProjectId,
  modelApiKey: env.modelApiKey,
  modelName: env.modelName,
});

await bot.init();
console.log("session:", bot.sessionId);
console.log("live view:", await bot.liveViewUrl());

await bot.goto("https://news.ycombinator.com");
await bot.act("click the link to the first story");
console.log("landed on:", await bot.page.title());

await bot.screenshot("story.png");
await bot.close();
