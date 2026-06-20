# Gotchas

Field notes from driving Stagehand on Browserbase. `Autopilot` already handles
most of these — this is the "why" so you can debug when something drifts.

### Concurrency-1 throws 429 on the next run
The free tier allows **one** concurrent session. If a previous run crashed and
left a session `RUNNING`, the next `init()` 429s. `Autopilot` calls
`releaseRunningSessions()` before connecting (opt out with `releaseStale: false`).
You can also release manually:

```ts
import { releaseRunningSessions } from "web-autopilot";
await releaseRunningSessions(apiKey, projectId);
```

### `keepAlive` sessions die on process exit — and resuming a dead one 400s
A `keepAlive` session stays up after you disconnect, but if the **process exits**
without you holding the connection, the session can flip to `COMPLETED`, and
trying to resume a completed session returns `400`. Two safe patterns:
- **Do everything in one connected run** (don't exit and reconnect), or
- Treat each run as fresh and let `releaseStale` clean up the last one.

`bot.close()` releases a `keepAlive` session for you so it stops billing; pass
`{ release: false }` only if you deliberately want to leave it up.

### Use the *active* page, not `stagehand.page`
`stagehand.page` can be a proxy that's missing `.keyboard` / `.mouse` on some
versions, so raw input throws `undefined is not an object`. The real Playwright
page is `stagehand.context.activePage()`. `bot.page` returns the right one.

### Prefer `act()` over raw keyboard/mouse for input
Going through the Stagehand wrapper, `page.keyboard.type(...)` can fail where
`act("type 'hello' into the search box")` succeeds. Reach for `bot.act(...)`
first; drop to raw Playwright only when you need pixel-precise control.

### Browserbase REST API quirks
- Auth header is **`X-BB-API-Key`**; the wire format is **camelCase**
  (`projectId`, `keepAlive`, `proxyCountryCode`, …).
- The interactive live view comes from `GET /sessions/{id}/debug`
  (`debuggerFullscreenUrl`). `bot.liveViewUrl()` wraps it.
- If you ever drop to raw CDP, the remote endpoint is **HTTPS, not `ws://`** —
  resolve the websocket from `/json/version`.

### Proxies & CAPTCHA solving are powerful — scope them
`proxies` and `solveCaptchas` are off by default. They're legitimately useful
for geo-testing, accessibility, and automating infrastructure you control.
**Don't** reach for them to defeat bot-protection on a service you don't own or
aren't authorized to automate — that's both a Terms-of-Service problem and a
good way to get an account banned.
