/**
 * Bring-your-own-session.
 *
 * Some flows live behind a login. Rather than typing credentials into a cloud
 * browser, you can inject a session cookie you exported from YOUR OWN logged-in
 * browser (devtools → Application → Cookies), then drive the app as yourself.
 *
 * ⚠️  Only do this against a service you own or are explicitly authorized to
 *     automate, and only with your own credentials. Don't use this to bypass
 *     access controls or another account's session. See the README.
 *
 * Set APP_URL and APP_SESSION_COOKIE in your .env (both are gitignored).
 *
 *   bun run examples/cookie-auth.ts     # or: npx tsx examples/cookie-auth.ts
 */
import { Autopilot, loadEnv } from "../src/index.js";

const env = loadEnv();

const APP_URL = process.env.APP_URL ?? "https://app.example.com";
const SESSION_COOKIE = process.env.APP_SESSION_COOKIE ?? "";

if (!SESSION_COOKIE) {
  console.error("Set APP_SESSION_COOKIE (and APP_URL) in your .env first — see .env.example.");
  process.exit(1);
}

const bot = new Autopilot({
  browserbaseApiKey: env.browserbaseApiKey,
  browserbaseProjectId: env.browserbaseProjectId,
  modelApiKey: env.modelApiKey,
  modelName: env.modelName,
});

await bot.init();

// Inject before navigating so the first request is already authenticated.
await bot.addCookies([
  {
    name: "session", // ← rename to your app's actual session cookie
    value: SESSION_COOKIE,
    domain: new URL(APP_URL).hostname,
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
  },
]);

await bot.goto(APP_URL);
await bot.act("open the main dashboard");
await bot.screenshot("dashboard.png");
console.log("authenticated as you —", await bot.page.title());

await bot.close();
