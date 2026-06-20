#!/usr/bin/env node
/**
 * web-autopilot CLI — open a cloud browser, optionally inject cookies, run a
 * sequence of natural-language actions, and screenshot the result.
 *
 *   web-autopilot --url https://example.com \
 *     --act "click the Documentation link" \
 *     --act "search for 'pricing'" \
 *     --screenshot out.png
 *
 * Diagnostics go to stderr; --observe results go to stdout (pipe-friendly).
 */
import { parseArgs } from "node:util";
import { readFileSync } from "node:fs";
import { Autopilot } from "./autopilot.js";
import { loadEnv } from "./config.js";

const HELP = `web-autopilot — drive a cloud browser with natural-language actions

USAGE
  web-autopilot --url <url> [options]

OPTIONS
  --url <url>            Page to open (required)
  --act <text>           A natural-language action; repeatable, runs in order
  --observe <text>       Ask a question about the page; prints JSON to stdout
  --cookies <file>       JSON array of cookies to inject before navigating
  --screenshot <file>    Save a screenshot when the actions finish
  --model <id>           Override the planning model (default: gemini 2.5 flash)
  --proxy                Route the session through a Browserbase proxy
  --solve-captchas       Let Browserbase attempt CAPTCHA solving
  --keep-open            Leave the session alive after the run (you release it)
  -h, --help             Show this help

Credentials are read from the environment (.env supported). See .env.example.

Only automate sites you own or are authorized to automate. See the README.`;

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      url: { type: "string" },
      act: { type: "string", multiple: true },
      observe: { type: "string" },
      cookies: { type: "string" },
      screenshot: { type: "string" },
      model: { type: "string" },
      proxy: { type: "boolean", default: false },
      "solve-captchas": { type: "boolean", default: false },
      "keep-open": { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });

  if (values.help || !values.url) {
    console.log(HELP);
    process.exit(values.help ? 0 : 1);
  }

  const env = loadEnv();
  const bot = new Autopilot({
    browserbaseApiKey: env.browserbaseApiKey,
    browserbaseProjectId: env.browserbaseProjectId,
    modelApiKey: env.modelApiKey,
    modelName: values.model ?? env.modelName,
    proxies: values.proxy,
    solveCaptchas: values["solve-captchas"],
    keepAlive: values["keep-open"],
  });

  await bot.init();
  console.error(`session: ${bot.sessionId}`);
  const live = await bot.liveViewUrl();
  if (live) console.error(`live view: ${live}`);

  if (values.cookies) {
    const cookies = JSON.parse(readFileSync(values.cookies, "utf8"));
    await bot.addCookies(cookies);
    console.error(`injected ${Array.isArray(cookies) ? cookies.length : 0} cookie(s)`);
  }

  await bot.goto(values.url);
  console.error(`→ ${values.url}`);

  for (const instruction of values.act ?? []) {
    console.error(`act: ${instruction}`);
    await bot.act(instruction);
  }

  if (values.observe) {
    const result = await bot.observe(values.observe);
    console.log(JSON.stringify(result, null, 2));
  }

  if (values.screenshot) {
    await bot.screenshot(values.screenshot);
    console.error(`screenshot → ${values.screenshot}`);
  }

  if (values["keep-open"]) {
    console.error("session kept open (--keep-open) — release it from the Browserbase dashboard when done");
    await bot.close({ release: false });
  } else {
    await bot.close();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
