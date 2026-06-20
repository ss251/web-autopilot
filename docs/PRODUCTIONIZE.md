# Productionize: run autopilot on a schedule

Three ways to take a flow from "runs on my laptop" to "runs in the cloud,"
cheapest-to-set-up first.

## 1. GitHub Actions (shipped in this repo)

`.github/workflows/scheduled-run.yml` runs [`examples/scheduled-qa.ts`](../examples/scheduled-qa.ts)
on demand — and on a nightly cron once you opt in. Autopilot creates its own
Browserbase session, so there's nothing else to host.

1. Add repo secrets (**Settings → Secrets and variables → Actions**):
   `BROWSERBASE_API_KEY`, `BROWSERBASE_PROJECT_ID`, `MODEL_API_KEY`.
2. Run it manually from the **Actions** tab (`workflow_dispatch`), optionally
   passing a `url`.
3. To run nightly, uncomment the `schedule:` block in the workflow.

The evolved `strategy.*.md` is uploaded as a build artifact each run, so you can
watch the strategy stabilize over time. `CI` (typecheck) runs on every push.

## 2. Browserbase Functions (managed session)

[`@browserbasehq/sdk-functions`](https://github.com/browserbase/sdk-functions-node)
deploys serverless browser functions where **Browserbase manages the session for
you** — each invocation gets `context.session.connectUrl`.

```sh
npx @browserbasehq/sdk-functions init my-fn && cd my-fn
# add BROWSERBASE_API_KEY to .env
npx bb dev index.ts          # test locally
npx bb publish index.ts      # deploy
```

```ts
import { defineFn } from "@browserbasehq/sdk-functions";
import { chromium } from "playwright-core";

defineFn("shop-qa", async (context, params) => {
  const browser = await chromium.connectOverCDP(context.session.connectUrl);
  const page = browser.contexts()[0]!.pages()[0]!;
  await page.goto(params.url);
  return { title: await page.title() };
}, { parametersSchema: /* zod schema */ undefined });
```

> Note: inside a Function the session is **provided**, so you connect to
> `context.session.connectUrl` directly rather than constructing an `Autopilot`
> (which creates its own session). Use Autopilot for #1/#3 where you own the
> lifecycle; use the native Function shape here. Docs:
> [docs.browserbase.com/functions/quickstart](https://docs.browserbase.com/functions/quickstart).

## 3. Vercel cron / any Node host

Autopilot is a plain library, so any host with a cron works: a
[Vercel Cron Job](https://vercel.com/docs/cron-jobs) hitting a route that calls
`improve()` / `agent()`, a Railway cron, or a container on a timer. Set the same
three env vars and call your flow. The
[`browserbase-nextjs-template`](https://github.com/browserbase/browserbase-nextjs-template)
is a good starting point for the Vercel route.
