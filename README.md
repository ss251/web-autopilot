# web-autopilot

**Drive cloud browsers with natural-language actions.** A small, honest starter
for building autonomous browser agents on [Browserbase](https://www.browserbase.com)
+ [Stagehand](https://github.com/browserbase/stagehand) — say *what* you want
("click the sign-in button", "extract the top 5 results"), and a planning model
turns it into real browser actions running in the cloud.

```ts
import { Autopilot, loadEnv } from "web-autopilot";

const bot = new Autopilot(loadEnv());
await bot.init();
await bot.goto("https://news.ycombinator.com");
await bot.act("click the link to the first story");
await bot.screenshot("story.png");
await bot.close();
```

No local Chrome, no Selenium grid, no selector babysitting — the browser runs on
Browserbase and the model figures out the clicks.

---

## ⚠️ Use responsibly

This tool drives real browsers against real websites. **Only automate sites you
own or have explicit permission to automate.** Respect each site's Terms of
Service and `robots.txt`. The optional proxy and CAPTCHA-solving features exist
for legitimate uses — geo-testing, accessibility, automating your *own*
infrastructure — **not** for circumventing access controls, rate limits, or
bot-protection on services you don't control. Always bring your *own*
credentials; never use someone else's session. You own how you use this.

---

## Why this exists

Stagehand + Browserbase is a fantastic combo, but the first time you wire it up
you trip over the same things everyone does: the concurrency-1 limit 429s your
second run, `keepAlive` sessions die on process exit, `stagehand.page` is missing
`.keyboard`, raw typing throws where `act()` works. `web-autopilot` bakes those
lessons into one tidy `Autopilot` class so you can get to the actual task. The
hard-won details live in [`docs/GOTCHAS.md`](docs/GOTCHAS.md).

## Features

- 🗣️ **Natural-language actions** — `act()`, `observe()`, structured `extract()` (zod).
- 🤖 **Autonomous agent** — `agent(goal)` plans *and* executes a multi-step flow itself.
- 🌱 **Self-improving loop** — `improve()` runs, verifies, reflects, and rewrites its own strategy until a task passes reliably ([auto-research](docs/SELF-IMPROVING.md)).
- ☁️ **Cloud browsers** — runs on Browserbase; nothing to install locally.
- 🔁 **Session hygiene** — auto-releases stale sessions so you don't 429.
- 🍪 **Bring-your-own-session** — inject a cookie to drive apps *you* are logged into.
- 👀 **Live view** — a URL to watch the cloud browser in real time.
- 🧰 **Library *and* CLI** — script it, or one-line it from the terminal.
- 🔒 **Secrets stay out of git** — `.env` + `cookies.json` are gitignored by default.

## Install

```bash
# clone the starter
git clone https://github.com/ss251/web-autopilot.git
cd web-autopilot
bun install        # or: npm install

# …or add the library to your own project
bun add web-autopilot
```

Runs on Node ≥ 18.17 or Bun.

## Setup

```bash
cp .env.example .env
```

Fill in:

| Variable | Where to get it |
|---|---|
| `BROWSERBASE_API_KEY` | [browserbase.com](https://www.browserbase.com) → Settings → API Keys |
| `BROWSERBASE_PROJECT_ID` | same dashboard |
| `MODEL_API_KEY` | a [Google AI Studio](https://aistudio.google.com/apikey) key (Gemini is the default planner) |
| `MODEL_NAME` *(optional)* | override the default `google/gemini-2.5-flash` |

## Quickstart

**CLI**

```bash
bun run cli --url https://news.ycombinator.com \
  --act "click the link to the first story" \
  --screenshot story.png

# global, after `npm i -g web-autopilot` (or `bun run build && npm link`)
web-autopilot --url https://example.com --observe "what is the main heading?"
```

**Library** — see [`examples/`](examples):

```bash
bun run examples/navigate.ts     # connect, act, screenshot
bun run examples/extract.ts      # structured extraction with a zod schema
bun run examples/cookie-auth.ts  # bring-your-own-session (your creds only)
bun run examples/agent.ts        # autonomous multi-step agent
bun run examples/self-improve.ts # the self-improving auto-research loop
```

## Bring-your-own-session (cookie auth)

To drive an app you're logged into, export a session cookie from your own
browser (devtools → Application → Cookies) and inject it before navigating:

```ts
await bot.addCookies([{
  name: "session",
  value: process.env.APP_SESSION_COOKIE!,
  domain: "app.example.com",
  path: "/",
  httpOnly: true,
  secure: true,
  sameSite: "Lax",
}]);
await bot.goto("https://app.example.com");
```

Keep the cookie in `.env` or a `cookies.json` — both are gitignored so you don't
commit a credential. Only ever use **your own** session, on a service you're
authorized to automate. (See *Use responsibly* above.)

## Autonomous agent

For multi-step flows, don't script each action — hand the agent a goal and it
plans and executes the whole thing (Stagehand's `agent` primitive):

```ts
const result = await bot.agent(
  "add the first product to the cart and go to checkout",
  { maxSteps: 12 },
);
console.log(result.success, result.message, result.actions.length);
```

## Self-improving loop (auto-research)

Brittle automation rots. Instead, declare the **objective** + a **success check**
and let the loop discover a reliable strategy — running the agent, verifying,
and **reflecting on each failure to rewrite its own instructions** until the task
passes consistently. Inspired by Browserbase's [`autobrowse`](https://github.com/browserbase/skills/blob/main/skills/autobrowse/SKILL.md)
skill and Karpathy's autoresearch harness. Full writeup: [docs/SELF-IMPROVING.md](docs/SELF-IMPROVING.md).

```ts
import { improve } from "web-autopilot";

const result = await improve(bot, {
  name: "checkout-smoke",
  url: "https://shop.example.com",
  goal: "add the first product to the cart and reach the checkout page",
  verify: async (b) => String(b.page.url()).includes("/checkout"),
}, { maxIterations: 5, passesToWin: 2, strategyPath: "strategy.checkout.md" });

console.log(result.passed, result.strategy);   // the evolved, reusable skill
```

## API

```ts
const bot = new Autopilot({
  browserbaseApiKey, browserbaseProjectId, modelApiKey,
  modelName?,        // default "google/gemini-2.5-flash"
  proxies?,          // default false
  solveCaptchas?,    // default false
  keepAlive?,        // default false
  viewport?,         // default 1440×900
  releaseStale?,     // default true — release stale RUNNING sessions first
  verbose?,          // 0 | 1 | 2, default 0
});

await bot.init();                       // connect; sets bot.sessionId
bot.page;                               // the active Playwright page
await bot.goto(url, opts?);
await bot.act("click the cart icon");
await bot.observe("is there a captcha?");
await bot.extract({ instruction, schema });   // schema = zod
await bot.agent("add to cart and checkout", { maxSteps });  // autonomous multi-step run
await bot.addCookies([...]);
await bot.screenshot("out.png", { fullPage? });
await bot.liveViewUrl();                // watch it live
await bot.close({ release? });          // also releases a keepAlive session
```

Session helpers (`listSessions`, `requestRelease`, `releaseRunningSessions`,
`liveViewUrl`) are exported too, for managing Browserbase out-of-band. The
self-improving `improve(bot, task, opts)` loop and the `geminiComplete()`
reflection helper are exported as well — see [docs/SELF-IMPROVING.md](docs/SELF-IMPROVING.md).

## How it works

```
your intent ─▶ Stagehand (planning model) ─▶ Playwright actions
                                                    │
                                            Browserbase cloud browser
```

`Autopilot` owns the connection, session lifecycle, and the active-page
plumbing; Stagehand turns each `act/observe/extract` into grounded browser
steps; Browserbase runs the actual Chromium in the cloud and gives you the live
view.

## Productionize

Run a flow on a schedule via GitHub Actions (shipped in `.github/workflows/`),
Browserbase Functions, or any cron host — see [docs/PRODUCTIONIZE.md](docs/PRODUCTIONIZE.md).

## Contributing

Issues and PRs welcome — especially more `examples/` and additions to
[`docs/GOTCHAS.md`](docs/GOTCHAS.md). Please keep examples to sites that are fine
to automate, and never commit real credentials.

## License

[MIT](LICENSE) © ss251
