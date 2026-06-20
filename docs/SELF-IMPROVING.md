# The self-improving loop (auto-research)

Most browser automation is brittle because you hand-tune the steps once and they
rot the moment the page shifts. `improve()` flips that: you declare the
**objective** and a **success check**, and the loop discovers — and keeps —
a reliable strategy on its own.

```
        ┌──────────────────────────────────────────────┐
        ▼                                                │
   run the agent  ─▶  verify (deterministic or LLM judge) │
   (current strategy)        │                            │
                       pass? │ no ─▶ reflect: model rewrites the strategy
                             │        from the failed trace ──────────────┘
                          yes │
                             ▼
              passed `passesToWin` times in a row?  ─▶  done → save strategy.md
```

This is the pattern behind Browserbase's [`autobrowse`](https://github.com/browserbase/skills/blob/main/skills/autobrowse/SKILL.md)
skill and Andrej Karpathy's "autoresearch" harness: an outer loop that runs an
experiment, reads the result, and improves its own instructions — applied here
to browser skills.

## Usage

```ts
import { Autopilot, loadEnv, improve } from "web-autopilot";

const bot = new Autopilot(loadEnv());
await bot.init();

const result = await improve(bot, {
  name: "checkout-smoke",
  url: "https://shop.example.com",
  goal: "add the first product to the cart and reach the checkout page",
  verify: async (b) => String(b.page.url()).includes("/checkout"),
}, {
  maxIterations: 5,
  passesToWin: 2,           // must succeed twice in a row to count as reliable
  strategyPath: "strategy.checkout.md",
});

console.log(result.passed, result.strategy);
await bot.close();
```

## Why a deterministic `verify` matters

The loop is only as honest as its success check. Prefer a code check —
URL changed, element present, value correct — over the built-in LLM judge:
it's free, fast, and can't be fooled by a page that merely *looks* done.
Reserve the LLM judge (the default when you give neither `verify` nor
`successText`) for goals you genuinely can't express in code.

> This mirrors a hard-won rule from the field: **LLM-vision makes a poor gate
> but a great discovery loop.** Let `improve()` *find* the reliable path; pin the
> pass/fail to something deterministic.

## Knobs

| Option | Default | What it does |
|---|---|---|
| `maxIterations` | 5 | attempts before giving up |
| `passesToWin` | 2 | consecutive passes required to call it reliable |
| `maxSteps` | 12 | agent steps allowed per attempt |
| `initialStrategy` | — | seed/refine a previously-evolved strategy |
| `strategyPath` | — | write the evolved strategy here as markdown |
| `reflect` | gemini | bring your own critic `(strategy, run) => Promise<string>` |

## The artifact

When the loop ends it returns (and optionally writes) the **evolved strategy** —
a numbered, imperative checklist of exactly how to do the task reliably on *this*
site. Commit it, reuse it as `initialStrategy`, or hand it to a teammate. You're
compiling the learnings instead of relearning them every run.
