/**
 * Structured extraction: pull typed data off a page with a zod schema.
 *
 *   bun run examples/extract.ts         # or: npx tsx examples/extract.ts
 */
import { z } from "zod";
import { Autopilot, loadEnv } from "../src/index.js";

const env = loadEnv();

const bot = new Autopilot({
  browserbaseApiKey: env.browserbaseApiKey,
  browserbaseProjectId: env.browserbaseProjectId,
  modelApiKey: env.modelApiKey,
  modelName: env.modelName,
});

await bot.init();
await bot.goto("https://news.ycombinator.com");

const data = await bot.extract({
  instruction: "extract the top 5 stories with their title and points",
  schema: z.object({
    stories: z.array(
      z.object({
        title: z.string(),
        points: z.number(),
      }),
    ),
  }),
});

console.log(JSON.stringify(data, null, 2));
await bot.close();
